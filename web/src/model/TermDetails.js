/* The details of one term, as the sheet shows them. The files define what is shown: the classes of the term choose
   its views, and the properties attached to each class (rdfs:domain) are its fields. This class works out what
   there is to show; the TermDetails component and the components under it put it on the page.

   What it gives:
     details  { iri, comment, fields, groups, tabs }
     field    { property, name, tip, text, values }      one property of the term, with the values the term states
     value    { literal | iri, from, note }              from: the property under the field's that states the value
     group    { definedBy, name, lists }                 the properties with the term in their domain, by rdfs:isDefinedBy
     list     { from, rows }                             from: the class above the term that the properties come from
     row      { iri, label, comment, note, blocks }      one such property, shown as a term
     block    { heading, fields }                        the fields of one view; heading: the class of the view */
import { TYPE, CLASS, RESOURCE, LITERAL, DATATYPE, LABEL, COMMENT, SUBCLASS_OF, SUBPROPERTY_OF, DOMAIN, RANGE, IS_DEFINED_BY } from '../rdf.js';

export class TermDetails {
  /* map: a TermMap. isShown: whether the map shows an IRI. */
  constructor(map, isShown) {
    this.map = map;
    this.statements = map.statements;
    this.isShown = isShown;
  }

  /* the details of the term with this id */
  of(id) {
    const iri = this.map.iriOf(id);
    const classes = this.classesOf(iri);
    /* the name and the comment of the term are the heading of the sheet, not fields */
    const blocks = this.blocksOf(iri, classes, new Set([LABEL, COMMENT]));
    const inherited = this.inheritedDomainFields(iri, classes);
    /* the definition is one list: the fields of each view the term has, in the order of the views */
    const fields = [];
    for (const cls of classes) {
      const block = blocks.find(each => each.heading === cls);
      if (block) fields.push(...block.fields);
      fields.push(...inherited.filter(each => each.cls === cls).map(each => each.field));
    }
    const rows = this.propertyRows(iri);
    return {
      iri,
      comment: this.statements.text(iri, COMMENT),
      fields,
      groups: this.groupsOf(iri, rows),
      tabs: this.tabsOf(rows),
    };
  }

  /* ---------- the classes of a term ---------- */

  /* The classes of a resource (RDF 1.2 Schema 2.1, 2.2): the classes it states (rdf:type), the domain of each
     property it is the subject of, the range of each property it is the value of, and each class above those
     (rdfs:subClassOf). rdfs:Resource is the class of everything, and comes first; then the classes nearest to it. */
  classesOf(iri) {
    const statements = this.statements;
    const stated = [RESOURCE, ...statements.values(iri, TYPE)];
    for (const statement of statements.about(iri)) stated.push(...this.domainOf(statement.p));
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

  /* The fields of a term, as one block for each of its classes. A statement of the term goes to the view of the
     class that its property is attached to (rdfs:domain); a property of no class goes to rdfs:Resource. A property
     with several domains is in the view of each. A block with no field is left out. */
  blocksOf(iri, classes, leaveOut) {
    const fields = this.fieldProperties(iri, leaveOut);
    const blocks = [];
    for (const cls of classes) {
      const here = [...fields.keys()].filter(property => {
        const domains = this.domainOf(property).filter(domain => classes.includes(domain));
        return domains.length ? domains.includes(cls) : cls === RESOURCE;
      });
      const made = this.map.order(here)
        .map(property => this.fieldOf(iri, property, fields.get(property)))
        .filter(Boolean);
      if (made.length) blocks.push({ heading: cls, fields: made });
    }
    return blocks;
  }

  /* The properties that are fields of a term, each with the properties under it that the term also states. A value
     of a property is a value of each property above it (RDF 1.2 Schema 2.2.5), so a property whose super-property
     the map shows is not a field of its own: its values are in the field of that super-property, under its name. */
  fieldProperties(iri, leaveOut) {
    const stated = [...new Set(this.statements.about(iri).map(statement => statement.p))];
    const fields = new Map();
    for (const property of this.map.order(stated).filter(this.isShown)) {
      const top = this.topShown(property);
      if (leaveOut.has(property) || leaveOut.has(top)) continue;
      if (!fields.has(top)) fields.set(top, []);
      fields.get(top).push(property);
    }
    return fields;
  }

  /* the farthest property above this one that the map shows, or the property itself */
  topShown(property) {
    let top = property;
    for (const above of this.statements.above(property, SUBPROPERTY_OF)) {
      if (this.isShown(above)) top = above;
    }
    return top;
  }

  /* One field: the values the term states with the property, then those it states with each property under it.
     A value from a property under it names that property. A field with no value is not shown. */
  fieldOf(iri, property, stated) {
    const values = this.valuesOf(iri, property);
    let text = values.length > 0 && this.isText(property);
    for (const under of this.map.order(stated.filter(each => each !== property))) {
      const more = this.valuesOf(iri, under);
      if (!more.length) continue;
      if (this.isText(under)) text = true;
      const from = { name: this.nameOf(under), tip: this.tipOf(under) };
      values.push(...more.map(value => ({ ...value, from })));
    }
    if (!values.length) return null;
    return this.field(property, values, text);
  }

  field(property, values, text) {
    return { property, name: this.nameOf(property), tip: this.tipOf(property), text, values };
  }

  /* the values a term states with a property: each a literal, or an IRI that the map shows */
  valuesOf(iri, property) {
    /* rdfs:Resource is the class of everything (RDF 1.2 Schema 2.1.1): a statement that something is in it, or
       that a class is under it, says nothing */
    const saysNothing = value => value.t === 'iri' && value.v === RESOURCE && this.rangeOf(property).includes(CLASS);
    const values = [];
    for (const statement of this.statements.about(iri)) {
      if (statement.p !== property || saysNothing(statement.o)) continue;
      if (statement.o.t === 'lit') {
        values.push({ literal: this.literal(statement.o) });
        continue;
      }
      for (const value of this.statements.irisIn(statement.o, statement.file)) {
        if (this.isShown(value)) values.push({ iri: value });
      }
    }
    return values;
  }

  /* a literal with what it says of itself: its language, or its datatype when that is not a plain string */
  literal(value) {
    if (value.l) return { text: value.v, tag: '@' + value.l };
    if (value.d && !/#string$/.test(value.d)) return { text: value.v, tag: this.statements.short(value.d) };
    return { text: value.v, tag: '' };
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

  /* The domain a term has from each property above it (rdfs:subPropertyOf): each { cls, field }, a field of its own
     that says where the domain is inherited from, in the view of the class that rdfs:domain is attached to. */
  inheritedDomainFields(iri, classes) {
    if (!this.isShown(DOMAIN)) return [];
    const statements = this.statements;
    const own = statements.values(iri, DOMAIN);
    const views = this.domainOf(DOMAIN).filter(cls => classes.includes(cls));
    const fields = [];
    for (const above of statements.above(iri, SUBPROPERTY_OF)) {
      for (const domain of statements.values(above, DOMAIN)) {
        if (own.includes(domain) || !this.isShown(domain)) continue;
        const value = { iri: domain, note: { text: ' inherited from ', iri: above } };
        for (const cls of views) fields.push({ cls, field: this.field(DOMAIN, [value], false) });
      }
    }
    return fields;
  }

  /* ---------- the properties that have the term in their domain ---------- */

  /* Each property whose rdfs:domain is the term or a class above it (rdfs:subClassOf), and each property under such
     a property (rdfs:subPropertyOf), which has the same domain, inherited. rdfs:Resource is the class of
     everything: its properties are the rdfs:Resource view of every term, not properties of this class. */
  propertyRows(iri) {
    const statements = this.statements;
    const classes = [iri, ...statements.above(iri, SUBCLASS_OF).filter(cls => cls !== RESOURCE)];
    const rows = [];
    const seen = new Set();
    for (const cls of classes) {
      if (!this.isShown(DOMAIN)) break;
      const attached = statements.pointingAt(cls)
        .filter(x => x.property === DOMAIN && this.isShown(x.subject))
        .map(x => x.subject);
      for (const property of this.map.order([...new Set(attached)])) {
        if (!seen.has(property)) {
          seen.add(property);
          rows.push({ iri: property, cls, note: null });
        }
        for (const under of this.map.order(statements.below(property, SUBPROPERTY_OF))) {
          if (seen.has(under) || !this.isShown(under)) continue;
          seen.add(under);
          rows.push({ iri: under, cls, note: { text: ' domain inherited from ', iri: property } });
        }
      }
    }
    return rows;
  }

  /* The rows in groups, one for each value of rdfs:isDefinedBy, in the order of its name; the rows that have none
     come last. In a group, the term's own properties come first, then those of each class above it, under that
     class; each list is in the order of the property names. */
  groupsOf(iri, rows) {
    const classes = [...new Set(rows.map(row => row.cls))];
    return this.definedBys(rows).map(definedBy => {
      const lists = [];
      for (const cls of classes) {
        const here = rows.filter(row => row.cls === cls && this.definedBy(row.iri) === definedBy);
        if (!here.length) continue;
        here.sort((a, b) => this.sortName(a.iri).localeCompare(this.sortName(b.iri)));
        lists.push({ from: cls === iri ? null : cls, rows: this.rowsOf(here, cls, definedBy) });
      }
      return { definedBy, name: definedBy ? this.statements.prefixName(definedBy) : '', lists };
    });
  }

  /* A property is a resource too: each row is shown by the views of its own classes, under its name and its
     comment. What the list already says is not shown again: the classes every property of the list has (their
     views have no heading, and an rdf:type to one of them is not shown), the rdfs:isDefinedBy of the group, and the
     rdfs:domain the list is under. */
  rowsOf(rows, cls, definedBy) {
    const statements = this.statements;
    const classesOfRow = rows.map(row => this.classesOf(row.iri));
    const shared = classesOfRow.reduce((common, classes) => common.filter(each => classes.includes(each)));
    return rows.map((row, i) => {
      const leaveOut = new Set([LABEL, COMMENT]);
      if (definedBy) leaveOut.add(IS_DEFINED_BY);
      if (statements.values(row.iri, TYPE).every(type => shared.includes(type))) leaveOut.add(TYPE);
      if (statements.values(row.iri, DOMAIN).every(domain => domain === cls)) leaveOut.add(DOMAIN);
      const blocks = this.blocksOf(row.iri, classesOfRow[i], leaveOut)
        .map(block => shared.includes(block.heading) ? { ...block, heading: null } : block);
      return {
        iri: row.iri,
        label: statements.text(row.iri, LABEL),
        comment: statements.text(row.iri, COMMENT),
        note: row.note,
        blocks,
      };
    });
  }

  /* rdfs:isDefinedBy selects which properties the list shows, one value at a time: each value, named by its prefix */
  tabsOf(rows) {
    return this.definedBys(rows).filter(Boolean).map(iri => ({ iri, name: this.statements.prefixName(iri) }));
  }

  /* the values of rdfs:isDefinedBy among the rows, in the order of their names; '' for the rows with none, last */
  definedBys(rows) {
    const name = iri => this.statements.prefixName(iri);
    return [...new Set(rows.map(row => this.definedBy(row.iri)))]
      .sort((a, b) => (a === '') - (b === '') || name(a).localeCompare(name(b)));
  }

  definedBy(iri) {
    return this.statements.values(iri, IS_DEFINED_BY)[0] || '';
  }

  /* ---------- names ---------- */

  nameOf(iri) {
    return this.statements.text(iri, LABEL) || this.statements.short(iri);
  }

  tipOf(iri) {
    return this.statements.text(iri, COMMENT) || this.statements.short(iri);
  }

  sortName(iri) {
    return this.nameOf(iri).toLowerCase();
  }
}
