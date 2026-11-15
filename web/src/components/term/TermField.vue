<!-- One field of a term: the name of the property, then its values. A value that a property under this one states
     names that property after it; an inherited value says where it is inherited from. -->
<script setup>
import TermRef from './TermRef.vue';
import TermValue from './TermValue.vue';

defineProps({ field: { type: Object, required: true } });
</script>

<template>
  <div class="v-line">
    <span class="cap" :title="field.tip">{{ field.name }}</span>
    <span class="vals" :class="{ text: field.text }">
      <template v-for="(value, i) in field.values" :key="i">
        <span v-if="value.from" class="sub-val">
          <TermValue :value="value" />
          <small :title="value.from.tip">{{ value.from.name }}</small>
        </span>
        <TermValue v-else :value="value" />
        <span v-if="value.note" class="class-cap">{{ value.note.text }}<TermRef :iri="value.note.iri" /></span>
      </template>
    </span>
  </div>
</template>
