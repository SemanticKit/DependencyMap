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

  const send = (res, ev, payload) => res.write('event: ' + ev + '\ndata: ' + JSON.stringify(payload) + '\n\n');
  /* the files as the page lists them: each { id, name, format, enabled, rev, bytes, addedAt } */
  store.on('change', () => { const files = store.list(); for (const c of clients) send(c, 'files', files); });
  const pages = { select(iris) { for (const c of clients) send(c, 'select', iris); return clients.size; } };

  /* The files, for the page:
       GET    /api/files        the list
       POST   /api/files        { name, text }: a new file, or the new text of the file with this name
       GET    /api/files/<id>   the text of a file
       PATCH  /api/files/<id>   { enabled }: turn a file on or off
       DELETE /api/files/<id>   remove a file */
  async function files(req, res, id) {
    if (!id) {
      if (req.method === 'GET') return out(res, 200, store.list());
      if (req.method === 'POST') {
        const b = await body(req) || {};
        return out(res, 200, map.writeFile(String(b.name || '').trim(), String(b.text || '')));
      }
      return out(res, 405, { message: 'Method not allowed.' });
    }
    const file = store.list().find(f => f.id === id);
    if (!file) return out(res, 404, { message: 'No such file.' });
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(store.text(id));
    }
    if (req.method === 'PATCH') {
      const b = await body(req) || {};
      store.setEnabled(id, b.enabled !== false);
      return out(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      store.remove(id);
      return out(res, 200, { ok: true });
    }
    return out(res, 405, { message: 'Method not allowed.' });
  }

  /* The page is built from web/ into dist/ (npm run build). Its own files are in dist/assets, under names the
     build gives them. The analysis engine and the N3 library are served as they are. */
  const dist = path.join(__dirname, 'dist');
  const statics = {
    '/': [path.join(dist, 'index.html'), 'text/html; charset=utf-8'],
    '/depmap-core.js': [path.join(__dirname, 'depmap-core.js'), 'text/javascript; charset=utf-8'],
    '/vendor/n3.min.js': [require.resolve('n3/browser/n3.min.js'), 'text/javascript; charset=utf-8'],
  };
  const assetTypes = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8' };
  /* a file of the built page, by its name alone: no path in the request reaches outside dist/assets */
  function asset(pathname) {
    if (!pathname.startsWith('/assets/')) return null;
    const name = path.basename(pathname), type = assetTypes[path.extname(name)];
    const f = path.join(dist, 'assets', name);
    return type && fs.existsSync(f) ? [f, type] : null;
  }

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
    const file = req.method === 'GET' ? statics[u.pathname] || asset(u.pathname) : null;
    if (file) {
      const [f, type] = file;
      if (!fs.existsSync(f)) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); res.end('The page is not built yet. Run "npm run build" in the DependencyMap folder, then load this page again.'); return; }
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
      clients.add(res); send(res, 'files', store.list());
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (u.pathname === '/api/env' && req.method === 'GET') {
      /* what the app runs in, for the info window of the page */
      out(res, 200, map.environment());
      return;
    }
    const filePath = /^\/api\/files(?:\/([^/]+))?$/.exec(u.pathname);
    if (filePath) {
      try { await files(req, res, filePath[1] ? decodeURIComponent(filePath[1]) : null); }
      catch (e) { out(res, 400, { message: String(e && e.message || e) }); }
      return;
    }
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
