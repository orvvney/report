<script setup>
import { computed, ref, watch } from 'vue';
import table from '../report/deals-table.cjs';
const props = defineProps({ deals: { type: Array, default: () => [] }, filters: Object, loading: Boolean, failed: Boolean });
const expanded = ref(false), page = ref(1), sortKey = ref('date'), direction = ref('desc');
const unavailable = computed(() => props.loading || props.failed);
const sorted = computed(() => table.sortRows(props.deals, sortKey.value, direction.value));
const paged = computed(() => table.paginate(sorted.value, page.value));
watch(() => JSON.stringify(props.filters), () => { page.value = 1; });
watch(() => props.deals, () => {
  if (!unavailable.value) page.value = paged.value.page;
});
function sort(key) {
  direction.value = sortKey.value === key && direction.value === 'asc' ? 'desc' : 'asc';
  sortKey.value = key;
  page.value = 1;
}
</script>

<template>
  <section class="deals-list" aria-labelledby="deals-list-heading" :aria-busy="loading">
    <h2 id="deals-list-heading">
      <button type="button" class="deals-list-toggle" :aria-expanded="expanded" aria-controls="deals-list-content" @click="expanded = !expanded">
        <span>Գործարքների ցանկ</span>
        <span class="deals-list-count" data-testid="deals-list-count">{{ unavailable ? '—' : deals.length }}</span>
        <svg class="deals-list-chevron" :class="{ 'is-expanded': expanded }" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </h2>
    <div v-show="expanded" id="deals-list-content" class="deals-list-content">
      <p v-if="loading" class="kpi-notice" role="status">Տվյալները բեռնվում են…</p>
      <p v-else-if="failed" class="kpi-notice" role="status">Տվյալներն անհասանելի են։</p>
      <template v-else-if="deals.length">
        <div class="deals-list-scroll" role="region" aria-label="Գործարքների աղյուսակ" tabindex="0">
          <table>
            <thead><tr>
              <th v-for="[key, label] in table.columns" :key="key" scope="col"
                :aria-sort="sortKey === key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'">
                <button type="button" @click="sort(key)">{{ label }}<span aria-hidden="true">{{ sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕' }}</span></button>
              </th>
            </tr></thead>
            <tbody><tr v-for="row in paged.rows" :key="row.id">
              <td v-for="[key] in table.columns" :key="key">
                <a v-if="key === 'customerName'" :href="row.url" target="_blank" rel="noopener noreferrer">{{ table.cellText(row, key) }}</a>
                <template v-else>{{ table.cellText(row, key) }}</template>
              </td>
            </tr></tbody>
          </table>
        </div>
        <nav v-if="paged.pages > 1" class="kpi-pagination deals-list-pagination" aria-label="Գործարքների ցանկի էջեր">
          <button type="button" :disabled="paged.page === 1" @click="page = paged.page - 1">Նախորդ</button>
          <span aria-live="polite">{{ paged.page }} / {{ paged.pages }}</span>
          <button type="button" :disabled="paged.page === paged.pages" @click="page = paged.page + 1">Հաջորդ</button>
        </nav>
      </template>
      <p v-else class="kpi-notice" role="status">Տվյալներ չկան</p>
    </div>
  </section>
</template>
