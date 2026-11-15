<!-- The sheet along the foot of the page with the details of the selection. Its bar has the name of the selected
     term at its start and, in its middle, the tabs of the views of the term (term/TermTabs.vue). A click on a tab opens the sheet over the map on that view
     (term/TermView.vue); a click anywhere outside the sheet closes it. Several selected terms are listed by name in
     the bar. -->
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import TermButton from './TermButton.vue';
import TermTabs from './term/TermTabs.vue';
import TermView from './term/TermView.vue';
import { TermMap } from '../model/TermMap.js';
import { map, app } from '../state.js';

const sheet = ref(null);
const body = ref(null);
const selected = computed(() => [...app.selection].sort());
/* the selected term, when it is the only one */
const one = computed(() => selected.value.length === 1 ? selected.value[0] : null);
const isOpen = computed(() => app.sheetOpen && !!one.value);

/* another term or another view starts at its top */
watch([one, () => app.termView], () => { if (body.value) body.value.scrollTop = 0; }, { flush: 'post' });

/* a click outside the sheet closes it */
function pointerdown(event) {
  if (app.sheetOpen && sheet.value && !sheet.value.contains(event.target)) app.sheetOpen = false;
}
onMounted(() => document.addEventListener('pointerdown', pointerdown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', pointerdown));
</script>

<template>
  <div v-if="selected.length" ref="sheet" class="sheet" :class="{ open: isOpen }" role="region" aria-label="Details of the selection">
    <div class="sheet-head">
      <template v-if="one">
        <b :title="map.iriOf(one)">{{ TermMap.bare(one) }}</b>
        <TermTabs :id="one" />
      </template>
      <template v-else>
        <b>{{ selected.length }} terms selected</b>
        <div class="names"><TermButton v-for="id in selected" :key="id" :id="id" from-side /></div>
      </template>
    </div>
    <div v-if="isOpen" ref="body" class="sheet-body">
      <TermView :id="one" />
    </div>
  </div>
</template>
