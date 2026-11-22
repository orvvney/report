<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
const helpOpen = ref(false), plot = ref(null), width = ref(500);
let observer;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; });
  observer.observe(plot.value);
});
onBeforeUnmount(() => observer?.disconnect());
const left = 72, right = 42;
const plotWidth = computed(() => Math.max(1, width.value - left - right));
const center = i => left + plotWidth.value * (i + 0.5) / 2;
const barWidth = computed(() => Math.min(80, plotWidth.value / 4));
const props = defineProps({ data: { type: Object, required: true } });
const format = new Intl.NumberFormat('hy-AM', { maximumFractionDigits: 2 });
const values = computed(() => [props.data.baselineMonthlyAverage, props.data.expoCount]);
const max = computed(() => Math.max(1, ...values.value));
const labels = [
  'Միջին ամսական գործարքների քանակ',
  'Տուն Էքսպո · ընդհանուր գործարքների քանակ',
];
</script>
<template>
  <section class="expo-comparison" aria-labelledby="expo-comparison-title">
    <div class="expo-comparison-controls">
      <div class="filter-title" @mouseenter="helpOpen = true" @mouseleave="helpOpen = false" @keydown.esc="helpOpen = false">
        <h2 id="expo-comparison-title">Ավելացված գործարքների համեմատություն</h2>
        <button type="button" class="filter-help" aria-label="Ավելացված գործարքների համեմատության մասին"
          aria-describedby="expo-comparison-help" @focus="helpOpen = true" @blur="helpOpen = false" @click="helpOpen = true">i</button>
        <div v-show="helpOpen" id="expo-comparison-help" class="filter-help-tooltip" role="tooltip">Այս գրաֆիկը նախատեսված է ամսական ստեղծված գործարքների միջին քանակը Տուն Էքսպոյի ընթացքում ստեղծված գործարքների ընդհանուր քանակի հետ համեմատելու համար։</div>
      </div>
    </div>
    <div ref="plot" class="expo-comparison-plot">
    <svg :viewBox="`0 0 ${width} 380`" height="380" role="img" aria-label="Ավելացված գործարքների համեմատություն">
      <g v-for="step in [0, 1, 2, 3, 4]" :key="step">
        <line :x1="left" :x2="width - right" :y1="310 - step * 65" :y2="310 - step * 65"
          :stroke="step ? 'var(--border)' : 'var(--control-border)'" :stroke-dasharray="step ? '4 4' : undefined" />
        <text :x="left - 21" :y="315 - step * 65" text-anchor="end" font-size="12" fill="var(--muted)">{{ format.format(max * step / 4) }}</text>
      </g>
      <line :x1="left" :x2="left" y1="50" y2="310" stroke="var(--control-border)" />
      <g v-for="(value, i) in values" :key="i">
        <rect :x="center(i) - barWidth / 2" :y="310 - value / max * 260" :width="barWidth"
          :height="value / max * 260" :fill="i ? '#00a387' : '#8bd5c8'" />
        <text :x="center(i)" :y="300 - value / max * 260" text-anchor="middle" font-size="14"
          data-testid="expo-comparison-value">{{ format.format(value) }}</text>
      </g>
    </svg>
    </div>
    <div class="expo-comparison-labels">
      <div v-for="(label, i) in labels" :key="i">
        <h3>{{ label }}</h3>
      </div>
    </div>
  </section>
</template>
<style scoped>
.expo-comparison { margin-top: var(--section-gap, 24px); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--card-shadow); background: var(--surface); }
.expo-comparison-controls { display: flex; justify-content: center; padding: 20px 12px; border-bottom: 1px solid var(--brand-tint); }
.expo-comparison-controls .filter-title { max-width: 100%; }
h2 { text-align: center; font-size: var(--expo-heading-size); font-weight: 600; overflow-wrap: anywhere; }
.filter-help { flex-shrink: 0; }
.filter-help-tooltip { left: 50%; transform: translateX(-50%); }
.expo-comparison-plot { margin: 16px 8px 0; }
svg { width: 100%; height: 380px; display: block; }
.expo-comparison-labels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; text-align: center; padding: 0 50px 20px 80px; margin-top: -49px; position: relative; }
.expo-comparison-labels > div { overflow-wrap: anywhere; min-width: 0; }
.expo-comparison-labels h3 { font-size: 14px; font-weight: 500; color: var(--muted); line-height: 1.5; margin: 0; }
</style>
