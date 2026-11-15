<!-- The side panel: the selection, what has to happen first, what waits for it, and the edges of one selected term. -->
<script setup>
import { computed } from 'vue';
import TermButton from './TermButton.vue';
import { map, app, reach, showInSheet, openSheet } from '../state.js';

/* the most edges in listed */
const EDGES_IN = 500;

const selected = computed(() => [...app.selection].sort());
/* the selected term, when it is the only one */
const one = computed(() => selected.value.length === 1 ? selected.value[0] : null);
const reachWord = computed(() => app.directOnly ? 'directly' : 'in all');

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

/* where the one selected term is declared, its tier and its cycle */
const declared = computed(() => {
  const id = one.value;
  if (!id) return '';
  const filesOfTerm = map.value.term(id).f;
  const unit = map.value.unitOf(id);
  let text = filesOfTerm.length ? 'Declared in ' + filesOfTerm.join(', ') + '.' : 'Referenced only. No loaded file declares it.';
  text += ' Tier ' + map.value.tierOf(id) + '.';
  if (unit.length > 1) text += ' In a cycle with ' + unit.filter(each => each !== id).join(', ') + '. They are generated as one unit.';
  return text;
});
/* the edges of the one selected term, each with the term at its other end */
const edgesOut = computed(() => {
  if (!one.value) return [];
  return map.value.edgesFrom(one.value).map(([, property, to, file]) => ({ property, term: to, file }));
});
const edgesIn = computed(() => {
  if (!one.value) return [];
  return map.value.edgesTo(one.value).map(([from, property, , file]) => ({ property, term: from, file }));
});

const key = [
  { standing: 'sel', text: 'selected' },
  { standing: 'up', text: 'has to happen first' },
  { standing: 'down', text: 'waits for it' },
  { standing: 'cyc', text: 'both: a cycle' },
];

function details(id) {
  showInSheet(id);
  openSheet(true);
}
</script>

<template>
  <aside class="side" aria-live="polite">
    <template v-if="!selected.length">
      <h2>No term selected</h2>
      <p class="empty">{{ map.isEmpty ? 'The detail of a term shows here.' : 'Select a term on the map, or type its name in the Term field.' }}</p>
      <details v-if="map.cycles.length" open>
        <summary>Cycles<small>{{ map.cycles.length }} units</small></summary>
        <div>
          <div v-for="(cycle, i) in map.cycles" :key="i" class="grp">
            <b>T{{ cycle.tier }}</b>
            <div><TermButton v-for="id in cycle.terms" :key="id" :id="id" from-side /></div>
          </div>
        </div>
      </details>
    </template>
    <template v-else>
      <template v-if="one">
        <h2>{{ one }}</h2>
        <p class="src">{{ map.iriOf(one) }}</p>
        <p>{{ declared }}</p>
        <button type="button" class="btn primary" @click="details(one)">Details</button>
      </template>
      <template v-else>
        <h2>{{ selected.length }} terms selected</h2>
        <div class="key"><TermButton v-for="id in selected" :key="id" :id="id" from-side /></div>
      </template>
      <div class="key"><span v-for="k in key" :key="k.standing" class="term" :class="k.standing">{{ k.text }}</span></div>

      <details open>
        <summary>Has to happen first<small>{{ reach.up.size }} terms {{ reachWord }}</small></summary>
        <div v-if="first.length">
          <div v-for="row in first" :key="row.tier" class="grp">
            <b>T{{ row.tier }}</b>
            <div><TermButton v-for="id in row.ids" :key="id" :id="id" from-side /></div>
          </div>
        </div>
        <p v-else class="empty">Nothing. No selected edge leaves this term.</p>
      </details>
      <details :open="reach.down.size <= 40">
        <summary>Waits for it<small>{{ reach.down.size }} terms {{ reachWord }}</small></summary>
        <div v-if="waiting.length">
          <div v-for="row in waiting" :key="row.tier" class="grp">
            <b>T{{ row.tier }}</b>
            <div><TermButton v-for="id in row.ids" :key="id" :id="id" from-side /></div>
          </div>
        </div>
        <p v-else class="empty">Nothing depends on it through the selected edges.</p>
      </details>

      <template v-if="one">
        <details>
          <summary>Edges out<small>{{ edgesOut.length }} triples</small></summary>
          <div v-if="edgesOut.length" class="scroll"><table>
            <tr><th>edge</th><th>term</th><th>file</th></tr>
            <tr v-for="(edge, i) in edgesOut" :key="i">
              <td class="k">{{ edge.property }}</td><td><TermButton :id="edge.term" from-side /></td><td class="k">{{ edge.file }}</td>
            </tr>
          </table></div>
          <p v-else class="empty">None.</p>
        </details>
        <details>
          <summary>Edges in<small>{{ edgesIn.length }} triples</small></summary>
          <div v-if="edgesIn.length" class="scroll"><table>
            <tr><th>edge</th><th>term</th><th>file</th></tr>
            <tr v-for="(edge, i) in edgesIn.slice(0, EDGES_IN)" :key="i">
              <td class="k">{{ edge.property }}</td><td><TermButton :id="edge.term" from-side /></td><td class="k">{{ edge.file }}</td>
            </tr>
          </table></div>
          <p v-else class="empty">None.</p>
        </details>
      </template>
    </template>
  </aside>
</template>
