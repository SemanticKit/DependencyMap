/* The analysis engine, depmap-core.js, and the parser it reads files with. The page loads both as scripts; the app,
   the MCP server and the command line use the same engine. */
export const engine = window.DepMap;

/* what the engine needs from the page to parse a file */
export const parsing = {
  get N3() { return window.N3; },
  DOMParser: window.DOMParser,
};
