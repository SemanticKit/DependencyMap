/* The compact ids of the map: prefix:name for an IRI in a namespace that a loaded ontology gives a prefix, and the
   IRI in angle brackets otherwise. One namespace can have several prefixes, from several ontologies; one is used,
   and the page lets the viewer choose which. */
export class Names {
  /* ontologies: each { name, prefixes }, every loaded one. chosen: for a namespace, the prefix to use. */
  constructor(ontologies, chosen = {}) {
    /* each namespace: { ns, used, aliases }; an alias is { label, files }, a prefix and the ontologies that give it */
    this.namespaces = [];
    for (const ontology of ontologies) {
      for (const label of Object.keys(ontology.prefixes || {})) {
        const ns = ontology.prefixes[label];
        if (ns) this.addAlias(ns, label, ontology.name);
      }
    }
    this.choose(chosen);
    /* the longest namespace first, so the most specific one names an IRI */
    this.longestFirst = this.namespaces.slice().sort((a, b) => b.ns.length - a.ns.length);
    this.idByIri = new Map();
  }

  addAlias(ns, label, ontology) {
    let namespace = this.namespaces.find(each => each.ns === ns);
    if (!namespace) this.namespaces.push(namespace = { ns, used: null, aliases: [] });
    let alias = namespace.aliases.find(each => each.label === label);
    if (!alias) namespace.aliases.push(alias = { label, files: [] });
    if (!alias.files.includes(ontology)) alias.files.push(ontology);
  }

  /* Give each namespace the prefix it is shown with: the chosen one, else its first prefix that is not empty. A
     prefix is used for one namespace only; a namespace that finds its prefix taken uses another of its own, or the
     prefix with a number after it. */
  choose(chosen) {
    const taken = new Set();
    for (const namespace of this.namespaces) {
      const labels = namespace.aliases.map(alias => alias.label);
      const wanted = labels.includes(chosen[namespace.ns]) ? chosen[namespace.ns] : (labels.find(label => label !== '') ?? labels[0]);
      let used = wanted;
      if (taken.has(used)) {
        const free = labels.find(label => !taken.has(label));
        if (free !== undefined) used = free;
        else for (let number = 2; taken.has(used); number++) used = wanted + number;
      }
      namespace.used = used;
      taken.add(used);
    }
  }

  /* the namespace of each prefix in use */
  get prefixes() {
    const prefixes = {};
    for (const namespace of this.namespaces) prefixes[namespace.used] = namespace.ns;
    return prefixes;
  }

  idOf(iri) {
    let id = this.idByIri.get(iri);
    if (id !== undefined) return id;
    id = '<' + iri + '>';
    const namespace = this.longestFirst.find(each => iri.startsWith(each.ns));
    if (namespace) {
      const name = iri.slice(namespace.ns.length);
      if (!/[\/#?\s<>]/.test(name)) id = namespace.used + ':' + name;
    }
    this.idByIri.set(iri, id);
    return id;
  }

  /* the prefix of a compact id: '' for an IRI in angle brackets, ':' for the empty prefix */
  static prefixOf(id) {
    if (id.charAt(0) === '<') return '';
    return id.slice(0, id.indexOf(':')) || ':';
  }
}
