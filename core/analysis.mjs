/* The map of the ontologies that are on: the terms, the edges between them, the cycles and the tiers.

   - A term is an IRI that an ontology describes: the subject of a statement.
   - An edge is a statement from a term to a term; the property of the statement is the name of the edge. A value
     inside a blank node (a list, a class expression) belongs to the statement that holds the blank node.
   - The group of an edge is the top of the rdfs:subPropertyOf line of its property. rdfs:seeAlso and the
     properties under it are references: they do not order the build.
   - A cycle is a strongly connected component of the ordering edges, and is generated as one unit.
   - The tier of a unit is the length of the longest dependency path below it.

   The statements are in an LDO dataset; the cycles and the tiers are worked out by graphology. */
import N3 from 'n3';
import Graph from 'graphology';
import { stronglyConnectedComponents } from 'graphology-components';
import { topologicalGenerations } from 'graphology-dag';
import { ontologyOf } from './ontology.mjs';
import { Names } from './names.mjs';

const { namedNode } = N3.DataFactory;
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const SUBPROPERTY_OF = RDFS + 'subPropertyOf';
const SEE_ALSO = RDFS + 'seeAlso';

const isIri = term => term.termType === 'NamedNode';
const isBlank = term => term.termType === 'BlankNode';

export class Analysis {
  /* dataset: the statements of the ontologies that are on, each in the graph of its ontology.
     on: those ontologies, each { name, quads }, in the order they are read. names: the Names of the map. */
  constructor(dataset, on, names) {
    this.dataset = dataset;
    this.names = names;
    this.terms = {};      /* id -> { i: its IRI, p: its prefix, f: the ontologies that describe it } */
    this.edges = [];      /* each [from, property, to, ontology], as ids */
    this.kinds = {};      /* property id -> the id of its edge group */
    this.refs = {};       /* property id -> true, for a reference */
    this.triples = {};    /* ontology -> the number of its statements */

    for (const ontology of on) this.addTerms(ontology);
    for (const ontology of on) this.addEdges(ontology);
    this.order();
  }

  get prefixes() {
    return this.names.prefixes;
  }

  get namespaces() {
    return this.names.namespaces;
  }

  addTerms(ontology) {
    this.triples[ontology.name] = ontology.quads.length;
    for (const quad of ontology.quads) {
      if (!isIri(quad.subject)) continue;
      const id = this.names.idOf(quad.subject.value);
      if (!this.terms[id]) this.terms[id] = { i: quad.subject.value, p: Names.prefixOf(id), f: [] };
      if (!this.terms[id].f.includes(ontology.name)) this.terms[id].f.push(ontology.name);
    }
  }

  addEdges(ontology) {
    const seen = new Set();
    for (const quad of ontology.quads) {
      if (!isIri(quad.subject) || quad.object.termType === 'Literal') continue;
      const from = this.names.idOf(quad.subject.value);
      const property = this.names.idOf(quad.predicate.value);
      for (const iri of this.irisIn(quad.object, quad.graph)) {
        const to = this.names.idOf(iri);
        const key = from + '\u0000' + property + '\u0000' + to;
        if (!this.terms[to] || seen.has(key)) continue;
        seen.add(key);
        this.edges.push([from, property, to, ontologyOf(quad.graph)]);
        this.group(property, quad.predicate.value);
      }
    }
  }

  /* the IRIs a value names: itself, or each IRI inside a blank node of the same ontology */
  irisIn(value, graph) {
    if (isIri(value)) return [value.value];
    if (!isBlank(value)) return [];
    const iris = [];
    const seen = new Set();
    const waiting = [value];
    while (waiting.length) {
      const node = waiting.pop();
      if (seen.has(node.value)) continue;
      seen.add(node.value);
      for (const quad of this.dataset.match(node, null, null, graph)) {
        if (isBlank(quad.object)) waiting.push(quad.object);
        else if (isIri(quad.object)) iris.push(quad.object.value);
      }
    }
    return iris;
  }

  /* set the edge group of a property, the first time the property is met */
  group(id, iri) {
    if (id in this.kinds) return;
    const above = this.propertiesAbove(iri);
    this.kinds[id] = this.names.idOf(above.length ? above[above.length - 1] : iri);
    if (iri === SEE_ALSO || above.includes(SEE_ALSO)) this.refs[id] = true;
  }

  /* the properties a property is under (rdfs:subPropertyOf), the nearest first */
  propertiesAbove(iri) {
    const found = [];
    const seen = new Set([iri]);
    const waiting = [iri];
    while (waiting.length) {
      for (const quad of this.dataset.match(namedNode(waiting.shift()), namedNode(SUBPROPERTY_OF), null)) {
        if (!isIri(quad.object) || seen.has(quad.object.value)) continue;
        seen.add(quad.object.value);
        found.push(quad.object.value);
        waiting.push(quad.object.value);
      }
    }
    return found;
  }

  /* the cycles and the tiers, on the edges that order the build */
  order() {
    const depends = new Graph({ type: 'directed' });
    for (const id of Object.keys(this.terms)) depends.addNode(id);
    for (const [from, property, to] of this.edges) {
      if (!this.refs[property] && from !== to) depends.mergeEdge(from, to);
    }
    /* from each term to the terms it depends on */
    this.depends = depends;
    /* each unit: a cycle, or a term alone */
    const units = stronglyConnectedComponents(depends).map(unit => unit.sort());
    const unitOf = new Map();
    units.forEach((unit, number) => { for (const id of unit) unitOf.set(id, number); });

    /* the units as a graph without cycles: from a unit to each unit that depends on it */
    const between = new Graph({ type: 'directed' });
    units.forEach((unit, number) => between.addNode(number));
    depends.forEachEdge((edge, attributes, from, to) => {
      if (unitOf.get(from) !== unitOf.get(to)) between.mergeEdge(unitOf.get(to), unitOf.get(from));
    });

    this.tiers = topologicalGenerations(between).map((generation, tier) => ({
      tier,
      groups: generation.map(number => units[Number(number)]).sort((a, b) => a[0] < b[0] ? -1 : 1),
    }));
    this.cycles = [];
    for (const tier of this.tiers) {
      for (const unit of tier.groups) {
        if (unit.length > 1) this.cycles.push({ tier: tier.tier, terms: unit });
      }
    }
  }
}
