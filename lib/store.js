'use strict';
/* The files of the map, kept on disk.
   <data>/files/<id> holds the text of each file, unchanged. <data>/files.json holds, for each id,
   the name, the format and whether the file is on. A file put in <data>/files/ by hand is read too;
   it is on, and its name is its file name. */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/* The same id the page gives a file name. */
function docId(name) {
  return (String(name).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').replace(/^\.+/, '_') || 'file').slice(0, 150);
}

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = path.resolve(dir);
    this.filesDir = path.join(this.dir, 'files');
    this.metaPath = path.join(this.dir, 'files.json');
    fs.mkdirSync(this.filesDir, { recursive: true });
    this.cache = new Map(); /* id -> {rev, text} */
    this.timer = null;
    try {
      this.watcher = fs.watch(this.filesDir, () => this.changed());
      this.watcher.on('error', () => {});
    } catch (_) { this.watcher = null; }
  }
  close() { if (this.watcher) this.watcher.close(); clearTimeout(this.timer); }
  changed() { clearTimeout(this.timer); this.timer = setTimeout(() => this.emit('change'), 50); }
  readMeta() {
    try { return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')) || {}; } catch (_) { return {}; }
  }
  writeMeta(meta) {
    const tmp = this.metaPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(meta, null, 1) + '\n');
    fs.renameSync(tmp, this.metaPath);
  }
  /* [{id, name, format, enabled, rev, bytes, addedAt}], sorted by name */
  list() {
    const meta = this.readMeta(), out = [];
    let names = [];
    try { names = fs.readdirSync(this.filesDir); } catch (_) {}
    for (const id of names) {
      if (id.startsWith('.') || id.endsWith('.tmp')) continue;
      let st;
      try { st = fs.statSync(path.join(this.filesDir, id)); } catch (_) { continue; }
      if (!st.isFile()) continue;
      const m = meta[id] || {};
      out.push({ id, name: m.name || id, format: m.format || null, enabled: m.enabled !== false,
        rev: Math.floor(st.mtimeMs).toString(36) + '-' + st.size.toString(36), bytes: st.size, addedAt: m.addedAt || null });
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  get(idOrName) {
    const all = this.list();
    return all.find(f => f.name === idOrName) || all.find(f => f.id === idOrName) || null;
  }
  text(id) {
    const f = this.list().find(x => x.id === id);
    if (!f) return null;
    const c = this.cache.get(id);
    if (c && c.rev === f.rev) return c.text;
    const text = fs.readFileSync(path.join(this.filesDir, id), 'utf8');
    this.cache.set(id, { rev: f.rev, text });
    return text;
  }
  /* a new file, or the new text of a file with the same name */
  put(name, text, format) {
    const id = docId(name), file = path.join(this.filesDir, id), tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    const meta = this.readMeta();
    meta[id] = { name, format: format || null, enabled: true, addedAt: new Date().toISOString() };
    this.writeMeta(meta);
    this.changed();
    return id;
  }
  setEnabled(id, on) {
    const meta = this.readMeta(), f = this.list().find(x => x.id === id);
    if (!f) return false;
    meta[id] = Object.assign({ name: f.name, format: f.format, addedAt: f.addedAt }, meta[id], { enabled: !!on });
    this.writeMeta(meta);
    this.changed();
    return true;
  }
  remove(id) {
    const meta = this.readMeta();
    let had = false;
    try { fs.unlinkSync(path.join(this.filesDir, id)); had = true; } catch (_) {}
    if (id in meta) { delete meta[id]; this.writeMeta(meta); had = true; }
    this.cache.delete(id);
    this.changed();
    return had;
  }
}

module.exports = { Store, docId };
