#!/usr/bin/env node
/* SemanticKit Dependency Map, local app.
   node server.js [--port 4787] [--stdio]
   Serves the map page at http://localhost:<port>/ and an MCP server at http://localhost:<port>/mcp
   (Streamable HTTP). With --stdio the MCP server is on standard input and output instead, and the page
   is served too when the port is free. The app is started in a project. It reads each ontology under the
   docs folder of the project, and it creates the folders it needs there. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store } from './lib/store.js';
import { Ontologies } from './lib/map.js';
import { createMcpServer } from './lib/mcp.js';
import { offerTypes } from './lib/types/types.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const LARGEST_REQUEST = 40 * 1024 * 1024;

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
  const chosen = { port: Number(process.env.DEPMAP_PORT) || 4787, data: projectRoot(), stdio: false, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') chosen.port = Number(argv[++i]);
    else if (arg === '--stdio') chosen.stdio = true;
    else if (arg === '-h' || arg === '--help') chosen.help = true;
    else chosen.bad = arg;
  }
  return chosen;
}

function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

/* the JSON body of a request */
function body(req) {
  return new Promise((done, failed) => {
    const parts = [];
    let size = 0;
    req.on('data', part => {
      size += part.length;
      if (size > LARGEST_REQUEST) {
        failed(new Error('The request is too large.'));
        req.destroy();
      } else parts.push(part);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(parts).toString('utf8');
        done(text ? JSON.parse(text) : undefined);
      } catch (e) {
        failed(e);
      }
    });
    req.on('error', failed);
  });
}

export function createApp({ data }) {
  const store = new Store(data);
  const ontologies = new Ontologies(store);
  /* the open pages: each a stream of server-sent events */
  const pagesOpen = new Set();

  const send = (res, event, payload) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n');
  /* an open page is told the ontologies when they change: each { id, name, format, enabled, rev, bytes, addedAt } */
  store.on('change', () => {
    const listed = store.list();
    for (const page of pagesOpen) send(page, 'files', listed);
  });
  const pages = {
    select(iris) {
      for (const page of pagesOpen) send(page, 'select', iris);
      return pagesOpen.size;
    },
  };

  /* The ontologies, for the page:
       GET    /api/files        the list
       POST   /api/files        { name, text }: a new ontology, or the new text of the one with this name
       GET    /api/files/<id>   the text of an ontology
       PATCH  /api/files/<id>   { enabled }: turn an ontology on or off
       DELETE /api/files/<id>   remove an ontology */
  async function files(req, res, id) {
    if (!id) {
      if (req.method === 'GET') return json(res, 200, store.list());
      if (req.method === 'POST') {
        const given = await body(req) || {};
        return json(res, 200, await ontologies.write(given.name, given.text));
      }
      return json(res, 405, { message: 'Method not allowed.' });
    }
    if (!store.list().some(each => each.id === id)) return json(res, 404, { message: 'No such ontology.' });
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(store.text(id));
    }
    if (req.method === 'PATCH') {
      const given = await body(req) || {};
      store.setEnabled(id, given.enabled !== false);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      store.remove(id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { message: 'Method not allowed.' });
  }

  /* The page is built from web/ into dist/ (npm run build). Its own files are in dist/assets, under the names the
     build gives them. */
  const dist = path.join(here, 'dist');
  const assetTypes = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8' };
  function pageFile(pathname) {
    if (pathname === '/') return { file: path.join(dist, 'index.html'), type: 'text/html; charset=utf-8' };
    if (!pathname.startsWith('/assets/')) return null;
    /* by its name alone: no path in the request reaches outside dist/assets */
    const name = path.basename(pathname);
    const type = assetTypes[path.extname(name)];
    return type ? { file: path.join(dist, 'assets', name), type } : null;
  }
  function servePage(res, found) {
    if (!fs.existsSync(found.file)) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('The page is not built yet. Run "npm run build" in the DependencyMap folder, then load this page again.');
      return;
    }
    res.writeHead(200, { 'content-type': found.type, 'cache-control': 'no-store' });
    fs.createReadStream(found.file).pipe(res);
  }

  async function serveMcp(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' });
      res.end();
      return;
    }
    let message;
    try {
      message = await body(req);
    } catch (e) {
      json(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
      return;
    }
    const server = createMcpServer(ontologies, pages);
    await offerTypes(server, ontologies);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, message);
  }

  function serveEvents(req, res) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    pagesOpen.add(res);
    send(res, 'files', store.list());
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      pagesOpen.delete(res);
    });
  }

  /* Only this computer, by its own name: no other origin can call the app (DNS rebinding, cross-site requests). */
  const hostOk = host => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(host || ''));
  const originOk = (origin, host) => !origin || origin === 'http://' + host;

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!hostOk(req.headers.host) || !originOk(req.headers.origin, req.headers.host)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const found = req.method === 'GET' ? pageFile(url.pathname) : null;
    if (found) return servePage(res, found);
    if (url.pathname === '/mcp') return serveMcp(req, res);
    if (url.pathname === '/api/events' && req.method === 'GET') return serveEvents(req, res);
    /* what the app runs in, for the info window of the page */
    if (url.pathname === '/api/env' && req.method === 'GET') return json(res, 200, ontologies.environment());
    const filePath = /^\/api\/files(?:\/([^/]+))?$/.exec(url.pathname);
    if (filePath) {
      try {
        await files(req, res, filePath[1] ? decodeURIComponent(filePath[1]) : null);
      } catch (e) {
        json(res, 400, { message: String(e && e.message || e) });
      }
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  }

  const httpServer = http.createServer((req, res) => {
    handle(req, res).catch(e => {
      if (!res.headersSent) json(res, 500, { message: String(e && e.message || e) });
      else res.end();
    });
  });
  return {
    store,
    ontologies,
    pages,
    httpServer,
    close() {
      for (const page of pagesOpen) page.end();
      store.close();
      httpServer.close();
    },
  };
}

/* The names of the project, as its .envrc gives them to a shell: .env first, then PROJECT_DIR, the root of
   the project, then the file of the client that started the app, .env.<client>, as an override. A name whose
   value comes out empty is left as it was. */
function loadEnv(root) {
  const env = process.env;
  const read = name => {
    let text;
    try {
      text = fs.readFileSync(path.join(root, name), 'utf8');
    } catch (_) {
      return;
    }
    for (const line of text.split('\n')) {
      const found = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!found) continue;
      const value = found[2].replace(/^"(.*)"$/, '$1').replace(/\$\{(\w+)\}/g, (_, key) => env[key] || '');
      if (value) env[found[1]] = value;
    }
  };
  read('.env');
  env.PROJECT_DIR = root;
  const client = env.CLAUDECODE ? 'claude' : env.XCODE_VERSION_ACTUAL ? 'xcode' : env.TERM_PROGRAM === 'vscode' ? 'vscode' : env.INSIDE_EMACS ? 'emacs' : null;
  if (client) read('.env.' + client);
}

function usage() {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 7);
  return lines.join('\n').replace(/^\/\* ?| ?\*\/$|^   /gm, '');
}

async function main() {
  loadEnv(projectRoot());
  const chosen = options(process.argv.slice(2));
  if (chosen.help || chosen.bad) {
    (chosen.bad ? console.error : console.log)(usage());
    process.exit(chosen.bad ? 1 : 0);
  }
  /* standard output is the MCP channel with --stdio, so the app talks on standard error */
  const log = (...said) => console.error(...said);
  const app = createApp(chosen);
  const listening = await new Promise(done => {
    app.httpServer.once('error', e => {
      if (chosen.stdio && e.code === 'EADDRINUSE') return done(false);
      log('The app could not start on port ' + chosen.port + ': ' + e.message);
      process.exit(1);
    });
    app.httpServer.listen(chosen.port, chosen.host, () => done(true));
  });
  log('Ontologies: ' + app.store.filesDir);
  if (listening) log('Map: http://localhost:' + chosen.port + '/' + (chosen.stdio ? '' : '\nMCP: http://localhost:' + chosen.port + '/mcp'));
  else log('Port ' + chosen.port + ' is in use, so this process serves MCP only, not the page.');

  if (chosen.stdio) {
    const server = createMcpServer(app.ontologies, app.pages);
    await offerTypes(server, app.ontologies);
    /* the types are those of the loaded ontologies: when the ontologies change, so do the resources */
    app.store.on('change', () => offerTypes(server, app.ontologies).catch(e => log('The types could not be offered: ' + e.message)));
    await server.connect(new StdioServerTransport());
    process.stdin.on('end', () => { app.close(); process.exit(0); });
  }
  const stop = () => { app.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
