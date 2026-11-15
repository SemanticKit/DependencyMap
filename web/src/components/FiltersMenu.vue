<!-- The Filters menu: which edge groups are in use, which prefixes the map shows, and which prefix names a
     namespace that the files give more than one. -->
<script setup>
import { computed } from 'vue';
import PopMenu from './PopMenu.vue';
import { map, app, setGroupInUse, setPrefixShown, choosePrefix } from '../state.js';

/* every namespace of every loaded file: those with several prefixes first, where one is selected to show */
const namespaces = computed(() => {
  const several = n => n.aliases.length > 1;
  return map.value.namespaces.slice().sort((a, b) => several(b) - several(a) || (a.used < b.used ? -1 : 1));
});
const severalCount = computed(() => namespaces.value.filter(n => n.aliases.length > 1).length);

const groupText = group => group.name + (group.members.length ? ' (' + group.members.join(', ') + ')' : '');
const prefixText = prefix => prefix === '' ? 'no prefix' : prefix === ':' ? ': (empty prefix)' : prefix;
/* a prefix as the files write it, with its colon */
const written = prefix => prefix === '' ? ':' : prefix + ':';
</script>

<template>
  <PopMenu id="filters-pop" label="Filters">
    <!-- one check box for each edge group in the loaded files, with the line its edges are drawn with -->
    <div class="ctl"><span>Edges</span>
      <div class="checks">
        <label v-for="group in map.edgeGroups" :key="group.name">
          <input type="checkbox" :checked="app.groupsInUse.has(group.name)" @change="setGroupInUse(group.name, $event.target.checked)">
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="currentColor" :stroke-width="group.line[1] || 1.3" :stroke-dasharray="group.line[0]" /></svg>
          {{ groupText(group) }}
        </label>
      </div>
    </div>
    <div class="ctl"><span>Show</span>
      <div class="checks">
        <label v-for="prefix in map.prefixes" :key="prefix">
          <input type="checkbox" :checked="!app.hiddenPrefixes.has(prefix)" @change="setPrefixShown(prefix, $event.target.checked)">
          <span class="sw" :style="{ background: map.colorOf(prefix) }"></span>
          {{ prefixText(prefix) }}
        </label>
      </div>
    </div>
    <details v-if="namespaces.length" class="ctl pfx">
      <summary>Prefixes: {{ namespaces.length }} namespaces, {{ severalCount }} with more than one prefix</summary>
      <div class="tablewrap"><table class="pfx-table">
        <tr v-for="n in namespaces" :key="n.ns">
          <td class="k">
            <select v-if="n.aliases.length > 1" :aria-label="'Prefix for ' + n.ns" :value="n.used" @change="choosePrefix(n.ns, $event.target.value)">
              <option v-for="alias in n.aliases" :key="alias.label" :value="alias.label">{{ written(alias.label) }}</option>
            </select>
            <template v-else>{{ written(n.used) }}</template>
          </td>
          <td class="k">{{ n.ns }}</td>
          <td><div v-for="alias in n.aliases" :key="alias.label"><code>{{ written(alias.label) }}</code> in {{ alias.files.join(', ') }}</div></td>
        </tr>
      </table></div>
    </details>
  </PopMenu>
</template>
