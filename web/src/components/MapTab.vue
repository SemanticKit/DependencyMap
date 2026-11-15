<!-- The map: the toolbar, the view that is on, the side panel and, when an action has something to say, its message. -->
<script setup>
import { computed } from 'vue';
import Toolbar from './Toolbar.vue';
import SidePanel from './SidePanel.vue';
import { app } from '../state.js';
import { viewOf } from '../views/index.js';

const view = computed(() => viewOf(app.view));
/* with nothing selected, a chart has no side panel and takes the whole width */
const solo = computed(() => !!view.value.chart && !app.selection.size);
</script>

<template>
  <div id="view-map" style="display:grid;gap:16px;grid-template-columns:minmax(0,1fr)">
    <Toolbar />
    <div class="main" :class="{ solo }">
      <div class="map">
        <component :is="view.component" :key="view.id" />
      </div>
      <div class="right">
        <SidePanel />
      </div>
    </div>
    <div v-if="app.message" class="status" aria-live="polite">{{ app.message }}</div>
  </div>
</template>
