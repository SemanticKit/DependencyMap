<!-- The Treemap view: D3's treemap example (observablehq.com/@d3/treemap/2), as published. Ours: the colour of a
     cell, the colour of the names, plain ids in place of the notebook's DOM.uid, and a click selects the term. -->
<script setup>
import * as d3 from 'd3';
import ChartFrame from './ChartFrame.vue';
import { treeRoot, treePrefixes } from './typeTree.js';
import { map, select } from '../state.js';

function treemap(data) {
  // Specify the chart’s dimensions.
  const width = 1154;
  const height = 1154;

  // Compute the layout.
  const root = d3.treemap()
    .tile(d3.treemapSquarify)
    .size([width, height])
    .padding(1)
    .round(true)
  (d3.hierarchy(data)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value));

  // Create the SVG container.
  const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "currentColor")
      .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  // Add a cell for each leaf of the hierarchy.
  const leaf = svg.selectAll("g")
    .data(root.leaves())
    .join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => select(d.data.id, false, false));

  // Append a tooltip.
  const format = d3.format(",d");
  leaf.append("title")
      .text(d => `${d.ancestors().reverse().map(d => d.data.name).join(".")}\n${format(d.value)}`);

  // Append a color rectangle.
  leaf.append("rect")
      .attr("id", (d, i) => "tm-leaf-" + i)
      .style("fill", d => map.value.colorOfTerm(d.data.id))
      .attr("fill-opacity", 0.6)
      .attr("width", d => d.x1 - d.x0)
      .attr("height", d => d.y1 - d.y0);

  // Append a clipPath to ensure text does not overflow.
  leaf.append("clipPath")
      .attr("id", (d, i) => "tm-clip-" + i)
    .append("use")
      .attr("href", (d, i) => "#tm-leaf-" + i);

  // Append multiline text. The last line shows the value and has a specific formatting.
  leaf.append("text")
      .attr("clip-path", (d, i) => "url(#tm-clip-" + i + ")")
    .selectAll("tspan")
    .data(d => d.data.name.split(/(?=[A-Z][a-z])|\s+/g).concat(format(d.value)))
    .join("tspan")
      .attr("x", 3)
      .attr("y", (d, i, nodes) => `${(i === nodes.length - 1) * 0.3 + 1.1 + i * 0.9}em`)
      .attr("fill-opacity", (d, i, nodes) => i === nodes.length - 1 ? 0.7 : null)
      .text(d => d);

  return svg.node();
}
</script>

<template>
  <ChartFrame :draw="treemap" :data="treeRoot" :prefixes="treePrefixes" />
</template>
