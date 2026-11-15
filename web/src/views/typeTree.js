/* What the views that show the terms of one type share: the types the Type box offers, the type that is on, and
   the tree of its terms. What the map does not show (an individual, an ontology, a prefix that is switched off) is
   not in the tree. */
import { computed } from 'vue';
import { typesIn, TypeTree } from '../model/TypeTree.js';
import { map, app, isCharted } from '../state.js';

/* the types the Type box offers: each { iri, name }, the most used first */
export const types = computed(() => typesIn(map.value, isCharted));

/* the type the charts show: the one picked in the Type box, or the first when that one is not in the files */
export const type = computed(() => {
  if (types.value.some(each => each.iri === app.type)) return app.type;
  return types.value.length ? types.value[0].iri : null;
});

const tree = computed(() => map.value.isEmpty ? null : new TypeTree(map.value, type.value, isCharted));

/* the tree in the form D3's hierarchy reads, or null when no file is loaded */
export const treeRoot = computed(() => tree.value ? tree.value.root : null);
/* the prefixes in the tree, for the legend */
export const treePrefixes = computed(() => tree.value ? tree.value.prefixes : []);
