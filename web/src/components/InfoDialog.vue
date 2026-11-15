<!-- The info button at the end of the row of controls: a window with the folder, the process and the environment variables the app
     runs in. -->
<script setup>
import { ref } from 'vue';
import { request } from '../http.js';

const dialog = ref(null), rows = ref([]), env = ref([]), error = ref('');
async function show() {
  rows.value = []; env.value = []; error.value = '';
  try {
    const j = await request('GET', '/api/env');
    rows.value = [['PROJECT_DIR', j.PROJECT_DIR], ['taken from', j.from], ['folder', j.folder], ['docs', j.docs], ['process', String(j.pid)], ['node', j.node]];
    env.value = Object.keys(j.env).map(k => [k, j.env[k]]);
  } catch (e) { error.value = e.message; }
  if (!dialog.value.open) dialog.value.showModal();
}
</script>

<template>
  <button type="button" class="btn info" title="What the app runs in" aria-label="What the app runs in" @click="show">i</button>
  <dialog ref="dialog" class="env">
    <div class="env-head"><b>What the app runs in</b><button type="button" class="btn" @click="dialog.close()">Close</button></div>
    <div class="env-body">
      <table>
        <tr v-for="[k, v] in rows" :key="k"><td>{{ k }}</td><td>{{ v }}</td></tr>
        <tr v-if="error"><td>error</td><td>{{ error }}</td></tr>
        <tr v-if="env.length"><td colspan="2" class="env-cap">Environment variables ({{ env.length }})</td></tr>
        <tr v-for="[k, v] in env" :key="'env ' + k"><td>{{ k }}</td><td>{{ v }}</td></tr>
      </table>
    </div>
  </dialog>
</template>

<style scoped>
.info { border-radius: 50%; width: 28px; height: 28px; padding: 0; font-style: italic; font-family: serif; font-weight: 700; }
.env { max-width: min(900px, 92vw); width: 92vw; max-height: 86vh; padding: 0; border: 1px solid #8884; border-radius: 10px; }
.env-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #8884; position: sticky; top: 0; background: Canvas; }
.env-body { padding: 12px 16px; overflow: auto; max-height: calc(86vh - 60px); }
.env table { border-collapse: collapse; width: auto; }
.env td { border: 0; font-family: ui-monospace, monospace; font-size: 12px; vertical-align: top; padding: 3px 0; word-break: break-all; }
.env td:first-child { padding: 3px 12px 3px 0; white-space: nowrap; word-break: normal; }
.env td.env-cap { padding: 10px 0 4px; font-weight: 600; font-family: inherit; }
</style>
