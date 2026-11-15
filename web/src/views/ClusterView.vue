<!-- The Cluster view: D3's dendrogram. -->
<script setup>
import * as d3 from 'd3';
import ChartFrame from './ChartFrame.vue';
import { treeRoot, treePrefixes } from './typeTree.js';
import { treeChart } from './treeChart.js';

const dendrogram = data => treeChart(data, d3.cluster());
</script>

<template>
  <ChartFrame :draw="dendrogram" :data="treeRoot" :prefixes="treePrefixes" />
</template>
