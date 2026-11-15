<!-- The Tiers view: one row for each tier, the root at the top, and the edges of the selection drawn over the terms. -->
<script setup>
import { ref, shallowRef, computed, watch, watchPostEffect, onMounted, onBeforeUnmount, nextTick } from 'vue';
import TermButton from '../components/TermButton.vue';
import { map, files, app, reach, isVisible } from '../state.js';

const root = ref(null);
const paths = shallowRef([]);
const size = ref({ width: 0, height: 0 });

const tiers = computed(() => map.value.tiers);
const blank = computed(() => {
  if (app.loading) return 'Loading the saved files.';
  if (!files.value.length) return 'No files are loaded. Add a Turtle or RDF/XML file to see its terms, its cycles and its tiers.';
  return 'No file is switched on, or no file has a term. Switch a file on in the Files list.';
});

function countOf(tier) {
  const count = tier.groups.reduce((sum, group) => sum + group.length, 0);
  return count + (count === 1 ? ' term' : ' terms');
}

/* The place of each term on the page, measured against the panel of the map. A term that is not shown has none. */
function measure(panel) {
  const frame = panel.getBoundingClientRect();
  const places = new Map();
  for (const button of root.value.querySelectorAll('[data-term]')) {
    if (button.offsetParent === null) continue;
    const box = button.getBoundingClientRect();
    places.set(button.dataset.term, {
      x: box.left - frame.left + box.width / 2,
      top: box.top - frame.top,
      bottom: box.bottom - frame.top,
    });
  }
  return places;
}

/* the curve of an edge from the term at a to the term at b */
function curve(a, b, toItself) {
  if (toItself) return `M${a.x - 8},${a.top}C${a.x - 26},${a.top - 22} ${a.x + 26},${a.top - 22} ${a.x + 8},${a.top}`;
  if (b.bottom <= a.top) {
    const bend = Math.max(14, (a.top - b.bottom) * .5);
    return `M${a.x},${a.top}C${a.x},${a.top - bend} ${b.x},${b.bottom + bend} ${b.x},${b.bottom}`;
  }
  if (b.top >= a.bottom) {
    const bend = Math.max(14, (b.top - a.bottom) * .5);
    return `M${a.x},${a.bottom}C${a.x},${a.bottom + bend} ${b.x},${b.top - bend} ${b.x},${b.top}`;
  }
  /* both in one row: an arc over the row */
  const rise = Math.min(20, 8 + Math.abs(a.x - b.x) * .08);
  return `M${a.x},${a.top}C${a.x},${a.top - rise} ${b.x},${b.top - rise} ${b.x},${b.top}`;
}

/* The edges are drawn from where the terms are on the page, so they are drawn after the page is laid out. */
function drawEdges() {
  if (!root.value) return;
  const panel = root.value.closest('.map');
  size.value = { width: panel.clientWidth, height: panel.clientHeight };
  if (!app.selection.size) {
    paths.value = [];
    return;
  }
  const places = measure(panel);
  const near = [];
  const far = [];
  for (const edge of reach.value.shownEdges()) {
    const from = places.get(edge.from);
    const to = places.get(edge.to);
    if (!from || !to) continue;
    const [dashes, width] = map.value.lineOf(edge.group);
    (edge.near ? near : far).push({
      d: curve(from, to, edge.from === edge.to),
      cls: 'e ' + edge.direction + (edge.near ? ' near' : ' far'),
      dashes: dashes || null,
      width: width || null,
      end: edge.near ? 'url(#m-' + edge.direction + ')' : null,
    });
  }
  /* an edge that touches the selection is drawn over the others */
  paths.value = far.concat(near);
}

/* draw again when the edges to show change, or when what the map shows moves the terms */
watchPostEffect(() => {
  reach.value;
  app.hiddenPrefixes.size;
  app.showOntologies;
  drawEdges();
});

/* a term selected from outside the map comes into view */
watch(() => app.scrollTo, async target => {
  if (!target || !root.value) return;
  await nextTick();
  const button = [...root.value.querySelectorAll('[data-term]')].find(each => each.dataset.term === target.id);
  if (!button || button.offsetParent === null) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  button.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
});

let resize = null;
onMounted(() => {
  resize = new ResizeObserver(drawEdges);
  resize.observe(root.value.closest('.map'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawEdges);
});
onBeforeUnmount(() => { if (resize) resize.disconnect(); });
</script>

<template>
  <div ref="root">
    <div id="tiers">
      <p v-if="!tiers.length" class="blank">{{ blank }}</p>
      <div v-for="tier in tiers" :key="tier.tier" class="tier">
        <h4>Tier {{ tier.tier }}<small>{{ countOf(tier) }}</small></h4>
        <div class="units">
          <template v-for="unit in tier.groups" :key="unit[0]">
            <span v-if="unit.length > 1" v-show="unit.some(isVisible)" class="unit" :class="{ root: tier.tier === 0 }" title="A cycle, generated as one unit">
              <TermButton v-for="id in unit" :key="id" v-show="isVisible(id)" :id="id" :standing="reach.standing(id)" />
            </span>
            <TermButton v-else v-show="isVisible(unit[0])" :id="unit[0]" :standing="reach.standing(unit[0])" />
          </template>
        </div>
      </div>
    </div>
    <svg class="edges" :width="size.width" :height="size.height" aria-hidden="true">
      <defs>
        <marker id="m-up" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" style="fill:var(--up)" /></marker>
        <marker id="m-down" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" style="fill:var(--down)" /></marker>
      </defs>
      <g>
        <path v-for="(path, i) in paths" :key="i" :d="path.d" :class="path.cls" :marker-end="path.end" :style="{ strokeDasharray: path.dashes, strokeWidth: path.width }" />
      </g>
    </svg>
  </div>
</template>
