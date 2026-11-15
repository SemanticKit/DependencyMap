# Dependency Map

The Dependency Map reads RDF files (Turtle, N-Triples or RDF/XML) and computes, for each term, what has to be generated before it. It runs on your computer as a web page and as an MCP server. It needs Node.js 20 or later.

## Run it

```sh
npm install
npm start
```

`npm install` also builds the page. After a change to a file in `web/`, build it again with `npm run build`.

The app prints two addresses:

| Address | What it is |
| --- | --- |
| `http://localhost:4787/` | The map page: the map, the details of a term, the files and the filters. |
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
| `select` | `ids` | Selects the terms on each open map page. |

| `create` | `type`, `id`, `properties` | Makes a term of a type, or adds to one, and stores the statements that adds with the ontology of the term's namespace. Each value is checked against the property it is for. |

## MCP resources

Each class of the loaded ontologies is a resource: a type. Its name is its compact id, such as `rdfs:Class`, and its address is its IRI. Reading it gives the classes above it and its properties: each property whose `rdfs:domain` is the class or a class above it, with what it takes (`rdfs:range`) and whether it has one value or many. The resources are those of the loaded ontologies, so loading an ontology adds its types.

`create` makes the term as an object of its type with [LDO](https://ldo.js.org). A type that is not loaded, a property the type does not have, a value that is not a loaded term, and a value that is not of the property's `rdfs:range` are each refused. Ontologies stored as RDF/XML are not read for the types.

A term is named by its compact id, such as `owl:Class`, or by its IRI in angle brackets. The tools compute the map from the saved files, so their answers do not depend on an open page. A change made through a tool shows on each open page, and a change made on the page is seen by the tools.

## MCP prompts

| Prompt | Arguments | What it asks |
| --- | --- | --- |
| `build_order` | | What the loaded files give: the tiers, the cycles and the order to generate the terms in. |
| `what_first` | `id` | For one term: what has to be generated before it, and what waits for it. |

Each prompt starts with how the map is made.

## Files

Start the app in a project. It reads each RDF file anywhere under the project's `docs` folder. A file that is loaded goes to `docs/<alias>/<name>`, where the alias is the prefix of its ontology, such as `docs/owl/owl.ttl`; the app makes the folders. `.semantickit.json`, in the project folder, records which files are on. It is written the first time one is switched or added.

## How the map is made

Every IRI that is the subject of a statement in a loaded file is a term. Each statement from a term to a term is an edge, and the property of the statement is the name of the edge. A value inside a blank node (a list or a class expression) belongs to the statement that holds the blank node. The files say which edges are references: `rdfs:seeAlso` and each property that the files make a subproperty of it. References are not used for cycles or tiers. A cycle is a strongly connected component, and it is generated as one unit. The tier of a term is the length of the longest dependency path below it.

The map is made by `core/`, and the page, the MCP server and the command line (`node depmap-cli.js <ontology>... [--term <id>] [--order] [--json]`) all use it. The reading and the graph work are done by libraries: N3 reads Turtle and N-Triples, `rdfxml-streaming-parser` reads RDF/XML, the statements are kept in an [LDO](https://ldo.js.org) dataset, and `graphology` finds the cycles and the tiers.

## Parts

| File | Role |
| --- | --- |
| `server.js` | Starts the app: the page, the page's storage and `/mcp`, or MCP on standard input and output. |
| `lib/store.js` | The files on disk. |
| `core/ontology.mjs` | Loads one ontology: its statements and its prefixes. |
| `core/names.mjs` | The compact ids, and the prefix used for each namespace. |
| `core/analysis.mjs` | The terms, the edges, the cycles and the tiers. |
| `core/map.mjs` | The map of some loaded ontologies, and the questions asked of it. |
| `lib/map.js` | The ontologies of the app, kept in the store, and the map made of them. |
| `lib/mcp.js` | The MCP tools that ask the map a question, and the prompts. |
| `lib/types/` | The types of the loaded ontologies as MCP resources, and the `create` tool, on LDO. |
| `web/` | The map page, as Vue components. `npm run build` puts them together into `dist/`, which the app serves. `npm install` runs the build. |
| `web/src/App.vue` | The page: the map and the details sheet. |
| `web/src/views/` | The views of the map, one component in each file: Tiers, Onion, Treemap, Pack, Tree, Cluster, Class and Datatype. `index.js` lists them; a new view is a new file and one line there. |
| `web/src/views/class/`, `web/src/views/datatype/` | The views by standard of the Class view and of the Datatype view (`classLayers.js`, `datatypeLayers.js`), and the drawing they share (`classDiagram.js`). |
| `web/src/components/` | The toolbar, the menus, the side panel, the details sheet (`TermSheet.vue` and `term/`). |
| `web/src/model/` | What the loaded files give, as classes that know nothing of the page: the statements (`Statements.js`), the map (`TermMap.js`), what a selection reaches (`Reach.js`), the details of a term (`TermDetails.js`), the tree of a type (`TypeTree.js`) and a diagram of boxes (`BoxDiagram.js`). |
| `web/src/state.js` | The state of the page: the files, the map and the controls, and the actions that change them. |
| `web/src/rdf.js` | The terms of RDF and RDFS that the page reads the files with. |
| `web/src/storage.js` | The files: the page lists and reads the app's files, and asks the app to add, switch or remove one (`/api/files`). |
| `depmap-cli.js` | The command line. |
| `test/smoke.js` | `npm test`: starts the app, connects an MCP client over HTTP and over standard input and output, and checks the answers against `depmap-cli.js` on `test/inputs/`. |

## Licence

GNU General Public License, version 2 only (GPL-2.0-only). The text is in `LICENSE`.
