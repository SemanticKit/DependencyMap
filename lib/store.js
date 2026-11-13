'use strict';
/* The files of the map, on disk under the docs folder of the project.
   Each RDF file anywhere under docs is read where it is; it is on, and its name is its file name.
   A file that is added goes to docs/<alias>/<name>, where the alias is the prefix of its ontology.
   The store creates the folders it needs. <dir>/.semantickit.json holds, for each file, the name, the
   format and whether the file is on. */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const RDF = /\.(ttl|nt|rdf|owl|xml)$/i;

/* A name that is safe as one part of a path, and as the id the page gives a file. */
function docId(name) {
  return (String(name).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').replace(/^\.+/, '_') || 'file').slice(0, 150);
}

class Store extends EventEmitter {
  /* dir: the project folder. docs: its docs folder, <dir>/docs when not given. */
  constructor(dir, docs) {
    super();
    this.dir = path.resolve(dir);
    this.filesDir = docs ? path.resolve(docs) : path.join(this.dir, 'docs');
    this.metaPath = path.join(this.dir, '.semantickit.json');
    this.paths = new Map(); /* id -> the path of the file */
    this.cache = new Map(); /* id -> {rev, text} */
    this.timer = null;
    this.watcher = null;
    this.watch();
  }
  watch() {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.filesDir, { recursive: true }, () => this.changed());
      this.watcher.on('error', () => {});
    } catch (_) { this.watcher = null; }
  }
  close() { if (this.watcher) this.watcher.close(); clearTimeout(this.timer); }
  changed() { clearTimeout(this.timer); this.timer = setTimeout(() => this.emit('change'), 50); }
  readMeta() {
    try { return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')) || {}; } catch (_) { return {}; }
  }
  writeMeta(meta) {
    const tmp = this.metaPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 1) + '\n');
    fs.renameSync(tmp, this.metaPath);
  }
  /* the RDF files under docs, as paths relative to it with "/" between the parts */
  walk(folder, into) {
    let names = [];
    try { names = fs.readdirSync(path.join(this.filesDir, folder), { withFileTypes: true }); } catch (_) {}
    for (const e of names) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = folder ? folder + '/' + e.name : e.name;
      if (e.isDirectory()) this.walk(rel, into);
      else if (e.isFile() && RDF.test(e.name)) into.push(rel);
    }
    return into;
  }
  /* [{id, name, format, enabled, rev, bytes, addedAt}], sorted by name */
  list() {
    const meta = this.readMeta(), out = [];
    this.paths.clear();
    for (const rel of this.walk('', [])) {
      const file = path.join(this.filesDir, rel);
      let st;
      try { st = fs.statSync(file); } catch (_) { continue; }
      const id = docId(rel), m = meta[id] || {};
      this.paths.set(id, file);
      out.push({ id, name: path.basename(rel), format: m.format || null, enabled: m.enabled !== false,
        rev: Math.floor(st.mtimeMs).toString(36) + '-' + st.size.toString(36), bytes: st.size, addedAt: m.addedAt || null });
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  get(idOrName) {
    const all = this.list();
    return all.find(f => f.name === idOrName) || all.find(f => f.id === idOrName) || null;
  }
  text(id) {
    const f = this.list().find(x => x.id === id);
    if (!f) return null;
    const c = this.cache.get(id);
    if (c && c.rev === f.rev) return c.text;
    const text = fs.readFileSync(this.paths.get(id), 'utf8');
    this.cache.set(id, { rev: f.rev, text });
    return text;
  }
  /* The new text of the file with this name, or a new file at docs/<alias>/<name>. */
  put(name, text, format, alias) {
    const old = this.get(name);
    const rel = old ? path.relative(this.filesDir, this.paths.get(old.id)).split(path.sep).join('/')
      : docId(alias || 'ontology') + '/' + docId(name);
    const id = docId(rel), file = path.join(this.filesDir, rel), tmp = file + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    this.watch();
    const meta = this.readMeta();
    meta[id] = { name: path.basename(rel), format: format || null, enabled: true, addedAt: new Date().toISOString() };
    this.writeMeta(meta);
    this.changed();
    return id;
  }
  setEnabled(id, on) {
    const meta = this.readMeta(), f = this.list().find(x => x.id === id);
    if (!f) return false;
    meta[id] = Object.assign({ name: f.name, format: f.format, addedAt: f.addedAt }, meta[id], { enabled: !!on });
    this.writeMeta(meta);
    this.changed();
    return true;
  }
  remove(id) {
    this.list();
    const meta = this.readMeta(), file = this.paths.get(id);
    let had = false;
    if (file) { try { fs.unlinkSync(file); had = true; } catch (_) {} }
    if (id in meta) { delete meta[id]; this.writeMeta(meta); had = true; }
    this.cache.delete(id);
    this.changed();
    return had;
  }
}

module.exports = { Store, docId };
