<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import ExpoPeriodFilter from './ExpoPeriodFilter.vue';
const snapshot = ref(null), loading = ref(false), failed = ref(false);
const arrivalPage = ref(1), dealsPage = ref(1);
const emit = defineEmits(['loading']);
const periods = reactive({ arrival: { ranges: [], invalid: false }, deals: { ranges: [], invalid: false } });
function applyPeriod(key, value) {
  periods[key] = value;
  if (key === 'arrival') arrivalPage.value = 1;
  else dealsPage.value = 1;
}
function selectRows(rows, key) {
  return rows.filter(row => periods[key].ranges.some(({ min, max }) => (!min || row.date >= min) && (!max || row.date <= max)));
}
const selected = computed(() => selectRows(snapshot.value?.leads || [], 'arrival'));
const selectedDeals = computed(() => selectRows(snapshot.value?.deals || [], 'deals'));
function groupDays(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.date, (groups.get(row.date) || 0) + 1);
  return [...groups].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}
const columns = computed(() => [
  { key: 'arrival', title: 'Լիդերի մուտք', filterTitle: 'Լիդի ստեղծման ժամանակահատված', sourceRows: snapshot.value?.leads || [], rows: selected.value, page: arrivalPage.value },
  { key: 'deals', title: 'Գործարքներ', filterTitle: 'Գործարքի ստեղծման ժամանակահատված', sourceRows: snapshot.value?.deals || [], rows: selectedDeals.value, page: dealsPage.value },
].map(column => ({ ...column, days: groupDays(column.rows), peak: Math.max(1, ...groupDays(column.rows).map(day => day.count)), pages: Math.max(1, Math.ceil(column.rows.length / 25)),
  visibleRows: [...column.rows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice((column.page - 1) * 25, column.page * 25) })));
function turnPage(key, delta) {
  if (key === 'arrival') arrivalPage.value += delta;
  else dealsPage.value += delta;
}
async function refresh(force = true) {
  if (loading.value) return;
  loading.value = true; emit('loading', true); failed.value = false; snapshot.value = null;
  try {
    const response = await fetch(`/api/toon-expo${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error();
    snapshot.value = await response.json(); arrivalPage.value = 1; dealsPage.value = 1;
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
        <h3 class="expo-column-title">{{ column.title }}</h3>
        <ExpoPeriodFilter :rows="column.sourceRows" :disabled="loading || failed || !snapshot"
          :title="column.filterTitle" :id-prefix="`expo-${column.key}-`" @change="applyPeriod(column.key, $event)" />
        <template v-if="!periods[column.key].invalid">
        <div class="expo-totals">
          <div v-if="column.key === 'arrival'"><strong data-testid="expo-leads">{{ selected.length }}</strong><span>Ստացված լիդեր</span></div>
          <div v-else><strong data-testid="expo-deals">{{ selectedDeals.length }}</strong><span>Գործարքների քանակ</span></div>
        </div>
        <p class="expo-explanation">{{ column.key === 'arrival' ? 'Լիդերը խմբավորված են ըստ ստեղծման օրվա։' : 'Toon Expo աղբյուրով գործարքներ՝ ըստ գործարքի ստեղծման օրվա։ Հաշվի են առնվում բոլոր փուլերն ու ուղղությունները՝ անկախ լիդի հետ կապից։' }}</p>
        <p v-if="!column.rows.length" role="status">{{ column.key === 'arrival' ? 'Ընտրված ժամանակահատվածում լիդեր չկան։' : 'Ընտրված ժամանակահատվածում գործարքներ չկան։' }}</p>
        <template v-else>
          <h3>{{ column.key === 'arrival' ? 'Մուտքն ըստ օրերի' : 'Գործարքներն ըստ օրերի' }}</h3>
          <div class="expo-scroll" tabindex="0" :aria-label="`${column.title}՝ օրական վիճակագրություն`">
            <table class="expo-daily"><thead><tr><th scope="col">Ամսաթիվ</th><th scope="col">{{ column.key === 'arrival' ? 'Լիդեր' : 'Գործարքներ' }}</th></tr></thead>
              <tbody><tr v-for="day in column.days" :key="day.date"><td>{{ day.date }}</td><td><span class="expo-bar" :style="{ '--bar-width': `${day.count / column.peak * 100}%` }">{{ day.count }}</span></td></tr></tbody>
            </table>
          </div>
          <h3>{{ column.key === 'arrival' ? 'Լիդերի ցանկ' : 'Գործարքների ցանկ' }} ({{ column.rows.length }})</h3>
          <div class="expo-scroll" tabindex="0" :aria-label="`${column.title}՝ ցանկ`">
            <table><thead><tr><th scope="col">{{ column.key === 'arrival' ? 'Լիդ' : 'Գործարք' }}</th><th scope="col">Ստեղծման ամսաթիվ</th></tr></thead>
              <tbody><tr v-for="row in column.visibleRows" :key="row.id"><td><a :href="row.url" target="_blank" rel="noopener noreferrer">#{{ row.id }} · {{ row.title }}</a></td><td>{{ row.date }}</td></tr></tbody>
            </table>
          </div>
          <nav v-if="column.pages > 1" class="expo-pagination" :aria-label="`${column.title}՝ էջեր`"><button :disabled="column.page === 1" @click="turnPage(column.key, -1)">Նախորդը</button><span>{{ column.page }} / {{ column.pages }}</span><button :disabled="column.page === column.pages" @click="turnPage(column.key, 1)">Հաջորդը</button></nav>
        </template>
        </template>
      </section>
    </div>
  </section>
</template>
