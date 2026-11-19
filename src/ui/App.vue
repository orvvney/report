<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import ReportHeader from './ReportHeader.vue';
import PropertyStages from './PropertyStages.vue';
import PropertyReport from './PropertyReport.vue';
import ToonExpo from './ToonExpo.vue';
defineProps({ account: { type: String, default: '' } });
const emit = defineEmits(['logout', 'expired']);
const sectionFromHash = () => window.location.hash === '#toon-expo' ? 'expo' : window.location.hash === '#parking' ? 'parking' : 'apartments';
const sectionTitles = {
  apartments: 'Կնքված բնակարաններ',
  parking: 'Կնքված կայանատեղիներ',
  expo: 'Տուն Էքսպո Նոյեմբեր 2026',
};
const activeSection = ref(sectionFromHash());
const stagePanels = ref(null), showFloatingStages = ref(false);
const expoVisited = ref(activeSection.value === 'expo');
const reportPanel = ref(null), expoPanel = ref(null), loading = ref(false), expoLoading = ref(false);
const propertyStages = ref(null);
function refresh() {
  propertyStages.value?.refresh();
  if (activeSection.value === 'expo') expoPanel.value?.refresh();
  else reportPanel.value?.refresh();
}
function syncSection() {
  activeSection.value = sectionFromHash();
  if (activeSection.value === 'expo') expoVisited.value = true;
}
function navigate(type) {
  window.location.hash = type === 'expo' ? 'toon-expo' : type === 'parking' ? 'parking' : '';
  syncSection();
}
watch(stagePanels, (panel, _, onCleanup) => {
  showFloatingStages.value = false;
  if (!panel) return;
  const observer = new IntersectionObserver(([entry]) => {
    showFloatingStages.value = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
  });
  observer.observe(panel);
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });
onMounted(() => window.addEventListener('hashchange', syncSection));
onBeforeUnmount(() => window.removeEventListener('hashchange', syncSection));
</script>
<template>
  <main class="report-page">
    <section aria-label="Գործարքների հաշվետվություն" class="report-shell">
      <ReportHeader :account="account" :section="activeSection" :section-title="sectionTitles[activeSection]" :loading="activeSection === 'expo' ? expoLoading : loading"
        @logout="emit('logout')" @navigate="navigate" @refresh="refresh" />
      <div v-if="activeSection !== 'expo'" ref="stagePanels" class="property-stage-panels-inline">
        <PropertyStages :key="activeSection" ref="propertyStages" :parking="activeSection === 'parking'" @expired="emit('expired')" />
      </div>
      <ToonExpo v-if="expoVisited" v-show="activeSection === 'expo'" ref="expoPanel" @loading="expoLoading = $event" @expired="emit('expired')" />
      <KeepAlive>
        <PropertyReport v-if="activeSection !== 'expo'" :key="activeSection" ref="reportPanel" :parking="activeSection === 'parking'"
          @loading="loading = $event" @expired="emit('expired')" />
      </KeepAlive>
      <div v-if="activeSection !== 'expo'" id="floating-property-stages" class="property-stage-panels-floating"
        :class="{ 'property-stage-panels-visible': showFloatingStages }"
        :aria-hidden="!showFloatingStages" :inert="!showFloatingStages"></div>
    </section>
  </main>
</template>
