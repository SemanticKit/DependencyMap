/* The loaded ontologies, read for what they define: the classes, and the properties of each. Nothing of RDF Schema
   is modelled here. The definitions are the loaded statements themselves, read with the dataset's own match. */
import N3 from 'n3';

const { namedNode } = N3.DataFactory;
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

const TYPE = namedNode(RDF + 'type');
const SUBCLASS_OF = namedNode(RDFS + 'subClassOf');
const DOMAIN = namedNode(RDFS + 'domain');
const RANGE = namedNode(RDFS + 'range');
const COMMENT = namedNode(RDFS + 'comment');

const isNamed = term => term.termType === 'NamedNode';

export class Schema {
  /* dataset: the LDO dataset of the loaded ontologies */
  constructor(dataset) {
    this.dataset = dataset;
    const typed = [...dataset.match(null, TYPE, null)].map(quad => quad.subject).filter(isNamed).map(subject => subject.value);
    /* the classes: each term that is an rdfs:Class, once */
    this.classes = [...new Set(typed)].filter(iri => this.isA(iri, RDFS + 'Class'));
  }

  /* the IRIs a term names with a property */
  values(iri, property) {
    return [...this.dataset.match(namedNode(iri), property, null)].map(quad => quad.object).filter(isNamed).map(object => object.value);
  }

  commentOf(iri) {
    const found = [...this.dataset.match(namedNode(iri), COMMENT, null)];
    return found.length ? found[0].object.value : '';
  }

  /* a class and every class above it, the nearest first */
  withAbove(cls) {
    const found = [cls];
    for (const each of found) {
      for (const above of this.values(each, SUBCLASS_OF)) {
        if (!found.includes(above)) found.push(above);
      }
    }
    return found;
  }

  /* whether a term is of a class: it states the class, or a class under it. Everything is an rdfs:Resource. */
  isA(iri, cls) {
    if (cls === RDFS + 'Resource') return true;
    return this.values(iri, TYPE).some(type => this.withAbove(type).includes(cls));
  }

  /* a class of literals: rdfs:Literal, or a datatype */
  isLiteral(cls) {
    return cls === RDFS + 'Literal' || this.isA(cls, RDFS + 'Datatype');
  }

  /* the properties of a class: those that name it, or a class above it, as their domain. rdf:type is left out:
     the type of a term is its class. Each is { iri, ranges, literal, single }. */
  propertiesOf(cls) {
    const found = [];
    for (const each of this.withAbove(cls)) {
      for (const quad of this.dataset.match(null, DOMAIN, namedNode(each))) {
        const iri = quad.subject.value;
        if (!isNamed(quad.subject) || iri === TYPE.value || found.some(known => known.iri === iri)) continue;
        const ranges = this.values(iri, RANGE);
        found.push({
          iri,
          ranges,
          literal: ranges.length > 0 && ranges.every(range => this.isLiteral(range)),
          single: this.isA(iri, OWL + 'FunctionalProperty'),
        });
      }
    }
    return found;
  }
}
