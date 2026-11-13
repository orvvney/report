<script setup>
const props = defineProps({ kind: String, title: String, range: Object, idPrefix: { type: String, default: '' } });
const emit = defineEmits(['edit']);
const emptyDate = (side) => !props.range.draft[side] && !props.range.badInput[side];
const errorText = (code) => code === 'reversed' ? 'Սկզբնական արժեքը չպետք է գերազանցի վերջնական արժեքը' : 'Անվավեր արժեք';
function beforeInput(event) {
  if (props.kind !== 'amount') return;
  const input = event.target, position = input.selectionStart;
  if (position !== input.selectionEnd) return;
  // Deleting across a generated separator must remove a digit, not get stuck
  // reinserting the same space on each keystroke.
  if (event.inputType === 'deleteContentBackward' && input.value[position - 1] === ' ') {
    input.setSelectionRange(Math.max(0, position - 2), position);
  } else if (event.inputType === 'deleteContentForward' && input.value[position] === ' ') {
    input.setSelectionRange(position, position + 2);
  }
}
</script>

<template>
  <div class="range-inputs">
    <div v-for="side in ['min', 'max']" :key="side" class="range-control">
      <input :id="`${idPrefix}${kind}-${side}`" :type="kind === 'date' ? 'date' : 'text'"
        :class="{ 'date-empty': kind === 'date' && emptyDate(side) }"
        :placeholder="kind === 'date' ? undefined : side === 'min' ? 'Սկսած' : 'Մինչև'"
        :inputmode="kind === 'date' ? undefined : 'decimal'"
        :aria-label="`${title}՝ ${side === 'min' ? 'Սկսած' : 'Մինչև'}`"
        :aria-invalid="!!range.errors[side]"
        :aria-describedby="range.errors[side] ? `${idPrefix}${kind}-error` : undefined"
        :value="range.draft[side]" @beforeinput="beforeInput"
        @input="emit('edit', side, $event)"
        @keyup="kind === 'date' && emit('edit', side, $event)"
        @blur="kind === 'date' && emit('edit', side, $event)" />
      <span v-if="kind === 'date' && emptyDate(side)" class="date-placeholder" aria-hidden="true">{{ side === 'min' ? 'Սկսած' : 'Մինչև' }}</span>
    </div>
  </div>
  <p v-if="Object.keys(range.errors).length" :id="`${idPrefix}${kind}-error`" class="filter-error" role="alert">{{ errorText(Object.values(range.errors)[0]) }}</p>
</template>
