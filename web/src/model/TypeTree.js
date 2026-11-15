/* The terms of one type, as a tree: the data of the Onion, Treemap, Pack, Tree and Cluster views. rdf:type and
   rdfs:subClassOf are different relations, so a chart groups by one relation at a time: the Type box picks one type,
   and the chart shows the terms of that type, each under the term it is a subclass or a subproperty of.

   root is a node { name, id, children }, in the form D3's hierarchy reads; a node with nothing under it has
   value 1 in place of children. */
import { TermMap } from './TermMap.js';
import { TYPE, SUBCLASS_OF, SUBPROPERTY_OF } from '../rdf.js';

/* The types (rdf:type) that the charted terms of a map state, the most used first: each { iri, name }. */
export function typesIn(map, isCharted) {
  const statements = map.statements;
  const uses = new Map();
  for (const id of map.ids.filter(isCharted)) {
    for (const type of statements.values(map.iriOf(id), TYPE)) uses.set(type, (uses.get(type) || 0) + 1);
  }
  return [...uses.keys()]
    .sort((a, b) => uses.get(b) - uses.get(a) || (a < b ? -1 : 1))
    .map(iri => ({ iri, name: statements.short(iri) }));
}

export class TypeTree {
  /* map: a TermMap. type: the IRI of the type, or null. isCharted: whether a chart shows a term. */
  constructor(map, type, isCharted) {
    this.map = map;
    const statements = map.statements;
    /* the name in a chart is the term without its prefix: the colour says the prefix, and the legend names the colours */
    this.root = { name: type ? TermMap.bare(statements.short(type)) : 'terms', children: [] };

    this.nodeById = new Map();
    for (const id of map.ids) {
      if (!isCharted(id) || !statements.values(map.iriOf(id), TYPE).includes(type)) continue;
      this.nodeById.set(id, { name: TermMap.bare(id), id, children: [] });
    }

    this.parentById = new Map();
    for (const id of this.nodeById.keys()) this.placeUnder(id);
    for (const [id, node] of this.nodeById) {
      const parent = this.parentById.has(id) ? this.nodeById.get(this.parentById.get(id)) : this.root;
      parent.children.push(node);
    }
    for (const node of [this.root, ...this.nodeById.values()]) {
      if (node.children.length) continue;
      delete node.children;
      node.value = 1;
    }
  }

  /* the prefixes of the terms in the tree, for the legend */
  get prefixes() {
    return [...new Set([...this.nodeById.keys()].map(id => this.map.prefixOf(id)))].sort();
  }

  /* A term goes under one of the terms it is a subclass or a subproperty of: one of its own prefix first, then by
     name. A term that would close a loop is passed over. */
  placeUnder(id) {
    const statements = this.map.statements;
    const iri = this.map.iriOf(id);
    const foreign = other => this.map.prefixOf(other) === this.map.prefixOf(id) ? 0 : 1;
    const candidates = [...statements.values(iri, SUBCLASS_OF), ...statements.values(iri, SUBPROPERTY_OF)]
      .map(above => statements.idOf(above))
      .filter(above => above && above !== id && this.nodeById.has(above))
      .sort((a, b) => foreign(a) - foreign(b) || (a < b ? -1 : 1));
    const parent = candidates.find(above => !this.isUnder(above, id));
    if (parent) this.parentById.set(id, parent);
  }

  /* whether a term is the other term, or is placed somewhere under it */
  isUnder(id, other) {
    for (let at = id; at; at = this.parentById.get(at)) {
      if (at === other) return true;
    }
    return false;
  }
}
