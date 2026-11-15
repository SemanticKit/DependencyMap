/* The edges in use, and what a selection reaches through them. */

/* The edges of the edge groups that are in use, by the term they leave and the term they arrive at. */
export class EdgesInUse {
  /* map: a TermMap. groups: the names of the edge groups in use, as a Set. */
  constructor(map, groups) {
    this.map = map;
    this.groups = groups;
    this.all = map.edges.filter(edge => groups.has(map.groupOf(edge[1])));
    this.byFrom = new Map();
    this.byTo = new Map();
    for (const edge of this.all) {
      const [from, , to] = edge;
      if (!this.byFrom.has(from)) this.byFrom.set(from, []);
      if (!this.byTo.has(to)) this.byTo.set(to, []);
      this.byFrom.get(from).push(edge);
      this.byTo.get(to).push(edge);
    }
  }

  /* the terms a term depends on */
  dependenciesOf(id) {
    return (this.byFrom.get(id) || []).map(edge => edge[2]);
  }

  /* the terms that depend on a term */
  dependantsOf(id) {
    return (this.byTo.get(id) || []).map(edge => edge[0]);
  }
}

/* What a selection reaches. up: what has to happen first. down: what waits for the selection. */
export class Reach {
  /* the most edges drawn that do not touch the selection */
  static FAR_EDGES = 1500;

  /* edges: an EdgesInUse. selection: a Set of term ids. directOnly: one step, not every step. */
  constructor(edges, selection, directOnly) {
    this.edges = edges;
    this.selection = selection;
    this.directOnly = directOnly;
    this.up = this.reached(id => edges.dependenciesOf(id));
    this.down = this.reached(id => edges.dependantsOf(id));
  }

  /* the terms the steps reach from the selection, without the selection */
  reached(step) {
    const found = new Set();
    const visited = new Set();
    const waiting = [...this.selection];
    while (waiting.length) {
      const id = waiting.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of step(id)) {
        found.add(next);
        if (!this.directOnly) waiting.push(next);
      }
    }
    for (const id of this.selection) found.delete(id);
    return found;
  }

  /* how a term stands to the selection: sel, up, down, cyc (both), dim (neither), or '' with no selection */
  standing(id) {
    if (!this.selection.size) return '';
    if (this.selection.has(id)) return 'sel';
    const up = this.up.has(id);
    const down = this.down.has(id);
    if (up && down) return 'cyc';
    if (up) return 'up';
    if (down) return 'down';
    return 'dim';
  }

  /* The edges the selection shows: each { from, to, group, direction, near }. near: the edge touches the
     selection. Of the edges that do not, no more than FAR_EDGES are given. */
  shownEdges() {
    const selection = this.selection;
    const shown = [];
    let far = 0;
    for (const [from, property, to] of this.edges.all) {
      const direction = this.directionOf(from, to);
      if (!direction) continue;
      const near = selection.has(from) || selection.has(to);
      if (!near && ++far > Reach.FAR_EDGES) continue;
      shown.push({ from, to, group: this.edges.map.groupOf(property), direction, near });
    }
    return shown;
  }

  /* whether an edge is on the way up from the selection, on the way down to it, or neither */
  directionOf(from, to) {
    const selection = this.selection;
    if (this.directOnly) {
      if (selection.has(from)) return 'up';
      if (selection.has(to)) return 'down';
      return null;
    }
    const isUp = id => selection.has(id) || this.up.has(id);
    const isDown = id => selection.has(id) || this.down.has(id);
    if (isUp(from) && isUp(to)) return 'up';
    if (isDown(from) && isDown(to)) return 'down';
    return null;
  }
}
