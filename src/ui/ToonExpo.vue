<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { afterPaint } from './after-paint.js';
import PropertyStages from './PropertyStages.vue';
import ExpoComparison from './ExpoComparison.vue';
import ExpoRecordsList from './ExpoRecordsList.vue';
import selection from '../report/expo-selection.cjs';
const stagesPanel = ref(null);
const listsExpanded = ref(false);
const snapshot = ref(null), loading = ref(false), failed = ref(false);
const helpOpen = ref(null);
const comparison = ref(null), comparisonLoading = ref(false), comparisonFailed = ref(false);
const detailsLoading = ref(false), detailsFailed = ref(false), detailsReady = ref(false), mobileExpanded = ref(new Set());
const viewRevision = ref(0);
let revision = 0;
watch(listsExpanded, value => { if (value) loadDetails(); });
const hasOpenLists = computed(() => phone.value ? mobileExpanded.value.size > 0 : listsExpanded.value);
const phoneQuery = window.matchMedia('(max-width: 639px)');
const phone = ref(phoneQuery.matches);
function updatePhone(event) { phone.value = event.matches; mobileExpanded.value = new Set(); }
onMounted(() => phoneQuery.addEventListener('change', updatePhone));
onBeforeUnmount(() => { phoneQuery.removeEventListener('change', updatePhone); revision++; });
const vMeasureHeading = {
  mounted(element) {
    const heading = element.querySelector('h3');
    const observer = new ResizeObserver(() => {
      const lineHeight = parseFloat(getComputedStyle(heading).lineHeight);
      element.classList.toggle('is-multiline', heading.getBoundingClientRect().height > lineHeight * 1.5);
    });
    observer.observe(heading);
    element.headingObserver = observer;
  },
  unmounted(element) { element.headingObserver?.disconnect(); },
};
const columnHelp = {
  arrival: { id: 'expo-interested-help', label: 'Հետաքրքրված հաճախորդների մասին', text: 'Այս սյունակում ներկայացված են Տուն Էքսպոյից եկած հետաքրքրված հաճախորդները:' },
  direct: { id: 'expo-direct-help', label: 'Անմիջապես գրանցված գործարքների մասին', text: 'Այս սյունակում ներկայացված են Տուն Էքսպոյից անմիջապես գրանցված գործարքները:' },
  deals: { id: 'expo-converted-help', label: 'Հետաքրքրությունից գործարք դառնալու մասին', text: 'Այս սյունակում ներկայացված են հետաքրքրված հաճախորդներից ձևավորված գործարքները:' },
};
const emit = defineEmits(['loading', 'expired']);
const unconvertedLeads = computed(() => {
  const convertedIds = new Set((snapshot.value?.deals || []).map(deal => Number(deal.leadId)));
  return (snapshot.value?.leads || []).filter(lead => !convertedIds.has(Number(lead.id)));
});
const selected = computed(() => selection.selectExpoRows(unconvertedLeads.value, 'lead'));
const selectedDeals = computed(() => selection.selectExpoRows(snapshot.value?.deals || [], 'deal'));
const selectedDirect = computed(() => selection.selectExpoRows(snapshot.value?.directDeals || [], 'deal'));
const columns = computed(() => [
  { key: 'direct', title: 'Անմիջապես գրանցված գործարքներ', rows: selectedDirect.value },
  { key: 'arrival', title: 'Հետաքրքրված հաճախորդներ', rows: selected.value },
  { key: 'deals', title: 'Հետաքրքրությունից դեպի գործարք', rows: selectedDeals.value },
]);
async function refresh(force = true) {
  if (loading.value || comparisonLoading.value) return;
  const current = ++revision;
  comparison.value = null; comparisonLoading.value = true; comparisonFailed.value = false;
  detailsReady.value = false; detailsFailed.value = false; detailsLoading.value = false;
  loading.value = true; emit('loading', true); failed.value = false; snapshot.value = null;
  try {
    const response = await fetch(`/api/toon-expo?view=summary${force ? '&refresh=1' : ''}`, { cache: 'no-store' });
    if (response.status === 401) { emit('expired'); comparisonLoading.value = false; emit('loading', false); return; }
    if (!response.ok) throw new Error();
    snapshot.value = await response.json();
  } catch { failed.value = true; }
  finally { loading.value = false; }
  if (current !== revision) return;
  if (!snapshot.value) { comparisonLoading.value = false; emit('loading', false); return; }
  if (force) stagesPanel.value?.refresh();
  await afterPaint();
  if (current !== revision) return;
  await loadComparison();
  if (hasOpenLists.value) loadDetails();
}
async function loadComparison() {
  if (!snapshot.value) return;
  const current = revision, snapshotId = snapshot.value.snapshotId;
  comparisonLoading.value = true; comparisonFailed.value = false; emit('loading', true);
  try {
    const response = await fetch(`/api/toon-expo?view=comparison&snapshot=${encodeURIComponent(snapshotId)}`, { cache: 'no-store' });
    if (current !== revision) return;
    if (response.status === 401) { emit('expired'); return; }
    if (response.status === 409) { comparisonLoading.value = false; await refresh(false); return; }
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (current === revision && result.snapshotId === snapshotId) comparison.value = result.createdDealsComparison;
  } catch { if (current === revision) comparisonFailed.value = true; }
  finally { if (current === revision) { comparisonLoading.value = false; emit('loading', false); } }
}
async function loadDetails() {
  if (!snapshot.value || detailsLoading.value || detailsReady.value) return;
  const current = revision, snapshotId = snapshot.value.snapshotId;
  detailsLoading.value = true; detailsFailed.value = false;
  try {
    const response = await fetch(`/api/toon-expo?view=details&snapshot=${encodeURIComponent(snapshotId)}`, { cache: 'no-store' });
    if (current !== revision) return;
    if (response.status === 401) { emit('expired'); return; }
    if (response.status === 409) { detailsLoading.value = false; await refresh(false); return; }
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (current !== revision || result.snapshotId !== snapshotId) return;
    snapshot.value = { ...snapshot.value, leads: result.leads, deals: result.deals, directDeals: result.directDeals };
    detailsReady.value = true;
  } catch { if (current === revision) detailsFailed.value = true; }
  finally { if (current === revision) detailsLoading.value = false; }
}
function expandColumn(key, expanded) {
  const values = new Set(mobileExpanded.value);
  if (expanded) values.add(key); else values.delete(key);
  mobileExpanded.value = values;
  if (expanded) loadDetails();
}

onMounted(() => refresh(false));
function resetView() {
  stagesPanel.value?.resetView();
  listsExpanded.value = false;
  mobileExpanded.value = new Set();
  helpOpen.value = null;
  viewRevision.value++;
}
defineExpose({ resetView, refresh });
</script>

<template>
  <div class="expo-section">
  <div class="property-stage-panels-inline expo-stages">
    <PropertyStages ref="stagesPanel" expo @expired="emit('expired')" />
  </div>
  <section :key="viewRevision" class="expo-panel" aria-label="Տուն Էքսպո Նոյեմբեր 2026">
    <p v-if="loading" role="status">Տվյալները բեռնվում են…</p>
    <div v-else-if="failed" role="alert">Չհաջողվեց բեռնել Տուն Էքսպոյի տվյալները։ <button type="button" @click="refresh()">Կրկին փորձել</button></div>
    <div v-show="snapshot && !loading && !failed" class="expo-columns">
      <section v-for="column in columns" :key="column.key" class="expo-column" :aria-label="column.title">
        <div class="expo-column-heading">
          <div class="filter-title" v-measure-heading @mouseenter="helpOpen = column.key"
            @mouseleave="helpOpen = null" @keydown.esc="helpOpen = null">
            <h3 class="expo-column-title">{{ column.title }}</h3>
            <button type="button" class="filter-help" :aria-label="columnHelp[column.key].label" :aria-describedby="columnHelp[column.key].id"
              @focus="helpOpen = column.key" @blur="helpOpen = null" @click="helpOpen = column.key">!</button>
            <div v-show="helpOpen === column.key" :id="columnHelp[column.key].id" class="filter-help-tooltip" role="tooltip">{{ columnHelp[column.key].text }}</div>
          </div>
        </div>
        <div class="expo-totals">
          <div v-if="column.key === 'arrival'"><strong data-testid="expo-leads">{{ selected.length }}</strong></div>
          <div v-else><strong :data-testid="column.key === 'deals' ? 'expo-deals' : 'expo-direct-deals'">{{ column.rows.length }}</strong></div>
        </div>
        <div v-if="phone" class="deals-list expo-lists">
          <ExpoRecordsList :rows="column.rows" :title="column.title" :loading="detailsLoading" :failed="detailsFailed" @expand="value => expandColumn(column.key, value)" @retry="loadDetails" item-title="Ցանկ" />
        </div>
      </section>
    </div>
  <section v-if="!phone" class="deals-list expo-lists" aria-label="Տուն Էքսպո Նոյեմբեր 2026՝ ցանկ" :aria-busy="loading">
    <button type="button" class="expo-records-toggle deals-list-header expo-desktop-toggle" :aria-expanded="listsExpanded" aria-controls="expo-lists-content" @click="listsExpanded = !listsExpanded">
      <span class="expo-records-title">Ցանկ</span>
      <svg class="deals-list-chevron" :class="{ 'is-expanded': listsExpanded }" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div v-show="listsExpanded" id="expo-lists-content" class="deals-list-content">
      <p v-if="loading" class="kpi-notice" role="status">Տվյալները բեռնվում են…</p>
      <p v-else-if="failed" class="kpi-notice" role="status">Տվյալներն անհասանելի են։</p>
      <div v-else-if="snapshot" class="expo-records-columns">
        <template v-for="column in columns" :key="column.key">
          <ExpoRecordsList :rows="column.rows" :title="column.title" :loading="detailsLoading" :failed="detailsFailed" @expand="value => expandColumn(column.key, value)" @retry="loadDetails" :collapsible="false" />
        </template>
      </div>
    </div>
  </section>
  </section>
  <section v-if="snapshot && !loading && !failed && (comparisonLoading || comparisonFailed)" class="expo-comparison" aria-label="Ավելացված գործարքների համեմատություն" :aria-busy="comparisonLoading">
    <p role="status" class="kpi-notice">{{ comparisonFailed ? 'Տվյալներն անհասանելի են։' : 'Տվյալները բեռնվում են…' }} <button v-if="comparisonFailed" type="button" @click="loadComparison">Կրկին փորձել</button></p>
  </section>
  <ExpoComparison :key="viewRevision" v-if="comparison && !loading && !failed" :data="comparison" />
  </div>
</template>
