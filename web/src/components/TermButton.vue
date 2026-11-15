<!-- A term, as a button that selects it. On the map it is a box with its id, the color of its prefix on its edge, and
     how the term stands to the selection. Outside the map it is its name alone, without the prefix. -->
<script setup>
import { TermMap } from '../model/TermMap.js';
import { map, select } from '../state.js';

defineProps({
  id: { type: String, required: true },
  /* how the term stands to the selection: sel, up, down, cyc or dim. Left out where the button is only a name. */
  standing: { type: String, default: null },
  /* outside the map: a click brings the term into view on the map */
  fromSide: { type: Boolean, default: false },
});

/* a click with Shift, Command or Control adds the term to the selection */
const adds = event => event.shiftKey || event.metaKey || event.ctrlKey;
</script>

<template>
  <button v-if="fromSide" type="button" class="tlink" :title="map.iriOf(id) || id" @click="select(id, adds($event), true)">{{ TermMap.bare(id) }}</button>
  <button v-else type="button" class="term" :class="standing" :data-term="id" :title="map.iriOf(id) || id"
    :style="{ borderLeftColor: map.colorOfTerm(id) }" :aria-pressed="standing === null ? null : standing === 'sel'"
    @click="select(id, adds($event), false)">{{ id }}</button>
</template>
