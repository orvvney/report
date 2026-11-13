<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import milonLogo from '../../images/logo_milon.png';
import resetIcon from '../../images/reset.png';
const props = defineProps({ loading: Boolean, account: { type: String, default: '' }, section: { type: String, default: 'apartments' } });
const emit = defineEmits(['refresh', 'navigate', 'logout']);
const header = ref(null), propertyMenu = ref(null), wide = ref(false);
let observer, tooltipTimer;
const tooltip = ref(null);
function hideTooltip() {
  clearTimeout(tooltipTimer);
  tooltip.value = null;
}
function showTooltip(key) {
  hideTooltip();
  if (key === 'refresh' && props.loading) return;
  tooltipTimer = setTimeout(() => { tooltip.value = key; }, 400);
}
watch(() => props.loading, () => hideTooltip());
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
onBeforeUnmount(() => { observer?.disconnect(); hideTooltip(); });
</script>

<template>
      <header class="report-header" :class="{ 'header-with-account': !!account, 'header-wide': wide, 'header-with-subtitle': section === 'apartments' || section === 'expo' }" ref="header">
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
            <button v-if="account" type="button" class="logout-button" :title="account" @click="emit('logout')">Ելք</button>
            <span class="header-tooltip-anchor" @pointerenter="event => { if (event.pointerType === 'mouse') showTooltip('refresh'); }" @pointerleave="hideTooltip">
            <button type="button" class="refresh-button header-icon-button" aria-label="Թարմացնել ամբողջ հաշվետվությունը" :aria-describedby="tooltip === 'refresh' ? 'refresh-tooltip' : undefined" @focus="showTooltip('refresh')" @blur="hideTooltip" @keydown.esc="hideTooltip"
              :disabled="loading" @click="hideTooltip(); emit('refresh')"><span class="filter-icon reset-icon" :style="{ maskImage: `url(${resetIcon})` }" aria-hidden="true"></span></button>
            <span v-if="tooltip === 'refresh'" id="refresh-tooltip" class="header-tooltip" role="tooltip">Թարմացնել ամբողջ հաշվետվությունը</span>
            </span>
            <span class="header-tooltip-anchor" @pointerenter="event => { if (event.pointerType === 'mouse') showTooltip('menu'); }" @pointerleave="hideTooltip">
            <button type="button" class="header-icon-button property-menu-trigger" aria-label="Հաշվետվությունների տեսակ" :aria-describedby="tooltip === 'menu' ? 'menu-tooltip' : undefined" @focus="showTooltip('menu')" @blur="hideTooltip" @keydown.esc="hideTooltip" @click="hideTooltip" popovertarget="property-menu" aria-haspopup="menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <span v-if="tooltip === 'menu'" id="menu-tooltip" class="header-tooltip" role="tooltip">Հաշվետվությունների տեսակ</span>
            </span>
            <div ref="propertyMenu" id="property-menu" class="property-menu" popover role="menu" aria-label="Հաշվետվությունների տեսակ">
              <button type="button" role="menuitem" @click="selectSection('apartments')">Բնակարաններ</button>
              <button type="button" role="menuitem" @click="selectSection('parking')">Ավտոկայանատեղիներ</button>
              <button type="button" role="menuitem" @click="selectSection('expo')">Տուն Էքսպո</button>
            </div>
          </div>
        </div>
      </header>
</template>
