<!-- The body of the sheet: the comment of the term, its definition (its own fields), and the properties that have the
     term in their domain. The Defined by buttons show the properties of one rdfs:isDefinedBy value at a time; the
     choice stays as the term changes. -->
<script setup>
import { computed } from 'vue';
import TermRef from './TermRef.vue';
import TermField from './TermField.vue';
import TermRow from './TermRow.vue';
import { app } from '../../state.js';

const props = defineProps({ details: { type: Object, required: true } });

/* the Defined by button that is on: null is All */
const tab = computed(() => props.details.tabs.some(t => t.iri === app.sheet.definedBy) ? app.sheet.definedBy : null);
const isEmpty = computed(() => !props.details.fields.length && !props.details.groups.length);
/* All shows each group under its name; a button shows its group alone, without the name. The properties with no
   rdfs:isDefinedBy are always shown. */
const showsGroup = group => tab.value === null || !group.definedBy || group.definedBy === tab.value;
</script>

<template>
  <article class="object">
    <p v-if="details.comment" class="term-note">{{ details.comment }}</p>
    <div class="term-view top">
      <section v-if="details.fields.length" class="class-view definition">
        <TermField v-for="(field, i) in details.fields" :key="i" :field="field" />
      </section>
      <section v-if="details.groups.length" class="class-view">
        <div class="view-cap">Properties</div>
        <div v-if="details.tabs.length" class="seg prop-tabs" role="group" aria-label="Defined by">
          <button type="button" :aria-pressed="tab === null" @click="app.sheet.definedBy = null">All</button>
          <button v-for="t in details.tabs" :key="t.iri" type="button" :title="t.iri" :aria-pressed="tab === t.iri" @click="app.sheet.definedBy = t.iri">{{ t.name }}</button>
        </div>
        <div v-for="group in details.groups" v-show="showsGroup(group)" :key="group.definedBy" class="items">
          <div v-if="group.definedBy" v-show="tab === null" class="group-cap" :title="group.definedBy">{{ group.name }}</div>
          <div v-for="(list, i) in group.lists" :key="i" class="items">
            <div v-if="list.from" class="from-cap"><TermRef :iri="list.from" /></div>
            <TermRow v-for="row in list.rows" :key="row.iri" :row="row" />
          </div>
        </div>
      </section>
      <p v-if="isEmpty" class="empty">The loaded files have no statement about this term in the vocabularies that Show selects.</p>
    </div>
  </article>
</template>
