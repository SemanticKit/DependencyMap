<!-- The Pack view: D3's circle packing example (observablehq.com/@d3/pack/2), as published. Ours: the colours and
     the click. -->
<script setup>
import * as d3 from 'd3';
import ChartFrame from './ChartFrame.vue';
import { treeRoot, treePrefixes } from './typeTree.js';
import { map, select } from '../state.js';

function circles(data) {
  // Specify the dimensions of the chart.
  const width = 928;
  const height = width;
  const margin = 1; // to avoid clipping the root circle stroke

  // Specify the number format for values.
  const format = d3.format(",d");

  // Create the pack layout.
  const pack = d3.pack()
      .size([width - margin * 2, height - margin * 2])
      .padding(3);

  // Compute the hierarchy from the JSON data; recursively sum the
  // values for each node; sort the tree by descending value; lastly
  // apply the pack layout.
  const root = pack(d3.hierarchy(data)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value));

  // Create the SVG container.
  const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [-margin, -margin, width, height])
      .attr("fill", "currentColor")
      .attr("style", "width: 100%; height: auto; font: 10px sans-serif;")
      .attr("text-anchor", "middle");

  // Place each node according to the layout’s x and y values.
  const node = svg.append("g")
    .selectAll()
    .data(root.descendants())
    .join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => { if (map.value.has(d.data.id)) { event.stopPropagation(); select(d.data.id, false, false); } });

  // Add a title.
  node.append("title")
      .text(d => `${d.ancestors().map(d => d.data.name).reverse().join("/")}\n${format(d.value)}`);

  // Add a filled or stroked circle.
  node.append("circle")
      .style("fill", d => map.value.has(d.data.id) ? map.value.colorOfTerm(d.data.id) : "none")
      .attr("fill-opacity", d => d.children ? 0.15 : 0.6)
      .style("stroke", d => d.children ? "var(--rule)" : null)
      .attr("r", d => d.r);

  // Add a label to leaf nodes.
  const text = node
    .filter(d => !d.children && d.r > 10)
    .append("text")
      .attr("clip-path", d => `circle(${d.r})`);

  // Add a tspan for each CamelCase-separated word.
  text.selectAll()
    .data(d => d.data.name.split(/(?=[A-Z][a-z])|\s+/g))
    .join("tspan")
      .attr("x", 0)
      .attr("y", (d, i, nodes) => `${i - nodes.length / 2 + 0.35}em`)
      .text(d => d);

  // Add a tspan for the node’s value.
  text.append("tspan")
      .attr("x", 0)
      .attr("y", d => `${d.data.name.split(/(?=[A-Z][a-z])|\s+/g).length / 2 + 0.35}em`)
      .attr("fill-opacity", 0.7)
      .text(d => format(d.value));

  return svg.node();
}
</script>

<template>
  <ChartFrame :draw="circles" :data="treeRoot" :prefixes="treePrefixes" />
</template>
