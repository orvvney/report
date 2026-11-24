<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue';

const props = defineProps({ id: String, label: String, value: String, months: Array, disabled: Boolean });
const emit = defineEmits(['select']);
const popup = ref(null);
const trigger = ref(null);
const open = ref(false);
const weekdays = ['Երկ', 'Երք', 'Չրք', 'Հնգ', 'Ուրբ', 'Շբթ', 'Կիր'];
const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function dateAt(year, month, day) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}
function dateValue(date) {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}
const cursor = ref(new Date());
const today = computed(() => open.value ? dateValue(new Date()) : '');
const first = computed(() => dateAt(cursor.value.getFullYear(), cursor.value.getMonth(), 1));
const offset = computed(() => (first.value.getDay() + 6) % 7);
const days = computed(() => Array.from(
  { length: dateAt(first.value.getFullYear(), first.value.getMonth() + 1, 0).getDate() },
  (_, index) => dateAt(first.value.getFullYear(), first.value.getMonth(), index + 1),
));

function prepare(event) {
  if (event.newState !== 'open') return;
  const [year, month, day] = (props.value || '').split('-').map(Number);
  cursor.value = year ? dateAt(year, month - 1, day) : new Date();
}
async function focusDay() {
  await nextTick();
  popup.value?.querySelector('[data-current-day]')?.focus({ preventScroll: true });
}
function toggled(event) {
  open.value = event.newState === 'open';
  if (open.value) focusDay();
}
function moveMonth(direction) {
  const next = dateAt(first.value.getFullYear(), first.value.getMonth() + direction, 1);
  if (next.getFullYear() < 1) return;
  cursor.value = next;
}
function moveDay(event) {
  const offset = arrows[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  const { value: date } = cursor;
  const next = dateAt(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  if (next.getFullYear() < 1) return;
  cursor.value = next;
  focusDay();
}
function choose(value) {
  popup.value.hidePopover();
  trigger.value.focus();
  emit('select', value);
}
watch(() => props.disabled, disabled => {
  if (disabled && popup.value?.matches(':popover-open')) popup.value.hidePopover();
});
</script>

<template>
  <button ref="trigger" class="date-picker-trigger" type="button" :popovertarget="id" :disabled="disabled"
    :aria-label="label" :aria-controls="id" :aria-expanded="open" aria-haspopup="dialog">
    <CalendarDays :size="16" aria-hidden="true" />
  </button>
  <div :id="id" ref="popup" class="date-picker-popup" lang="hy" popover role="dialog"
    :aria-label="label" @beforetoggle="prepare" @toggle="toggled">
    <div class="date-picker-header">
      <button type="button" aria-label="Նախորդ ամիս" @click="moveMonth(-1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
      <span aria-live="polite">{{ months[first.getMonth()] }} {{ first.getFullYear() }}</span>
      <button type="button" aria-label="Հաջորդ ամիս" @click="moveMonth(1)"><ChevronRight :size="16" aria-hidden="true" /></button>
    </div>
    <div class="date-picker-days">
      <span v-for="weekday in weekdays" :key="weekday" aria-hidden="true">{{ weekday }}</span>
      <button v-for="day in days" :key="day.getDate()" type="button"
        :aria-label="`${day.getDate()} ${months[day.getMonth()]} ${day.getFullYear()}`"
        :style="day.getDate() === 1 ? { gridColumnStart: offset + 1 } : undefined"
        :data-current-day="day.getDate() === cursor.getDate() ? '' : undefined"
        :tabindex="day.getDate() === cursor.getDate() ? 0 : -1"
        :aria-pressed="dateValue(day) === value" :aria-current="dateValue(day) === today ? 'date' : undefined"
        @keydown="moveDay" @click="choose(dateValue(day))">{{ day.getDate() }}</button>
    </div>
    <div class="date-picker-header">
      <button type="button" @click="choose('')">Մաքրել</button>
      <button type="button" @click="choose(today)">Այսօր</button>
    </div>
  </div>
</template>
