<!-- A term as an rdf:Property: a field for each property that RDFS declares for rdf:Property. -->
<script setup>
import { computed } from 'vue';
import TermField from '../term/TermField.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { PROPERTY } from '../../rdf.js';
import { map, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const fields = computed(() => new TermDetails(map.value, isShown).formatOf(props.id, PROPERTY));
</script>

<template>
  <dl v-if="fields.length" class="fields">
    <TermField v-for="field in fields" :key="field.property" :field="field" />
  </dl>
</template>
