/* The MCP server of the map: the tools that ask the map a question, and the prompts. The types of the loaded
   ontologies and the create tool are offered by lib/types/types.mjs. */
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { Shape } from '../core/shape.mjs';

const VERSION = createRequire(import.meta.url)('../package.json').version;

/* how the map is made: the instructions of the server, and the start of each prompt */
const HOW = 'The SemanticKit Dependency Map reads ontologies (Turtle, N-Triples or RDF/XML) and computes, for every term, ' +
  'what has to be generated first. Every IRI that is the subject of a statement in a loaded ontology is a term. Each statement from a ' +
  'term to a term is an edge, and the property of the statement is the name of the edge. A value inside a blank node (a list or a class ' +
  'expression) belongs to the statement that holds the blank node. The ontologies say which edges are references: rdfs:seeAlso and each ' +
  'property that they make a subproperty of it; references are not used for cycles or tiers. A cycle is a strongly connected ' +
  'component and is generated as one unit. The tier of a term is the length of the longest dependency path below it. Name terms by ' +
  'their compact ids, such as rdfs:Class, or by <IRI>. Only ontologies that are on are in the map. The types of the loaded ontologies ' +
  'are the resources of this server.';

const READS = { readOnlyHint: true, openWorldHint: false };
const TERM = z.string().describe('A compact id such as owl:Class, or an IRI in angle brackets');

function answer(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }] };
}

/* ontologies: the Ontologies of the app. pages: { select(iris) -> the number of open pages that got it } */
export function createMcpServer(ontologies, pages) {
  const server = new McpServer({ name: 'semantickit-dependency-map', version: VERSION }, { instructions: HOW });

  /* one tool: its answer is what the function gives; what it throws is the error the client gets */
  const tool = (name, title, description, inputSchema, run, annotations = READS) => {
    server.registerTool(name, { title, description, inputSchema, annotations: { title, ...annotations } }, async given => {
      try {
        return answer(await run(given || {}, await ontologies.map()));
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] };
      }
    });
  };

  tool('summary', 'Summary',
    'The ontologies, with their triples and whether each is on, the number of terms and edges, the number of terms in each tier, and the cycles.',
    {}, (given, map) => map.summary());
  tool('order', 'Build order',
    'The build order: one entry per unit (a term, or a cycle of terms generated together), in tier order.',
    {}, (given, map) => map.order());
  tool('term', 'Term',
    'One term: its IRI, the ontologies that declare it, its tier, its unit, label, comment, every statement about it, ' +
    'hasToHappenFirst (every term that must be generated before it, in tier order) and waitsForIt (every term that needs it).',
    { id: TERM }, (given, map) => map.term(given.id));
  tool('terms_in', 'Terms in an ontology',
    'The ids of the terms that a loaded ontology declares.',
    { name: z.string().describe('The name of the ontology, such as owl.ttl') }, (given, map) => map.termsIn(given.name));
  tool('find', 'Find terms',
    'The ids of the terms whose id, IRI or label contains the text (case does not matter).',
    { text: z.string() }, (given, map) => map.find(given.text));
  tool('environment', 'Environment',
    'What the app runs in: the project folder, the docs folder, the process, and every environment variable of the process, ' +
    'such as the variables of the session that started it. The values of secrets are hidden.',
    {}, () => ontologies.environment());
  tool('select', 'Select terms on the map',
    'Select terms on every open map page and show the first one. Returns how many pages got the selection.',
    { ids: z.array(z.string()).min(1) }, (given, map) => {
      const ids = given.ids.map(name => map.idOf(name)).filter(Boolean);
      if (!ids.length) throw new Error('None of these terms is in the loaded ontologies: ' + given.ids.join(', '));
      /* a page is told the IRIs, because its choice of prefixes can differ */
      return { selected: ids, pages: pages.select(ids.map(id => map.iriOf(id))) };
    }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });

  tool('shape', 'Shape of some information',
    'What some information is in the loaded ontologies. Give values in any form: names of properties, labels, descriptions, ' +
    'sample data, as texts, lists or objects. The answer starts with the request as it was given. For each value it gives the terms that match (by name, label or comment), each with ' +
    'the classes it involves: a class is itself, a property is its domain and its range. Then it gives the classes of the shape, ' +
    'the links between them (rdfs:subClassOf, owl:equivalentClass, or a property from its domain to its range) and the paths that ' +
    'join them. The classes are also selected on every open map page, so the shape can be looked at.',
    { values: z.array(z.any()).min(1).describe('The values, in any form') }, (given, map) => {
      const shape = new Shape(map).of(given.values);
      const iris = shape.classes.map(id => map.iriOf(id)).filter(Boolean);
      return { ...shape, pages: iris.length ? pages.select(iris) : 0 };
    }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });

  /* The prompts: what a person asks of the map, with how the map is made. */
  const asks = text => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });
  server.registerPrompt('build_order', {
    title: 'Build order',
    description: 'What the loaded ontologies give: the tiers, the cycles and the order to generate the terms in.',
  }, () => asks(HOW + '\n\nUse the summary tool and the order tool. Say which ontologies are on, how many terms and tiers there are, ' +
    'which cycles there are (each is generated as one unit), and the order to generate the units in, tier by tier.'));
  server.registerPrompt('what_first', {
    title: 'What has to happen first',
    description: 'For one term: what has to be generated before it, and what waits for it.',
    argsSchema: { id: TERM },
  }, ({ id }) => asks(HOW + '\n\nUse the term tool on ' + id + '. Say its tier and its unit, what has to be generated before it, ' +
    'in tier order, and what waits for it. Then use the select tool to select it on the map.'));
  return server;
}
