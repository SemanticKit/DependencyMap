/* A diagram of boxes, drawn with D3. It knows nothing of the page or of RDF: it takes a model and gives an SVG.

   model: { boxes: [{ id, name, groups: [{ title, members: [text] }] }], links: [{ from, to }] }
   hooks: { color(id) -> the colour of a box, click(id) -> a click on a box }

   A box has its name, and under it one part for each group of members: a rule, the title of the group, and the
   members, one on a line. A link is the inheritance connection, from a box to the box above it.

   The layout is D3's force simulation (d3.forceSimulation): it has no direction. The boxes push each other apart
   and each connection pulls its two boxes together, so boxes that inherit from each other sit close and the
   drawing fills the area both ways. */
import * as d3 from 'd3';

/* the measures of a box */
const NAME_HEIGHT = 28;
const TITLE_HEIGHT = 16;
const LINE_HEIGHT = 15;
const MIN_WIDTH = 84;
const PADDING = 24;
/* the fonts the drawing writes in, as the canvas names them */
const NAME_FONT = '600 12px sans-serif';
const TITLE_FONT = 'italic 9px sans-serif';
const MEMBER_FONT = '11px sans-serif';

/* the room between two boxes */
const GAP = 32;
/* the layout */
const TICKS = 300;

/* the width of a text in a font, measured by the browser */
const ruler = document.createElement('canvas').getContext('2d');
function widthOf(text, font) {
  ruler.font = font;
  return ruler.measureText(text).width;
}

const PANEL = 'var(--panel, Canvas)';
const MARKER = 'class-diagram-inherit';

/* One box, measured: where its rules, titles and members are inside it, and how large it is. Its place (x, y, its
   top left corner) is set by the layout. */
class Box {
  constructor({ id, name, groups }) {
    this.id = id;
    this.name = name;
    this.rules = [];      /* the height of each rule */
    this.titles = [];     /* each { text, y } */
    this.members = [];    /* each { text, y } */
    this.width = Math.max(MIN_WIDTH, widthOf(name, NAME_FONT) + PADDING);
    this.height = NAME_HEIGHT;
    this.x = 0;
    this.y = 0;
    for (const group of groups) {
      if (group.members.length) this.addGroup(group);
    }
  }

  addGroup(group) {
    this.rules.push(this.height);
    this.titles.push({ text: group.title, y: this.height + 4 + TITLE_HEIGHT / 2 });
    this.height += 4 + TITLE_HEIGHT;
    this.widenFor(group.title, TITLE_FONT);
    for (const member of group.members) {
      this.members.push({ text: member, y: this.height + LINE_HEIGHT / 2 });
      this.height += LINE_HEIGHT;
      this.widenFor(member, MEMBER_FONT);
    }
    this.height += 6;
  }

  widenFor(text, font) {
    this.width = Math.max(this.width, widthOf(text, font) + PADDING);
  }

  /* the radius of the circle around the box, with room: no two such circles may overlap */
  get reach() {
    return Math.hypot(this.width, this.height) / 2 + GAP / 2;
  }

  get middle() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  /* the point on the edge of the box where a straight line from its middle to a point leaves it */
  edgeToward(point) {
    const middle = this.middle;
    const dx = point.x - middle.x;
    const dy = point.y - middle.y;
    const acrossX = dx ? this.width / 2 / Math.abs(dx) : Infinity;
    const acrossY = dy ? this.height / 2 / Math.abs(dy) : Infinity;
    const scale = Math.min(acrossX, acrossY);
    return [middle.x + dx * scale, middle.y + dy * scale];
  }
}

/* The layout gives each box its place: D3's force simulation, with D3's own forces. */
function layOut(boxes, links) {
  /* in the simulation each box is a point at its middle */
  const points = boxes.map(box => ({ id: box.id, box }));
  const simulation = d3.forceSimulation(points)
    /* a connection pulls its two boxes together */
    .force('link', d3.forceLink(links.map(link => ({ source: link.from.id, target: link.to.id })))
      .id(point => point.id)
      .distance(link => link.source.box.reach + link.target.box.reach)
      .strength(0.5))
    /* all boxes push each other apart */
    .force('charge', d3.forceManyBody().strength(-300).distanceMax(1200))
    /* no box on another */
    .force('collide', d3.forceCollide(point => point.box.reach).iterations(4))
    /* all are drawn to the middle, more from above and below than from the sides: the drawing is wider than high */
    .force('x', d3.forceX().strength(0.012))
    .force('y', d3.forceY().strength(0.04))
    .stop();
  simulation.tick(TICKS);
  for (const point of points) {
    point.box.x = point.x - point.box.width / 2;
    point.box.y = point.y - point.box.height / 2;
  }
}

export function classDiagram(model, hooks) {
  const boxes = model.boxes.map(box => new Box(box));
  const boxOf = id => boxes.find(box => box.id === id);
  const links = model.links
    .filter(link => link.from !== link.to)
    .map(link => ({ from: boxOf(link.from), to: boxOf(link.to) }))
    .filter(link => link.from && link.to);

  layOut(boxes, links);

  const left = d3.min(boxes, box => box.x) || 0;
  const top = d3.min(boxes, box => box.y) || 0;
  const right = d3.max(boxes, box => box.x + box.width) || 1;
  const bottom = d3.max(boxes, box => box.y + box.height) || 1;
  const svg = d3.create('svg')
    .attr('viewBox', [left, top, right - left, bottom - top])
    .attr('fill', 'currentColor')
    .attr('style', 'font: 12px sans-serif;');

  drawMarker(svg);
  drawLinks(svg, links);
  drawBoxes(svg, boxes, hooks);
  return svg.node();
}

/* the end of an inheritance connection: a hollow triangle at the box above */
function drawMarker(svg) {
  svg.append('defs').append('marker')
    .attr('id', MARKER)
    .attr('viewBox', '0 0 14 14')
    .attr('refX', 13)
    .attr('refY', 7)
    .attr('markerWidth', 14)
    .attr('markerHeight', 14)
    .attr('markerUnits', 'userSpaceOnUse')
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M1,1L13,7L1,13Z')
    .attr('fill', PANEL)
    .attr('stroke', 'currentColor')
    .attr('stroke-width', 1.2);
}

/* a connection is a straight line, from the edge of a box to the edge of the box above it */
function drawLinks(svg, links) {
  const line = link => `M${link.from.edgeToward(link.to.middle)}L${link.to.edgeToward(link.from.middle)}`;
  svg.append('g')
    .attr('fill', 'none')
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', 1)
    .selectAll()
    .data(links)
    .join('path')
    .attr('d', line)
    .attr('marker-end', `url(#${MARKER})`);
}

function drawBoxes(svg, boxes, hooks) {
  const color = box => hooks.color(box.id);
  const drawn = svg.append('g')
    .selectAll()
    .data(boxes)
    .join('g')
    .attr('transform', box => `translate(${box.x},${box.y})`)
    .style('cursor', 'pointer')
    .on('click', (event, box) => hooks.click(box.id));

  /* the ground of the box hides the connections that pass behind it; its colour goes over that, light */
  drawn.append('rect')
    .attr('width', box => box.width)
    .attr('height', box => box.height)
    .attr('rx', 3)
    .attr('fill', PANEL);
  drawn.append('rect')
    .attr('width', box => box.width)
    .attr('height', box => box.height)
    .attr('rx', 3)
    .attr('fill', color)
    .attr('fill-opacity', 0.07)
    .attr('stroke', color)
    .attr('stroke-opacity', 0.75)
    .attr('stroke-width', 1);

  /* the name */
  drawn.append('text')
    .attr('x', box => box.width / 2)
    .attr('y', NAME_HEIGHT / 2)
    .attr('dy', '0.32em')
    .attr('text-anchor', 'middle')
    .attr('font-weight', 600)
    .text(box => box.name);

  /* the rule over each group */
  drawn.append('g')
    .selectAll()
    .data(box => box.rules.map(y => ({ y, box })))
    .join('line')
    .attr('x1', 0)
    .attr('x2', rule => rule.box.width)
    .attr('y1', rule => rule.y)
    .attr('y2', rule => rule.y)
    .attr('stroke', rule => color(rule.box))
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1);

  /* the title of each group */
  drawn.append('text')
    .attr('font-size', 9)
    .attr('font-style', 'italic')
    .attr('fill-opacity', 0.7)
    .attr('text-anchor', 'middle')
    .selectAll()
    .data(box => box.titles.map(title => ({ ...title, x: box.width / 2 })))
    .join('tspan')
    .attr('x', title => title.x)
    .attr('y', title => title.y)
    .attr('dy', '0.32em')
    .text(title => title.text);

  /* the members */
  drawn.append('text')
    .attr('font-size', 11)
    .attr('fill-opacity', 0.85)
    .selectAll()
    .data(box => box.members)
    .join('tspan')
    .attr('x', 10)
    .attr('y', member => member.y)
    .attr('dy', '0.32em')
    .text(member => member.text);
}
