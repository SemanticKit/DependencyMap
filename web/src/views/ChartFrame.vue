<!-- The frame of a chart view: the panel a drawing fills, the zoom of the view, and the legend of the prefixes in
     it. A chart view gives it the drawing (a function from the data to an SVG) and the data; it draws again each
     time the data changes. -->
<script setup>
import { ref, watch, onMounted } from 'vue';
import * as d3 from 'd3';
import { map } from '../state.js';

const props = defineProps({
  draw: { type: Function, required: true },   /* data -> SVG element */
  data: { type: Object, default: null },
  prefixes: { type: Array, default: () => [] },
  /* start on all of what was drawn, so no name is cut off. A drawing that holds parts it shows only later keeps
     its own view. */
  fit: { type: Boolean, default: true },
});
const box = ref(null);

function render() {
  if (!box.value) return;
  box.value.replaceChildren();
  if (!props.data) return;
  const svg = props.draw(props.data);
  box.value.appendChild(svg);
  /* the chart takes the whole panel: the size is in the style sheet */
  svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = ''; svg.style.height = ''; svg.style.maxWidth = '';
  if (props.fit) { const b = svg.getBBox(), p = 12; if (b.width > 0 && b.height > 0) svg.setAttribute('viewBox', [b.x - p, b.y - p, b.width + 2 * p, b.height + 2 * p]); }
  /* Zoom of the view itself, the d3-zoom way: what was drawn goes into one group, and the zoom sets the transform
     of that group. The wheel zooms at the pointer and a drag moves the view. It has nothing to do with selection. */
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.append(...svg.childNodes); svg.appendChild(g);
  d3.select(svg).call(d3.zoom().scaleExtent([1, 200]).clickDistance(6).on('zoom', ev => g.setAttribute('transform', ev.transform))).on('dblclick.zoom', null);
}
onMounted(render);
watch(() => props.data, render);
</script>

<template>
  <div id="onion-wrap">
    <div id="onion" ref="box"></div>
    <div id="legend" aria-label="Prefixes">
      <div v-for="p in prefixes.filter(Boolean)" :key="p"><span class="sw" :style="{ background: map.colorOf(p) }"></span>{{ p }}</div>
    </div>
  </div>
</template>
