<!-- A term, as a button that selects it. On the map it also shows how the term stands to the selection. -->
<script setup>
import { map, select } from '../state.js';

defineProps({
  id: { type: String, required: true },
  /* how the term stands to the selection: sel, up, down, cyc or dim. Left out where the button is only a name. */
  standing: { type: String, default: null },
  /* a click from outside the map brings the term into view on the map */
  fromSide: { type: Boolean, default: false },
});

/* a click with Shift, Command or Control adds the term to the selection */
const adds = event => event.shiftKey || event.metaKey || event.ctrlKey;
</script>

<template>
  <button type="button" class="term" :class="standing" :data-term="id" :title="map.iriOf(id) || id"
    :style="{ borderLeftColor: map.colorOfTerm(id) }" :aria-pressed="standing === null ? null : standing === 'sel'"
    @click="select(id, adds($event), fromSide)">{{ id }}</button>
</template>
