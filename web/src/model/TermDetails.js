/* What the views of a term read. The ontologies define what is shown: a type is a term of the map, and the
   properties declared for it (rdfs:domain) are its format. A view asks whether the term is of a type (isA) and for
   the term through the format of that type (formatOf).

   What it gives:
     field    { property, name, tip, text, values }      one property of the term, with the values the term states
     value    { literal | iri }
     details  { iri, properties, tabs }                  the properties with the term as their domain;
                                                         tabs: each { iri, name }, a value of rdfs:isDefinedBy
     row      { iri, id, label, comment, definedBy }     one such property: its name and its comment */
import { TermMap } from './TermMap.js';
import { TYPE, CLASS, RESOURCE, LITERAL, DATATYPE, LABEL, COMMENT, SUBCLASS_OF, SUBPROPERTY_OF, DOMAIN, RANGE, IS_DEFINED_BY } from '../rdf.js';

export class TermDetails {
  /* map: a TermMap. isShown: whether the map shows an IRI. */
  constructor(map, isShown) {
    this.map = map;
    this.statements = map.statements;
    this.isShown = isShown;
  }

  /* the properties that have the term with this id as their domain */
  of(id) {
    const iri = this.map.iriOf(id);
    const properties = this.propertyRows(iri);
    return { iri, properties, tabs: this.tabsOf(properties) };
  }

  /* ---------- the classes of a term ---------- */

  /* The classes of a resource (RDF 1.2 Schema 2.1, 2.2): the classes it states (rdf:type), the domain of each
     property it is the subject of, the range of each property it is the value of, and each class above those
     (rdfs:subClassOf). rdfs:Resource is the class of everything, and comes first; then the classes nearest to it. */
  classesOf(iri) {
    const statements = this.statements;
    const stated = [RESOURCE, ...statements.values(iri, TYPE)];
    for (const statement of statements.about(iri)) stated.push(...this.domainOf(statement.predicate.value));
    for (const { property } of statements.pointingAt(iri)) stated.push(...this.rangeOf(property));

    const classes = [];
    for (const cls of stated) {
      for (const each of [cls, ...statements.above(cls, SUBCLASS_OF)]) {
        if (!classes.includes(each)) classes.push(each);
      }
    }
    const depth = cls => cls === RESOURCE ? -1 : statements.above(cls, SUBCLASS_OF).length;
    return classes
      .filter(cls => cls === RESOURCE || this.isShown(cls))
      .map((cls, position) => ({ cls, depth: depth(cls), position }))
      .sort((a, b) => a.depth - b.depth || a.position - b.position)
      .map(entry => entry.cls);
  }

  /* the domain of a property: the one it states, or the one of the nearest property above it that states one */
  domainOf(property) {
    return this.inherited(property, DOMAIN);
  }

  /* the range of a property: the one it states, or the one of the nearest property above it that states one */
  rangeOf(property) {
    return this.inherited(property, RANGE);
  }

  inherited(property, what) {
    for (const each of [property, ...this.statements.above(property, SUBPROPERTY_OF)]) {
      const found = this.statements.values(each, what);
      if (found.length) return found;
    }
    return [];
  }

  /* ---------- the fields of a term ---------- */

  /* whether a term is an instance of a class */
  isA(id, cls) {
    return this.classesOf(this.map.iriOf(id)).includes(cls);
  }

  /* A term through the format of a type. The type is a term of the map, and the ontologies say which properties
     are declared for it (rdfs:domain): the format is those properties, in the order of the map. This gives a field
     for each of them that the term states. */
  formatOf(id, type) {
    const iri = this.map.iriOf(id);
    const declared = this.statements.pointingAt(type)
      .filter(each => each.property === DOMAIN && this.isShown(each.subject))
      .map(each => each.subject);
    return this.map.order([...new Set(declared)])
      .map(property => this.fieldOf(iri, property))
      .filter(Boolean);
  }

  /* A term with no type in mind: a field for each property the term states and the map shows, in the order of the
     map. */
  fieldsOf(id) {
    const iri = this.map.iriOf(id);
    const stated = [...new Set(this.statements.about(iri).map(statement => statement.predicate.value))];
    return this.map.order(stated)
      .filter(this.isShown)
      .map(property => this.fieldOf(iri, property))
      .filter(Boolean);
  }

  /* One field: the values the term states with the property. A field with no value is not shown. */
  fieldOf(iri, property) {
    const values = this.valuesOf(iri, property);
    if (!values.length) return null;
    return this.field(property, values, this.isText(property));
  }

  /* A field is text when the range of its property is literal, or when one of its values is a string: a property
     with no range can still state a string. */
  field(property, values, text) {
    const states = values.some(value => value.literal && value.literal.string);
    return { property, name: this.nameOf(property), tip: this.tipOf(property), text: text || states, values };
  }

  /* the values a term states with a property: each a literal, or an IRI that the map shows */
  valuesOf(iri, property) {
    /* rdfs:Resource is the class of everything (RDF 1.2 Schema 2.1.1): a statement that something is in it, or
       that a class is under it, says nothing */
    const saysNothing = value => value.termType === 'NamedNode' && value.value === RESOURCE && this.rangeOf(property).includes(CLASS);
    const values = [];
    /* a value is shown once, however many ontologies state it */
    const addLiteral = literal => {
      if (!values.some(known => known.literal && known.literal.text === literal.text && known.literal.tag === literal.tag)) values.push({ literal });
    };
    const addIri = value => {
      if (!values.some(known => known.iri === value)) values.push({ iri: value });
    };
    for (const statement of this.statements.about(iri)) {
      if (statement.predicate.value !== property || saysNothing(statement.object)) continue;
      if (statement.object.termType === 'Literal') {
        addLiteral(this.literal(statement.object));
        continue;
      }
      for (const value of this.statements.irisIn(statement.object, statement.graph)) {
        if (this.isShown(value)) addIri(value);
      }
    }
    return values;
  }

  /* a literal with what it says of itself: its language, or its datatype when that is not a plain string; string
     says that it is a string, with a language or without */
  literal(value) {
    if (value.language) return { text: value.value, tag: '@' + value.language, string: true };
    const datatype = value.datatype ? value.datatype.value : '';
    if (datatype && !/#string$/.test(datatype)) return { text: value.value, tag: this.statements.short(datatype), string: false };
    return { text: value.value, tag: '', string: true };
  }

  /* The range of a property says what its values are: a literal range gives text, each other range gives links. */
  isText(property) {
    const range = this.rangeOf(property);
    return range.length > 0 && range.every(cls => this.isLiteral(cls));
  }

  isLiteral(cls) {
    if (cls === LITERAL) return true;
    if (this.statements.above(cls, SUBCLASS_OF).includes(LITERAL)) return true;
    return this.statements.values(cls, TYPE).includes(DATATYPE);
  }

  /* ---------- the properties that have the term in their domain ---------- */

  /* Each property that states the term as its rdfs:domain: one relationship from the term. A property of a class
     above the term, or under such a property, is not one of these; the term that states it shows it. A row is a
     property by its name and its comment; a property is a term, and selecting it shows its own fields. The rows
     are one list, in the order of the property names. */
  propertyRows(iri) {
    if (!this.isShown(DOMAIN)) return [];
    const attached = this.statements.pointingAt(iri)
      .filter(each => each.property === DOMAIN && this.isShown(each.subject))
      .map(each => each.subject);
    return [...new Set(attached)]
      .sort((a, b) => this.sortName(a).localeCompare(this.sortName(b)))
      .map(property => ({
        iri: property,
        id: this.statements.idOf(property),
        /* the color says the prefix, so the name is shown without it */
        label: this.nameOf(property),
        comment: this.statements.text(property, COMMENT),
        definedBy: this.statements.values(property, IS_DEFINED_BY)[0] || '',
      }));
  }

  /* rdfs:isDefinedBy selects which properties the list shows, one value at a time: each value among the rows, named
     by its prefix, in the order of the names */
  tabsOf(rows) {
    return [...new Set(rows.map(row => row.definedBy))]
      .filter(Boolean)
      .map(iri => ({ iri, name: this.statements.prefixName(iri) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------- names ---------- */

  /* the name of a property as the key of a field: its label, or its name without the prefix */
  nameOf(iri) {
    return this.statements.text(iri, LABEL) || TermMap.bare(this.statements.short(iri));
  }

  tipOf(iri) {
    return this.statements.text(iri, COMMENT) || this.statements.short(iri);
  }

  sortName(iri) {
    return this.nameOf(iri).toLowerCase();
  }
}
