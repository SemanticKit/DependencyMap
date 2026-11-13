'use strict';
/* The operations of the map, computed from the files in the store: the same operations as the page's
   DepMapAPI and depmap-cli.js. The analysis is depmap-core.js, the engine the page runs. */
const fs = require('fs');
const path = require('path');
const C = require('../depmap-core.js');
const N3 = require('n3');
const { DOMParser } = require('@xmldom/xmldom');

const ENV = { N3, DOMParser };
const MAX_BYTES = 20 * 1024 * 1024; /* the page's limit for one file */

/* The alias of the ontology a file holds: the prefix of the namespace that most of its subjects are in.
   A file with no such prefix takes the name of the file without its extension. */
function alias(parsed, name) {
  const spaces = Object.keys(parsed.prefixes || {}).filter(p => p && parsed.prefixes[p])
    .map(p => [parsed.prefixes[p], p]).sort((a, b) => b[0].length - a[0].length);
  const subjects = new Set(parsed.triples.filter(t => t.s.t === 'iri').map(t => t.s.v)), count = new Map();
  for (const iri of subjects) {
    const hit = spaces.find(([ns]) => iri.length > ns.length && iri.startsWith(ns));
    if (hit) count.set(hit[1], (count.get(hit[1]) || 0) + 1);
  }
  let best = null;
  for (const [p, n] of count) if (!best || n > best[1]) best = [p, n];
  return best ? best[0] : String(name).replace(/\.[^.]+$/, '');
}

class DependencyMap {
  constructor(store) { this.store = store; this.key = null; this.parsed = new Map(); }

  /* the map for the files as they are now; computed again only when a file changed */
  state() {
    const metas = this.store.list();
    const key = C.VERSION + '|' + metas.map(m => m.id + '@' + m.rev + (m.enabled ? '+' : '-')).join(',');
    if (key === this.key) return this.s;
    const files = metas.map(m => {
      const old = this.parsed.get(m.id);
      if (old && old.rev === m.rev) return Object.assign(old, { enabled: m.enabled });
      const f = { id: m.id, name: m.name, rev: m.rev, enabled: m.enabled, format: m.format };
      try {
        const text = this.store.text(m.id);
        f.format = f.format || C.detectFormat(m.name, text);
        const r = C.parse(m.name, text, f.format, ENV);
        f.triples = r.triples; f.prefixes = r.prefixes; f.count = r.triples.length; f.chars = text.length; f.error = null;
      } catch (e) {
        f.triples = null; f.prefixes = null; f.count = 0; f.error = 'This file could not be read: ' + String(e && e.message || e).slice(0, 300);
      }
      this.parsed.set(m.id, f);
      return f;
    });
    for (const id of [...this.parsed.keys()]) if (!metas.some(m => m.id === id)) this.parsed.delete(id);
    const use = files.filter(f => f.enabled && f.triples);
    const D = C.analyze(use.map(f => ({ name: f.name, triples: f.triples, prefixes: f.prefixes })),
      { bindings: files.filter(f => f.prefixes).map(f => ({ name: f.name, prefixes: f.prefixes })) });
    const FX = C.facts(use.map(f => ({ name: f.name, triples: f.triples })));
    const IRI2ID = new Map(Object.keys(D.terms).map(id => [D.terms[id].i, id]));
    const PFX = Object.keys(D.prefixes || {}).map(p => [D.prefixes[p], p]).sort((a, b) => b[0].length - a[0].length);
    this.key = key;
    this.s = { files, D, FX, IRI2ID, PFX, ix: C.index(D) };
    return this.s;
  }

  short(iri) {
    const { IRI2ID, PFX } = this.s;
    const id = IRI2ID.get(iri); if (id) return id;
    for (const [ns, p] of PFX) if (iri.indexOf(ns) === 0) { const l = iri.slice(ns.length); if (!/[\/#?\s<>]/.test(l)) return p + ':' + l; break; }
    return '<' + iri + '>';
  }
  textOf(iri, p) { return C.text(this.s.FX, iri, C.family(this.s.FX, p)); }
  labelOf(id) { const t = this.s.D.terms[id]; return t ? this.textOf(t.i, C.RDFS + 'label') : ''; }
  commentOf(id) { const t = this.s.D.terms[id]; return t ? this.textOf(t.i, C.RDFS + 'comment') : ''; }
  findId(t) {
    const { D, IRI2ID } = this.state();
    t = String(t || '').trim(); if (D.terms[t]) return t;
    return IRI2ID.get(t.replace(/^<|>$/g, ''));
  }
  file(name) {
    const { files } = this.state();
    const f = files.find(x => x.name === name || x.id === name);
    if (!f) throw new Error('No loaded file is named ' + name + '. Loaded: ' + (files.map(x => x.name).join(', ') || 'none'));
    return f;
  }

  summary() {
    const { files, D } = this.state();
    return {
      files: files.map(f => ({ name: f.name, enabled: f.enabled, format: f.format, triples: f.count, chars: f.chars == null ? null : f.chars, error: f.error || null })),
      terms: Object.keys(D.terms).length, edges: D.edges.length,
      tiers: D.tiers.map(t => ({ tier: t.tier, terms: t.groups.reduce((a, g) => a + g.length, 0) })),
      cycles: D.cycles,
    };
  }
  order() { return this.state().D.tiers.flatMap(t => t.groups.map(u => ({ tier: t.tier, unit: u }))); }
  term(id) {
    const k = this.findId(id); if (!k) throw new Error('No term with this name in the loaded files: ' + id);
    const { D, FX, ix } = this.s;
    const d = C.describe(D, ix, k);
    const val = (o, file, depth) => o.t === 'iri' ? this.short(o.v) : o.t === 'lit' ? JSON.stringify(o.v) + (o.l ? '@' + o.l : '')
      : depth > 6 ? '[]' : '[ ' + (FX.bn.get(file + '\u0000' + o.v) || []).map(t => this.short(t.p) + ' ' + val(t.o, file, depth + 1)).join(' ; ') + ' ]';
    return { id: k, iri: d.iri, declaredIn: d.declaredIn, tier: d.tier, unit: d.unit, label: this.labelOf(k), comment: this.commentOf(k),
      statements: (FX.subj.get(d.iri) || []).map(t => ({ property: this.short(t.p), value: val(t.o, t.file, 0), file: t.file })),
      hasToHappenFirst: d.hasToHappenFirst, waitsForIt: d.waitsForIt };
  }
  termsIn(name) { const f = this.file(name), { D } = this.s; return Object.keys(D.terms).filter(id => D.terms[id].f.includes(f.name)).sort(); }
  find(text) {
    const q = String(text || '').toLowerCase(), { D } = this.state();
    return Object.keys(D.terms).filter(id => id.toLowerCase().includes(q) || D.terms[id].i.toLowerCase().includes(q) || this.labelOf(id).toLowerCase().includes(q)).sort();
  }
  files() { return this.state().files.map(f => f.name); }
  readFile(name) { const f = this.file(name); return this.store.text(f.id); }
  writeFile(name, text) {
    name = String(name || '').trim(); text = String(text);
    if (!name) throw new Error('Give the file a name.');
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(name + ' is larger than 20 MB.');
    const format = C.detectFormat(name, text);
    let r;
    try { r = C.parse(name, text, format, ENV); } catch (e) { throw new Error(name + ': This file could not be read: ' + String(e && e.message || e).slice(0, 300)); }
    this.store.put(name, text, format, alias(r, name));
    return { name, triples: r.triples.length };
  }
  loadFile(file, name) {
    const p = path.resolve(String(file));
    return this.writeFile(name || path.basename(p), fs.readFileSync(p, 'utf8'));
  }
  removeFile(name) { const f = this.file(name); this.store.remove(f.id); return { removed: f.name }; }
  enableFile(name, on) { const f = this.file(name); this.store.setEnabled(f.id, on !== false); return { name: f.name, enabled: on !== false }; }
  /* term ids as IRIs, for an open page whose prefix choices can differ */
  iris(ids) { return [].concat(ids).map(x => this.findId(x)).filter(Boolean).map(id => this.s.D.terms[id].i); }
}

module.exports = { DependencyMap, ENV };
