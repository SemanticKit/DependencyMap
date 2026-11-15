/* The ontologies of the app, kept in the store, and the map made of them (core/map.mjs). */
import { loadOntology } from '../core/ontology.mjs';
import { DependencyMap } from '../core/map.mjs';

const MAX_BYTES = 20 * 1024 * 1024; /* the largest ontology the app takes */

/* The alias of an ontology: the prefix of the namespace that most of its subjects are in. An ontology with no such
   prefix takes its name without the extension. The store keeps an ontology in the folder of its alias. */
function aliasOf(ontology) {
  const spaces = Object.keys(ontology.prefixes).filter(prefix => prefix && ontology.prefixes[prefix])
    .map(prefix => ({ prefix, namespace: ontology.prefixes[prefix] }))
    .sort((a, b) => b.namespace.length - a.namespace.length);
  const subjects = new Set(ontology.quads.map(quad => quad.subject).filter(subject => subject.termType === 'NamedNode').map(subject => subject.value));
  const counts = new Map();
  for (const iri of subjects) {
    const space = spaces.find(each => iri.length > each.namespace.length && iri.startsWith(each.namespace));
    if (space) counts.set(space.prefix, (counts.get(space.prefix) || 0) + 1);
  }
  let best = null;
  for (const [prefix, count] of counts) {
    if (!best || count > best.count) best = { prefix, count };
  }
  return best ? best.prefix : String(ontology.name).replace(/\.[^.]+$/, '');
}

export class Ontologies {
  constructor(store) {
    this.store = store;
    this.loaded = new Map();    /* id in the store -> the ontology as loaded, with the rev it was loaded at */
    this.key = null;
    this.made = null;
  }

  /* the map of the ontologies as they are now; made again only when one changed */
  async map() {
    const listed = this.store.list();
    const key = listed.map(each => each.id + '@' + each.rev + (each.enabled ? '+' : '-')).join(',');
    if (key === this.key) return this.made;

    const ontologies = [];
    for (const each of listed) ontologies.push(await this.load(each));
    for (const id of [...this.loaded.keys()]) {
      if (!listed.some(each => each.id === id)) this.loaded.delete(id);
    }
    this.key = key;
    this.made = new DependencyMap(ontologies);
    return this.made;
  }

  /* one ontology of the store, loaded; read again only when its text changed */
  async load(listed) {
    const known = this.loaded.get(listed.id);
    if (known && known.rev === listed.rev) return Object.assign(known, { enabled: listed.enabled });
    const ontology = { id: listed.id, name: listed.name, rev: listed.rev, enabled: listed.enabled, format: listed.format, quads: null, prefixes: null, error: null };
    try {
      Object.assign(ontology, await loadOntology(listed.name, this.store.text(listed.id), listed.format || undefined));
    } catch (e) {
      ontology.error = 'This ontology could not be read: ' + String(e && e.message || e).slice(0, 300);
    }
    this.loaded.set(listed.id, ontology);
    return ontology;
  }

  /* Save a new ontology, or the new text of the ontology with this name. The text has to load. */
  async write(name, text) {
    name = String(name || '').trim();
    text = String(text);
    if (!name) throw new Error('Give the ontology a name.');
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(name + ' is larger than 20 MB.');
    let ontology;
    try {
      ontology = await loadOntology(name, text);
    } catch (e) {
      throw new Error(name + ': This ontology could not be read: ' + String(e && e.message || e).slice(0, 300));
    }
    this.store.put(name, text, ontology.format, aliasOf(ontology));
    return { name, triples: ontology.quads.length };
  }

  /* Store statements about a term: with the ontology that its namespace belongs to, or as a new one named after the
     prefix. turtle: the statements. Gives the name of the ontology they were stored with. */
  async addStatements(iri, turtle) {
    const map = await this.map();
    const space = map.names.longestFirst.find(each => iri.startsWith(each.ns));
    if (!space) throw new Error('No loaded ontology has a prefix for the namespace of <' + iri + '>.');
    const home = map.on.find(ontology => aliasOf(ontology) === space.used);
    if (!home) {
      this.store.put(space.used + '.ttl', turtle, 'turtle', space.used);
      return space.used + '.ttl';
    }
    if (home.format !== 'turtle') throw new Error(home.name + ' is not Turtle, so statements cannot be added to it.');
    this.store.put(home.name, this.store.text(home.id).replace(/\s*$/, '\n\n') + turtle, home.format, space.used);
    return home.name;
  }

  /* What the app runs in: the folder, the process and its environment variables. The values of secrets are not given. */
  environment() {
    const secret = /TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE|API_?KEY/i;
    /* The root of the project is PROJECT_DIR: that variable when it is set, else the variable of the client that
       started the app, else the folder the app is in. A path that starts at the root is shown from $PROJECT_DIR. */
    const holder = ['PROJECT_DIR', 'CLAUDE_PROJECT_DIR'].find(name => process.env[name]) || null;
    const root = (holder ? process.env[holder] : process.cwd()).replace(/\/+$/, '');
    const short = value => value === root ? '$PROJECT_DIR' : value.startsWith(root + '/') ? '$PROJECT_DIR' + value.slice(root.length) : value;
    const env = {};
    for (const name of Object.keys(process.env).sort()) {
      env[name] = secret.test(name) ? '(hidden)' : name === holder ? process.env[name] : short(process.env[name]);
    }
    return {
      PROJECT_DIR: root,
      from: holder || 'the folder the app is in',
      folder: short(process.cwd()),
      docs: short(this.store.filesDir),
      pid: process.pid,
      node: process.version,
      env,
    };
  }
}
