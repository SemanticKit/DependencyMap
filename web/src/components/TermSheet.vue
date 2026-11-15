<!-- The sheet at the foot of the page with the details of the selected term. It is folded down to its name, or open. -->
<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import TermBody from './term/TermBody.vue';
import { TermDetails } from '../model/TermDetails.js';
import { map, app, isShown, openSheet, sheetBack } from '../state.js';

const body = ref(null);
/* the term of the sheet, when the sheet is on the page */
const term = computed(() => {
  const id = app.sheet.id;
  return app.sheet.state !== 'none' && id && map.value.term(id) ? id : null;
});
const isOpen = computed(() => app.sheet.state === 'open');
const name = computed(() => term.value ? map.value.labelOf(term.value) || term.value : '');
/* the details are worked out only while the sheet is open, and again when the term or what the map shows changes */
const details = computed(() => term.value && isOpen.value ? new TermDetails(map.value, isShown).of(term.value) : null);

/* new details start at their top; an opened sheet takes the keyboard */
watch(details, () => { if (body.value) body.value.scrollTop = 0; }, { flush: 'post' });
watch(isOpen, async on => {
  if (!on) return;
  await nextTick();
  if (body.value) body.value.focus();
});
</script>

<template>
  <div v-show="term" class="sheet" :class="{ open: isOpen }" role="region" aria-label="Details of the selected term">
    <div class="sheet-head">
      <button v-show="isOpen && app.sheet.back.length" class="btn" type="button" @click="sheetBack">Back</button>
      <button class="sheet-headline" type="button" @click="openSheet(!isOpen)"><b :title="term">{{ name }}</b><span id="sheet-sub"></span></button>
      <button class="btn primary" type="button" :aria-expanded="isOpen" @click="openSheet(!isOpen)">{{ isOpen ? 'Fold down' : 'Details' }}</button>
    </div>
    <div v-show="isOpen" ref="body" class="sheet-body" tabindex="-1">
      <TermBody v-if="details" :details="details" />
    </div>
  </div>
</template>
