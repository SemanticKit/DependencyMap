<!-- The tabs of the views of a term (views.js), in the bar of the details sheet. A click on a tab opens the sheet on
     its view; a click on the tab that is on closes the sheet. TermView shows the view whose tab is on. -->
<script setup>
import { computed } from 'vue';
import { termViews, currentOf } from './views.js';
import { app } from '../../state.js';

/* the tab that is on, while the sheet is open */
const current = computed(() => app.sheetOpen ? currentOf(app.termView) : null);

function choose(view) {
  if (current.value === view) {
    app.sheetOpen = false;
    return;
  }
  app.termView = view.id;
  app.sheetOpen = true;
}
</script>

<template>
  <div class="seg" role="tablist" aria-label="Views of the term">
    <button v-for="view in termViews" :id="'term-tab-' + view.id" :key="view.id" type="button" role="tab"
      :aria-selected="view === current" @click="choose(view)">{{ view.name }}</button>
  </div>
</template>
