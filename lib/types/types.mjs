/* The types of the loaded ontologies, for an MCP client.

   A type is a definition, so each class is offered as an MCP resource: its name is its compact id, its address is
   its IRI, and reading it gives its properties. The resources are those of the loaded ontologies: they are listed
   again when the ontologies change.

   One tool, create, makes a term of a type. LDO does the work: the term is an object of the shape type of its
   class, read from the map's own dataset, and what the call adds is kept in a transaction. The app stores the
   statements that adds. */
import N3 from 'n3';
import * as z from 'zod';
import { Schema } from './Schema.mjs';
import { shapeTypeOf } from './shapeType.mjs';

/* server: an McpServer. ontologies: the Ontologies of the app. */
export async function offerTypes(server, ontologies) {
  const types = new Types(ontologies, await ontologies.map());
  for (const offered of server.typeResources || []) offered.remove();
  server.typeResources = types.classes.map(cls => types.offer(server, cls));
  if (server.createTool) server.createTool.remove();
  server.createTool = types.offerCreate(server);
}

class Types {
  constructor(ontologies, map) {
    this.ontologies = ontologies;
    this.map = map;
    this.schema = new Schema(map.dataset);
    this.classes = this.schema.classes;
  }

  /* ---------- a type, as a resource ---------- */

  offer(server, cls) {
    const id = this.map.short(cls);
    const about = { title: id, description: this.schema.commentOf(cls), mimeType: 'application/json' };
    return server.registerResource(id, cls, about, async () => ({
      contents: [{ uri: cls, mimeType: 'application/json', text: JSON.stringify(await this.definitionOf(cls), null, 1) }],
    }));
  }

  /* what a type is: its class, the classes above it, and its properties */
  async definitionOf(cls) {
    const type = await shapeTypeOf(this.schema, cls);
    const short = iri => this.map.short(iri);
    return {
      id: short(cls),
      iri: cls,
      comment: this.schema.commentOf(cls),
      above: this.schema.withAbove(cls).slice(1).map(short),
      properties: type.members.map(member => ({
        name: member.name,
        id: short(member.iri),
        takes: member.literal ? 'text' : member.ranges.map(short),
        values: member.single ? 'one' : 'many',
      })),
    };
  }

  /* ---------- a term of a type ---------- */

  offerCreate(server) {
    const config = {
      title: 'Create a term',
      description: 'Make a term of a type, or add to one. The types are the resources of this server; read a type for its properties. ' +
        'Each value is checked against the property it is for.',
      inputSchema: {
        type: z.string().describe('The type: a compact id such as owl:Class, or an IRI in angle brackets'),
        id: z.string().describe('The term: a compact id such as ex:Thing, or an IRI in angle brackets'),
        properties: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
          .describe('The properties of the term, by the names the type gives them'),
      },
      annotations: { title: 'Create a term', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    };
    return server.registerTool('create', config, async given => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(await this.create(given), null, 1) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] };
      }
    });
  }

  /* Make the term from what was given, and store the statements that adds. */
  async create({ type, id, properties = {} }) {
    const cls = this.iriFor(type);
    if (!this.classes.includes(cls)) throw new Error(type + ' is not a type of the loaded ontologies.');
    const shapeType = await shapeTypeOf(this.schema, cls);
    for (const name of Object.keys(properties)) {
      if (!shapeType.members.some(member => member.name === name)) throw new Error(name + ' is not a property of ' + this.map.short(cls) + '.');
    }

    const iri = this.iriFor(id);
    const transaction = this.map.dataset.startTransaction();
    const term = transaction.usingType(shapeType).fromSubject(iri);
    term.type.add({ '@id': cls });
    for (const member of shapeType.members) {
      if (properties[member.name] === undefined) continue;
      const values = [].concat(properties[member.name]);
      if (member.single && values.length > 1) throw new Error(member.name + ' takes one value.');
      for (const value of values) this.set(term, member, value);
    }
    const added = [...(transaction.getChanges().added || [])];
    const ontology = added.length ? await this.ontologies.addStatements(iri, await turtleOf(added)) : null;
    return { id: this.map.short(iri), type: this.map.short(cls), statements: added.length, ontology };
  }

  /* give a property of the term a value: text, or a term of the type the property takes */
  set(term, member, value) {
    const object = member.literal ? String(value) : { '@id': this.termFor(member, value) };
    if (member.single) term[member.name] = object;
    else term[member.name].add(object);
  }

  /* the IRI of a value that has to be a loaded term, of each type the property takes */
  termFor(member, value) {
    const iri = this.iriFor(value);
    const property = this.map.short(member.iri);
    if (!this.map.terms[this.map.short(iri)]) throw new Error(property + ': ' + value + ' is not a term of the loaded ontologies.');
    for (const range of member.ranges) {
      if (!this.schema.isA(iri, range)) throw new Error(property + ': ' + value + ' is not a ' + this.map.short(range) + '.');
    }
    return iri;
  }

  /* the IRI a name stands for: the id of a term, an IRI in angle brackets, or prefix:name with a loaded prefix */
  iriFor(name) {
    const text = String(name || '').trim();
    if (this.map.terms[text]) return this.map.terms[text].i;
    if (/^<[^<>\s]+>$/.test(text)) return text.slice(1, -1);
    const colon = text.indexOf(':');
    const namespace = colon >= 0 ? this.map.names.prefixes[text.slice(0, colon)] : undefined;
    if (!namespace) throw new Error(text + ': no loaded ontology has this prefix. Give the IRI in angle brackets.');
    return namespace + text.slice(colon + 1);
  }
}

/* statements as Turtle, with N3's writer */
function turtleOf(quads) {
  const writer = new N3.Writer();
  writer.addQuads(quads);
  return new Promise((done, failed) => writer.end((error, text) => error ? failed(error) : done(text)));
}
