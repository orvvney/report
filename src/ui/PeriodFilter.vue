<script setup>
import { ref } from 'vue';
import calendar from '../report/period.cjs';
import RangeInputs from './RangeInputs.vue';
import MonthPicker from './MonthPicker.vue';
const { periods, quickPeriods } = calendar;
defineProps({ selectedPeriod: String, selectedQuick: String, activeSelection: Object,
  periodContext: Object, availableMonths: Number, disabled: Boolean, title: String,
  range: Object, dateRevision: Number, months: Array, idPrefix: { type: String, default: '' } });
const emit = defineEmits(['period', 'quick', 'year', 'select', 'months', 'edit']);
const monthPicker = ref(null);
defineExpose({ close: () => monthPicker.value?.close() });
</script>

<template>
            <fieldset class="date-filter" :disabled="disabled">
              <legend>{{ title }}</legend>
              <div class="period-select">
              <select  :value="selectedPeriod" :aria-label="title" @change="emit('period', $event.target.value)">
                <option v-for="[value, title] in periods" :key="value" :value="value">{{ title }}</option>
              </select>
              <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="selectedPeriod === 'quick'" class="period-details period-select">
                <select :value="selectedQuick" aria-label="Արագ ընտրություն" @change="emit('quick', $event.target.value)">
                  <option v-for="[value, title] in quickPeriods" :key="value" :value="value">{{ title }}</option>
                </select>
                <span class="select-arrow" aria-hidden="true"></span>
              </div>
              <div v-if="activeSelection" class="period-details" :class="{ 'period-details-quarter': selectedPeriod === 'quarter' }">
                <div class="period-toolbar" :class="{ 'month-toolbar': selectedPeriod === 'month' }">
                  <div class="period-select">
                    <select :value="activeSelection.year" aria-label="Տարի" @change="emit('year', Number($event.target.value))">
                      <option v-for="year in periodContext.years" :key="year" :value="year">{{ year }}</option>
                    </select>
                    <span class="select-arrow" aria-hidden="true"></span>
                  </div>
                  <MonthPicker v-if="selectedPeriod === 'month'" ref="monthPicker" :months="months"
                    :values="activeSelection.values" :limit="availableMonths" :disabled="disabled"
                    @select="emit('select', $event)" @all="emit('months', false)" @clear="emit('months', true)" />
                </div>
                <div v-if="selectedPeriod === 'quarter'" class="period-buttons quarter-buttons" role="group" aria-label="Եռամսյակներ">
                  <button v-for="(title, index) in ['I', 'II', 'III', 'IV']" :key="index" type="button"
                    :aria-pressed="activeSelection.values.includes(index + 1)" :disabled="disabled || activeSelection.year === periodContext.year && index + 1 > periodContext.quarter"
                    @click="emit('select', index + 1)">{{ title }}</button>
                </div>
              </div>
              <div v-show="selectedPeriod === 'custom'" class="custom-period">
                <RangeInputs :key="dateRevision" kind="date" :title="title" :range="range" :id-prefix="idPrefix"
                  @edit="(side, event) => emit('edit', side, event)" />
              </div>
            </fieldset>
</template>
