<!-- The row of controls over the map: the Term box, the reach, the view, the Type box, the three menus and the info button. -->
<script setup>
import { computed } from 'vue';
import FilesMenu from './FilesMenu.vue';
import ViewMenu from './ViewMenu.vue';
import FiltersMenu from './FiltersMenu.vue';
import InfoDialog from './InfoDialog.vue';
import { map, app, select, clearSelection, setDirectOnly, setView } from '../state.js';
import { views, viewOf } from '../views/index.js';
import { types, type } from '../views/typeTree.js';

const view = computed(() => viewOf(app.view));
/* the Term box is the selection: it names the one selected term */
const term = computed(() => app.selection.size === 1 ? [...app.selection][0] : '');

function typed(event) {
  const id = event.target.value.trim();
  if (id) select(id, false, true);
}
/* clearing the box (its own clear button, or Escape) clears the selection */
function cleared(event) {
  if (event.target.value === '' && app.selection.size) clearSelection();
}
</script>

<template>
  <div class="bar">
    <input type="search" list="termlist" placeholder="Term, for example rdfs:Class" autocomplete="off" aria-label="Term" :value="term" @change="typed" @input="cleared">
    <datalist id="termlist"><option v-for="id in map.ids" :key="id" :value="id" /></datalist>
    <div class="seg" role="group" aria-label="Reach">
      <button type="button" :aria-pressed="!app.directOnly" @click="setDirectOnly(false)">Everything</button>
      <button type="button" :aria-pressed="app.directOnly" @click="setDirectOnly(true)">Direct only</button>
    </div>
    <div class="seg" role="group" aria-label="Layout">
      <button v-for="v in views" :key="v.id" type="button" :aria-pressed="v.id === view.id" @click="setView(v.id)">{{ v.name }}</button>
    </div>
    <select v-if="view.byType" aria-label="Type" :value="type" @change="app.type = $event.target.value">
      <option v-for="t in types" :key="t.iri" :value="t.iri">{{ t.name }}</option>
    </select>
    <FilesMenu />
    <ViewMenu />
    <FiltersMenu />
    <InfoDialog />
  </div>
</template>
