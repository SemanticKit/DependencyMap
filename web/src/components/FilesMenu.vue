<!-- The Files menu: the loaded files, each on or off, and adding, pasting, downloading and removing a file. -->
<script setup>
import { ref, computed, nextTick } from 'vue';
import PopMenu from './PopMenu.vue';
import { files, app, say } from '../state.js';
import { addFile, addFiles, setEnabled, removeFile, downloadUrl } from '../storage.js';

const label = computed(() => 'Files: ' + files.value.filter(file => file.enabled).length + ' of ' + files.value.length + ' on');

/* ---------- adding ---------- */
const input = ref(null);
const pasting = ref(false);
const pasteName = ref('');
const pasteText = ref('');
const nameField = ref(null);

function chosen(event) {
  addFiles([...event.target.files]);
  event.target.value = '';
}
async function openPaste() {
  pasting.value = true;
  await nextTick();
  nameField.value.focus();
}
async function paste() {
  const name = pasteName.value.trim();
  if (!name) {
    say('Give the pasted text a file name.');
    nameField.value.focus();
    return;
  }
  if (!pasteText.value.trim()) {
    say('Paste the text of the file first.');
    return;
  }
  const added = await addFile(name, pasteText.value);
  if (!added) return;
  pasteText.value = '';
  pasteName.value = '';
  pasting.value = false;
}

/* ---------- removing ----------
   Remove asks once more: the id of the file whose Remove was selected, for five seconds. */
const sure = ref(null);

function remove(file) {
  if (sure.value === file.id) {
    sure.value = null;
    removeFile(file);
    return;
  }
  sure.value = file.id;
  setTimeout(() => { if (sure.value === file.id) sure.value = null; }, 5000);
}
</script>

<template>
  <PopMenu :label="label">
    <div class="files">
      <span v-if="!files.length && !app.loading" class="empty">No files yet.</span>
      <div v-for="file in files" :key="file.id + file.rev" class="frow">
        <label>
          <input type="checkbox" :checked="file.enabled" :disabled="!!file.error" @change="setEnabled(file, $event.target.checked)">
          <span class="fname">{{ file.name }}</span>
        </label>
        <span class="meta">{{ file.error ? 'not read' : file.count + ' triples' }}</span>
        <a class="link" :href="downloadUrl(file)" :download="file.name" :title="'Save ' + file.name + ' to your computer, as it is in the app'">Download</a>
        <button type="button" class="link" :class="{ danger: sure === file.id }" @click="remove(file)">{{ sure === file.id ? 'Remove ' + file.name + '? Select again to confirm' : 'Remove' }}</button>
        <span v-if="file.error" class="err">{{ file.error }}</span>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
      <button class="btn primary" type="button" title="Turtle, N-Triples or RDF/XML. You can also drop files on the page. A file with the same name replaces the old one." @click="input.click()">Add files</button>
      <button class="btn" type="button" @click="openPaste">Paste text</button>
      <input ref="input" type="file" multiple accept=".ttl,.nt,.n3,.turtle,.rdf,.owl,.xml,text/turtle,application/rdf+xml" hidden @change="chosen">
    </div>
    <form v-if="pasting" class="paste" @submit.prevent="paste">
      <input ref="nameField" v-model="pasteName" type="text" placeholder="File name, for example shacl.ttl" aria-label="File name" autocomplete="off">
      <textarea v-model="pasteText" placeholder="Paste Turtle or RDF/XML here" aria-label="File text"></textarea>
      <div style="display:flex;gap:6px"><button class="btn primary" type="submit">Add</button><button class="btn" type="button" @click="pasting = false">Cancel</button></div>
    </form>
  </PopMenu>
</template>
