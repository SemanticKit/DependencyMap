<!-- The Datatype view: a diagram of the datatypes in the loaded files, which the Class view leaves off. A datatype
     is a box. What is a datatype is said by the views in datatype/datatypeLayers.js. -->
<script setup>
import BoxDiagramView from './BoxDiagramView.vue';
import { DATATYPE_LAYERS } from './datatype/datatypeLayers.js';
</script>

<template>
  <BoxDiagramView :layers="DATATYPE_LAYERS" />
</template>
