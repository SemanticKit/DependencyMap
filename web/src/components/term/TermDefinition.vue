<!-- The generic view of a term, for a term of any type: its IRI, its comment, a field for each other property it
     states, and the properties that have it as their domain. The view of a standard (views.js) shows a term through
     the types of that standard instead. -->
<script setup>
import { computed } from 'vue';
import TermField from './TermField.vue';
import TermProperties from './TermProperties.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { LABEL, COMMENT } from '../../rdf.js';
import { map, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const details = computed(() => new TermDetails(map.value, isShown));
const iri = computed(() => map.value.iriOf(props.id));
const comment = computed(() => map.value.statements.text(iri.value, COMMENT));
const fields = computed(() => details.value.fieldsOf(props.id)
  .filter(field => field.property !== LABEL && field.property !== COMMENT));
const hasProperties = computed(() => details.value.of(props.id).properties.length > 0);
</script>

<template>
  <section class="class-view">
    <div class="definition">
      <p class="src">{{ iri }}</p>
      <p v-if="comment" class="term-note">{{ comment }}</p>
      <dl v-if="fields.length" class="fields">
        <TermField v-for="field in fields" :key="field.property" :field="field" />
      </dl>
    </div>
    <TermProperties v-if="hasProperties" :id="id" />
  </section>
</template>
