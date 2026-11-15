/* The map of some loaded ontologies, and the questions asked of it. The page, the MCP server and the command line
   all make one of these from their ontologies and ask it the same questions.

   The statements are in an LDO dataset, each in the graph of its ontology. */
import { createLdoDataset } from '@ldo/ldo';
import N3 from 'n3';
import { bfsFromNode } from 'graphology-traversal';
import { ontologyOf } from './ontology.mjs';
import { Names } from './names.mjs';
import { Analysis } from './analysis.mjs';

const { namedNode } = N3.DataFactory;
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const LABEL = RDFS + 'label';
const COMMENT = RDFS + 'comment';
const SUBPROPERTY_OF = namedNode(RDFS + 'subPropertyOf');
/* how deep a value inside blank nodes is written out */
const DEPTH = 6;

export class DependencyMap {
  /* ontologies: every loaded ontology, each { name, enabled, quads, prefixes }; one that could not be read has no
     quads. chosen: for a namespace with several prefixes, the one to use. */
  constructor(ontologies, chosen = {}) {
    this.ontologies = ontologies;
    this.on = ontologies.filter(ontology => ontology.enabled && ontology.quads);
    const quads = this.on.flatMap(ontology => ontology.quads);
    this.dataset = createLdoDataset(quads);
    /* where each statement is written: the dataset keeps no order, and a term is shown as its ontology states it */
    this.writtenAt = new Map(quads.map((quad, position) => [quad, position]));
    this.names = new Names(ontologies.filter(ontology => ontology.prefixes), chosen);
    this.analysis = new Analysis(this.dataset, this.on, this.names);
    this.tierOf = new Map();
    this.unitOf = new Map();
    for (const tier of this.analysis.tiers) {
      for (const unit of tier.groups) {
        for (const id of unit) {
          this.tierOf.set(id, tier.tier);
          this.unitOf.set(id, unit);
        }
      }
    }
  }

  get terms() { return this.analysis.terms; }
  get edges() { return this.analysis.edges; }
  get tiers() { return this.analysis.tiers; }
  get cycles() { return this.analysis.cycles; }

  /* ---------- names ---------- */

  short(iri) {
    return this.names.idOf(iri);
  }

  /* the id of a term named by its id or by its IRI, with or without angle brackets */
  idOf(name) {
    const text = String(name || '').trim();
    if (this.terms[text]) return text;
    const id = this.names.idOf(text.replace(/^<|>$/g, ''));
    return this.terms[id] ? id : undefined;
  }

  iriOf(id) {
    return this.terms[id] ? this.terms[id].i : null;
  }

  /* ---------- statements ---------- */

  /* the statements about a term or a blank node, in one ontology or in all, in the order they are written */
  about(subject, graph = null) {
    const found = [...this.dataset.match(subject, null, null, graph)];
    return found.sort((a, b) => this.writtenAt.get(a) - this.writtenAt.get(b));
  }

  /* a property, and each property the ontologies put under it (rdfs:subPropertyOf) */
  family(property) {
    const found = [property];
    for (const each of found) {
      for (const quad of this.dataset.match(null, SUBPROPERTY_OF, namedNode(each))) {
        if (quad.subject.termType === 'NamedNode' && !found.includes(quad.subject.value)) found.push(quad.subject.value);
      }
    }
    return found;
  }

  /* the text a term states with a property or a property under it: the one with no language or in English first */
  text(iri, property) {
    for (const each of this.family(property)) {
      const literals = [...this.dataset.match(namedNode(iri), namedNode(each), null)].map(quad => quad.object).filter(object => object.termType === 'Literal');
      if (literals.length) return (literals.find(literal => !literal.language || /^en\b/.test(literal.language)) || literals[0]).value;
    }
    return '';
  }

  labelOf(id) {
    return this.terms[id] ? this.text(this.terms[id].i, LABEL) : '';
  }

  commentOf(id) {
    return this.terms[id] ? this.text(this.terms[id].i, COMMENT) : '';
  }

  /* a value as Turtle writes it; a blank node with the statements inside it */
  written(value, graph, depth = 0) {
    if (value.termType === 'NamedNode') return this.short(value.value);
    if (value.termType === 'Literal') return JSON.stringify(value.value) + (value.language ? '@' + value.language : '');
    if (depth > DEPTH) return '[]';
    const inside = this.about(value, graph).map(quad => this.short(quad.predicate.value) + ' ' + this.written(quad.object, graph, depth + 1));
    return '[ ' + inside.join(' ; ') + ' ]';
  }

  /* ---------- the answers ---------- */

  summary() {
    return {
      ontologies: this.ontologies.map(ontology => ({
        name: ontology.name,
        enabled: ontology.enabled,
        format: ontology.format,
        triples: ontology.quads ? ontology.quads.length : 0,
        error: ontology.error || null,
      })),
      terms: Object.keys(this.terms).length,
      edges: this.edges.length,
      tiers: this.tiers.map(tier => ({ tier: tier.tier, terms: tier.groups.reduce((sum, unit) => sum + unit.length, 0) })),
      cycles: this.cycles,
    };
  }

  /* the build order: one entry for each unit, in tier order */
  order() {
    return this.tiers.flatMap(tier => tier.groups.map(unit => ({ tier: tier.tier, unit })));
  }

  /* the terms that are reached from a term along the ordering edges: outbound, what it depends on; inbound, what
     depends on it. In tier order, then by name. */
  reach(id, mode) {
    const found = [];
    bfsFromNode(this.analysis.depends, id, node => { if (node !== id) found.push(node); }, { mode });
    return found.sort((a, b) => this.tierOf.get(a) - this.tierOf.get(b) || (a < b ? -1 : 1));
  }

  /* the answer for one term: what it is, what has to happen first, what waits for it */
  term(name) {
    const id = this.idOf(name);
    if (!id) throw new Error('No term with this name in the loaded ontologies: ' + name);
    const iri = this.terms[id].i;
    return {
      id,
      iri,
      declaredIn: this.terms[id].f,
      tier: this.tierOf.get(id),
      unit: this.unitOf.get(id),
      label: this.labelOf(id),
      comment: this.commentOf(id),
      statements: this.about(namedNode(iri)).map(quad => ({
        property: this.short(quad.predicate.value),
        value: this.written(quad.object, quad.graph),
        ontology: ontologyOf(quad.graph),
      })),
      hasToHappenFirst: this.reach(id, 'outbound'),
      waitsForIt: this.reach(id, 'inbound'),
    };
  }

  /* the terms an ontology describes */
  termsIn(name) {
    if (!this.ontologies.some(ontology => ontology.name === name)) {
      throw new Error('No loaded ontology is named ' + name + '. Loaded: ' + (this.ontologies.map(ontology => ontology.name).join(', ') || 'none'));
    }
    return Object.keys(this.terms).filter(id => this.terms[id].f.includes(name)).sort();
  }

  /* the terms whose id, IRI or label contains the text */
  find(text) {
    const wanted = String(text || '').toLowerCase();
    const has = value => value.toLowerCase().includes(wanted);
    return Object.keys(this.terms).filter(id => has(id) || has(this.terms[id].i) || has(this.labelOf(id))).sort();
  }
}
