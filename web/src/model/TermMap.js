/* The map: what the loaded files give. It is made once from the files and is not changed after; when a file or a
   prefix choice changes, the page makes a new one. It knows nothing of the controls of the page. */
import * as d3 from 'd3';
import { engine } from './engine.js';
import { Statements } from './Statements.js';
import { TYPE, PROPERTY, CLASS, DATATYPE, LABEL, COMMENT, SUBCLASS_OF, SUBPROPERTY_OF, DOMAIN, RANGE, IS_DEFINED_BY } from '../rdf.js';

/* the lines the edges of the edge groups are drawn with: [dashes, width] */
const LINES = [['', ''], ['2 3', ''], ['', '2.3'], ['7 3', '2.3'], ['9 3 2 3', ''], ['2 3', '2.3']];
const REFERENCE_LINE = ['1 5', '1'];

/* the properties that say what a term is in the vocabulary: a term that has one, or is the value of one, is not data */
const STRUCTURE = [SUBCLASS_OF, SUBPROPERTY_OF, DOMAIN, RANGE];

export class TermMap {
  /* files: every loaded file. chosenPrefixes: for a namespace with several prefixes, the one to use. */
  constructor(files, chosenPrefixes) {
    this.files = files;
    const on = files.filter(file => file.enabled && file.triples);
    const bindings = files.filter(file => file.prefixes).map(file => ({ name: file.name, prefixes: file.prefixes }));
    this.analysis = engine.analyze(
      on.map(file => ({ name: file.name, triples: file.triples, prefixes: file.prefixes })),
      { bindings, choose: { ...chosenPrefixes } },
    );
    this.statements = new Statements(on, this.analysis);
    this.tiers = this.analysis.tiers;
    this.cycles = this.analysis.cycles;
    this.edges = this.analysis.edges;
    this.namespaces = this.analysis.namespaces || [];

    this.indexTiers();
    this.indexEdges();
    /* the ids of the terms, in the order of their names */
    this.ids = [...this.tierByTerm.keys()].sort();
    this.prefixes = [...new Set(Object.keys(this.analysis.terms).map(id => this.prefixOf(id)))].sort();
    /* one colour for each prefix, none used twice: a D3 ordinal scale over D3's rainbow */
    this.palette = d3.scaleOrdinal(this.prefixes, d3.quantize(d3.interpolateRainbow, this.prefixes.length + 1));
    this.ontologies = this.findOntologies();
    this.individuals = this.findIndividuals();
    this.edgeGroups = this.findEdgeGroups();
  }

  /* ---------- terms ---------- */

  get isEmpty() {
    return this.tiers.length === 0;
  }

  has(id) {
    return this.tierByTerm.has(id);
  }

  /* what the engine keeps of a term: { i: its IRI, p: its prefix, f: the files that declare it } */
  term(id) {
    return this.analysis.terms[id];
  }

  iriOf(id) {
    const term = this.term(id);
    return term ? term.i : null;
  }

  prefixOf(id) {
    const term = this.term(id);
    return term ? term.p : '';
  }

  /* the name of a term without its prefix */
  static bare(id) {
    const colon = id.indexOf(':');
    const prefixed = id.charAt(0) !== '<' && colon >= 0 && colon < id.length - 1;
    return prefixed ? id.slice(colon + 1) : id;
  }

  colorOf(prefix) {
    return this.palette(prefix);
  }

  colorOfTerm(id) {
    return this.colorOf(this.prefixOf(id));
  }

  labelOf(id) {
    const iri = this.iriOf(id);
    return iri ? this.statements.text(iri, LABEL) : '';
  }

  commentOf(id) {
    const iri = this.iriOf(id);
    return iri ? this.statements.text(iri, COMMENT) : '';
  }

  /* ---------- tiers and units ---------- */

  tierOf(id) {
    return this.tierByTerm.get(id);
  }

  /* the unit a term is generated in: the term alone, or the terms of its cycle */
  unitOf(id) {
    return this.unitByTerm.get(id);
  }

  /* the first unit of the map: the root cycle when there is one */
  firstUnit() {
    if (this.isEmpty) return null;
    const groups = this.tiers[0].groups;
    return groups.find(group => group.length > 1) || groups[0];
  }

  /* IRIs in the order of the map: by tier, then by name. An IRI that is no term comes last. */
  order(iris) {
    const tier = iri => {
      const id = this.statements.idOf(iri);
      return id !== undefined && this.has(id) ? this.tierOf(id) : Infinity;
    };
    const name = iri => this.statements.short(iri);
    return iris.slice().sort((a, b) => tier(a) - tier(b) || (name(a) < name(b) ? -1 : 1));
  }

  indexTiers() {
    this.tierByTerm = new Map();
    this.unitByTerm = new Map();
    for (const tier of this.tiers) {
      for (const group of tier.groups) {
        for (const id of group) {
          this.tierByTerm.set(id, tier.tier);
          this.unitByTerm.set(id, group);
        }
      }
    }
  }

  /* ---------- edges ---------- */

  /* each edge is [from, property, to, file] */
  edgesFrom(id) {
    return this.edgesByFrom.get(id) || [];
  }

  edgesTo(id) {
    return this.edgesByTo.get(id) || [];
  }

  /* the edge group of a property: the top of its rdfs:subPropertyOf line in the files */
  groupOf(property) {
    return this.analysis.kinds[property];
  }

  /* the line the edges of a group are drawn with: [dashes, width] */
  lineOf(group) {
    const found = this.edgeGroups.find(g => g.name === group);
    return found ? found.line : ['', ''];
  }

  indexEdges() {
    this.edgesByFrom = new Map();
    this.edgesByTo = new Map();
    for (const edge of this.edges) {
      const [from, , to] = edge;
      if (!this.edgesByFrom.has(from)) this.edgesByFrom.set(from, []);
      if (!this.edgesByTo.has(to)) this.edgesByTo.set(to, []);
      this.edgesByFrom.get(from).push(edge);
      this.edgesByTo.get(to).push(edge);
    }
  }

  /* One edge group for each top property of the edges: { name, members, reference, line }. A reference group
     (rdfs:seeAlso and the properties under it) is not used for tiers or cycles; the reference groups come last. */
  findEdgeGroups() {
    const kinds = this.analysis.kinds || {};
    const references = this.analysis.refs || {};
    const properties = Object.keys(kinds);
    const isReference = name => properties.some(property => kinds[property] === name && references[property]);
    const names = [...new Set(Object.values(kinds))];
    names.sort((a, b) => isReference(a) - isReference(b) || (a < b ? -1 : 1));

    let used = 0;
    return names.map(name => {
      const reference = isReference(name);
      return {
        name,
        reference,
        members: properties.filter(property => kinds[property] === name && property !== name),
        line: reference ? REFERENCE_LINE : LINES[used++ % LINES.length],
      };
    });
  }

  /* ---------- what is not a concept ---------- */

  /* The ontologies in the files: each term that another term is rdfs:isDefinedBy, and each term that has the
     rdf:type of such a term. The View menu shows them only when its Prefixes box is checked. */
  findOntologies() {
    const statements = this.statements;
    const found = new Set();
    const types = new Set();
    for (const id of Object.keys(this.analysis.terms)) {
      const iri = this.iriOf(id);
      if (!statements.isValueOf(iri, IS_DEFINED_BY)) continue;
      found.add(id);
      for (const type of statements.values(iri, TYPE)) types.add(type);
    }
    for (const id of Object.keys(this.analysis.terms)) {
      if (statements.values(this.iriOf(id), TYPE).some(type => types.has(type))) found.add(id);
    }
    return found;
  }

  /* An individual is an instance of something (rdf:type) that is not itself a class, a property or a datatype.
     It is data, not a concept, and a chart does not show it. */
  findIndividuals() {
    const statements = this.statements;
    const OWL = 'http://www.w3.org/2002/07/owl#';
    const isMeta = type => {
      if (type === CLASS || type === PROPERTY || type === DATATYPE) return true;
      if (statements.above(type, SUBCLASS_OF).some(above => above === CLASS || above === PROPERTY)) return true;
      return type.startsWith(OWL) && /(Class|Property|Restriction|DataRange)$/.test(type);
    };
    const found = new Set();
    for (const id of Object.keys(this.analysis.terms)) {
      if (this.ontologies.has(id)) continue;
      const iri = this.iriOf(id);
      const types = statements.values(iri, TYPE);
      if (!types.length || types.some(isMeta)) continue;
      if (statements.about(iri).some(statement => STRUCTURE.includes(statement.p))) continue;
      if (statements.pointingAt(iri).some(x => x.property === TYPE || STRUCTURE.includes(x.property))) continue;
      found.add(id);
    }
    return found;
  }
}
