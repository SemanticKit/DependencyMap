<!-- The Class view: a class diagram of the loaded files. A class is a box with its members inside. What is a class,
     a member or a mark is said by the views in class/classLayers.js. -->
<script setup>
import BoxDiagramView from './BoxDiagramView.vue';
import { CLASS_LAYERS } from './class/classLayers.js';
</script>

<template>
  <BoxDiagramView :layers="CLASS_LAYERS" />
</template>
