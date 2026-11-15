<!-- A term as an rdfs:Resource, which every term is: its IRI, its comment, and a field for each other property that
     RDF and RDFS declare for rdfs:Resource. The label is the name of the term, shown where the term is named. -->
<script setup>
import { computed } from 'vue';
import TermField from '../term/TermField.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { RESOURCE, LABEL, COMMENT } from '../../rdf.js';
import { map, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const iri = computed(() => map.value.iriOf(props.id));
const comment = computed(() => map.value.statements.text(iri.value, COMMENT));
const fields = computed(() => new TermDetails(map.value, isShown).formatOf(props.id, RESOURCE)
  .filter(field => field.property !== LABEL && field.property !== COMMENT));
</script>

<template>
  <section class="definition">
    <p class="src">{{ iri }}</p>
    <p v-if="comment" class="term-note">{{ comment }}</p>
    <dl v-if="fields.length" class="fields">
      <TermField v-for="field in fields" :key="field.property" :field="field" />
    </dl>
  </section>
</template>
