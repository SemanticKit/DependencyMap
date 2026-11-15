/* A diagram of boxes, made from a map by the views of some layers. It names no term: each view selects what it is
   for, and the nearest view that matches says which part of the diagram that becomes. The Class view gives it the
   layers of views/class/classLayers.js, the Datatype view those of views/datatype/datatypeLayers.js.

   What it gives:
     boxes   each { id, name, groups }; a group is { title, depth, members }, the members with one type
     links   each { from, to }: the inheritance connections between the boxes
     prefixes  the prefixes of the boxes, for the legend */
import { TermMap } from './TermMap.js';

/* The views of the layers, read against the statements of a map. */
class LayeredViews {
  constructor(layers, statements) {
    this.statements = statements;
    /* a view of a later layer goes before one of an earlier layer */
    this.views = layers.flatMap(layer => layer.views);
    this.byType = new Map();
    this.instance = this.propertiesOf('instance');
    this.inherits = this.propertiesOf('inherits');
    this.memberOf = this.propertiesOf('memberOf');
    this.memberType = this.propertiesOf('memberType');
  }

  /* the properties of a statement part: each one a view selects, with the properties the files put under it */
  propertiesOf(part) {
    const properties = [];
    for (const view of this.views) {
      if (view.part !== part || !view.select.statement) continue;
      for (const property of this.statements.family(view.select.statement)) {
        if (!properties.includes(property)) properties.push(property);
      }
    }
    return properties;
  }

  /* The views of a type: the views that select the type, then those that select each type above it, the nearest
     first. Each is { view, type }, with the type it was found at. */
  of(type) {
    if (this.byType.has(type)) return this.byType.get(type);
    const found = [];
    const seen = new Set([type]);
    let level = [type];
    while (level.length) {
      const next = [];
      for (const each of level) {
        const selecting = this.views.filter(view => view.select.instanceOf === each).reverse();
        for (const view of selecting) found.push({ view, type: each });
        for (const above of this.statements.named(each, this.inherits)) {
          if (seen.has(above)) continue;
          seen.add(above);
          next.push(above);
        }
      }
      level = next;
    }
    this.byType.set(type, found);
    return found;
  }

  /* what a term is: for each of its types that has a view, { type, views } */
  typesOf(iri) {
    return this.statements.named(iri, this.instance)
      .map(type => ({ type, views: this.of(type) }))
      .filter(each => each.views.length);
  }

  /* each IRI a term points at with one of the properties, those inside blank nodes too */
  valuesOf(iri, properties) {
    return [...new Set(properties.flatMap(property => this.statements.values(iri, property)))];
  }
}

export class BoxDiagram {
  /* map: a TermMap. layers: the layers of views. isCharted: whether a chart shows a term. */
  constructor(map, layers, isCharted) {
    this.map = map;
    this.views = new LayeredViews(layers, map.statements);
    this.terms = map.ids.filter(isCharted);
    this.boxById = new Map();
    this.links = [];

    for (const id of this.terms) this.addBox(id);
    for (const id of this.terms) {
      this.addLinks(id);
      this.addAsMember(id);
    }
    /* the parts of a box: the type the member view selects first, then the types under it */
    for (const box of this.boxes) {
      box.groups.sort((a, b) => a.depth - b.depth || (a.title < b.title ? -1 : 1));
    }
  }

  get boxes() {
    return [...this.boxById.values()];
  }

  get prefixes() {
    return [...new Set(this.boxes.map(box => this.map.prefixOf(box.id)))].sort();
  }

  /* a term whose nearest view is the class part is a box, unless a nearest view of another of its types omits it */
  addBox(id) {
    const parts = this.views.typesOf(this.map.iriOf(id)).map(each => each.views[0].view.part);
    if (!parts.includes('class') || parts.includes('omit')) return;
    this.boxById.set(id, { id, name: TermMap.bare(id), groups: [] });
  }

  /* an inheritance connection from a box to each box it names as above it */
  addLinks(id) {
    if (!this.boxById.has(id)) return;
    const statements = this.map.statements;
    for (const iri of statements.named(this.map.iriOf(id), this.views.inherits)) {
      const above = statements.idOf(iri);
      if (above !== id && this.boxById.has(above)) this.links.push({ from: id, to: above });
    }
  }

  /* a term that has the members part goes into the box of each class it is a member of */
  addAsMember(id) {
    const iri = this.map.iriOf(id);
    const types = this.views.typesOf(iri);
    const title = this.titleOf(types);
    if (!title) return;

    const statements = this.map.statements;
    const marks = this.marksOf(types);
    const memberTypes = this.views.valuesOf(iri, this.views.memberType);
    for (const classIri of this.views.valuesOf(iri, this.views.memberOf)) {
      const box = this.boxById.get(statements.idOf(classIri));
      if (!box) continue;
      const type = memberTypes.map(each => this.nameIn(each, box.id)).join(', ');
      const group = this.groupOf(box, title);
      group.members.push(this.nameIn(iri, box.id) + (type ? ': ' + type : '') + marks);
    }
  }

  /* The part of the box a member is in has the type of the member as its title: the type whose nearest view is the
     members view, and of several the one farthest under that view. A type with a nearer view of its own (a mark)
     is not a title; then the title is the type the members view selects. Null when the term is no member. */
  titleOf(types) {
    const statements = this.map.statements;
    const asMember = types
      .map(each => ({ ...each, position: each.views.findIndex(found => found.view.part === 'members') }))
      .filter(each => each.position >= 0);
    if (!asMember.length) return null;

    const direct = asMember
      .filter(each => each.position === 0)
      .map(each => ({ type: each.type, depth: statements.above(each.type, this.views.inherits[0]).length }));
    if (!direct.length) {
      const first = asMember[0];
      return { type: first.views[first.position].type, depth: 0 };
    }
    direct.sort((a, b) => b.depth - a.depth || (a.type < b.type ? -1 : 1));
    return direct[0];
  }

  /* the text of each mark view of the types of a term, after the member */
  marksOf(types) {
    const texts = [];
    for (const each of types) {
      for (const found of each.views) {
        if (found.view.part === 'mark' && !texts.includes(found.view.text)) texts.push(found.view.text);
      }
    }
    return texts.map(text => ' ' + text).join('');
  }

  /* the group of a box for members with this title, made when the box has none yet */
  groupOf(box, title) {
    const name = this.map.statements.short(title.type);
    let group = box.groups.find(each => each.title === name);
    if (!group) {
      group = { title: name, depth: title.depth, members: [] };
      box.groups.push(group);
    }
    return group;
  }

  /* the name of something inside a box: without its prefix when that is the prefix of the box */
  nameIn(iri, boxId) {
    const id = this.map.statements.idOf(iri);
    if (!id) return this.map.statements.short(iri);
    return this.map.prefixOf(id) === this.map.prefixOf(boxId) ? TermMap.bare(id) : id;
  }
}
