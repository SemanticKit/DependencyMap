/* Starts the app on a new, empty project, loads the ontologies of test/inputs as the page does, connects an MCP
   client over HTTP and over standard input and output, and checks the answers against depmap-cli.js on the same
   ontologies. */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../server.js';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputs = path.join(app, 'test', 'inputs');
const names = ['rdf.ttl', 'rdfs.ttl', 'rdf-xsd.ttl', 'owl.ttl'];
let docs; /* the docs folder of the test project */
let port; /* the port of the app under test */

/* what the command line says of the same ontologies */
function cli(...args) {
  const out = execFileSync(process.execPath, [path.join(app, 'depmap-cli.js'), ...names.map(name => path.join(inputs, name)), ...args, '--json'], { maxBuffer: 1 << 28 });
  return JSON.parse(out);
}

/* load an ontology of test/inputs into the app, as the page does */
async function load(name) {
  const text = fs.readFileSync(path.join(inputs, name), 'utf8');
  const response = await fetch('http://localhost:' + port + '/api/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, text }) });
  assert(response.ok, 'load ' + name + ': ' + (await response.text()));
}

async function check(client, label) {
  const call = async (name, given) => {
    const result = await client.callTool({ name, arguments: given || {} });
    assert(!result.isError, label + ' ' + name + ': ' + (result.content[0] && result.content[0].text));
    const text = result.content[0].text;
    try { return JSON.parse(text); } catch (_) { return text; }
  };
  const refused = async (why, given) => assert((await client.callTool({ name: 'create', arguments: given })).isError, why);

  /* the tools and the prompts */
  const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepStrictEqual(tools, ['create', 'environment', 'find', 'order', 'select', 'shape', 'summary', 'term', 'terms_in']);
  const prompts = (await client.listPrompts()).prompts.map(prompt => prompt.name).sort();
  assert.deepStrictEqual(prompts, ['build_order', 'what_first']);
  const asked = await client.getPrompt({ name: 'what_first', arguments: { id: 'rdfs:Class' } });
  assert(asked.messages[0].content.text.includes('rdfs:Class'), 'the prompt names the term');

  /* a type is a resource: one for each class of the loaded ontologies, read for its properties */
  const types = (await client.listResources()).resources.map(resource => resource.name);
  for (const name of ['rdfs:Class', 'rdfs:Datatype', 'rdf:Property', 'owl:Class', 'owl:ObjectProperty']) assert(types.includes(name), label + ' has the type ' + name);
  const read = await client.readResource({ uri: 'http://www.w3.org/2000/01/rdf-schema#Class' });
  const definition = JSON.parse(read.contents[0].text);
  assert.strictEqual(definition.id, 'rdfs:Class');
  assert(definition.above.includes('rdfs:Resource'), 'a type says what is above it');
  assert.deepStrictEqual(definition.properties.find(property => property.id === 'rdfs:subClassOf'), { name: 'subClassOf', id: 'rdfs:subClassOf', takes: ['rdfs:Class'], values: 'many' });

  /* the app says where it runs */
  const where = await call('environment');
  assert(where.docs.endsWith('/docs'), 'environment gives the docs folder');
  assert(typeof where.PROJECT_DIR === 'string' && where.PROJECT_DIR.startsWith('/'), 'environment gives the project root');
  assert(where.env && typeof where.env.PATH === 'string', 'environment gives the variables');

  /* the map answers as the command line does */
  const told = cli();
  const summary = await call('summary');
  assert.deepStrictEqual({ ...summary, ontologies: summary.ontologies.map(each => each.name).sort() }, { ...told.summary, ontologies: names.slice().sort() }, 'summary');
  assert.deepStrictEqual(await call('order'), told.order, 'order');
  assert.deepStrictEqual(await call('term', { id: 'owl:cardinality' }), cli('--term', 'owl:cardinality')[0], 'term');
  assert((await call('find', { text: 'subclassof' })).includes('rdfs:subClassOf'));
  assert((await call('terms_in', { name: 'rdfs.ttl' })).includes('rdfs:Class'));
  assert.deepStrictEqual((await call('select', { ids: ['rdfs:Class'] })).selected, ['rdfs:Class']);

  /* shape takes values in any form: a text, an object with names and values, a number. It gives the terms each
     value matches, the classes those involve, and what links the classes. */
  const shape = await call('shape', { values: ['sub class of', { datatype: 'the class of datatypes' }, 42, 'zzqqxxjj'] });
  assert.deepStrictEqual(shape.inputs.map(input => input.value), ['sub class of', 'datatype', 'the class of datatypes', '42', 'zzqqxxjj'], 'shape reads every value');
  const subClassOf = shape.inputs[0].matches.find(match => match.term === 'rdfs:subClassOf');
  assert(subClassOf && subClassOf.kind === 'property' && subClassOf.classes.includes('rdfs:Class'), 'a property is the classes it connects');
  assert(shape.inputs[1].matches.some(match => match.term === 'rdfs:Datatype' && match.kind === 'class'), 'a class is itself');
  assert(shape.classes.includes('rdfs:Class') && shape.classes.includes('rdfs:Datatype'), 'shape gives the classes');
  assert(shape.links.some(link => link.from === 'rdfs:Datatype' && link.property === 'rdfs:subClassOf' && link.to === 'rdfs:Class'), 'shape gives the links');
  assert(shape.unmatched.includes('zzqqxxjj'), 'a value that matches nothing is said to match nothing');

  /* create makes a term of a type, and checks each value against the property it is for */
  const made = await call('create', { type: 'rdfs:Class', id: 'rdfs:Smoke', properties: { label: 'Smoke', subClassOf: ['rdfs:Resource'] } });
  assert.deepStrictEqual(made, { id: 'rdfs:Smoke', type: 'rdfs:Class', statements: 3, ontology: 'rdfs.ttl' });
  const smoke = await call('term', { id: 'rdfs:Smoke' });
  assert(smoke.hasToHappenFirst.includes('rdfs:Resource') && smoke.hasToHappenFirst.includes('rdfs:Class'), 'rdfs:Smoke');
  await refused('a value that is not of the type of the property', { type: 'rdfs:Class', id: 'rdfs:Smoke2', properties: { subClassOf: ['rdfs:label'] } });
  await refused('a value that is not a loaded term', { type: 'rdfs:Class', id: 'rdfs:Smoke2', properties: { subClassOf: ['rdfs:Nothing'] } });
  await refused('a property the type does not have', { type: 'rdfs:Class', id: 'rdfs:Smoke2', properties: { nothing: 'x' } });
  await refused('a type that is not loaded', { type: 'rdfs:Nothing', id: 'rdfs:Smoke2' });
  /* back to the ontology as it was */
  await load('rdfs.ttl');

  console.log(label + ': ' + tools.length + ' tools, ' + types.length + ' types; ' + summary.terms + ' terms, ' + summary.edges + ' edges, ' + summary.cycles.length + ' cycles; answers match depmap-cli.js');
}

/* an empty project: the app makes docs and the folder of each ontology when one is loaded */
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'depmap-test-'));
docs = path.join(data, 'docs');
port = 4900 + Math.floor(Math.random() * 500);
const running = createApp({ data });
await new Promise(done => running.httpServer.listen(port, '127.0.0.1', done));
try {
  assert(!fs.existsSync(docs), 'nothing is made before an ontology is loaded');
  for (const name of names) await load(name);
  for (const [folder, name] of [['rdf', 'rdf.ttl'], ['rdfs', 'rdfs.ttl'], ['xsd', 'rdf-xsd.ttl'], ['owl', 'owl.ttl']]) {
    assert(fs.existsSync(path.join(docs, folder, name)), name + ' is in docs/' + folder);
  }
  const http = new Client({ name: 'smoke', version: '1' });
  await http.connect(new StreamableHTTPClientTransport(new URL('http://localhost:' + port + '/mcp')));
  await check(http, 'HTTP');
  await http.close();

  const stdio = new Client({ name: 'smoke', version: '1' });
  await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(app, 'server.js'), '--stdio', '--port', String(port)], cwd: data, stderr: 'ignore' }));
  await check(stdio, 'stdio');
  await stdio.close();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  running.close();
  fs.rmSync(data, { recursive: true, force: true });
}
