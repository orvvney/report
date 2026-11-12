<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import kpi from '../report/kpi.cjs';
import decimals from '../report/filter.cjs';
import axes from '../report/kpi-axis.cjs';
const props = defineProps({ wide: Boolean, balanced: Boolean, series: Object, metric: String, title: String, period: String, ranges: Object });
const active = ref(null), cursors = ref([0, 0]), chart = ref(null), width = ref(320), availableHeight = ref(158);

let observer;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; availableHeight.value = entry.contentRect.height; });
  observer.observe(chart.value);
});
onUnmounted(() => observer?.disconnect());
// Preserve the top inset and reserve a footer below monthly labels for the scrollbar.
const svgHeight = computed(() => props.balanced ? Math.max(158, availableHeight.value + 16 - 2 * 25.5 - (monthlyScroll.value ? 40 : 0)) : 158);
const plotTop = computed(() => props.balanced ? 4.5 : 16);
const plotBottom = computed(() => props.balanced ? svgHeight.value - 4.5 : 110);
const plotHeight = computed(() => plotBottom.value - plotTop.value);
const labels = ['Ընտրված', 'Համեմատություն'];
const lines = computed(() => [props.series.current, props.series.previous].filter(line => line !== null));
const selected = computed(() => props.series.current || []);
const length = computed(() => Math.max(1, ...lines.value.map(line => line.length)));
const narrow = computed(() => width.value < 260);
const sparseLabels = computed(() => width.value < 360);
const scale = computed(() => axes.axisScale(lines.value, props.metric, narrow.value, props.balanced));
const monthlyScroll = computed(() => props.wide && !daily.value && selected.value.length > 1);
// Extend the annual axis only; future months must not become zero-valued data points.
const axisPoints = computed(() => {
  if (!monthlyScroll.value || props.period !== 'year') return selected.value;
  const year = selected.value[0].min.slice(0, 4);
  return Array.from({ length: 12 }, (_, index) => ({ min: `${year}-${String(index + 1).padStart(2, '0')}-01` }));
});
const ticks = computed(() => monthlyScroll.value ? axisPoints.value.map((_, index) => index) : axes.xTickIndices(selected.value.length, sparseLabels.value));
const margin = computed(() => {
  if (!props.wide) return narrow.value ? Math.min(54, width.value * .34) : 72;
  const context = document.createElement('canvas').getContext('2d');
  context.font = `10px ${chart.value ? getComputedStyle(chart.value).fontFamily : 'Arial'}`;
  return Math.max(...scale.value.ticks.flatMap(tick => labelRows(tick.label)).map(text => context.measureText(text).width)) + 7;
});
const rightInset = computed(() => margin.value);
const basePlotWidth = computed(() => Math.max(1, width.value - margin.value - rightInset.value));
// Reduce the former three-month tick distance by 30% for each monthly step.
const monthStep = computed(() => basePlotWidth.value * 3 * .7 / Math.max(1, length.value - 1));
const plotWidth = computed(() => monthlyScroll.value ? monthStep.value * (Math.max(length.value, axisPoints.value.length) - .5) : basePlotWidth.value);
const canvasWidth = computed(() => margin.value + plotWidth.value + rightInset.value);
const daily = computed(() => props.period === 'month' || (props.period === 'custom' && props.ranges?.current?.[0]?.min && props.ranges?.current?.[0]?.max
  && (Date.parse(props.ranges.current[0].max) - Date.parse(props.ranges.current[0].min)) / 86400000 < 31));
function x(index) { if (monthlyScroll.value) return margin.value + (index + .5) * monthStep.value; return margin.value + (length.value === 1 ? .5 : index / (length.value - 1)) * plotWidth.value; }
const firstLabelGap = computed(() => {
  if (!props.wide || !selected.value.length) return 0;
  const context = document.createElement('canvas').getContext('2d');
  context.font = `${props.balanced ? 9 : 10}px ${chart.value ? getComputedStyle(chart.value).fontFamily : 'Arial'}`;
  const lastWidth = Math.max(...labelParts(selected.value.at(-1)).map(text => context.measureText(text).width));
  return 16 + rightInset.value - lastWidth / 2;
});
function labelX(index) { if (monthlyScroll.value) return x(index); return x(index) + (props.wide && index === 0 ? firstLabelGap.value : 0); }
function labelParts(point) { return axes.dateParts(point, daily.value, sparseLabels.value, props.wide); }
function y(point) {
  const value = decimals.decimal(String(point[props.metric]), true);
  const upper = scale.value.upper, lower = scale.value.lower || { coefficient: 0n, scale: 0 };
  const precision = Math.max(value.scale, upper.scale, lower.scale);
  const toInteger = number => number.coefficient * 10n ** BigInt(precision - number.scale);
  const ratio = (toInteger(value) - toInteger(lower)) * 1000000n / (toInteger(upper) - toInteger(lower));
  return plotBottom.value - Number(ratio) / 1000000 * plotHeight.value;
}
function labelRows(text) {
  if (props.wide && props.metric === 'amount') return [text.replace(/ ֏$/, '')];
  if (props.metric === 'count' || text.length <= 6) return [text];
  const marker = text.lastIndexOf(' ');
  const before = text.slice(0, marker);
  const split = before.lastIndexOf(' ');
  return split < 0 ? [before, '֏'] : [before.slice(0, split), `${before.slice(split + 1)} ֏`];
}
function description(point, line) {
  return `${labels[line]}՝ ${kpi.rangeText([point])} · ${kpi.valueText(point[props.metric], props.metric)}`;
}
function move(event, line, index) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const end = lines.value[line].length - 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? end
    : Math.max(0, Math.min(end, index + (event.key === 'ArrowRight' ? 1 : -1)));
  cursors.value[line] = next;
  event.currentTarget.parentElement.children[next].focus();
}
watch(() => props.series, () => { active.value = null; cursors.value = [0, 0]; });
</script>

<template>
  <div ref="chart" class="kpi-chart" :aria-label="`${title}՝ ժամանակային գրաֆիկ`" role="group" @click.stop @keydown.stop>
    <template v-if="lines.some(line => line.length)">
      <div v-if="!wide" class="kpi-legend" aria-hidden="true">
        <span v-for="(line, index) in lines" :key="index"><i :class="`kpi-line-${index}`"></i>{{ labels[index] }}</span>
      </div>
      <div class="kpi-chart-scroll" :class="{ 'kpi-month-scroll': monthlyScroll }" :style="balanced ? { height: `${svgHeight + (monthlyScroll ? 40 : 24)}px` } : undefined">
      <svg :viewBox="`0 0 ${canvasWidth} ${svgHeight}`" :style="{ width: `${canvasWidth}px`, ...(balanced ? { height: `${svgHeight}px` } : {}) }" :aria-label="`${title}՝ ժամանակային գրաֆիկ`" role="group">
        <g class="kpi-axis" data-testid="kpi-axes">
          <path :d="`M${margin} ${plotTop}V${plotBottom}H${canvasWidth - rightInset}`" fill="none" stroke="#1d283e" />
          <g v-for="tick in scale.ticks" :key="tick.value" data-testid="kpi-y-tick">
            <line :x1="margin - 4" :x2="canvasWidth - rightInset" :y1="plotBottom - tick.fraction * plotHeight" :y2="plotBottom - tick.fraction * plotHeight" stroke="#d3dfdb" />
            <text :x="margin - 7" :y="plotBottom - tick.fraction * plotHeight + (labelRows(tick.label).length === 1 ? 3 : 0)" text-anchor="end">
              <tspan v-for="(row, rowIndex) in labelRows(tick.label)" :key="rowIndex" :x="margin - 7" :dy="rowIndex ? 10 : 0" :textLength="!wide && row.length * 5.5 > margin - 9 ? margin - 9 : undefined" lengthAdjust="spacingAndGlyphs">{{ row }}</tspan>
            </text>
          </g>
          <g v-for="index in ticks" :key="index" data-testid="kpi-x-tick">
            <line v-if="!wide" :x1="x(index)" :x2="x(index)" :y1="plotBottom" :y2="plotBottom + 4" stroke="#1d283e" />
            <text :x="labelX(index)" :y="plotBottom + (wide ? 7 : 18)" :dominant-baseline="wide ? 'text-before-edge' : undefined" :font-size="balanced ? 9 : undefined" :text-anchor="monthlyScroll ? 'middle' : index === 0 && selected.length > 1 ? 'start' : index === selected.length - 1 && selected.length > 1 ? (wide ? 'middle' : 'end') : 'middle'">
              <tspan v-for="(part, partIndex) in labelParts(axisPoints[index])" :key="partIndex" :x="labelX(index)" :dy="partIndex ? (balanced ? 9 : 11) : 0">{{ part }}</tspan>
            </text>
          </g>
        </g>
        <template v-for="(line, lineIndex) in lines" :key="lineIndex">
          <polyline v-if="line.length" :points="line.map((point, index) => `${x(index)},${y(point)}`).join(' ')"
            fill="none" :stroke="lineIndex ? '#1d283e' : '#00a387'" :stroke-width="lineIndex ? 1.5 : 3.5" :stroke-dasharray="lineIndex ? '6 4' : undefined"
            vector-effect="non-scaling-stroke" :data-testid="`kpi-line-${lineIndex}`" />
          <g>
            <circle v-for="(point, index) in line" :key="point.min" :cx="x(index)" :cy="y(point)" r="4"
              :fill="lineIndex ? '#1d283e' : '#00a387'" stroke="white" stroke-width="1"
              :tabindex="cursors[lineIndex] === index ? 0 : -1" role="button" :aria-label="description(point, lineIndex)"
              @mouseenter="active = description(point, lineIndex)" @mouseleave="active = null"
              @focus="active = description(point, lineIndex)" @blur="active = null"
              @click="active = description(point, lineIndex)" @keydown="move($event, lineIndex, index)" />
          </g>
        </template>
      </svg>
      </div>
      <p class="kpi-chart-tooltip" role="status">{{ active || ' ' }}</p>
    </template>
    <p v-else class="kpi-notice">Տվյալներ չկան</p>
  </div>
</template>
