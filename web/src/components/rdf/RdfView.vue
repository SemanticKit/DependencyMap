<!-- The RDF view of a term: the term as each type of RDF and RDFS that it is. Every term is an rdfs:Resource; one
     that is an rdfs:Class or an rdf:Property is shown as that too. Each type has its own component, in the folder
     of its vocabulary. -->
<script setup>
import { computed } from 'vue';
import Resource from '../rdfs/Resource.vue';
import Class from '../rdfs/Class.vue';
import Property from './Property.vue';
import { TermDetails } from '../../model/TermDetails.js';
import { CLASS, PROPERTY } from '../../rdf.js';
import { map, isShown } from '../../state.js';

const props = defineProps({ id: { type: String, required: true } });

const details = computed(() => new TermDetails(map.value, isShown));
</script>

<template>
  <section class="class-view rdf-view">
    <Resource :id="id" />
    <Class v-if="details.isA(id, CLASS)" :id="id" />
    <Property v-if="details.isA(id, PROPERTY)" :id="id" />
  </section>
</template>
