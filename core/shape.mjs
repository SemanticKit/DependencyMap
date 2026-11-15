/* The shape of some information in the loaded ontologies.

   Given values in any form (names of properties, labels, descriptions, sample data), it finds the terms that match
   each value, reduces the matches to the classes they involve, and finds the paths between those classes. The
   result is the classes and the links between them: what kind of things the values describe and how those things
   relate. It is the starting point for writing a new ontology, and for seeing which loaded ontologies it touches.

   The search is MiniSearch; the paths are graphology's. */
import N3 from 'n3';
import Graph from 'graphology';
import MiniSearch from 'minisearch';
import { allSimplePaths } from 'graphology-simple-path';

const { namedNode } = N3.DataFactory;
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const TYPE = RDF + 'type';
const SUBCLASS_OF = RDFS + 'subClassOf';
const SUBPROPERTY_OF = RDFS + 'subPropertyOf';
const DOMAIN = RDFS + 'domain';
const RANGE = RDFS + 'range';
const LABEL = RDFS + 'label';
const COMMENT = RDFS + 'comment';
const EQUIVALENT_CLASS = OWL + 'equivalentClass';
/* the classes of everything: every class is under them, so a path through one says nothing */
const EVERYTHING = [RDFS + 'Resource', OWL + 'Thing'];

/* the most terms kept for one value, the longest path looked for, and the most paths kept between two classes */
const MATCHES = 8;
const PATH_LENGTH = 3;
const PATHS = 5;

/* a name as words: firstName, first_name and first-name are all "first name" */
const words = text => String(text).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class Shape {
  /* map: a DependencyMap */
  constructor(map) {
    this.map = map;
    this.dataset = map.dataset;
    this.index = this.indexOfTerms();
    this.classes = this.graphOfClasses();
  }

  /* ---------- what is searched ---------- */

  /* every term, searchable by its name, its label and its comment */
  indexOfTerms() {
    const index = new MiniSearch({
      fields: ['name', 'label', 'comment'],
      searchOptions: { boost: { name: 3, label: 3 }, prefix: true, fuzzy: 0.2 },
    });
    index.addAll(Object.keys(this.map.terms).map(id => ({
      id,
      name: words(id.slice(id.indexOf(':') + 1)),
      label: this.map.text(this.map.terms[id].i, LABEL),
      comment: this.map.text(this.map.terms[id].i, COMMENT),
    })));
    return index;
  }

  /* ---------- the classes and what links them ---------- */

  /* the terms a term points at with a property; a value inside a blank node counts */
  values(iri, property) {
    const found = [];
    for (const quad of this.dataset.match(namedNode(iri), namedNode(property), null)) {
      for (const value of this.map.analysis.irisIn(quad.object, quad.graph)) {
        if (!found.includes(value)) found.push(value);
      }
    }
    return found;
  }

  /* what a property says with rdfs:domain or rdfs:range: its own, or that of the nearest property above it */
  inherited(property, what) {
    for (const each of [property, ...this.map.analysis.propertiesAbove(property)]) {
      const found = this.values(each, what);
      if (found.length) return found;
    }
    return [];
  }

  /* The classes as a graph. A node is a class. A link is a statement that relates two classes: one is under the
     other (rdfs:subClassOf), they are the same (owl:equivalentClass), or a property runs from one to the other
     (rdfs:domain to rdfs:range). The classes of everything are left out. */
  graphOfClasses() {
    const graph = new Graph({ type: 'undirected', multi: true });
    const link = (from, property, to) => {
      if (from === to || EVERYTHING.includes(from) || EVERYTHING.includes(to)) return;
      graph.mergeNode(from);
      graph.mergeNode(to);
      graph.addEdge(from, to, { from, property, to });
    };
    for (const relation of [SUBCLASS_OF, EQUIVALENT_CLASS]) {
      for (const quad of this.dataset.match(null, namedNode(relation), null)) {
        if (quad.subject.termType !== 'NamedNode') continue;
        for (const to of this.map.analysis.irisIn(quad.object, quad.graph)) link(quad.subject.value, relation, to);
      }
    }
    const properties = new Set([...this.dataset.match(null, namedNode(DOMAIN), null)]
      .filter(quad => quad.subject.termType === 'NamedNode')
      .map(quad => quad.subject.value));
    for (const property of properties) {
      for (const from of this.values(property, DOMAIN)) {
        graph.mergeNode(from);
        for (const to of this.inherited(property, RANGE)) link(from, property, to);
      }
    }
    return graph;
  }

  /* ---------- from a value to classes ---------- */

  /* The classes a term involves. A class is itself. A property is the classes it connects: its domain and its
     range. Anything else is the classes it is an instance of. */
  classesOf(iri) {
    if (this.classes.hasNode(iri)) return { kind: 'class', classes: [iri] };
    const connects = [...this.inherited(iri, DOMAIN), ...this.inherited(iri, RANGE)];
    const isProperty = connects.length > 0 || this.values(iri, SUBPROPERTY_OF).length > 0 ||
      this.values(iri, TYPE).some(type => /Property$/.test(type));
    if (isProperty) return { kind: 'property', classes: connects };
    const types = this.values(iri, TYPE);
    return { kind: types.some(type => /Class$/.test(type)) ? 'class' : 'individual', classes: types.some(type => /Class$/.test(type)) ? [iri] : types };
  }

  /* any value as the texts to search for: a text is itself; a list or an object is each thing in it, names and
     values alike; anything else is how it is written */
  static textsIn(value) {
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap(Shape.textsIn);
    if (typeof value === 'object') return Object.entries(value).flatMap(([name, inside]) => [name, ...Shape.textsIn(inside)]);
    return [String(value)];
  }

  /* the terms that match one text, the best first, each with where it matched and the classes it involves */
  matchesOf(text) {
    return this.index.search(words(text)).slice(0, MATCHES).map(hit => {
      const iri = this.map.terms[hit.id].i;
      const { kind, classes } = this.classesOf(iri);
      return {
        term: hit.id,
        kind,
        label: this.map.labelOf(hit.id),
        matchedIn: [...new Set(Object.values(hit.match).flat())],
        score: Math.round(hit.score * 100) / 100,
        classes: classes.filter(cls => !EVERYTHING.includes(cls)).map(cls => this.map.short(cls)),
      };
    });
  }

  /* ---------- the answer ---------- */

  /* The shape of some values: for each value the terms it matched, then the classes those involve, the links
     between those classes, and the paths that join them. */
  of(values) {
    const inputs = Shape.textsIn(values).map(value => ({ value, matches: this.matchesOf(value) }));
    const found = [...new Set(inputs.flatMap(input => input.matches.flatMap(match => match.classes)))];
    const iriOf = id => this.map.terms[id] ? this.map.terms[id].i : id.replace(/^<|>$/g, '');
    const nodes = found.map(iriOf).filter(iri => this.classes.hasNode(iri));

    const paths = [];
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const between = allSimplePaths(this.classes, nodes[a], nodes[b], { maxDepth: PATH_LENGTH })
          .sort((x, y) => x.length - y.length)
          .slice(0, PATHS);
        for (const path of between) paths.push(path);
      }
    }

    /* the classes of the shape: those found, and those the paths pass through */
    const inShape = [...new Set([...nodes, ...paths.flat()])];
    const links = [];
    for (const path of paths) {
      for (let step = 1; step < path.length; step++) {
        this.classes.forEachEdge(path[step - 1], path[step], (edge, link) => {
          const written = { from: this.map.short(link.from), property: this.map.short(link.property), to: this.map.short(link.to) };
          if (!links.some(each => each.from === written.from && each.property === written.property && each.to === written.to)) links.push(written);
        });
      }
    }

    return {
      inputs,
      unmatched: inputs.filter(input => !input.matches.length).map(input => input.value),
      classes: inShape.map(iri => this.map.short(iri)).sort(),
      links,
      paths: paths.map(path => path.map(iri => this.map.short(iri))),
    };
  }
}
