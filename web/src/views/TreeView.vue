<!-- The Tree view: D3's tidy tree. -->
<script setup>
import * as d3 from 'd3';
import ChartFrame from './ChartFrame.vue';
import { treeRoot, treePrefixes } from './typeTree.js';
import { treeChart } from './treeChart.js';

const tidy = data => treeChart(data, d3.tree());
</script>

<template>
  <ChartFrame :draw="tidy" :data="treeRoot" :prefixes="treePrefixes" />
</template>
