/* The state of the page. Each component reads it; none keeps a copy.

   files  the loaded files.
   map    the map made from them (a TermMap). It is replaced as a whole when a file or a prefix choice changes.
   app    the controls: the selection, the view and the filters.

   What follows from these (the edges in use, what the selection reaches) is computed. */
import { reactive, shallowRef, triggerRef, computed } from 'vue';
import { TermMap } from './model/TermMap.js';
import { EdgesInUse, Reach } from './model/Reach.js';

/* what the viewer chose on an earlier visit, kept by the browser */
const kept = {
  read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  },
  write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* the browser keeps nothing: the choice lasts for this visit */ }
  },
  readPrefixes() {
    try { return JSON.parse(this.read('depmap-prefix', '{}')) || {}; } catch (e) { return {}; }
  },
};

/* each file: { id, name, rev, format, enabled, count, triples, prefixes, error } */
export const files = shallowRef([]);
export const map = shallowRef(new TermMap([], {}));

export const app = reactive({
  loading: true,            /* until the app has sent its files */
  message: '',              /* what the last action has to say, shown under the map */
  view: kept.read('depmap-layout', 'tiers'),
  type: null,               /* the type the Type box picked */
  directOnly: false,        /* the reach: one step, not every step */
  showOntologies: false,
  chosenPrefixes: kept.readPrefixes(),
  groupsInUse: new Set(),   /* the edge groups in use */
  groupsSeen: new Set(),    /* the edge groups the page has met: a new one starts in use, unless it is a reference group */
  hiddenPrefixes: new Set(),
  selection: new Set(),
  autoSelect: true,         /* until the viewer selects a term, the first unit of the map is selected */
  sheetOpen: false,         /* the details sheet is open over the map, not folded down to the name of the term */
  termView: null,           /* the tab that is on in the details of a term; null is the first */
  definedBy: null,          /* the Defined by button that is on in the properties of a term; null is All */
  scrollTo: null,          /* the term the Tiers view brings into view */
});

/* ---------- what follows from the state ---------- */

export const edgesInUse = computed(() => new EdgesInUse(map.value, app.groupsInUse));
export const reach = computed(() => new Reach(edgesInUse.value, app.selection, app.directOnly));

/* what the map shows of a term: its prefix is on in Show, and it is not an ontology unless the View menu shows those */
export function isVisible(id) {
  if (app.hiddenPrefixes.has(map.value.prefixOf(id))) return false;
  return app.showOntologies || !map.value.ontologies.has(id);
}

/* what a chart shows: what the map shows, without the individuals */
export function isCharted(id) {
  return !map.value.individuals.has(id) && isVisible(id);
}

/* whether the map shows an IRI: as its term when it is one, else by its prefix */
export function isShown(iri) {
  const statements = map.value.statements;
  const id = statements.idOf(iri);
  if (id) return isVisible(id);
  const short = statements.short(iri);
  const prefix = short.charAt(0) === '<' ? '' : (short.slice(0, short.indexOf(':')) || ':');
  return !app.hiddenPrefixes.has(prefix);
}

/* ---------- the map ---------- */

export function say(text) {
  app.message = text;
}

/* Replace the loaded files and make the map again. */
export function setFiles(list) {
  files.value = list;
  remake();
}

/* Make the map again from the files. The selection is kept by IRI, because a prefix choice changes the ids. */
export function remake() {
  const old = map.value;
  const selectedIris = [...app.selection].map(id => old.iriOf(id)).filter(Boolean);

  const next = new TermMap(files.value, app.chosenPrefixes);
  const idOf = iri => next.statements.idOf(iri);
  let selection = new Set(selectedIris.map(idOf).filter(id => id && next.has(id)));
  if (app.autoSelect && !next.isEmpty) selection = new Set([next.firstUnit()[0]]);

  for (const group of next.edgeGroups) {
    if (app.groupsSeen.has(group.name)) continue;
    app.groupsSeen.add(group.name);
    if (!group.reference) app.groupsInUse.add(group.name);
  }

  map.value = next;
  triggerRef(files);
  app.selection = selection;
  app.message = '';
}

/* ---------- the controls ---------- */

/* Select a term. add: add it to the selection, or take it out when it is in. fromOutside: the click was not on the
   map, so the map brings the term into view. */
export function select(id, add, fromOutside) {
  if (!map.value.has(id)) {
    say('No term named ' + id + ' in the loaded files.');
    return;
  }
  app.message = '';
  app.autoSelect = false;
  if (!add) app.selection = new Set([id]);
  else if (app.selection.has(id)) app.selection.delete(id);
  else app.selection.add(id);
  if (fromOutside) app.scrollTo = { id };
}

export function clearSelection() {
  app.message = '';
  app.autoSelect = false;
  app.selection = new Set();
}

export function setDirectOnly(on) {
  app.message = '';
  app.directOnly = on;
}

export function setView(id) {
  app.message = '';
  app.view = id;
  kept.write('depmap-layout', id);
}

export function setGroupInUse(group, on) {
  app.message = '';
  if (on) app.groupsInUse.add(group);
  else app.groupsInUse.delete(group);
}

export function setPrefixShown(prefix, on) {
  app.message = '';
  if (on) app.hiddenPrefixes.delete(prefix);
  else app.hiddenPrefixes.add(prefix);
}

/* use this prefix for a namespace that the files give several */
export function choosePrefix(namespace, prefix) {
  app.chosenPrefixes[namespace] = prefix;
  kept.write('depmap-prefix', JSON.stringify(app.chosenPrefixes));
  remake();
}
