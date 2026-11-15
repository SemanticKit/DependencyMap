<!-- The map: the toolbar, the view that is on and, when an action has something to say, its message. -->
<script setup>
import { computed } from 'vue';
import Toolbar from './Toolbar.vue';
import { app } from '../state.js';
import { viewOf } from '../views/index.js';

const view = computed(() => viewOf(app.view));
</script>

<template>
  <div id="view-map" style="display:grid;gap:16px;grid-template-columns:minmax(0,1fr)">
    <Toolbar />
    <div class="main">
      <div class="map">
        <component :is="view.component" :key="view.id" />
      </div>
    </div>
    <div v-if="app.message" class="status" aria-live="polite">{{ app.message }}</div>
  </div>
</template>
