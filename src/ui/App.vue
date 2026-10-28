<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import filters from '../report/filter.cjs';
import chart from '../report/chart.cjs';
const { chartScale, fullAmount, shortAmount, updatedTime } = chart;
const { calculate, roomOptions, reconcileRooms, toggleRoom, validateRange } = filters;
const mode = ref('rooms'), report = ref(null), loading = ref(false), failed = ref(false);
const updatedAt = ref(null), dialog = ref(null), problemButton = ref(null);
const months = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
const fields = { rooms: 'Սենյակների քանակ', date: 'Կնքման ամսաթիվ', amount: 'Ընդհանուր արժեք', area: 'Մակերես (մ²)', currency: 'Արժույթ' };
const filterFields = { ...fields, amount: 'Բնակարանի ընդհանուր արժեք' };
const reasons = { missing: 'Լրացված չէ', invalid: 'Անվավեր արժեք', unsupported_currency: 'Աջակցվում է միայն AMD' };
const availableRooms = ref([]), selectedRooms = ref([]);
const ranges = reactive(Object.fromEntries(['amount', 'area', 'date'].map((kind) => [kind, {
  draft: { min: '', max: '' }, applied: { min: null, max: null }, errors: {}, badInput: {},
}])));
const disabled = computed(() => loading.value || failed.value || !report.value);
const filtered = computed(() => calculate(report.value?.deals || [], report.value?.year, {
  rooms: selectedRooms.value, ...Object.fromEntries(Object.entries(ranges).map(([kind, range]) => [kind, range.applied])),
}));
const categories = computed(() => report.value ? filtered.value[mode.value] : []);
const errorText = (code) => code === 'reversed' ? 'Սկզբնական արժեքը չպետք է գերազանցի վերջնական արժեքը' : 'Անվավեր արժեք';
// An unfinished native date has an empty value too; keep its visible segments.
const emptyDate = (side) => !ranges.date.draft[side] && !ranges.date.badInput[side];
function editRange(kind, side, event) {
  const range = ranges[kind];
  range.draft[side] = event.target.value;
  range.badInput[side] = event.target.validity.badInput;
  const result = validateRange(kind, range.draft, range.badInput);
  range.errors = result.errors;
  if (result.valid) range.applied = result.values;
}
const hasData = computed(() => categories.value.some((entry) => entry.count > 0));
const scale = computed(() => chartScale(categories.value.map((entry) => entry.amount)));
const totalCount = computed(() => categories.value.reduce((sum, entry) => sum + entry.count, 0));
const axisTitle = computed(() => fields[mode.value === 'rooms' ? 'rooms' : 'date']);
const label = (entry) => mode.value === 'rooms' ? String(entry.category) : months[entry.category - 1];
const barWidth = 56;
const viewportWidth = ref(0);
let viewportObserver;
function observeViewport(element) {
  viewportObserver?.disconnect();
  if (!element) return;
  viewportObserver = new ResizeObserver(([entry]) => { viewportWidth.value = entry.contentRect.width; });
  viewportObserver.observe(element);
}
onBeforeUnmount(() => viewportObserver?.disconnect());
// Reserve a full line for each amount and month, even on a narrow viewport.
const categoryWidth = computed(() => Math.max(96, ...categories.value.map((entry) =>
  Math.max((fullAmount(entry.amount).length + 2) * 8, label(entry).length * 12) + 24)));
const width = computed(() => Math.max(920, viewportWidth.value, categories.value.length * categoryWidth.value + 120));
const step = computed(() => (width.value - 120) / Math.max(1, categories.value.length));
const barCenter = (index) => 100 + (index + 0.5) * step.value;
const barHeight = (entry) => Number(entry.amount) / Number(scale.value.maximum) * 260;
function switchMode(value) { mode.value = value; }
function closeProblems() { dialog.value?.close(); }
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const elements = [...dialog.value.querySelectorAll('button, a[href]')];
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function restoreFocus() { problemButton.value?.focus(); }
async function openProblems() { await nextTick(); dialog.value.showModal(); }
function backdrop(event) {
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeProblems();
}
async function refresh() {
  if (loading.value) return;
  closeProblems(); report.value = null; failed.value = false; loading.value = true;
  try {
    const response = await fetch('/api/report', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const snapshot = await response.json();
    const available = roomOptions(snapshot.deals);
    selectedRooms.value = reconcileRooms(availableRooms.value, selectedRooms.value, available);
    availableRooms.value = available;
    report.value = snapshot;
    updatedAt.value = new Date();
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
onMounted(refresh);
</script>

<template>
  <main class="px-3 pb-8 sm:px-8 sm:pb-14">
    <section aria-label="Գործարքների հաշվետվություն" class="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header class="report-header">
        <p class="report-header-label">Հաշվետվություններ</p>
        <hr data-testid="header-divider" aria-hidden="true">
        <p class="report-header-category">ԱՆՇԱՐԺ ԳՈՒՅՔԻ՝ ԲՆԱԿԱՐԱՆՆԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ</p>
        <h1>Կնքված բնակարանների հաշվետվություն</h1>
      </header>
      <form class="filter-panel" aria-label="Զտիչներ" @submit.prevent>
        <div aria-label="Զտիչների տարածք">
          <div class="filter-row">
            <fieldset class="room-filter" :disabled="disabled">
              <legend>{{ fields.rooms }}</legend>
              <div class="room-buttons">
                <button v-for="room in availableRooms" :key="room" type="button"
                  :aria-pressed="selectedRooms.includes(room)" :aria-label="`${fields.rooms}՝ ${room}`"
                  @click="selectedRooms = toggleRoom(selectedRooms, room)">{{ room }}</button>
              </div>
            </fieldset>
            <fieldset v-for="kind in ['amount', 'area', 'date']" :key="kind" :disabled="disabled" class="range-filter" :class="{ 'date-filter': kind === 'date' }">
              <legend>{{ kind === 'area' ? 'Մակերես' : filterFields[kind] }}</legend>
              <div class="range-inputs">
                <div v-for="side in ['min', 'max']" :key="side" class="range-control" :class="{ 'has-unit': kind !== 'date' }">
                  <input :id="`${kind}-${side}`" :type="kind === 'date' ? 'date' : 'text'"
                    :class="{ 'date-empty': kind === 'date' && emptyDate(side) }"
                    :placeholder="kind === 'date' ? undefined : side === 'min' ? 'Սկսած' : 'Մինչև'"
                    :inputmode="kind === 'date' ? undefined : 'decimal'"
                    :aria-label="`${filterFields[kind]}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`"
                    :aria-invalid="!!ranges[kind].errors[side]"
                    :aria-describedby="ranges[kind].errors[side] ? `${kind}-error` : undefined"
                    @keyup="kind === 'date' && editRange(kind, side, $event)"
                    @blur="kind === 'date' && editRange(kind, side, $event)"
                    :value="ranges[kind].draft[side]" @input="editRange(kind, side, $event)" />
                  <span v-if="kind === 'date' && emptyDate(side)" class="date-placeholder" aria-hidden="true">{{ side === 'min' ? 'Սկսած' : 'Մինչև' }}</span>
                  <span v-if="kind !== 'date'" class="range-unit" aria-hidden="true">{{ kind === 'amount' ? '֏' : '(մ²)' }}</span>
                </div>
              </div>
              <p v-if="Object.keys(ranges[kind].errors).length" :id="`${kind}-error`" class="filter-error" role="alert">{{ errorText(Object.values(ranges[kind].errors)[0]) }}</p>
            </fieldset>
          </div>
        </div>
      </form>
      <div class="flex flex-col items-center gap-3 border-b border-slate-100 px-3 py-5 sm:px-6">
        <p class="text-sm font-medium text-slate-600">Ցուցադրություն</p>
        <div role="group" aria-label="Խմբավորում" class="flex max-w-full rounded-xl bg-slate-100 p-1">
          <button v-for="item in ['rooms', 'months']" :key="item" type="button"
            :aria-pressed="mode === item" @click="switchMode(item)"
            class="rounded-lg px-3 py-2.5 text-xs font-medium transition-colors sm:px-5 sm:text-sm"
            :class="mode === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'">
            {{ fields[item === 'rooms' ? 'rooms' : 'date'] }}
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-6 sm:px-8">
        <h2 class="text-sm font-medium">Y · Ընդհանուր արժեք (֏)</h2>
        <button type="button" class="refresh-button"
          :disabled="loading" @click="refresh">Թարմացնել հաշվետվությունը</button>
      </div>
      <div v-if="loading" role="status" class="flex min-h-96 items-center justify-center p-8 text-center text-slate-500">Տվյալները բեռնվում են…</div>
      <div v-else-if="failed" role="alert" class="flex min-h-96 items-center justify-center p-8 text-center text-red-700">Չհաջողվեց բեռնել տվյալները։ Փորձեք կրկին։</div>
      <template v-else-if="report">
        <p v-if="!hasData" role="status" class="pt-6 text-center text-slate-500">Տվյալներ չկան</p>
        <div :ref="observeViewport" class="overflow-x-auto px-2 pt-4" aria-label="Գծապատկերի տարածք" tabindex="0">
          <svg v-if="categories.length" :viewBox="`0 0 ${width} 380`" :style="{ minWidth: `${width}px` }" class="block w-full" role="group" :aria-label="axisTitle">
            <g v-for="(tick, index) in scale.ticks" :key="index" data-testid="y-tick">
              <line x1="100" :x2="width - 20" :y1="310 - index * 65" :y2="310 - index * 65"
                :stroke="index === 0 ? '#94a3b8' : '#e5eaf2'" :stroke-dasharray="index === 0 ? undefined : '4 4'" />
              <text x="86" :y="315 - index * 65" text-anchor="end" font-size="12" fill="#64748b">{{ shortAmount(tick) }}</text>
            </g>
            <line x1="100" x2="100" y1="310" y2="50" stroke="#94a3b8" data-testid="y-axis" />
            <g v-for="(entry, index) in categories" :key="entry.category" class="chart-column" role="img" tabindex="0"
              :aria-label="`${label(entry)}՝ ${fullAmount(entry.amount)} AMD, ${entry.count} գործարք`">
              <rect :x="barCenter(index) - barWidth / 2" :y="310 - barHeight(entry)" :width="barWidth" :height="barHeight(entry)" rx="4" fill="#6685EB" />
              <text :x="barCenter(index)" :y="298 - barHeight(entry)" text-anchor="middle" font-size="12" fill="#6685EB" data-testid="bar-amount">{{ fullAmount(entry.amount) }} ֏</text>
              <text :x="barCenter(index)" y="338" text-anchor="middle" font-size="12" fill="#475569">{{ label(entry) }}</text>
              <text :x="barCenter(index)" y="360" text-anchor="middle" font-size="12" fill="#64748b" data-testid="bar-count">{{ entry.count }} գործարք</text>
            </g>
          </svg>
          <div v-else class="py-24" aria-hidden="true"></div>
        </div>
        <footer class="border-t border-slate-100 px-4 py-5 sm:px-6">
          <div class="chart-footer-info text-xs text-slate-500">
            <p class="chart-summary" aria-live="polite">Թարմացվել է՝ <time :datetime="updatedAt.toISOString()">{{ updatedTime(updatedAt) }}</time> · <span data-testid="total-count">Գործարքների քանակ՝ {{ totalCount }}</span></p>
            <p class="chart-x-title">{{ axisTitle }} · Գործարքների քանակ · X</p>
          </div>
          <div v-if="report.problems.length" class="mt-4 flex justify-end">
            <button ref="problemButton" type="button" @click="openProblems"
              class="rounded-lg bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-900 hover:bg-amber-100 sm:text-sm">
              Խնդրահարույց գործարքներ <span class="ml-2 rounded-md bg-white px-2 py-1">{{ report.problems.length }}</span>
            </button>
          </div>
        </footer>
      </template>
    </section>
    <dialog ref="dialog" aria-labelledby="problems-title" @click="backdrop" @close="restoreFocus" @keydown="trapFocus"
      class="fixed inset-0 m-auto max-h-[80vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl">
      <div class="sticky top-0 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5">
        <h2 id="problems-title" class="text-base font-semibold sm:text-lg">Խնդրահարույց գործարքներ</h2>
        <button type="button" aria-label="Փակել" autofocus @click="closeProblems" class="rounded-md px-3 py-1 text-2xl hover:bg-slate-100">×</button>
      </div>
      <ul class="divide-y divide-slate-100 px-5">
        <li v-for="problem in report?.problems || []" :key="problem.id" class="flex gap-5 py-4 text-sm">
          <a :href="problem.url" target="_blank" rel="noopener noreferrer" class="shrink-0 font-semibold text-blue-700 underline underline-offset-4">{{ problem.id }}</a>
          <div class="space-y-1"><p v-for="reason in problem.reasons" :key="reason.field">{{ fields[reason.field] }}՝ {{ reasons[reason.code] }}</p></div>
        </li>
      </ul>
    </dialog>
  </main>
</template>
