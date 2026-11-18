<script setup>
import { ref } from 'vue';
const props = defineProps({ parking: Boolean, hold: Boolean });
const emit = defineEmits(['expired']);
const stages = ref(null), loading = ref(true), failed = ref(false);
function reset() { stages.value = null; loading.value = true; failed.value = false; }
async function refresh(force = true) {
  reset();
  try {
    const response = await fetch(`${props.parking ? '/api/parking-stages' : '/api/property-stages'}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (response.status === 401) { emit('expired'); return; }
    if (!response.ok) throw new Error();
    stages.value = (await response.json()).stages;
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
defineExpose({ refresh, reset });
</script>
<template>
  <section class="property-stages" :aria-label="parking ? 'Կայանատեղիներն ըստ փուլերի' : 'Բնակարաններն ըստ փուլերի'" :aria-busy="loading || hold">
    <p v-if="loading || hold || failed" role="status">{{ failed ? 'Տվյալներն անհասանելի են։' : 'Տվյալները բեռնվում են…' }}</p>
    <div v-else class="property-stages-row" :aria-label="parking ? 'Կայանատեղիների փուլեր' : 'Բնակարանների փուլեր'">
      <article v-for="stage in stages" :key="stage.name"><p>{{ stage.count }}</p><h3>{{ stage.name }}</h3></article>
    </div>
  </section>
</template>
