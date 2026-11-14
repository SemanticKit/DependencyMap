'use strict';
/* The MCP server of the map: one tool for each operation of the page's DepMapAPI that works without a page. */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const z = require('zod');

const VERSION = require('../package.json').version;

function json(v) { return { content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] }; }
function wrap(fn) {
  return async (args) => {
    try { return json(await fn(args || {})); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: String(e && e.message || e) }] }; }
  };
}

/* map: a DependencyMap. pages: { select(iris) -> number of open pages that got it } */
function createMcpServer(map, pages) {
  const server = new McpServer({ name: 'semantickit-dependency-map', version: VERSION }, {
    instructions: 'The SemanticKit Dependency Map. It reads RDF files (Turtle, N-Triples or RDF/XML) and computes, for every term, ' +
      'what has to be generated first. Every IRI that is the subject of a statement in a loaded file is a term. Each statement from a term ' +
      'to a term is an edge. A cycle is a strongly connected component and is generated as one unit. The tier of a term is the length of ' +
      'the longest dependency path below it. Name terms by their compact ids, such as rdfs:Class, or by <IRI>. Only files that are on are in the map.',
  });
  const ro = { readOnlyHint: true, openWorldHint: false };
  const t = (name, title, description, inputSchema, fn, annotations) =>
    server.registerTool(name, { title, description, inputSchema, annotations: Object.assign({ title }, annotations || ro) }, wrap(fn));

  t('summary', 'Summary', 'The files, with their triples and whether each is on, the number of terms and edges, the number of terms in each tier, and the cycles.',
    {}, () => map.summary());
  t('order', 'Build order', 'The build order: one entry per unit (a term, or a cycle of terms generated together), in tier order.',
    {}, () => map.order());
  t('term', 'Term', 'One term: its IRI, the files that declare it, its tier, its unit, label, comment, every statement about it, ' +
    'hasToHappenFirst (every term that must be generated before it, in tier order) and waitsForIt (every term that needs it).',
    { id: z.string().describe('A compact id such as owl:Class, or an IRI in angle brackets') }, a => map.term(a.id));
  t('terms_in', 'Terms in a file', 'The ids of the terms that a loaded file declares.',
    { name: z.string().describe('The file name, such as owl.ttl') }, a => map.termsIn(a.name));
  t('find', 'Find terms', 'The ids of the terms whose id, IRI or label contains the text (case does not matter).',
    { text: z.string() }, a => map.find(a.text));
  t('environment', 'Environment', 'What the app runs in: the project folder, the docs folder, the process, and every environment variable of the process, ' +
    'such as the variables of the session that started it. The values of secrets are hidden.', {}, () => map.environment());
  t('files', 'Files', 'The names of the loaded files.', {}, () => map.files());
  t('read_file', 'Read a file', 'The text of a loaded file.', { name: z.string() }, a => map.readFile(a.name));
  const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  t('write_file', 'Write a file', 'Save a new file, or the new text of a loaded file with this name, and compute the map again. ' +
    'The text must be Turtle, N-Triples or RDF/XML; the format comes from the name (.ttl, .nt, .rdf, .owl, .xml) or the text.',
    { name: z.string().describe('File name, such as shacl.ttl'), text: z.string() }, a => map.writeFile(a.name, a.text), write);
  t('load_file', 'Load a file from disk', 'Read a file from this computer and save it in the map, as write_file does.',
    { path: z.string().describe('A path on the computer the app runs on'), name: z.string().optional().describe('The name in the map; the file name if left out') },
    a => map.loadFile(a.path, a.name), write);
  t('enable_file', 'Turn a file on or off', 'Turn a loaded file on or off. A file that is off stays loaded but is not in the map.',
    { name: z.string(), enabled: z.boolean() }, a => map.enableFile(a.name, a.enabled), write);
  t('remove_file', 'Remove a file', 'Remove a loaded file from the map and delete its saved copy.',
    { name: z.string() }, a => map.removeFile(a.name), { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
  t('select', 'Select terms on the map', 'Select terms on every open map page and show the first one. Returns how many pages got the selection.',
    { ids: z.array(z.string()).min(1) }, a => {
      const iris = map.iris(a.ids);
      if (!iris.length) throw new Error('None of these terms is in the loaded files: ' + a.ids.join(', '));
      return { selected: iris.map(i => map.short(i)), pages: pages.select(iris) };
    }, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  return server;
}

module.exports = { createMcpServer };
