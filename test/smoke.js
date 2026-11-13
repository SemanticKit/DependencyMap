'use strict';
/* Starts the app on a new data folder with the files of test/inputs, connects an MCP client over HTTP and over
   standard input and output, and checks the answers against depmap-cli.js on the same files. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createApp } = require('../server.js');

const app = path.join(__dirname, '..');
const inputs = path.join(__dirname, 'inputs');
const names = ['rdf.ttl', 'rdfs.ttl', 'rdf-xsd.ttl', 'owl.ttl'];

async function check(client, label) {
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args || {} });
    assert(!r.isError, label + ' ' + name + ': ' + (r.content[0] && r.content[0].text));
    const t = r.content[0].text;
    try { return JSON.parse(t); } catch (_) { return t; }
  };
  const tools = (await client.listTools()).tools.map(t => t.name).sort();
  assert.deepStrictEqual(tools, ['enable_file', 'files', 'find', 'load_file', 'order', 'read_file', 'remove_file', 'select', 'summary', 'term', 'terms_in', 'write_file']);
  const cli = JSON.parse(execFileSync(process.execPath, [path.join(app, 'depmap-cli.js'), ...names.map(n => path.join(inputs, n)), '--json'], { maxBuffer: 1 << 28 }));
  const sum = await call('summary');
  assert.strictEqual(sum.terms, Object.keys(cli.terms).length, 'terms');
  assert.strictEqual(sum.edges, cli.edges.length, 'edges');
  assert.deepStrictEqual(sum.cycles, cli.cycles, 'cycles');
  const order = await call('order');
  assert.deepStrictEqual(order, cli.tiers.flatMap(t => t.groups.map(u => ({ tier: t.tier, unit: u }))), 'order');
  const cliTerm = JSON.parse(execFileSync(process.execPath, [path.join(app, 'depmap-cli.js'), ...names.map(n => path.join(inputs, n)), '--term', 'owl:cardinality', '--json']))[0];
  const term = await call('term', { id: 'owl:cardinality' });
  for (const k of ['iri', 'tier', 'unit', 'hasToHappenFirst', 'waitsForIt', 'statements', 'label', 'comment']) assert.deepStrictEqual(term[k], cliTerm[k], 'term ' + k);
  assert((await call('find', { text: 'subclassof' })).includes('rdfs:subClassOf'));
  assert((await call('terms_in', { name: 'rdfs.ttl' })).includes('rdfs:Class'));
  assert.strictEqual(await call('read_file', { name: 'rdfs.ttl' }), fs.readFileSync(path.join(inputs, 'rdfs.ttl'), 'utf8'));
  const added = await call('write_file', { name: 'extra.ttl', text: '@prefix ex: <http://example.org/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nex:A a rdfs:Class ; rdfs:subClassOf ex:B .\nex:B a rdfs:Class .\n' });
  assert.strictEqual(added.triples, 3);
  const a = await call('term', { id: 'ex:A' });
  assert(a.hasToHappenFirst.includes('ex:B') && a.hasToHappenFirst.includes('rdfs:Class'), 'ex:A');
  await call('enable_file', { name: 'extra.ttl', enabled: false });
  assert(!(await call('find', { text: 'example.org' })).length, 'off');
  await call('remove_file', { name: 'extra.ttl' });
  assert(!(await call('files')).includes('extra.ttl'));
  const bad = await client.callTool({ name: 'write_file', arguments: { name: 'bad.ttl', text: 'this is not turtle' } });
  assert(bad.isError);
  const sel = await call('select', { ids: ['rdfs:Class'] });
  assert.deepStrictEqual(sel.selected, ['rdfs:Class']);
  console.log(label + ': ' + tools.length + ' tools; ' + sum.terms + ' terms, ' + sum.edges + ' edges, ' + sum.cycles.length + ' cycles; answers match depmap-cli.js');
}

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'depmap-test-'));
  const rdf = path.join(data, 'rdf');
  fs.mkdirSync(rdf);
  for (const n of names) fs.copyFileSync(path.join(inputs, n), path.join(rdf, n));
  const port = 4900 + Math.floor(Math.random() * 500);
  const a = createApp({ data, port, vocabularies: rdf });
  await new Promise(ok => a.httpServer.listen(port, '127.0.0.1', ok));
  try {
    const http = new Client({ name: 'smoke', version: '1' });
    await http.connect(new StreamableHTTPClientTransport(new URL('http://localhost:' + port + '/mcp')));
    await check(http, 'HTTP');
    await http.close();
    const stdio = new Client({ name: 'smoke', version: '1' });
    await stdio.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(app, 'server.js'), '--stdio', '--vocabularies', rdf, '--data', data, '--port', String(port)], stderr: 'ignore' }));
    await check(stdio, 'stdio');
    await stdio.close();
  } finally { a.close(); fs.rmSync(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
