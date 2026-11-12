<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import filters from '../report/filter.cjs';
import calendar from '../report/period.cjs';
import amountInput from '../report/amount-input.cjs';
import RangeInputs from './RangeInputs.vue';
import MonthPicker from './MonthPicker.vue';
import KpiCard from './KpiCard.vue';
import StatisticsPanel from './StatisticsPanel.vue';
import DealsHistogram from './DealsHistogram.vue';
import KpiDealsDialog from './KpiDealsDialog.vue';
import kpi from '../report/kpi.cjs';
import filterIcon from '../../images/filter.png';
import resetIcon from '../../images/reset.png';
import milonLogo from '../../images/logo_milon.png';
const { periods, quickPeriods, quickSelection, calendarContext, defaultSelection, initialSelections, reconcileSelections, togglePeriodValue, periodRanges } = calendar;
const { formatAmountInput, ungroupAmount } = amountInput;
const { roomOptions, reconcileRooms, toggleRoom, validateRange } = filters;
const report = ref(null), loading = ref(false), failed = ref(false);
const kpiDialog = ref(null);
const propertyMenu = ref(null);
function selectPropertyType() {
  propertyMenu.value?.hidePopover();
}
const filterContainer = ref(null), wideKpi = ref(false);
let kpiObserver;
function layoutPanels() {
    if (!filterContainer.value) return;
    wideKpi.value = filterContainer.value.clientWidth >= 1100;
    const page = filterContainer.value.closest('.report-page');
    const logo = page.querySelector('.report-logo');
    page.style.setProperty('--section-gap', `${logo.getBoundingClientRect().top + window.scrollY}px`);
    const row = filterContainer.value.querySelector('.report-top-panels');
    const form = row.querySelector('form');
    row.classList.toggle('panels-stacked', !wideKpi.value);
    row.classList.add('panels-joined');
    const title = form.querySelector('.filter-heading h2');
    const legend = form.querySelector('legend');
    if (title && legend && !disabled.value) {
      const heading = row.querySelector('.statistics-heading');
      const statTitle = heading.querySelector('h2');
      const desired = statTitle.getBoundingClientRect().bottom + legend.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
      row.style.setProperty('--statistics-content-gap', `${Math.max(0, desired - heading.getBoundingClientRect().bottom)}px`);
      const amountMax = form.querySelector('#amount-max');
      if (!row.classList.contains('panels-stacked') && amountMax) {
        row.style.setProperty('--statistics-content-height', `${Math.max(100, amountMax.getBoundingClientRect().bottom - desired)}px`);
      } else row.style.removeProperty('--statistics-content-height');
    }
}
onMounted(() => {
  kpiObserver = new ResizeObserver(layoutPanels);
  kpiObserver.observe(filterContainer.value);
});
onBeforeUnmount(() => kpiObserver?.disconnect());
const months = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
const fields = { rooms: 'Սենյակների քանակ', date: 'Կնքման ամսաթիվ', amount: 'Ընդհանուր արժեք', area: 'Մակերես (մ²)', currency: 'Արժույթ' };
const filterFields = { ...fields, amount: 'Բնակարանի արժեք (֏)', date: 'Կնքման ժամանակահատված' };
const availableRooms = ref([]), selectedRooms = ref([]);
const quarterRoomRows = computed(() => Array.from({ length: Math.ceil(availableRooms.value.length / 3) },
  (_, index) => availableRooms.value.slice(index * 3, index * 3 + 3)));
const emptyRange = () => ({ draft: { min: '', max: '' }, applied: { min: null, max: null }, errors: {}, badInput: {} });
const ranges = reactive(Object.fromEntries(['amount', 'area', 'date'].map((kind) => [kind, emptyRange()])));
const selectedPeriod = ref('year'), dateRevision = ref(0);
watch([availableRooms, selectedPeriod, loading, wideKpi], async () => { await nextTick(); layoutPanels(); });
const selectedQuick = ref('current-month'), monthPicker = ref(null);
const hasFilterErrors = computed(() => ['area', 'amount', ...(selectedPeriod.value === 'custom' ? ['date'] : [])]
  .some(kind => Object.keys(ranges[kind].errors).length));
const periodContext = ref(calendarContext());
const periodSelections = ref(initialSelections(periodContext.value));
const activeSelection = computed(() => periodSelections.value[selectedPeriod.value]);
const effectivePeriod = computed(() => selectedPeriod.value === 'quick'
  ? quickSelection(selectedQuick.value, periodContext.value)
  : { period: selectedPeriod.value, selection: activeSelection.value });
const stackedFilters = computed(() => !['last-12', 'all'].includes(effectivePeriod.value.period));
const presetRanges = computed(() => selectedPeriod.value === 'custom' ? undefined
  : periodRanges(effectivePeriod.value.period, periodContext.value, effectivePeriod.value.selection));
const availableMonths = computed(() => periodSelections.value.month?.year === periodContext.value.year
  ? periodContext.value.month : 12);
const selectedComplexes = ref(['tower', 'hills']);
const complexes = [['tower', 'Թաուեր'], ['hills', 'Հիլլս']];
const allRooms = ref(true);
const disabled = computed(() => loading.value || failed.value || !report.value);
const appliedFilters = computed(() => ({
  rooms: selectedRooms.value, complexes: selectedComplexes.value,
  amount: ranges.amount.applied, area: ranges.area.applied,
  date: selectedPeriod.value === 'custom' ? ranges.date.applied : undefined,
  dateRanges: presetRanges.value,
}));
const kpiResetRevision = ref(0);
const kpiData = computed(() => report.value ? kpi.calculateKpis(report.value.deals, {
  period: effectivePeriod.value.period, context: periodContext.value, selection: effectivePeriod.value.selection,
  custom: ranges.date.applied, filters: appliedFilters.value,
}) : null);
function updatePeriod() {
  periodContext.value = calendarContext(report.value?.deals || []);
  periodSelections.value = reconcileSelections(periodSelections.value, periodContext.value);
  const period = selectedPeriod.value;
  if (Object.hasOwn(periodSelections.value, period) && !periodSelections.value[period]) {
    periodSelections.value[period] = defaultSelection(period, periodContext.value);
  }
}
function futurePeriod(value) {
  return activeSelection.value?.year === periodContext.value.year && value > periodContext.value[selectedPeriod.value];
}
function selectPeriodValue(value) {
  updatePeriod();
  if (!futurePeriod(value)) activeSelection.value.values = togglePeriodValue(activeSelection.value.values, value);
}
function changePeriodYear() {
  updatePeriod();
}
function setAllMonths(clear) {
  updatePeriod();
  activeSelection.value.values = clear ? [periodContext.value.month]
    : Array.from({ length: availableMonths.value }, (_, index) => index + 1);
}
function toggleComplex(value) {
  if (!selectedComplexes.value.includes(value)) selectedComplexes.value = [...selectedComplexes.value, value];
  else if (selectedComplexes.value.length > 1) selectedComplexes.value = selectedComplexes.value.filter((key) => key !== value);
}
function selectAllRooms() {
  allRooms.value = true;
  selectedRooms.value = [...availableRooms.value];
}
function selectRoom(room) {
  selectedRooms.value = toggleRoom(selectedRooms.value, room, allRooms.value ? availableRooms.value : undefined);
  allRooms.value = false;
}
function resetFilters() {
  kpiResetRevision.value++;
  selectedQuick.value = 'current-month';
  monthPicker.value?.close();
  periodSelections.value = initialSelections(calendarContext());
  selectedPeriod.value = 'year'; updatePeriod();
  selectedComplexes.value = ['tower', 'hills'];
  selectAllRooms();
  for (const kind of Object.keys(ranges)) ranges[kind] = emptyRange();
  dateRevision.value++;
}
function editRange(kind, side, event) {
  const range = ranges[kind], input = event.target;
  let text = input.value;
  if (kind === 'amount') {
    const formatted = formatAmountInput(text, input.selectionStart, input.selectionEnd);
    text = formatted.text;
    input.value = text;
    input.setSelectionRange(formatted.start, formatted.end);
  }
  range.draft[side] = text;
  range.badInput[side] = input.validity.badInput;
  const draft = kind === 'amount'
    ? Object.fromEntries(Object.entries(range.draft).map(([key, value]) => [key, ungroupAmount(value)])) : range.draft;
  const result = validateRange(kind, draft, range.badInput);
  range.errors = result.errors;
  if (result.valid) range.applied = result.values;
}
async function refresh(force = true) {
  if (loading.value) return;
  monthPicker.value?.close(); kpiDialog.value?.close(); report.value = null; failed.value = false; loading.value = true;
  try {
    const response = await fetch(force ? '/api/report?refresh=1' : '/api/report', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const snapshot = await response.json();
    const available = roomOptions(snapshot.deals);
    if (!available.length || !selectedRooms.value.some(room => available.includes(room))) allRooms.value = true;
    selectedRooms.value = allRooms.value ? [...available] : reconcileRooms(availableRooms.value, selectedRooms.value, available);
    availableRooms.value = available;
    report.value = snapshot;
    updatePeriod();
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
onMounted(() => refresh(false));
</script>

<template>
  <main class="report-page">
    <section aria-label="Գործարքների հաշվետվություն" class="report-shell">
      <header class="report-header" :class="{ 'header-wide': wideKpi }">
        <div class="report-header-row">
          <div class="report-brand">
            <img :src="milonLogo" alt="Milon Mining" class="report-logo">
            <span class="report-brand-name">MILON MINING</span>
          </div>
          <div class="report-header-copy">
            <h1>Հաշվետվություն</h1>
          </div>
          <div class="header-actions">
            <button type="button" class="refresh-button header-icon-button" aria-label="Թարմացնել հաշվետվությունը" title="Թարմացնել հաշվետվությունը"
              :disabled="loading" @click="refresh"><span class="filter-icon reset-icon" :style="{ maskImage: `url(${resetIcon})` }" aria-hidden="true"></span></button>
            <button type="button" class="header-icon-button property-menu-trigger" aria-label="Անշարժ գույքի տեսակ" title="Անշարժ գույքի տեսակ" popovertarget="property-menu" aria-haspopup="menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div ref="propertyMenu" id="property-menu" class="property-menu" popover role="menu" aria-label="Անշարժ գույքի տեսակ">
              <button type="button" role="menuitem" @click="selectPropertyType('apartments')">Բնակարաններ</button>
              <button type="button" role="menuitem" @click="selectPropertyType('parking')">Ավտոկայանատեղիներ</button>
            </div>
          </div>
        </div>
      </header>
      <div ref="filterContainer" class="filter-container">
      <div class="report-top-panels" :class="{ 'top-wide': wideKpi }">
      <form class="filter-panel" :class="{ 'filter-panel-unavailable': disabled, 'filter-panel-with-errors': hasFilterErrors, 'stacked-filters': stackedFilters, 'month-filter': selectedPeriod === 'month', 'quarter-filter': selectedPeriod === 'quarter' }" aria-label="Զտիչներ" @submit.prevent>
        <p v-if="disabled" class="filter-notice" role="status">Հաշվետվությունների թարմացման պատճառով զտիչների կարգավորումը ժամանակավորապես անհասանելի է։</p>
        <div v-show="!disabled" aria-label="Զտիչների տարածք">
          <div class="filter-heading">
            <h2><span class="filter-icon" :style="{ maskImage: `url(${filterIcon})` }" aria-hidden="true"></span>Զտիչներ</h2>
            <button type="button" :disabled="disabled" @click="resetFilters"><span class="filter-icon reset-icon" :style="{ maskImage: `url(${resetIcon})` }" aria-hidden="true"></span>Վերականգնել</button>
          </div>
          <div class="filter-row">
            <div class="filter-first-row" :style="{ '--room-row-width': `${Math.max(156, availableRooms.length * 32 - 4)}px` }">
            <fieldset class="date-filter" :disabled="disabled">
              <legend>{{ filterFields.date }}</legend>
              <div class="period-select">
              <select v-model="selectedPeriod" :aria-label="filterFields.date" @change="updatePeriod">
                <option v-for="[value, title] in periods" :key="value" :value="value">{{ title }}</option>
              </select>
              <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="selectedPeriod === 'quick'" class="period-details period-select">
                <select v-model="selectedQuick" aria-label="Արագ ընտրություն" @change="updatePeriod">
                  <option v-for="[value, title] in quickPeriods" :key="value" :value="value">{{ title }}</option>
                </select>
                <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="activeSelection" class="period-details">
                <div class="period-toolbar" :class="{ 'month-toolbar': selectedPeriod === 'month' }">
                  <div class="period-select">
                    <select v-model.number="activeSelection.year" aria-label="Տարի" @change="changePeriodYear">
                      <option v-for="year in periodContext.years" :key="year" :value="year">{{ year }}</option>
                    </select>
                    <span class="select-arrow" aria-hidden="true"></span>
                  </div>
                  <MonthPicker v-if="selectedPeriod === 'month'" ref="monthPicker" :months="months"
                    :values="activeSelection.values" :limit="availableMonths" :disabled="disabled"
                    @select="selectPeriodValue" @all="setAllMonths(false)" @clear="setAllMonths(true)" />
                </div>
                <div v-if="selectedPeriod === 'quarter'" class="period-buttons quarter-buttons" role="group" aria-label="Եռամսյակներ">
                  <button v-for="(title, index) in ['I', 'II', 'III', 'IV']" :key="index" type="button"
                    :aria-pressed="activeSelection.values.includes(index + 1)" :disabled="disabled || futurePeriod(index + 1)"
                    @click="selectPeriodValue(index + 1)">{{ title }}</button>
                </div>
              </div>
              <div v-show="selectedPeriod === 'custom'" class="custom-period">
                <RangeInputs :key="dateRevision" kind="date" :title="filterFields.date" :range="ranges.date"
                  @edit="(side, event) => editRange('date', side, event)" />
              </div>
            </fieldset>
            <fieldset :disabled="disabled">
              <legend>Համալիր</legend>
              <div class="complex-buttons">
                <button v-for="[value, title] in complexes" :key="value" type="button"
                  :aria-pressed="selectedComplexes.includes(value)" @click="toggleComplex(value)">{{ title }}</button>
              </div>
            </fieldset>
            <fieldset class="room-filter" :disabled="disabled">
              <legend>{{ fields.rooms }}</legend>
              <div class="room-buttons">
                <button class="all-rooms" type="button" :aria-pressed="allRooms"
                  @click="selectAllRooms">Բոլորը</button>
                <div class="room-values">
                  <template v-if="selectedPeriod === 'quarter'">
                    <div v-for="(row, index) in quarterRoomRows" :key="index" class="quarter-room-row">
                      <button v-for="room in row" :key="room" type="button"
                        :aria-pressed="!allRooms && selectedRooms.includes(room)" :aria-label="`${fields.rooms}՝ ${room}`"
                        @click="selectRoom(room)">{{ room }}</button>
                    </div>
                  </template>
                  <template v-else>
                    <button v-for="room in availableRooms" :key="room" type="button"
                      :aria-pressed="!allRooms && selectedRooms.includes(room)" :aria-label="`${fields.rooms}՝ ${room}`"
                      @click="selectRoom(room)">{{ room }}</button>
                  </template>
                </div>
              </div>
            </fieldset>
            </div>
            <div class="filter-second-row">
            <fieldset v-for="kind in ['area', 'amount']" :key="kind" :disabled="disabled" class="range-filter">
              <legend>{{ filterFields[kind] }}</legend>
              <RangeInputs :kind="kind" :title="filterFields[kind]" :range="ranges[kind]"
                @edit="(side, event) => editRange(kind, side, event)" />
            </fieldset>
            </div>
          </div>
        </div>
      </form>
      <StatisticsPanel :deals="report?.deals || []" :filters="appliedFilters" :period="selectedPeriod" :loading="loading || (!report && !failed)" :failed="failed" :reset-revision="kpiResetRevision" />
      </div>
      </div>
      <div class="kpi-container" :class="{ 'kpi-wide': wideKpi }" data-testid="kpi-container">
      <div class="kpi-grid">
        <KpiCard :wide="wideKpi" metric="count" title="Կնքված բնակարանների քանակ" :data="kpiData" :period="effectivePeriod.period"
          :loading="loading" :failed="failed" :reset-revision="kpiResetRevision" @open="(title, element) => kpiDialog.open(title, element)" />
        <KpiCard :wide="wideKpi" metric="amount" title="Վաճառքի ընդհանուր արժեք" :data="kpiData" :period="effectivePeriod.period"
          :loading="loading" :failed="failed" :reset-revision="kpiResetRevision" @open="(title, element) => kpiDialog.open(title, element)" />
      </div>
      <div v-if="!wideKpi && !disabled && kpiData" class="kpi-dates" data-testid="kpi-dates">
        <p>Ընտրված՝ {{ kpi.rangeText(kpiData.ranges.current) || 'Տվյալներ չկան' }}</p>
        <p v-if="kpiData.ranges.previous">Համեմատություն՝ {{ kpi.rangeText(kpiData.ranges.previous) }}</p>
      </div>
      </div>
      <DealsHistogram :wide="wideKpi" :deals="report?.deals || []" :filters="appliedFilters" :months="months"
        :data="kpiData" :period="effectivePeriod.period"
        :year="effectivePeriod.selection?.year || report?.year || periodContext.year"
        :loading="loading || (!report && !failed)" :failed="failed" />
    </section>
    <KpiDealsDialog ref="kpiDialog" :data="kpiData" :unavailable="disabled" />
  </main>
</template>
