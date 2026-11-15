<!-- A reference to something by its IRI. A term of the map is a button that selects it; another web address is a
     link; anything else is its name. -->
<script setup>
import { computed } from 'vue';
import { map, select } from '../../state.js';
import { COMMENT } from '../../rdf.js';

const props = defineProps({
  iri: { type: String, required: true },
  /* shown in place of the id of the term */
  label: { type: String, default: '' },
});
const statements = computed(() => map.value.statements);
const id = computed(() => statements.value.idOf(props.iri));
const short = computed(() => statements.value.short(props.iri));
const isWebAddress = computed(() => /^https?:/.test(props.iri));
/* under a label the tip is the id; under the id it is the comment of the term */
const tip = computed(() => props.label ? short.value : statements.value.text(props.iri, COMMENT) || props.iri);
</script>

<template>
  <button v-if="id" type="button" class="tlink" :title="tip" @click="select(id, false, true)">{{ label || id }}</button>
  <a v-else-if="isWebAddress" class="tlink" :href="iri" target="_blank" rel="noopener">{{ short.replace(/^<|>$/g, '') }}</a>
  <code v-else :title="iri">{{ short }}</code>
</template>
