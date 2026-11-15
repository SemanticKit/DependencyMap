<!-- One field of a term, as one entry of a description list: the name of the property and its values. The range of
     the property says how the field is laid out: values that are terms stand beside the name on one line, with
     commas between them; values that are text stand under it, each on its own line, across the whole width. The
     fields of a term stand in a <dl class="fields">. -->
<script setup>
import TermValue from './TermValue.vue';

defineProps({ field: { type: Object, required: true } });
</script>

<template>
  <div class="field" :class="{ text: field.text }">
    <dt :title="field.tip">{{ field.name }}</dt>
    <template v-if="field.text">
      <dd v-for="(value, i) in field.values" :key="i"><TermValue :value="value" /></dd>
    </template>
    <dd v-else>
      <template v-for="(value, i) in field.values" :key="i">
        <template v-if="i">, </template>
        <TermValue :value="value" />
      </template>
    </dd>
  </div>
</template>
