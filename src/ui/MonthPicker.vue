<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
const props = defineProps({ months: Array, values: Array, limit: Number, disabled: Boolean });
const popupId = `month-popup-${useId()}`;
const emit = defineEmits(['select', 'all', 'clear']);
const trigger = ref(null), popup = ref(null), open = ref(false);
function position() {
  if (!open.value) return;
  const button = trigger.value.getBoundingClientRect();
  const width = Math.min(400, window.innerWidth - 24);
  popup.value.style.width = `${width}px`;
  popup.value.style.left = `${Math.max(12, Math.min(button.left + (button.width - width) / 2, window.innerWidth - width - 12))}px`;
  const height = popup.value.getBoundingClientRect().height;
  popup.value.style.top = `${Math.max(12, button.bottom + height + 8 <= window.innerHeight
    ? button.bottom : button.top - height)}px`;
}
async function show() {
  if (props.disabled || open.value) return;
  open.value = true;
  await nextTick();
  if (!popup.value || !open.value) return;
  popup.value.showPopover(); position();
}
function close(restore = false) {
  if (!open.value) return;
  popup.value.hidePopover(); open.value = false;
  if (restore) trigger.value.focus();
}
function leave(event) {
  if (event.pointerType !== 'mouse') return;
  if (trigger.value.contains(event.relatedTarget) || popup.value.contains(event.relatedTarget)) return;
  close();
}
function outside(event) {
  if (!trigger.value.contains(event.target) && !popup.value.contains(event.target)) close();
}
function escape(event) {
  if (event.key === 'Escape' && open.value) { event.preventDefault(); close(true); }
}
watch(() => props.disabled, value => { if (value) close(); });
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', escape);
  window.removeEventListener('resize', position);
  window.removeEventListener('scroll', position, true);
});
defineExpose({ close });
</script>

<template>
  <div class="month-picker">
    <button ref="trigger" class="month-trigger" type="button" :disabled="disabled"
      :aria-controls="popupId" :aria-expanded="open" aria-haspopup="dialog"
      @pointerenter="event => { if (event.pointerType === 'mouse') show(); }" @pointerleave="leave" @click="show">
      Ամիսներ<span class="select-arrow" aria-hidden="true"></span>
    </button>
    <div :id="popupId" ref="popup" popover="manual" role="dialog" aria-label="Ամիսների ընտրություն"
      class="month-popup" @pointerleave="leave">
      <div class="period-buttons month-grid" role="group" aria-label="Ամիսներ">
        <button v-for="(month, index) in months" :key="month" type="button" :disabled="disabled || index + 1 > limit"
          :aria-pressed="values.includes(index + 1)" @click="emit('select', index + 1)">{{ month }}</button>
      </div>
      <div class="month-actions">
        <button type="button" @click="emit('clear')">Մաքրել</button>
        <button type="button" @click="emit('all')">Բոլորը</button>
      </div>
    </div>
  </div>
</template>
