<!-- One view of a term: where it stands in the build order. Where it is declared, its tier and its unit, what has to
     happen first, and what waits for it. The map works these out; nothing here is stored. -->
<script setup>
import { computed } from 'vue';
import TermButton from '../TermButton.vue';
import { Reach } from '../../model/Reach.js';
import { map, app, edgesInUse } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const reachWord = computed(() => app.directOnly ? 'directly' : 'in all');
/* what this one term reaches, through the edges in use */
const reach = computed(() => new Reach(edgesInUse.value, new Set([props.id]), app.directOnly));

/* terms as rows, one for each tier: each { tier, ids } */
function byTier(ids) {
  const rows = [];
  for (const id of [...ids].sort()) {
    const tier = map.value.tierOf(id);
    let row = rows.find(each => each.tier === tier);
    if (!row) rows.push(row = { tier, ids: [] });
    row.ids.push(id);
  }
  return rows.sort((a, b) => a.tier - b.tier);
}
const first = computed(() => byTier(reach.value.up));
const waiting = computed(() => byTier(reach.value.down));

/* where the term is declared, and its tier */
const declared = computed(() => {
  const ontologies = map.value.term(props.id).f;
  const text = ontologies.length ? 'Declared in ' + ontologies.join(', ') + '.' : 'Referenced only. No loaded ontology declares it.';
  return text + ' Tier ' + map.value.tierOf(props.id) + '.';
});
/* the other terms of its cycle */
const cycle = computed(() => map.value.unitOf(props.id).filter(each => each !== props.id));
</script>

<template>
  <section class="class-view">
    <p>{{ declared }}</p>
    <p v-if="cycle.length">In a cycle with {{ cycle.join(', ') }}. They are generated as one unit.</p>
    <div class="side-by-side">
      <section class="part">
        <h3>Has to happen first<small>{{ reach.up.size }} terms {{ reachWord }}</small></h3>
        <div v-for="row in first" :key="row.tier" class="grp">
          <b>T{{ row.tier }}</b>
          <div><TermButton v-for="id in row.ids" :key="id" :id="id" from-side /></div>
        </div>
        <p v-if="!first.length" class="empty">Nothing. No edge in use leaves this term.</p>
      </section>
      <section class="part">
        <h3>Waits for it<small>{{ reach.down.size }} terms {{ reachWord }}</small></h3>
        <div v-for="row in waiting" :key="row.tier" class="grp">
          <b>T{{ row.tier }}</b>
          <div><TermButton v-for="id in row.ids" :key="id" :id="id" from-side /></div>
        </div>
        <p v-if="!waiting.length" class="empty">Nothing depends on it through the edges in use.</p>
      </section>
    </div>
  </section>
</template>
