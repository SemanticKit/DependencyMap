<!-- A diagram of boxes with their members inside and the inheritance connections between them. The layers of views
     it is given say what a box, a member and a mark are (see class/classLayers.js); model/BoxDiagram.js applies
     them to the map, and class/classDiagram.js draws the result. The Class view and the Datatype view are this
     view with their own layers. -->
<script setup>
import { computed } from 'vue';
import ChartFrame from './ChartFrame.vue';
import { classDiagram } from './class/classDiagram.js';
import { BoxDiagram } from '../model/BoxDiagram.js';
import { map, isCharted, select } from '../state.js';

const props = defineProps({ layers: { type: Array, required: true } });

const diagram = computed(() => map.value.isEmpty ? null : new BoxDiagram(map.value, props.layers, isCharted));
const prefixes = computed(() => diagram.value ? diagram.value.prefixes : []);

const draw = model => classDiagram(model, {
  color: id => map.value.colorOfTerm(id),
  click: id => { if (map.value.has(id)) select(id, false, false); },
});
</script>

<template>
  <ChartFrame :draw="draw" :data="diagram" :prefixes="prefixes" />
</template>
