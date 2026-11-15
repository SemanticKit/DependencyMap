#!/usr/bin/env node
/* SemanticKit dependency map, command line.
   Setup, one time, in this directory:  npm install
   Use:  node depmap-cli.js <ontology>... [--term <id or IRI>] [--order] [--json]
   Ontologies are Turtle, N-Triples or RDF/XML. Term ids are compact names (owl:Class) or <IRI>. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOntology } from './core/ontology.mjs';
import { DependencyMap } from './core/map.mjs';

const chosen = { paths: [], terms: [], order: false, json: false, help: false };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--term') chosen.terms.push(args[++i]);
  else if (arg === '--order') chosen.order = true;
  else if (arg === '--json') chosen.json = true;
  else if (arg === '-h' || arg === '--help') chosen.help = true;
  else chosen.paths.push(arg);
}
if (chosen.help || !chosen.paths.length) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 5).join('\n'));
  process.exit(chosen.paths.length ? 0 : 1);
}

const ontologies = [];
for (const file of chosen.paths) {
  const name = path.basename(file);
  try {
    ontologies.push({ enabled: true, ...await loadOntology(name, fs.readFileSync(file, 'utf8')) });
  } catch (e) {
    console.error(name + ': could not be read: ' + e.message);
    process.exit(1);
  }
}
const map = new DependencyMap(ontologies);

/* the answer for a term, or why there is none */
function answerFor(name) {
  try {
    return map.term(name);
  } catch (e) {
    return { id: name, error: e.message };
  }
}

function printTerm(term) {
  if (term.error) {
    console.log(term.id + ': ' + term.error);
    return;
  }
  console.log(term.id + '  <' + term.iri + '>');
  console.log('  declared in: ' + term.declaredIn.join(', ') + '   tier: ' + term.tier + (term.unit.length > 1 ? '   cycle: ' + term.unit.join(', ') : ''));
  console.log('  has to happen first (' + term.hasToHappenFirst.length + '):');
  for (const tier of map.tiers) {
    const here = term.hasToHappenFirst.filter(id => map.tierOf.get(id) === tier.tier);
    if (here.length) console.log('    T' + tier.tier + '  ' + here.join(' '));
  }
  console.log('  waits for it (' + term.waitsForIt.length + ')' + (term.waitsForIt.length ? ': ' + term.waitsForIt.join(' ') : ''));
  console.log('  statements (' + term.statements.length + '):');
  for (const statement of term.statements) console.log('    ' + statement.property + ' ' + statement.value + '   [' + statement.ontology + ']');
}

function printSummary() {
  const summary = map.summary();
  console.log('ontologies:  ' + summary.ontologies.map(each => each.name + ' (' + each.triples + ' triples)').join(', '));
  console.log('terms:  ' + summary.terms + '   edges: ' + summary.edges);
  for (const tier of summary.tiers) console.log('tier ' + tier.tier + ': ' + tier.terms + ' terms');
  console.log('cycles: ' + summary.cycles.length);
  for (const cycle of summary.cycles) console.log('  T' + cycle.tier + '  ' + cycle.terms.join(' '));
}

if (chosen.terms.length) {
  const answers = chosen.terms.map(answerFor);
  if (chosen.json) console.log(JSON.stringify(answers, null, 1));
  else answers.forEach(printTerm);
} else if (chosen.json) {
  console.log(JSON.stringify({ summary: map.summary(), order: map.order(), terms: map.terms, edges: map.edges }));
} else if (chosen.order) {
  for (const { tier, unit } of map.order()) console.log('T' + tier + '\t' + unit.join(' '));
} else {
  printSummary();
}
