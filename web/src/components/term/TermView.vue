<!-- The view of one term whose tab is on (TermTabs.vue, views.js). The details sheet shows it under its bar. -->
<script setup>
import { computed } from 'vue';
import { currentOf } from './views.js';
import { app } from '../../state.js';

defineProps({ id: { type: String, required: true } });

const current = computed(() => currentOf(app.termView));
</script>

<template>
  <article class="term-view top" role="tabpanel" :aria-labelledby="'term-tab-' + current.id">
    <component :is="current.component" :id="id" />
  </article>
</template>
