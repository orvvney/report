<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import ReportHeader from './ReportHeader.vue';
import PropertyReport from './PropertyReport.vue';
import ToonExpo from './ToonExpo.vue';
defineProps({ account: { type: String, default: '' } });
const emit = defineEmits(['logout', 'expired']);
const sectionFromHash = () => window.location.hash === '#toon-expo' ? 'expo' : window.location.hash === '#parking' ? 'parking' : 'apartments';
const activeSection = ref(sectionFromHash());
const expoVisited = ref(activeSection.value === 'expo');
const reportPanel = ref(null), expoPanel = ref(null), loading = ref(false), expoLoading = ref(false);
function syncSection() {
  activeSection.value = sectionFromHash();
  if (activeSection.value === 'expo') expoVisited.value = true;
}
function navigate(type) {
  window.location.hash = type === 'expo' ? 'toon-expo' : type === 'parking' ? 'parking' : '';
  syncSection();
}
onMounted(() => window.addEventListener('hashchange', syncSection));
onBeforeUnmount(() => window.removeEventListener('hashchange', syncSection));
</script>
<template>
  <main class="report-page">
    <section aria-label="Գործարքների հաշվետվություն" class="report-shell">
      <ReportHeader :account="account" :section="activeSection" :loading="activeSection === 'expo' ? expoLoading : loading"
        @logout="emit('logout')" @navigate="navigate" @refresh="activeSection === 'expo' ? expoPanel?.refresh() : reportPanel?.refresh()" />
      <ToonExpo v-if="expoVisited" v-show="activeSection === 'expo'" ref="expoPanel" @loading="expoLoading = $event" @expired="emit('expired')" />
      <KeepAlive>
        <PropertyReport v-if="activeSection !== 'expo'" :key="activeSection" ref="reportPanel" :parking="activeSection === 'parking'"
          @loading="loading = $event" @expired="emit('expired')" />
      </KeepAlive>
    </section>
  </main>
</template>
