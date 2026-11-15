<!-- The properties that state a term as their domain, as one list in as many columns as fit. The Defined by buttons
     show the properties of one rdfs:isDefinedBy value at a time; the choice stays as the term changes. -->
<script setup>
import { computed } from 'vue';
import TermRow from './TermRow.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { map, app, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const details = computed(() => new TermDetails(map.value, isShown).of(props.id));
/* the Defined by button that is on: null is All */
const tab = computed(() => details.value.tabs.some(each => each.iri === app.definedBy) ? app.definedBy : null);
const shown = computed(() => details.value.properties.filter(row => tab.value === null || row.definedBy === tab.value));
</script>

<template>
  <section class="class-view">
    <h3 id="term-properties">Properties</h3>
    <div v-if="details.tabs.length" class="seg prop-tabs" role="group" aria-label="Defined by">
      <button type="button" :aria-pressed="tab === null" @click="app.definedBy = null">All</button>
      <button v-for="each in details.tabs" :key="each.iri" type="button" :aria-pressed="tab === each.iri" @click="app.definedBy = each.iri">{{ each.name }}</button>
    </div>
    <ul class="items" aria-labelledby="term-properties">
      <TermRow v-for="row in shown" :key="row.iri" :row="row" />
    </ul>
  </section>
</template>
