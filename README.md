# Dependency Map

The Dependency Map reads RDF files (Turtle, N-Triples or RDF/XML) and computes, for each term, what has to be generated before it. It runs on your computer as a web page and as an MCP server. It needs Node.js 20 or later.

## Run it

```sh
npm install
npm start
```

The app prints two addresses:

| Address | What it is |
| --- | --- |
| `http://localhost:4787/` | The map page: the map, the details of a term, the files, the filters and the notes. |
| `http://localhost:4787/mcp` | The MCP server, over Streamable HTTP. |

The app answers only on `localhost`, and only to requests from its own page or from clients that send no `Origin`.

### Options

| Option | Environment variable | Default | Meaning |
| --- | --- | --- | --- |
| `--port <n>` | `DEPMAP_PORT` | `4787` | The port of the page and of `/mcp`. |
| `--stdio` | | | Serve MCP on standard input and output instead of `/mcp`. The page is served too when the port is free. |

## Connect an MCP client

With the app running, add it to Claude Code:

```sh
claude mcp add --transport http dependency-map http://localhost:4787/mcp
```

Or let Claude Code start the app itself:

```sh
claude mcp add dependency-map -- node /path/to/DependencyMap/server.js --stdio
```

## MCP tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `summary` | | The files, with their triples and whether each is on, the number of terms and edges, the number of terms in each tier, and the cycles. |
| `order` | | The build order: one entry per unit (a term, or a cycle generated as one unit), in tier order. |
| `term` | `id` | The term's IRI, `declaredIn`, `tier`, `unit`, label, comment, every statement about it, `hasToHappenFirst` (every term that must be generated before it, in tier order) and `waitsForIt`. |
| `terms_in` | `name` | The terms that a file declares. |
| `find` | `text` | The terms whose id, IRI or label contains the text. |
| `files` | | The names of the loaded files. |
| `read_file` | `name` | The text of a loaded file. |
| `write_file` | `name`, `text` | Saves a new file, or the new text of a loaded file, and computes the map again. |
| `load_file` | `path`, `name` (optional) | Reads a file on this computer and saves it as `write_file` does. |
| `enable_file` | `name`, `enabled` | Turns a file on or off. A file that is off stays loaded but is not in the map. |
| `remove_file` | `name` | Removes a file and deletes its saved copy. |
| `select` | `ids` | Selects the terms on each open map page. |

A term is named by its compact id, such as `owl:Class`, or by its IRI in angle brackets. The tools compute the map from the saved files, so their answers do not depend on an open page. A change made through a tool shows on each open page, and a change made on the page is seen by the tools.

## Files

Start the app in a project. It reads each RDF file anywhere under the project's `docs` folder. A file that is loaded goes to `docs/<alias>/<name>`, where the alias is the prefix of its ontology, such as `docs/owl/owl.ttl`; the app makes the folders. `.semantickit.json`, in the project folder, records which files are on. It is written the first time one is switched or added.

## How the map is made

Every IRI that is the subject of a statement in a loaded file is a term. Each statement from a term to a term is an edge, and the property of the statement is the name of the edge. A value inside a blank node (a list or a class expression) belongs to the statement that holds the blank node. The files say which edges are references: `rdfs:seeAlso` and each property that the files make a subproperty of it. References are not used for cycles or tiers. A cycle is a strongly connected component, and it is generated as one unit. The tier of a term is the length of the longest dependency path below it.

The analysis is `depmap-core.js`. The page, the MCP server and the command line (`node depmap-cli.js <file>... [--term <id>] [--order] [--json]`) all use it.

## Parts

| File | Role |
| --- | --- |
| `server.js` | Starts the app: the page, the page's storage and `/mcp`, or MCP on standard input and output. |
| `lib/store.js` | The files on disk. |
| `lib/map.js` | The operations of the map, computed from the files. |
| `lib/mcp.js` | The MCP tools. |
| `public/index.html` | The map page. |
| `public/local.js` | Gives the page its storage (the app's files) and file downloads. |
| `depmap-core.js` | The analysis. |
| `depmap-cli.js` | The command line. |
| `test/smoke.js` | `npm test`: starts the app, connects an MCP client over HTTP and over standard input and output, and checks the answers against `depmap-cli.js` on `test/inputs/`. |

## Licence

GNU General Public License, version 2 only (GPL-2.0-only). The text is in `LICENSE`.
