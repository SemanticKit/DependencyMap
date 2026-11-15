<!-- The page: the map, and the sheet with the details of the selection. -->
<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import MapTab from './components/MapTab.vue';
import TermSheet from './components/TermSheet.vue';
import { app, clearSelection } from './state.js';
import { addFiles } from './storage.js';

/* Files dropped anywhere on the page are added. While files are dragged over the page, the page shows it. */
let dragsInside = 0;
const carriesFiles = event => event.dataTransfer && [...event.dataTransfer.types].includes('Files');

function dragenter(event) {
  if (!carriesFiles(event)) return;
  dragsInside++;
  document.body.classList.add('drag');
}
function dragleave() {
  dragsInside--;
  if (dragsInside <= 0) endDrag();
}
function dragover(event) {
  if (carriesFiles(event)) event.preventDefault();
}
function drop(event) {
  if (!event.dataTransfer || !event.dataTransfer.files.length) return;
  event.preventDefault();
  endDrag();
  addFiles([...event.dataTransfer.files]);
}
function endDrag() {
  dragsInside = 0;
  document.body.classList.remove('drag');
}

/* Escape folds the sheet down; with the sheet down it clears the selection */
function keydown(event) {
  if (event.key !== 'Escape') return;
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (app.sheetOpen && app.selection.size) app.sheetOpen = false;
  else if (app.selection.size && !typing) clearSelection();
}

const listeners = { dragenter, dragleave, dragover, drop, keydown };
onMounted(() => {
  for (const name of Object.keys(listeners)) document.addEventListener(name, listeners[name]);
});
onBeforeUnmount(() => {
  for (const name of Object.keys(listeners)) document.removeEventListener(name, listeners[name]);
});
</script>

<template>
  <div class="wrap">
    <MapTab />
  </div>
  <TermSheet />
</template>
