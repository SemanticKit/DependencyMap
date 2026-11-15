/* The statements of the files that are on, and the questions the page asks of them. The engine (depmap-core.js)
   indexes the statements; this class is the one place that reads that index. */
import { engine } from './engine.js';

export class Statements {
  /* files: the files that are on, each { name, triples }. analysis: what the engine made of them. */
  constructor(files, analysis) {
    this.facts = engine.facts(files.map(file => ({ name: file.name, triples: file.triples })));

    this.idByIri = new Map();
    for (const id of Object.keys(analysis.terms)) this.idByIri.set(analysis.terms[id].i, id);

    /* each namespace with its prefix, the longest namespace first */
    this.namespaces = [];
    const prefixes = analysis.prefixes || {};
    for (const prefix of Object.keys(prefixes)) this.namespaces.push({ namespace: prefixes[prefix], prefix });
    this.namespaces.sort((a, b) => b.namespace.length - a.namespace.length);
  }

  /* the statements that have this IRI as their subject: each { p, o, file } */
  about(iri) {
    return this.facts.subj.get(iri) || [];
  }

  /* the statements inside a blank node of a file */
  inBlankNode(file, node) {
    return this.facts.bn.get(file + '\u0000' + node) || [];
  }

  /* the id of the term with this IRI, or undefined when no file has such a term */
  idOf(iri) {
    return this.idByIri.get(iri);
  }

  /* the short name of an IRI: the id of its term, or prefix:name, or the IRI in angle brackets */
  short(iri) {
    const id = this.idOf(iri);
    if (id) return id;
    for (const { namespace, prefix } of this.namespaces) {
      if (!iri.startsWith(namespace)) continue;
      const name = iri.slice(namespace.length);
      if (!/[\/#?\s<>]/.test(name)) return prefix + ':' + name;
      break;
    }
    return '<' + iri + '>';
  }

  /* the name of an ontology: the prefix whose namespace is its IRI */
  prefixName(iri) {
    for (const { namespace, prefix } of this.namespaces) {
      if (namespace === iri || namespace === iri + '#' || namespace === iri + '/') return prefix;
    }
    return this.short(iri).replace(/^<|>$/g, '').replace(/:$/, '');
  }

  /* a property, and each property the files put under it (rdfs:subPropertyOf) */
  family(property) {
    return engine.family(this.facts, property);
  }

  /* the text a term states with a property, or with a property under it */
  text(iri, property) {
    return engine.text(this.facts, iri, this.family(property));
  }

  /* the IRIs that a value names: itself, or each IRI inside a blank node (a list or a class expression) */
  irisIn(value, file) {
    if (value.t === 'iri') return [value.v];
    if (value.t !== 'bnode') return [];
    const iris = [];
    const seen = new Set();
    const waiting = [value.v];
    while (waiting.length) {
      const node = waiting.pop();
      if (seen.has(node)) continue;
      seen.add(node);
      for (const statement of this.inBlankNode(file, node)) {
        if (statement.o.t === 'bnode') waiting.push(statement.o.v);
        else if (statement.o.t === 'iri' && !iris.includes(statement.o.v)) iris.push(statement.o.v);
      }
    }
    return iris;
  }

  /* the IRIs a term points at with a property, those inside blank nodes too */
  values(iri, property) {
    const iris = [];
    for (const statement of this.about(iri)) {
      if (statement.p !== property) continue;
      for (const value of this.irisIn(statement.o, statement.file)) {
        if (!iris.includes(value)) iris.push(value);
      }
    }
    return iris;
  }

  /* The IRIs a term names itself with one of the properties. An IRI inside a blank node is left out: a class
     expression (a restriction) is not a class the term is an instance of or is under. */
  named(iri, properties) {
    const iris = [];
    for (const statement of this.about(iri)) {
      if (!properties.includes(statement.p) || statement.o.t !== 'iri') continue;
      if (!iris.includes(statement.o.v)) iris.push(statement.o.v);
    }
    return iris;
  }

  /* the statements that point at an IRI: each { property, subject }, once */
  pointingAt(iri) {
    const found = [];
    const seen = new Set();
    const add = (property, subject) => {
      const key = property + ' ' + subject;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ property, subject });
    };
    for (const statement of this.facts.obj.get(iri) || []) {
      if (statement.s.t === 'iri') {
        add(statement.p, statement.s.v);
        continue;
      }
      /* inside a blank node: the property is the one of the statement that holds the blank node */
      const owner = engine.owner(this.facts, statement.file, statement.s.v);
      if (!owner) continue;
      for (const holder of this.about(owner)) {
        if (holder.o.t === 'bnode' && this.irisIn(holder.o, holder.file).includes(iri)) add(holder.p, owner);
      }
    }
    return found;
  }

  /* whether a statement with this property has the IRI as its value */
  isValueOf(iri, property) {
    return (this.facts.obj.get(iri) || []).some(statement => statement.p === property);
  }

  /* what an IRI points at with a property, what those point at, and so on: the nearest first */
  above(iri, property) {
    return this.walk(iri, at => this.values(at, property));
  }

  /* what points at an IRI with a property, what points at those, and so on: the nearest first */
  below(iri, property) {
    return this.walk(iri, at => this.pointingAt(at).filter(x => x.property === property).map(x => x.subject));
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
