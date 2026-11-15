<!-- A menu of the toolbar: a button that opens a panel over the map. A click outside it closes it. -->
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineProps({ label: { type: String, required: true } });
const menu = ref(null);
const outside = e => { if (menu.value && menu.value.open && !menu.value.contains(e.target)) menu.value.open = false; };
onMounted(() => document.addEventListener('click', outside));
onBeforeUnmount(() => document.removeEventListener('click', outside));
</script>

<template>
  <details ref="menu" class="pop">
    <summary>{{ label }}</summary>
    <div class="pop-body"><slot /></div>
  </details>
</template>
