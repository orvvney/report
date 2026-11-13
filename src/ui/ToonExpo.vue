<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import ExpoRecordsList from './ExpoRecordsList.vue';
const snapshot = ref(null), loading = ref(false), failed = ref(false);
const helpOpen = ref(null), listsExpanded = ref(false);
const expoPeriod = reactive({ arrival: 'current', direct: 'current', deals: 'current' });
const columnHelp = {
  arrival: { id: 'expo-interested-help', label: 'Հետաքրքրված հաճախորդների մասին', text: 'Այս սյունակում ներկայացված են Տուն Էքսպոյից եկած հետաքրքրված հաճախորդները:' },
  direct: { id: 'expo-direct-help', label: 'Անմիջապես գրանցված գործարքների մասին', text: 'Այս սյունակում ներկայացված են Տուն Էքսպոյից անմիջապես գրանցված գործարքները:' },
  deals: { id: 'expo-converted-help', label: 'Հետաքրքրությունից գործարք դառնալու մասին', text: 'Այս սյունակում ներկայացված են հետաքրքրված հաճախորդներից ձևավորված գործարքները:' },
};
const emit = defineEmits(['loading']);
const periods = reactive({ arrival: { ranges: [{ min: '2026-11-13', max: null }], invalid: false }, deals: { ranges: [{ min: '2026-11-13', max: null }], invalid: false }, direct: { ranges: [{ min: '2026-11-13', max: null }], invalid: false } });
function selectExpoPeriod(key, value) {
  expoPeriod[key] = value;
  periods[key] = { ranges: [value === 'past' ? { min: null, max: '2026-11-12' } : { min: '2026-11-13', max: null }], invalid: false };
}
function selectRows(rows, key) {
  return rows.filter(row => periods[key].ranges.some(({ min, max }) => (!min || row.date >= min) && (!max || row.date <= max)));
}
const unconvertedLeads = computed(() => {
  const convertedIds = new Set((snapshot.value?.deals || []).map(deal => Number(deal.leadId)));
  return (snapshot.value?.leads || []).filter(lead => !convertedIds.has(Number(lead.id)));
});
const selected = computed(() => selectRows(unconvertedLeads.value, 'arrival'));
const selectedDeals = computed(() => selectRows(snapshot.value?.deals || [], 'deals'));
const selectedDirect = computed(() => selectRows(snapshot.value?.directDeals || [], 'direct'));
const columns = computed(() => [
  { key: 'arrival', title: 'Հետաքրքրված հաճախորդներ', filterTitle: 'Ստեղծման ժամանակահատված', sourceRows: unconvertedLeads.value, rows: selected.value },
  { key: 'direct', title: 'Անմիջապես գրանցված գործարքներ', filterTitle: 'Ստեղծման ժամանակահատված', sourceRows: snapshot.value?.directDeals || [], rows: selectedDirect.value },
  { key: 'deals', title: 'Հետաքրքրությունից դեպի գործարք', filterTitle: 'Ստեղծման ժամանակահատված', sourceRows: snapshot.value?.deals || [], rows: selectedDeals.value },
]);
async function refresh(force = true) {
  if (loading.value) return;
  loading.value = true; emit('loading', true); failed.value = false; snapshot.value = null;
  try {
    const response = await fetch(`/api/toon-expo${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    snapshot.value = await response.json();
  } catch { failed.value = true; }
  finally { loading.value = false; emit('loading', false); }
}
onMounted(() => refresh(false));
defineExpose({ refresh });
</script>

<template>
  <section class="expo-panel" aria-label="Տուն Էքսպո">
    <p v-if="loading" role="status">Տվյալները բեռնվում են…</p>
    <div v-else-if="failed" role="alert">Չհաջողվեց բեռնել Տուն Էքսպոյի տվյալները։ <button type="button" @click="refresh()">Կրկին փորձել</button></div>
    <div v-show="snapshot && !loading && !failed" class="expo-columns">
      <section v-for="column in columns" :key="column.key" class="expo-column" :aria-label="column.title">
        <div class="expo-column-heading">
          <div class="filter-title" @mouseenter="helpOpen = column.key"
            @mouseleave="helpOpen = null" @keydown.esc="helpOpen = null">
            <h3 class="expo-column-title">{{ column.title }}</h3>
            <button type="button" class="filter-help" :aria-label="columnHelp[column.key].label" :aria-describedby="columnHelp[column.key].id"
              @focus="helpOpen = column.key" @blur="helpOpen = null" @click="helpOpen = column.key">!</button>
            <div v-show="helpOpen === column.key" :id="columnHelp[column.key].id" class="filter-help-tooltip" role="tooltip">{{ columnHelp[column.key].text }}</div>
          </div>
        </div>
        <div class="expo-event-filter period-buttons" role="group" aria-label="Տուն Էքսպոյի ժամանակահատված">
          <button type="button" :aria-pressed="expoPeriod[column.key] === 'past'" :disabled="loading || failed || !snapshot" @click="selectExpoPeriod(column.key, 'past')">Անցած Տուն Էքսպոներ</button>
          <button type="button" :aria-pressed="expoPeriod[column.key] === 'current'" :disabled="loading || failed || !snapshot" @click="selectExpoPeriod(column.key, 'current')">Ներկայիս Տուն Էքսպո</button>
        </div>
        <template v-if="!periods[column.key].invalid">
        <div class="expo-totals">
          <div v-if="column.key === 'arrival'"><strong data-testid="expo-leads">{{ selected.length }}</strong><span>Ստացված լիդեր</span></div>
          <div v-else><strong :data-testid="column.key === 'deals' ? 'expo-deals' : 'expo-direct-deals'">{{ column.rows.length }}</strong><span>Գործարքների քանակ</span></div>
        </div>
        </template>
      </section>
    </div>
  <section class="deals-list expo-lists" aria-label="Տուն Էքսպո՝ ցանկ" :aria-busy="loading">
    <div class="deals-list-header" @click="listsExpanded = !listsExpanded">
      <h2><button type="button" class="deals-list-toggle" :aria-expanded="listsExpanded" aria-controls="expo-lists-content" @click.stop="listsExpanded = !listsExpanded">Ցանկ</button></h2>
      <span class="deals-list-count">{{ loading || failed ? '—' : columns.reduce((sum, column) => sum + (periods[column.key].invalid ? 0 : column.rows.length), 0) }}</span>
      <svg class="deals-list-chevron" :class="{ 'is-expanded': listsExpanded }" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </div>
    <div v-show="listsExpanded" id="expo-lists-content" class="deals-list-content">
      <p v-if="loading" class="kpi-notice" role="status">Տվյալները բեռնվում են…</p>
      <p v-else-if="failed" class="kpi-notice" role="status">Տվյալներն անհասանելի են։</p>
      <div v-else-if="snapshot" class="expo-records-columns">
        <template v-for="column in columns" :key="column.key">
          <ExpoRecordsList v-if="!periods[column.key].invalid" :rows="column.rows" :title="column.title" :filters="periods[column.key]" />
          <section v-else class="expo-records" :aria-label="`${column.title}՝ ցանկ`"><h3 class="expo-records-heading">{{ column.title }}</h3><p class="kpi-notice">Ուղղեք ժամանակահատվածի սխալը։</p></section>
        </template>
      </div>
    </div>
  </section>
  </section>
</template>
