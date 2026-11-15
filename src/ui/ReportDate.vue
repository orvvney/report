<script setup>
import { computed } from 'vue';
const props = defineProps({ text: String });
const parts = computed(() => props.text?.match(/^(\d{2}\.\d{2}\.)(\d{2})(\d{2})$/));
</script>

<template><span v-if="parts">{{ parts[1] }}<span class="desktop-text">{{ parts[2] }}</span>{{ parts[3] }}</span><span v-else>{{ text }}</span></template>
