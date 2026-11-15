/* The questions the page asks of the statements of the map. The statements are in the map's LDO dataset, as RDF/JS
   quads: a statement has a subject, a predicate, an object and the graph of its ontology. */
import N3 from 'n3';

const { namedNode } = N3.DataFactory;
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const isIri = term => term.termType === 'NamedNode';
const isBlank = term => term.termType === 'BlankNode';
/* how far up a blank node is followed to the term it belongs to */
const OWNER_DEPTH = 12;

export class Statements {
  /* map: the DependencyMap of the core */
  constructor(map) {
    this.map = map;
    this.dataset = map.dataset;
  }

  /* the statements that have this IRI as their subject, in the order they are written */
  about(iri) {
    return this.map.about(namedNode(iri));
  }

  /* the id of the term with this IRI, or undefined when no ontology describes such a term */
  idOf(iri) {
    const id = this.map.short(iri);
    return this.map.terms[id] ? id : undefined;
  }

  /* the short name of an IRI: prefix:name, or the IRI in angle brackets */
  short(iri) {
    return this.map.short(iri);
  }

  /* The name of an ontology: the prefix whose namespace is its IRI. An ontology with no prefix is named by what it
     calls itself (rdfs:label), and one that says nothing by the last part of its IRI. The whole IRI is not a name. */
  prefixName(iri) {
    const found = this.map.names.namespaces.find(each => each.ns === iri || each.ns === iri + '#' || each.ns === iri + '/');
    if (found) return found.used;
    const label = this.text(iri, LABEL);
    if (label) return label;
    return iri.replace(/[#/]+$/, '').split(/[#/]/).pop();
  }

  /* a property, and each property the ontologies put under it (rdfs:subPropertyOf) */
  family(property) {
    return this.map.family(property);
  }

  /* the text a term states with a property, or with a property under it */
  text(iri, property) {
    return this.map.text(iri, property);
  }

  /* the IRIs that a value names: itself, or each IRI inside a blank node (a list or a class expression) */
  irisIn(value, graph) {
    return this.map.analysis.irisIn(value, graph);
  }

  /* the IRIs a term points at with a property, those inside blank nodes too */
  values(iri, property) {
    const iris = [];
    for (const statement of this.dataset.match(namedNode(iri), namedNode(property), null)) {
      for (const value of this.irisIn(statement.object, statement.graph)) {
        if (!iris.includes(value)) iris.push(value);
      }
    }
    return iris;
  }

  /* The IRIs a term names itself with one of the properties. An IRI inside a blank node is left out: a class
     expression (a restriction) is not a class the term is an instance of or is under. */
  named(iri, properties) {
    const iris = [];
    for (const property of properties) {
      for (const statement of this.dataset.match(namedNode(iri), namedNode(property), null)) {
        if (isIri(statement.object) && !iris.includes(statement.object.value)) iris.push(statement.object.value);
      }
    }
    return iris;
  }

  /* the statements that point at an IRI: each { property, subject }, once */
  pointingAt(iri) {
    const found = [];
    const add = (property, subject) => {
      if (!found.some(each => each.property === property && each.subject === subject)) found.push({ property, subject });
    };
    for (const statement of this.dataset.match(null, null, namedNode(iri))) {
      if (isIri(statement.subject)) {
        add(statement.predicate.value, statement.subject.value);
        continue;
      }
      /* inside a blank node: the property is the one of the statement that holds the blank node */
      const owner = this.ownerOf(statement.subject, statement.graph);
      if (!owner) continue;
      for (const holder of this.dataset.match(owner, null, null, statement.graph)) {
        if (isBlank(holder.object) && this.irisIn(holder.object, holder.graph).includes(iri)) add(holder.predicate.value, owner.value);
      }
    }
    return found;
  }

  /* the term a blank node belongs to: the named subject above it */
  ownerOf(blank, graph) {
    const seen = new Set();
    let level = [blank];
    for (let depth = 0; depth < OWNER_DEPTH && level.length; depth++) {
      const next = [];
      for (const node of level) {
        if (seen.has(node.value)) continue;
        seen.add(node.value);
        for (const statement of this.dataset.match(null, null, node, graph)) {
          if (isIri(statement.subject)) return statement.subject;
          next.push(statement.subject);
        }
      }
      level = next;
    }
    return null;
  }

  /* whether a statement with this property has the IRI as its value */
  isValueOf(iri, property) {
    return this.dataset.match(null, namedNode(property), namedNode(iri)).size > 0;
  }

  /* what an IRI points at with a property, what those point at, and so on: the nearest first */
  above(iri, property) {
    return this.walk(iri, at => this.values(at, property));
  }

  /* what points at an IRI with a property, what points at those, and so on: the nearest first */
  below(iri, property) {
    return this.walk(iri, at => this.pointingAt(at).filter(each => each.property === property).map(each => each.subject));
  }

  /* each IRI that the steps reach from a start, the nearest first, without the start */
  walk(start, step) {
    const reached = [];
    const seen = new Set([start]);
    const waiting = [start];
    while (waiting.length) {
      for (const next of step(waiting.shift())) {
        if (seen.has(next)) continue;
        seen.add(next);
        reached.push(next);
        waiting.push(next);
      }
    }
    return reached;
  }
}
