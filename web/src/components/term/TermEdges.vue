<!-- One view of a term: its edges on the map, those that leave it and those that arrive at it, each with the term at
     its other end and the ontology that states it. -->
<script setup>
import { computed } from 'vue';
import TermButton from '../TermButton.vue';
import { TermMap } from '../../model/TermMap.js';
import { map } from '../../state.js';

/* the most edges in listed */
const EDGES_IN = 500;

const props = defineProps({ id: { type: String, required: true } });

/* each edge of the map is [from, property, to, ontology] */
const out = computed(() => map.value.edgesFrom(props.id).map(([, property, to, ontology]) => ({ property: TermMap.bare(property), term: to, ontology })));
const into = computed(() => map.value.edgesTo(props.id).map(([from, property, , ontology]) => ({ property: TermMap.bare(property), term: from, ontology })));
</script>

<template>
  <section class="class-view side-by-side">
    <section class="part">
      <h3>Edges out<small>{{ out.length }} triples</small></h3>
      <div v-if="out.length" class="scroll"><table class="edge-list">
        <tr><th>edge</th><th>term</th><th>ontology</th></tr>
        <tr v-for="(edge, i) in out" :key="i">
          <td class="k">{{ edge.property }}</td><td><TermButton :id="edge.term" from-side /></td><td class="k">{{ edge.ontology }}</td>
        </tr>
      </table></div>
      <p v-else class="empty">None.</p>
    </section>
    <section class="part">
      <h3>Edges in<small>{{ into.length }} triples</small></h3>
      <div v-if="into.length" class="scroll"><table class="edge-list">
        <tr><th>edge</th><th>term</th><th>ontology</th></tr>
        <tr v-for="(edge, i) in into.slice(0, EDGES_IN)" :key="i">
          <td class="k">{{ edge.property }}</td><td><TermButton :id="edge.term" from-side /></td><td class="k">{{ edge.ontology }}</td>
        </tr>
      </table></div>
      <p v-else class="empty">None.</p>
    </section>
  </section>
</template>
