<script setup>
import { ref } from 'vue';
const emit = defineEmits(['expired']);
const stages = ref(null), loading = ref(true), failed = ref(false);
async function refresh(force = true) {
  stages.value = null; loading.value = true; failed.value = false;
  try {
    const response = await fetch(`/api/property-stages${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (response.status === 401) { emit('expired'); return; }
    if (!response.ok) throw new Error();
    stages.value = (await response.json()).stages;
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
defineExpose({ refresh });
</script>
<template>
  <section class="property-stages" aria-label="Բնակարաններն ըստ փուլերի" :aria-busy="loading">
    <p v-if="loading || failed" role="status">{{ failed ? 'Տվյալներն անհասանելի են։' : 'Տվյալները բեռնվում են…' }}</p>
    <div v-else class="property-stages-row" aria-label="Բնակարանների փուլեր">
      <article v-for="stage in stages" :key="stage.name"><p>{{ stage.count }}</p><h3>{{ stage.name }}</h3></article>
    </div>
  </section>
</template>
