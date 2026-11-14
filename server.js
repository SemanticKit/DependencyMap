#!/usr/bin/env node
'use strict';
/* SemanticKit Dependency Map, local app.
   node server.js [--port 4787] [--stdio]
   Serves the map page at http://localhost:<port>/ and an MCP server at http://localhost:<port>/mcp
   (Streamable HTTP). With --stdio the MCP server is on standard input and output instead, and the page
   is served too when the port is free. The app is started in a project. It reads each RDF file under the
   docs folder of the project, and it creates the folders it needs there. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Store } = require('./lib/store');
const { DependencyMap } = require('./lib/map');
const { createMcpServer } = require('./lib/mcp');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const CHUNK = 80000; /* the size of the parts the page reads a file in */

/* The root of the project: the nearest folder, from the one the app is started in upwards, that holds .git.
   The app runs no program to find it. Where no folder holds .git, it is the folder the app is started in. */
function projectRoot() {
  const start = process.cwd();
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (dir === path.dirname(dir)) return start;
  }
}

function options(argv) {
  const o = { port: Number(process.env.DEPMAP_PORT) || 4787, data: projectRoot(), stdio: false, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--stdio') o.stdio = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else { o.bad = a; }
  }
  return o;
}

function createApp({ data, port }) {
  const store = new Store(data);
  const map = new DependencyMap(store);
  const clients = new Set(); /* open pages: server-sent event streams */
  const generic = new Map(); /* documents other than files/, such as graph/summary: kept while the app runs */
  const pending = new Map(); /* id -> Map(n -> text): parts of a file the page is uploading */

  const send = (res, ev, payload) => res.write('event: ' + ev + '\ndata: ' + JSON.stringify(payload) + '\n\n');
  const fileDocs = () => store.list().map(m => ({ id: m.id, data: { name: m.name, format: m.format, enabled: m.enabled, rev: m.rev, bytes: m.bytes, addedAt: m.addedAt } }));
  store.on('change', () => { const docs = fileDocs(); for (const c of clients) send(c, 'files', docs); });
  const pages = { select(iris) { for (const c of clients) send(c, 'select', iris); return clients.size; } };

  /* The page's database: files/<id> are the files on disk; files/<id>/chunks/<n> are parts of their text. */
  const seg = p => String(p || '').split('/').filter(Boolean);
  const safe = s => s.every(x => /^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(x) && x !== '.' && x !== '..');
  function chunksOf(id) {
    const p = pending.get(id);
    if (p) return [...p.keys()].sort((a, b) => a - b).map(n => ({ id: String(n).padStart(4, '0'), data: { text: p.get(n) } }));
    const f = store.list().find(x => x.id === id); if (!f) return [];
    const text = store.text(id), out = [];
    for (let i = 0; i * CHUNK < text.length || i === 0; i++) out.push({ id: String(i).padStart(4, '0'), data: { text: text.slice(i * CHUNK, (i + 1) * CHUNK) } });
    return out;
  }
  function getDoc(p) {
    const s = seg(p);
    if (s[0] === 'files' && s.length === 2) { const d = fileDocs().find(x => x.id === s[1]); return d ? d.data : null; }
    if (s[0] === 'files' && s.length === 4 && s[2] === 'chunks') { const c = chunksOf(s[1]).find(x => x.id === s[3]); return c ? c.data : null; }
    return generic.has(s.join('/')) ? generic.get(s.join('/')) : null;
  }
  function listCol(p, limit) {
    const s = seg(p);
    if (s[0] === 'files' && s.length === 1) return fileDocs().slice(0, limit);
    if (s[0] === 'files' && s.length === 3 && s[2] === 'chunks') return chunksOf(s[1]).slice(0, limit);
    const pre = s.join('/') + '/', out = [];
    for (const [k, v] of generic) if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push({ id: k.slice(pre.length), data: v });
    return out.slice(0, limit);
  }
  function writeDoc(p, op, data) {
    const s = seg(p);
    if (s[0] === 'files' && s.length === 4 && s[2] === 'chunks') {
      const n = Number(s[3]);
      if (op === 'delete') { const q = pending.get(s[1]); if (q) q.delete(n); return; }
      if (!pending.has(s[1])) pending.set(s[1], new Map());
      pending.get(s[1]).set(n, String(data && data.text || ''));
      return;
    }
    if (s[0] === 'files' && s.length === 2) {
      const id = s[1];
      if (op === 'delete') { pending.delete(id); store.remove(id); return; }
      if (op === 'update') {
        if (data && 'enabled' in data && !store.setEnabled(id, data.enabled)) throw Object.assign(new Error('No such file.'), { code: 'not-found' });
        return;
      }
      let text = typeof data.text === 'string' ? data.text : null;
      if (text === null) {
        const q = pending.get(id) || new Map(), n = Number(data.chunks) || 0, parts = [];
        for (let i = 0; i < n; i++) { if (!q.has(i)) throw Object.assign(new Error('Part ' + i + ' of the file is missing.'), { code: 'invalid-argument' }); parts.push(q.get(i)); }
        text = parts.join('');
      }
      pending.delete(id);
      map.writeFile(data.name || id, text);
      return;
    }
    const k = s.join('/');
    if (op === 'delete') generic.delete(k);
    else if (op === 'update') generic.set(k, Object.assign({}, generic.get(k), data));
    else generic.set(k, data);
  }

  const pub = path.join(__dirname, 'public');
  const statics = {
    '/': [path.join(pub, 'index.html'), 'text/html; charset=utf-8'],
    '/local.js': [path.join(pub, 'local.js'), 'text/javascript; charset=utf-8'],
    '/depmap-core.js': [path.join(__dirname, 'depmap-core.js'), 'text/javascript; charset=utf-8'],
    '/vendor/n3.min.js': [require.resolve('n3/browser/n3.min.js'), 'text/javascript; charset=utf-8'],
    '/vendor/d3.min.js': [path.join(path.dirname(require.resolve('d3')), '..', 'dist', 'd3.min.js'), 'text/javascript; charset=utf-8'],
  };

  /* Only this computer, by its own name: no other origin can call the app (DNS rebinding, cross-site requests). */
  const hostOk = h => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(h || ''));
  const originOk = (o, h) => !o || o === 'http://' + h;

  function body(req) {
    return new Promise((ok, no) => {
      const parts = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > 40 * 1024 * 1024) { no(new Error('The request is too large.')); req.destroy(); } else parts.push(c); });
      req.on('end', () => { try { const s = Buffer.concat(parts).toString('utf8'); ok(s ? JSON.parse(s) : undefined); } catch (e) { no(e); } });
      req.on('error', no);
    });
  }
  const out = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };

  async function handle(req, res) {
    const u = new URL(req.url, 'http://localhost');
    if (!hostOk(req.headers.host) || !originOk(req.headers.origin, req.headers.host)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (req.method === 'GET' && statics[u.pathname]) {
      const [f, type] = statics[u.pathname];
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); return;
    }
    if (u.pathname === '/mcp') {
      if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return; }
      let b; try { b = await body(req); } catch (e) { out(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }); return; }
      const server = createMcpServer(map, pages);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, b);
      return;
    }
    if (u.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clients.add(res); send(res, 'files', fileDocs());
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (u.pathname === '/api/env' && req.method === 'GET') {
      /* what the app runs in, for the info window of the page */
      out(res, 200, map.environment());
      return;
    }
    try {
      if (u.pathname === '/api/doc' && req.method === 'GET') { const d = getDoc(u.searchParams.get('path')); out(res, 200, { exists: d !== null, data: d }); return; }
      if (u.pathname === '/api/collection' && req.method === 'GET') { out(res, 200, { docs: listCol(u.searchParams.get('path'), Number(u.searchParams.get('limit')) || 1000) }); return; }
      if (u.pathname === '/api/doc' && req.method === 'POST') {
        const b = await body(req) || {};
        if (!safe(seg(b.path)) || !['set', 'update', 'delete'].includes(b.op)) { out(res, 400, { code: 'invalid-argument', message: 'Bad path or operation.' }); return; }
        writeDoc(b.path, b.op, b.data || {}); out(res, 200, { ok: true }); return;
      }
    } catch (e) { out(res, 400, { code: e.code || 'error', message: String(e && e.message || e) }); return; }
    res.writeHead(404); res.end('Not found');
  }

  const httpServer = http.createServer((req, res) => { handle(req, res).catch(e => { if (!res.headersSent) out(res, 500, { message: String(e && e.message || e) }); else res.end(); }); });
  return { store, map, pages, httpServer, close() { for (const c of clients) c.end(); store.close(); httpServer.close(); } };
}

/* The names of the project, as its .envrc gives them to a shell: .env first, then PROJECT_DIR, the root of
   the project, then the file of the client that started the app, .env.<client>, as an override. A name whose
   value comes out empty is left as it was. */
function loadEnv(root) {
  const e = process.env;
  const read = name => {
    let text;
    try { text = fs.readFileSync(path.join(root, name), 'utf8'); } catch (_) { return; }
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^"(.*)"$/, '$1').replace(/\$\{(\w+)\}/g, (_, k) => e[k] || '');
      if (value) e[m[1]] = value;
    }
  };
  read('.env');
  e.PROJECT_DIR = root;
  const client = e.CLAUDECODE ? 'claude' : e.XCODE_VERSION_ACTUAL ? 'xcode' : e.TERM_PROGRAM === 'vscode' ? 'vscode' : e.INSIDE_EMACS ? 'emacs' : null;
  if (client) read('.env.' + client);
}

async function main() {
  loadEnv(projectRoot());
  const o = options(process.argv.slice(2));
  if (o.help || o.bad) { (o.bad ? console.error : console.log)(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 7).join('\n').replace(/^\/\* ?| ?\*\/$|^   /gm, '')); process.exit(o.bad ? 1 : 0); }
  const log = (...a) => console.error(...a); /* stdout is the MCP channel with --stdio */
  const app = createApp(o);
  const listening = await new Promise(ok => {
    app.httpServer.once('error', e => { if (o.stdio && e.code === 'EADDRINUSE') ok(false); else { log('The app could not start on port ' + o.port + ': ' + e.message); process.exit(1); } });
    app.httpServer.listen(o.port, o.host, () => ok(true));
  });
  log('Files: ' + app.store.filesDir);
  if (listening) log('Map: http://localhost:' + o.port + '/' + (o.stdio ? '' : '\nMCP: http://localhost:' + o.port + '/mcp'));
  else log('Port ' + o.port + ' is in use, so this process serves MCP only, not the page.');
  if (o.stdio) {
    const server = createMcpServer(app.map, app.pages);
    await server.connect(new StdioServerTransport());
    process.stdin.on('end', () => { app.close(); process.exit(0); });
  }
  const stop = () => { app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

if (require.main === module) main();
module.exports = { createApp };
