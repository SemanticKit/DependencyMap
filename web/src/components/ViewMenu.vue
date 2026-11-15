<!-- The View menu: whether the map shows the ontologies (the prefixes themselves) as terms. -->
<script setup>
import { computed } from 'vue';
import PopMenu from './PopMenu.vue';
import { map, app } from '../state.js';

const list = computed(() => {
  const ontologies = [...map.value.ontologies].sort();
  if (!ontologies.length) return 'No prefixes in the loaded files.';
  return ontologies.map(id => id.replace(/:$/, '')).join(', ');
});
</script>

<template>
  <PopMenu label="View">
    <div class="checks"><label><input v-model="app.showOntologies" type="checkbox">Prefixes</label></div>
    <p class="src" style="margin:0">{{ list }}</p>
  </PopMenu>
</template>
