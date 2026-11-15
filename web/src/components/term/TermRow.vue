<!-- A property that has the term of the sheet in its domain, shown as a term: its name and its comment, then its
     fields, one block for each of its views. A block has the class of its view as heading, unless every property
     of the list has that class. -->
<script setup>
import TermRef from './TermRef.vue';
import TermField from './TermField.vue';

defineProps({ row: { type: Object, required: true } });
</script>

<template>
  <div class="term-view item">
    <div>
      <TermRef :iri="row.iri" :label="row.label" />
      <span v-if="row.note" class="class-cap">{{ row.note.text }}<TermRef :iri="row.note.iri" /></span>
      <div v-if="row.comment" class="item-note">{{ row.comment }}</div>
    </div>
    <template v-for="(block, i) in row.blocks" :key="i">
      <div v-if="block.heading" class="item-view">
        <div class="view-cap"><TermRef :iri="block.heading" /></div>
        <TermField v-for="(field, j) in block.fields" :key="j" :field="field" />
      </div>
      <template v-else>
        <TermField v-for="(field, j) in block.fields" :key="j" :field="field" />
      </template>
    </template>
  </div>
</template>
