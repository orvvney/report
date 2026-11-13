<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import milonLogo from '../../images/logo_milon.png';
import resetIcon from '../../images/reset.png';
defineProps({ loading: Boolean, section: { type: String, default: 'apartments' } });
const emit = defineEmits(['refresh', 'navigate']);
const header = ref(null), propertyMenu = ref(null), wide = ref(false);
let observer;
function selectSection(section) {
  propertyMenu.value?.hidePopover();
  emit('navigate', section);
}
onMounted(() => {
  const measure = () => { wide.value = header.value.clientWidth >= 1100; };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(header.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
      <header class="report-header" :class="{ 'header-wide': wide, 'header-with-subtitle': section === 'apartments' || section === 'expo' }" ref="header">
        <div class="report-header-row">
          <div class="report-brand">
            <img :src="milonLogo" alt="Milon Mining" class="report-logo">
            <span class="report-brand-name">MILON MINING</span>
          </div>
          <div class="report-header-copy">
            <h1>Հաշվետվություն</h1>
            <p v-if="section === 'apartments' || section === 'expo'" class="report-header-subtitle"><span>{{ section === 'expo' ? 'Տուն Էքսպո' : 'Կնքված բնակարաններ' }}</span></p>
          </div>
          <div class="header-actions">
            <button type="button" class="refresh-button header-icon-button" aria-label="Թարմացնել հաշվետվությունը" title="Թարմացնել հաշվետվությունը"
              :disabled="loading" @click="emit('refresh')"><span class="filter-icon reset-icon" :style="{ maskImage: `url(${resetIcon})` }" aria-hidden="true"></span></button>
            <button type="button" class="header-icon-button property-menu-trigger" aria-label="Անշարժ գույքի տեսակ" title="Անշարժ գույքի տեսակ" popovertarget="property-menu" aria-haspopup="menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div ref="propertyMenu" id="property-menu" class="property-menu" popover role="menu" aria-label="Անշարժ գույքի տեսակ">
              <button type="button" role="menuitem" @click="selectSection('apartments')">Բնակարաններ</button>
              <button type="button" role="menuitem" @click="selectSection('parking')">Ավտոկայանատեղիներ</button>
              <button type="button" role="menuitem" @click="selectSection('expo')">Տուն Էքսպո</button>
            </div>
          </div>
        </div>
      </header>
</template>
