<script setup>
import { computed } from 'vue';
const props = defineProps({ name: String });
const parts = computed(() => {
  const match = (props.name || '').trim().match(/^(\S+)\s+(.+)$/);
  return match ? [match[1], match[2]] : [props.name];
});
</script>

<template><span class="customer-name"><span>{{ parts[0] }}</span><template v-if="parts.length > 1">{{ ' ' }}<span class="customer-surname">{{ parts[1] }}</span></template></span></template>
