/* One ontology, loaded: its statements as RDF/JS quads, and the prefixes it declares. Turtle and N-Triples are read
   by N3, RDF/XML by rdfxml-streaming-parser. Every statement of an ontology is put in the graph named after it, so
   a statement in the dataset says which ontology it is from. */
import N3 from 'n3';
import { RdfXmlParser } from 'rdfxml-streaming-parser';

const { namedNode, quad } = N3.DataFactory;
const GRAPH = 'urn:ontology:';

/* the graph of an ontology, and the name of the ontology a graph is of */
export const graphOf = name => namedNode(GRAPH + encodeURIComponent(name));
export const ontologyOf = graph => decodeURIComponent(graph.value.slice(GRAPH.length));

/* the format of an ontology: from its name, or from how its text begins */
export function formatOf(name, text) {
  const lower = String(name || '').toLowerCase();
  if (/\.(ttl|nt|n3|turtle)$/.test(lower)) return 'turtle';
  if (/\.(rdf|owl|xml)$/.test(lower)) return 'rdfxml';
  return /^\s*(<\?xml|<rdf:RDF|<!DOCTYPE|<!--)/.test(text) ? 'rdfxml' : 'turtle';
}

/* rdfxml-streaming-parser, also keeping the prefixes the document declares */
class RdfXmlWithPrefixes extends RdfXmlParser {
  prefixes = {};

  onTag(tag) {
    for (const prefix of Object.keys(tag.ns || {})) {
      if (prefix && !(prefix in this.prefixes)) this.prefixes[prefix] = tag.ns[prefix];
    }
    super.onTag(tag);
  }
}

function readTurtle(text) {
  const prefixes = {};
  const quads = new N3.Parser().parse(text, null, (prefix, namespace) => { prefixes[prefix] = namespace.value; });
  return { quads, prefixes };
}

function readRdfXml(text) {
  return new Promise((done, failed) => {
    const parser = new RdfXmlWithPrefixes();
    const quads = [];
    parser.on('data', each => quads.push(each));
    parser.on('error', failed);
    parser.on('end', () => done({ quads, prefixes: parser.prefixes }));
    parser.write(text);
    parser.end();
  });
}

/* name: the name of the ontology. text: its text. format: turtle or rdfxml, worked out when not given.
   Gives { name, format, quads, prefixes }. Throws when the text cannot be read. */
export async function loadOntology(name, text, format = formatOf(name, text)) {
  const read = format === 'rdfxml' ? await readRdfXml(text) : readTurtle(text);
  const graph = graphOf(name);
  return {
    name,
    format,
    quads: read.quads.map(each => quad(each.subject, each.predicate, each.object, graph)),
    prefixes: read.prefixes,
  };
}
