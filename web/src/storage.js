/* The files of the map. The app keeps them, on disk in the project; the page lists them, reads their text, and asks
   the app to add, switch or remove one. The app tells each open page when the files change. */
import { engine, parsing } from './model/engine.js';
import { files, map, app, say, setFiles, select } from './state.js';
import { request } from './http.js';

const fileUrl = file => '/api/files/' + encodeURIComponent(file.id);

/* Follow the app: it sends the list of files now and each time they change, and the terms a tool asks to select. */
export function connect() {
  const events = new EventSource('/api/events');
  /* one list is loaded after another, so an older list never lands on a newer one */
  let loading = Promise.resolve();
  events.addEventListener('files', event => {
    const listed = JSON.parse(event.data);
    loading = loading.then(() => load(listed)).catch(e => say('The files could not be loaded: ' + e.message));
  });
  events.addEventListener('select', event => selectIris(JSON.parse(event.data)));
}

/* Make the loaded files those the app lists. A file that did not change (same rev) is not read again. */
async function load(listed) {
  const next = [];
  for (const record of listed) {
    let file = files.value.find(each => each.id === record.id && each.rev === record.rev);
    if (!file) file = await read(record);
    file.enabled = record.enabled;
    next.push(file);
  }
  app.loading = false;
  setFiles(next);
}

/* a file of the app, read: its text, its triples and its prefixes, or the error that stopped the reading */
async function read(record) {
  const file = { id: record.id, name: record.name, rev: record.rev, format: record.format, count: 0, triples: null, error: null };
  try {
    const response = await fetch(fileUrl(file), { cache: 'no-store' });
    if (!response.ok) throw new Error('the app answered ' + response.status);
    const text = await response.text();
    file.format = file.format || engine.detectFormat(file.name, text);
    const parsed = engine.parse(file.name, text, file.format, parsing);
    file.triples = parsed.triples;
    file.prefixes = parsed.prefixes;
    file.count = parsed.triples.length;
  } catch (e) {
    file.error = 'This file could not be read: ' + String(e && e.message || e).slice(0, 300);
  }
  return file;
}

/* the select tool of the app's MCP server: select these terms, given by their IRIs */
function selectIris(iris) {
  const ids = iris.map(iri => map.value.statements.idOf(iri)).filter(Boolean);
  if (!ids.length) return;
  select(ids[0], false, true);
  for (const id of ids.slice(1)) select(id, true, false);
}

/* ---------- changing the files ---------- */

/* Add a file, or give the file of this name a new text. Gives whether the app took it. */
export async function addFile(name, text) {
  say('Saving ' + name + '.');
  try {
    await request('POST', '/api/files', { name, text });
    return true;
  } catch (e) {
    say(e.message);
    return false;
  }
}

/* add the files the viewer chose or dropped */
export async function addFiles(chosen) {
  for (const file of chosen) await addFile(file.name, await file.text());
}

export async function setEnabled(file, enabled) {
  try {
    await request('PATCH', fileUrl(file), { enabled });
  } catch (e) {
    say(e.message);
  }
}

export async function removeFile(file) {
  try {
    await request('DELETE', fileUrl(file));
  } catch (e) {
    say(e.message);
  }
}

/* the address the text of a file is downloaded from */
export const downloadUrl = fileUrl;
