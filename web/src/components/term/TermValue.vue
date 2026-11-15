<!-- One value of a field: a literal, with its language or its datatype after it, or a reference. -->
<script setup>
import TermRef from './TermRef.vue';

defineProps({ value: { type: Object, required: true } });
</script>

<template>
  <span v-if="value.literal" class="lit">
    <span>{{ value.literal.text }}</span>
    <small v-if="value.literal.tag">{{ value.literal.tag }}</small>
  </span>
  <TermRef v-else :iri="value.iri" />
</template>
