<script setup>
import { computed, reactive, ref, watch } from 'vue';
import PeriodFilter from './PeriodFilter.vue';
import calendar from '../report/period.cjs';
import filters from '../report/filter.cjs';
const props = defineProps({ rows: Array, disabled: Boolean, title: String, idPrefix: String });
const emit = defineEmits(['change']);
const { calendarContext, initialSelections, reconcileSelections, defaultSelection, togglePeriodValue, quickSelection, periodRanges } = calendar;
const months = ['Հունվար', 'Փետրվար', 'Մարտ', 'Ապրիլ', 'Մայիս', 'Հունիս', 'Հուլիս', 'Օգոստոս', 'Սեպտեմբեր', 'Հոկտեմբեր', 'Նոյեմբեր', 'Դեկտեմբեր'];
const selectedPeriod = ref('year'), selectedQuick = ref('current-month');
const context = ref(calendarContext(props.rows || [])), selections = ref(initialSelections(context.value));
const range = reactive({ draft: { min: '', max: '' }, applied: { min: null, max: null }, errors: {}, badInput: {} });
const activeSelection = computed(() => selections.value[selectedPeriod.value]);
const availableMonths = computed(() => activeSelection.value?.year === context.value.year ? context.value.month : 12);
const invalid = computed(() => selectedPeriod.value === 'custom' && Object.keys(range.errors).length > 0);
const dateRanges = computed(() => {
  if (selectedPeriod.value === 'custom') return [range.applied];
  const effective = selectedPeriod.value === 'quick' ? quickSelection(selectedQuick.value, context.value)
    : { period: selectedPeriod.value, selection: activeSelection.value };
  return periodRanges(effective.period, context.value, effective.selection);
});
function updatePeriod() {
  context.value = calendarContext(props.rows || []);
  selections.value = reconcileSelections(selections.value, context.value);
  if (Object.hasOwn(selections.value, selectedPeriod.value) && !activeSelection.value) {
    selections.value[selectedPeriod.value] = defaultSelection(selectedPeriod.value, context.value);
  }
}
function choosePeriod(value) { selectedPeriod.value = value; updatePeriod(); }
function selectValue(value) {
  updatePeriod();
  if (activeSelection.value.year === context.value.year && value > context.value[selectedPeriod.value]) return;
  activeSelection.value.values = togglePeriodValue(activeSelection.value.values, value);
}
function allMonths(clear) {
  updatePeriod();
  activeSelection.value.values = clear ? [context.value.month] : Array.from({ length: availableMonths.value }, (_, i) => i + 1);
}
function editDate(side, event) {
  range.draft[side] = event.target.value; range.badInput[side] = event.target.validity.badInput;
  const result = filters.validateRange('date', range.draft, range.badInput);
  range.errors = result.errors;
  if (result.valid) range.applied = result.values;
}
watch(() => props.rows, updatePeriod);
watch([dateRanges, invalid], () => emit('change', { ranges: dateRanges.value, invalid: invalid.value }), { immediate: true });
</script>

<template>
  <form class="expo-period-filter" :aria-label="title" @submit.prevent>
    <PeriodFilter :selected-period="selectedPeriod" :selected-quick="selectedQuick"
      :active-selection="activeSelection" :period-context="context" :available-months="availableMonths"
      :disabled="disabled" :title="title" :range="range" :months="months" :id-prefix="idPrefix"
      @period="choosePeriod" @quick="value => { selectedQuick = value; updatePeriod(); }"
      @year="value => { activeSelection.year = value; updatePeriod(); }"
      @select="selectValue" @months="allMonths" @edit="editDate" />
  </form>
</template>
