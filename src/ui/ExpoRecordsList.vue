<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ rows: Array, title: String, itemTitle: String, filters: Object });
const page = ref(1), sortKey = ref('date'), direction = ref('desc');
const pages = computed(() => Math.max(1, Math.ceil(props.rows.length / 25)));
const visible = computed(() => [...props.rows].sort((a, b) => {
  const order = String(a[sortKey.value] || '').localeCompare(String(b[sortKey.value] || ''), 'hy', { numeric: true }) || a.id - b.id;
  return direction.value === 'asc' ? order : -order;
}).slice((page.value - 1) * 25, page.value * 25));
watch(() => JSON.stringify(props.filters), () => { page.value = 1; });
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
    <h3 class="expo-records-heading">{{ title }} <span class="deals-list-count">{{ rows.length }}</span></h3>
        <div class="deals-list-scroll" role="region" :aria-label="title" tabindex="0">
          <table><thead><tr><th v-for="[key, label] in [['customerName', 'Անուն / Ազգանուն'], ['date', 'Ստեղծման ամսաթիվ']]" :key="key" scope="col" :aria-sort="sortKey === key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'"><button type="button" @click="sort(key)">{{ label }}<span aria-hidden="true">{{ sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕' }}</span></button></th></tr></thead>
            <tbody><tr v-if="!rows.length"><td colspan="2"><p class="kpi-notice" role="status">Տվյալներ չկան</p></td></tr><tr v-for="row in visible" :key="row.id"><td><a :href="row.url" target="_blank" rel="noopener noreferrer">{{ row.customerName || 'Անունը նշված չէ' }}</a></td><td>{{ formatDate(row.date) }}</td></tr></tbody>
          </table>
        </div>
        <nav v-if="pages > 1" class="kpi-pagination deals-list-pagination" :aria-label="`${title}՝ էջեր`"><button type="button" :disabled="page === 1" @click="page--">Նախորդ</button><span aria-live="polite">{{ page }} / {{ pages }}</span><button type="button" :disabled="page === pages" @click="page++">Հաջորդ</button></nav>
  </section>
</template>
