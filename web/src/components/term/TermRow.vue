<!-- A property that has the shown term as its domain: its name and its comment. Its prefix is its description
     (aria-description). Selecting it shows its own fields. -->
<script setup>
import { computed } from 'vue';
import TermRef from './TermRef.vue';
import { map } from '../../state.js';

const props = defineProps({ row: { type: Object, required: true } });

const prefix = computed(() => map.value.prefixOf(props.row.id));
</script>

<template>
  <li class="term-view item" :aria-description="prefix">
    <TermRef :iri="row.iri" :label="row.label" />
    <div v-if="row.comment" class="item-note">{{ row.comment }}</div>
  </li>
</template>
