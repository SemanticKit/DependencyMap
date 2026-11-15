<!-- A term as an rdfs:Class: a field for each property that RDFS declares for rdfs:Class, and the properties that
     have this class as their domain. -->
<script setup>
import { computed } from 'vue';
import TermField from '../term/TermField.vue';
import TermProperties from '../term/TermProperties.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { CLASS } from '../../rdf.js';
import { map, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const details = computed(() => new TermDetails(map.value, isShown));
const fields = computed(() => details.value.formatOf(props.id, CLASS));
const hasProperties = computed(() => details.value.of(props.id).properties.length > 0);
</script>

<template>
  <dl v-if="fields.length" class="fields">
    <TermField v-for="field in fields" :key="field.property" :field="field" />
  </dl>
  <TermProperties v-if="hasProperties" :id="id" />
</template>
