<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import CustomerName from './CustomerName.vue';
import ReportDate from './ReportDate.vue';
const props = defineProps({ rows: Array, title: String, itemTitle: String, loading: Boolean, failed: Boolean, collapsible: { type: Boolean, default: true } });
const expanded = ref(false);
const emit = defineEmits(['expand', 'retry']);
watch(expanded, value => emit('expand', value));
const scrollArea = ref(null);
let frame = null, observer;
function updateHeading() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    const area = scrollArea.value;
    if (!area) return;
    const headingHeight = area.querySelector('thead').offsetHeight;
    const offset = Math.max(0, Math.min(-area.getBoundingClientRect().top, area.clientHeight - headingHeight));
    area.style.setProperty('--expo-heading-offset', `${offset}px`);
  });
}
onMounted(() => {
  window.addEventListener('scroll', updateHeading, { passive: true, capture: true });
  window.addEventListener('resize', updateHeading);
  observer = new ResizeObserver(updateHeading);
  observer.observe(scrollArea.value);
  updateHeading();
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateHeading, true);
  window.removeEventListener('resize', updateHeading);
  observer?.disconnect();
  if (frame !== null) cancelAnimationFrame(frame);
});
const contentId = useId();
const page = ref(1), sortKey = ref('date'), direction = ref('desc');
const emptySlots = computed(() => 10 - Math.max(1, visible.value.length));
const pages = computed(() => Math.max(1, Math.ceil(props.rows.length / 10)));
const sortValue = row => sortKey.value === 'stageName' ? row.stageName || row.stageId || '' : row[sortKey.value] || '';
const visible = computed(() => [...props.rows].sort((a, b) => {
  const order = String(sortValue(a)).localeCompare(String(sortValue(b)), 'hy', { numeric: true }) || a.id - b.id;
  return direction.value === 'asc' ? order : -order;
}).slice((page.value - 1) * 10, page.value * 10));
watch(() => props.rows, () => { page.value = Math.min(page.value, pages.value); });
function formatDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
function sort(key) {
  direction.value = sortKey.value === key && direction.value === 'asc' ? 'desc' : 'asc';
  sortKey.value = key; page.value = 1;
}
</script>

<template>
  <section class="expo-records" :aria-label="`${title}՝ ցանկ`">
        <button v-if="collapsible" type="button" class="expo-records-toggle deals-list-header" aria-label="Ցանկ" :aria-expanded="expanded" :aria-controls="contentId" @click="expanded = !expanded">
          <span class="expo-records-title">{{ itemTitle || 'Ցանկ' }}</span>
          <span class="deals-list-count">{{ rows.length }}</span>
          <svg class="deals-list-chevron" :class="{ 'is-expanded': expanded }" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div v-show="expanded || !collapsible" :id="contentId" class="expo-records-content">
        <p v-if="loading" class="kpi-notice" role="status">Տվյալները բեռնվում են…</p>
        <p v-else-if="failed" class="kpi-notice" role="status">Տվյալներն անհասանելի են։ <button type="button" @click="emit('retry')">Կրկին փորձել</button></p>
        <div v-show="!loading && !failed" ref="scrollArea" class="deals-list-scroll" role="region" :aria-label="title" tabindex="0">
          <table><thead><tr><th v-for="[key, label] in [['customerName', 'Հաճախորդ'], ['date', 'Ստեղծված՝'], ['stageName', 'Կարգավիճակ']]" :key="key" scope="col" :aria-sort="sortKey === key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"><button type="button" @click="sort(key)">{{ label }}<span aria-hidden="true">{{ sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕' }}</span></button></th></tr></thead>
            <tbody><tr v-if="!rows.length" class="expo-empty-row"><td colspan="3"><p class="kpi-notice" role="status">Տվյալներ չկան</p></td></tr><tr v-for="row in visible" :key="row.id" class="expo-record-row"><td><a :href="row.url" target="_blank" rel="noopener noreferrer"><CustomerName :name="row.customerName || 'Անունը նշված չէ'" /></a></td><td><ReportDate :text="formatDate(row.date)" /></td><td>{{ row.stageName || row.stageId || '—' }}</td></tr><tr v-for="slot in emptySlots" :key="`empty-${slot}`" class="expo-placeholder-row" aria-hidden="true"><td v-for="cell in 3" :key="cell"></td></tr></tbody>
          </table>
        </div>
        <div class="expo-records-footer">
        <nav v-if="pages > 1" class="kpi-pagination deals-list-pagination" :aria-label="`${title}՝ էջեր`"><button type="button" :disabled="page === 1" @click="page--">Նախորդ</button><span aria-live="polite">{{ page }} / {{ pages }}</span><button type="button" :disabled="page === pages" @click="page++">Հաջորդ</button></nav>
        </div>
        </div>
  </section>
</template>
