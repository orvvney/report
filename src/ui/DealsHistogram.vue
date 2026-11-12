<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import filters from '../report/filter.cjs';
import chart from '../report/chart.cjs';
import histogram from '../report/histogram.cjs';
import kpi from '../report/kpi.cjs';
import buildingIcon from '../../images/building.png';
import walletIcon from '../../images/wallet.png';
import roomsIcon from '../../images/rooms.png';

const props = defineProps({
  deals: { type: Array, required: true }, filters: { type: Object, required: true },
  months: { type: Array, required: true }, year: { type: Number, required: true },
  loading: Boolean, failed: Boolean, wide: Boolean, data: Object, period: String,
});
const { fullAmount, shortAmount } = chart;
const { monthlyRoomTotals, roomColor, histogramScale, comparisonMonths } = histogram;
const mode = ref('count');
const compare = ref(false);
const modes = [['count', 'Բն. քանակ', buildingIcon], ['months', 'Վաճառքի գումար', walletIcon], ['rooms', 'Սենյակներ', roomsIcon]];
const isCount = computed(() => mode.value === 'count');
const plotStyle = { paddingLeft: '0px', paddingRight: '21px' };
const metric = computed(() => isCount.value ? 'count' : 'amount');
const change = computed(() => props.data?.changes?.[metric.value]);
const grouped = computed(() => filters.calculate(props.deals, props.year, props.filters));
const counted = computed(() => filters.calculate(props.data?.selected.current || [], props.year).months);
const stacked = computed(() => monthlyRoomTotals(props.deals, props.year, props.filters));
const canCompare = computed(() => Boolean(props.data?.ranges.previous?.length));
const comparing = computed(() => compare.value && canCompare.value);
const previous = computed(() => comparisonMonths(props.data?.selected.previous, props.data?.ranges, props.year, props.period));
const categories = computed(() => isCount.value ? counted.value : mode.value === 'rooms' ? stacked.value.months : grouped.value.months);
const axisTitle = 'Կնքման ամիս';
const label = entry => props.months[entry.category - 1];
const totalCount = computed(() => categories.value.reduce((sum, entry) => sum + entry.count, 0));
const scale = computed(() => histogramScale([
  ...(isCount.value ? counted.value : stacked.value.months), ...(comparing.value ? previous.value : []),
].map(entry => isCount.value ? entry.count : entry.amount), { integer: isCount.value }));
const yTitle = computed(() => isCount.value ? 'Բնակարանների քանակ' : 'Ընդհանուր արժեք (֏)');
const tickY = index => 310 - index * 260 / (scale.value.ticks.length - 1);
const yAxis = ref(null);
const tickLabelWidth = computed(() => {
  const context = document.createElement('canvas').getContext('2d');
  context.font = `12px ${yAxis.value ? getComputedStyle(yAxis.value).fontFamily : 'Arial'}`;
  return Math.max(...scale.value.ticks.map(tick => context.measureText(isCount.value ? fullAmount(tick) : shortAmount(tick)).width));
});
const yAxisWidth = computed(() => 41 + tickLabelWidth.value + 21 + 1);
const histogramWidth = ref(0);
const viewportWidth = computed(() => Math.max(0, histogramWidth.value - yAxisWidth.value - 21));
const fitMonths = computed(() => viewportWidth.value >= 520);
const shortMonths = ['Հնվ', 'Փտր', 'Մրտ', 'Ապր', 'Մյս', 'Հնս', 'Հլս', 'Օգս', 'Սպտ', 'Հկտ', 'Նյմ', 'Դկտ'];
let observer;
let observedContainer;
function observeViewport(element) {
  const container = element?.closest('.deals-histogram');
  if (container === observedContainer) return;
  observer?.disconnect();
  observedContainer = container;
  if (!container) return;
  histogramWidth.value = container.clientWidth;
  observer = new ResizeObserver(([entry]) => { histogramWidth.value = entry.contentRect.width; });
  observer.observe(container);
}
onBeforeUnmount(() => observer?.disconnect());
const moneyText = entry => `${fitMonths.value ? shortAmount(entry.amount) : fullAmount(entry.amount)} ֏`;
const moneyParts = entry => fitMonths.value && Number(entry.amount) >= 1000
  ? [shortAmount(entry.amount).split(' ')[0], ` ${shortAmount(entry.amount).split(' ').slice(1).join(' ')} ֏`]
  : [moneyText(entry)];
const barText = entry => isCount.value ? String(entry.count) : moneyText(entry);
const barParts = entry => isCount.value ? [String(entry.count)] : moneyParts(entry);
const footerParts = entry => [mode.value === 'months' || !fitMonths.value ? `${entry.count} գործարք` : `${entry.count} բն.`];
const categoryWidth = computed(() => Math.max(96, ...categories.value.map(entry =>
  Math.max(barText(entry).length * 8, label(entry).length * 12) + 24)));
const width = computed(() => fitMonths.value ? viewportWidth.value
  : Math.max(820, viewportWidth.value, categories.value.length * categoryWidth.value + 20));
const step = computed(() => (width.value - 20) / Math.max(1, categories.value.length));
const barWidth = computed(() => comparing.value ? Math.min(28, step.value * .26) : fitMonths.value ? Math.min(56, step.value * .6) : 56);
const barCenter = index => (index + 0.5) * step.value;
const currentCenter = index => barCenter(index) - (comparing.value ? (barWidth.value + 4) / 2 : 0);
const previousCenter = index => barCenter(index) + (barWidth.value + 4) / 2;
const amountWidth = computed(() => comparing.value ? step.value / 2 - 6 : step.value - 8);
const barHeight = entry => Number(isCount.value ? entry.count : entry.amount) / Number(scale.value.maximum) * 260;
const segmentY = segment => 310 - Number(segment.end) / Number(scale.value.maximum) * 260;
const segmentHeight = segment => Number(segment.amount) / Number(scale.value.maximum) * 260;
const segmentText = (entry, segment) => `${label(entry)} · ${segment.room} սենյակ · ${fullAmount(segment.amount)} ֏ · ${segment.count} բնակարան`;
const tooltip = ref(null);
let activeSegment;
const hideTooltip = () => { tooltip.value = null; activeSegment = null; };
function leaveTooltip(event) {
  if (event.pointerType === 'touch' || event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement)) return;
  if (activeSegment && event.currentTarget.contains(activeSegment)) hideTooltip();
}
function positionTooltip() {
  if (!activeSegment || !tooltip.value) return;
  const box = activeSegment.getBoundingClientRect();
  const tooltipWidth = Math.min(300, window.innerWidth - 24);
  tooltip.value = { ...tooltip.value, width: tooltipWidth,
    left: Math.max(12, Math.min(box.x, window.innerWidth - tooltipWidth - 12)),
    top: Math.max(12, Math.min(box.y - 80, window.innerHeight - 100)) };
}
onMounted(() => {
  window.addEventListener('scroll', positionTooltip, true);
  window.addEventListener('resize', positionTooltip);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', positionTooltip, true);
  window.removeEventListener('resize', positionTooltip);
});
function showSegment(event, entry, segment) {
  activeSegment = event.currentTarget;
  tooltip.value = { text: segmentText(entry, segment) };
  positionTooltip();
}
const countText = entry => `${label(entry)} · ${entry.count} բնակարան · ${fullAmount(entry.amount)} ֏`;
const previousPeriod = entry => `Համեմատություն՝ ${kpi.rangeText(entry.ranges) || 'Տվյալներ չկան'}`;
const previousText = entry => `${previousPeriod(entry)} · ${entry.count} գործարք · ${fullAmount(entry.amount)} ֏`;
function showPrevious(event, entry, segment) {
  activeSegment = event.currentTarget;
  tooltip.value = { text: segment ? `${previousPeriod(entry)} · ${segment.room} սենյակ · ${fullAmount(segment.amount)} ֏ · ${segment.count} բնակարան` : previousText(entry) };
  positionTooltip();
}
function showCount(event, entry) {
  if (mode.value === 'rooms') return;
  activeSegment = event.currentTarget;
  tooltip.value = { text: countText(entry) };
  positionTooltip();
}
// A native date blur can reapply identical filters while a chart mark receives
// focus. Keep its tooltip unless the displayed data actually changed.
watch([() => JSON.stringify(categories.value), () => comparing.value ? JSON.stringify(previous.value) : null,
  comparing, () => props.loading, () => props.failed], hideTooltip);
</script>

<template>
  <section class="deals-histogram" :class="{ 'histogram-wide': wide }" aria-label="Գործարքների հիստոգրամ">
    <div class="histogram-controls">
      <h2>Ցուցադրություն</h2>
      <div role="group" aria-label="Խմբավորում" class="histogram-modes">
        <button v-for="[item, title, icon] in modes" :key="item" type="button"
          :aria-pressed="mode === item" :disabled="loading || failed" @click="mode = item">
          <span>{{ title }}</span><img :src="icon" alt="" width="40" height="40" />
        </button>
      </div>
    </div>
    <div class="histogram-graph-toolbar">
      <p class="histogram-axis">Y · {{ yTitle }} · {{ year }}</p>
      <label class="histogram-comparison-toggle"><input v-model="compare" type="checkbox"
        aria-label="Ցուցադրել համեմատական հիստոգրամը" :disabled="loading || failed || !canCompare"
        :title="!canCompare ? 'Համեմատության համար ընտրեք համեմատելի ժամանակահատված' : undefined">Համեմատել</label>
    </div>
    <p v-if="loading" role="status" class="histogram-status">Տվյալները բեռնվում են…</p>
    <p v-else-if="failed" role="status" class="histogram-status">Տվյալներն անհասանելի են։</p>
    <template v-else>
      <div v-if="data" class="histogram-kpi" aria-live="polite">
        <template v-if="mode !== 'rooms'">
        <p class="histogram-kpi-value" data-testid="histogram-kpi-value">{{ isCount ? kpi.valueText(data.current.count, 'count') : kpi.fullKpiAmount(data.current.amount) }}</p>
        <h3>{{ isCount ? 'բնակարան' : 'ընդհանուր արժեք' }}</h3>
        <p v-if="change" class="histogram-kpi-change" data-testid="histogram-kpi-change">
          <span>{{ change.direction === 'up' ? '+' : '' }}{{ kpi.valueText(change.delta, metric) }}</span>
          <span :class="`kpi-${change.direction}`"><span v-if="change.direction !== 'flat'" class="histogram-change-arrow">{{ change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : '' }}</span> {{ change.percentage ?? '—' }}</span>
        </p>
        <p v-else-if="period === 'custom'">Համեմատության համար նշեք երկու ամսաթվերը։</p>
        </template>
        <ul v-else class="histogram-legend" aria-label="Սենյակների քանակ">
          <li v-for="room in stacked.rooms" :key="room"><i :style="{ background: roomColor(room) }" aria-hidden="true"></i>{{ room }} սենյակ</li>
        </ul>
      </div>
      <p v-if="!totalCount && (!comparing || previous.every(entry => !entry.count))" role="status" class="histogram-empty">Տվյալներ չկան</p>
      <div v-if="data" class="histogram-year-legend" aria-label="Համեմատվող ժամանակահատվածներ">
        <span><i></i>Ընտրված՝ {{ kpi.rangeText(data.ranges.current) || 'Տվյալներ չկան' }}</span>
        <span v-if="comparing"><i class="previous-year-marker"></i>Համեմատություն՝ {{ kpi.rangeText(data.ranges.previous) }}</span>
      </div>
      <div class="histogram-plot" :style="plotStyle">
        <svg ref="yAxis" class="histogram-y-axis" data-testid="histogram-y-axis" :viewBox="`0 0 ${yAxisWidth} 380`" :width="yAxisWidth" :style="{ flexBasis: `${yAxisWidth}px` }" height="380" role="img" :aria-label="yTitle">
          <g v-for="(tick, index) in scale.ticks" :key="index" data-testid="y-tick">
            <text :x="41 + tickLabelWidth" :y="tickY(index) + 5" text-anchor="end" font-size="12" fill="var(--muted)">{{ isCount ? fullAmount(tick) : shortAmount(tick) }}</text>
          </g>
          <line :x1="yAxisWidth - .5" :x2="yAxisWidth - .5" y1="310" y2="50" stroke="var(--control-border)" />
        </svg>
        <div :ref="observeViewport" class="histogram-scroll" aria-label="Գծապատկերի տարածք" tabindex="0">
        <svg :viewBox="`0 0 ${width} 380`" :style="{ minWidth: `${width}px` }" role="group" :aria-label="axisTitle">
          <line v-for="(_, index) in scale.ticks" :key="index" x1="0" :x2="width - 20"
            :y1="tickY(index)" :y2="tickY(index)"
            :stroke="index === 0 ? 'var(--control-border)' : 'var(--border)'" :stroke-dasharray="index === 0 ? undefined : '4 4'" />
          <g v-for="(entry, index) in categories" :key="entry.category" class="chart-column"
            :role="mode === 'rooms' ? 'group' : isCount ? 'button' : 'img'" :tabindex="mode !== 'rooms' ? 0 : undefined"
            :aria-label="isCount ? countText(entry) : `${label(entry)}՝ ${fullAmount(entry.amount)} AMD, ${entry.count} գործարք`"
            @focus="showCount($event, entry)" @blur="hideTooltip" @click="showCount($event, entry)"
            @pointerenter="event => { if (event.pointerType !== 'touch') showCount(event, entry); }"
            @pointerleave="leaveTooltip"
            @keydown.enter.prevent="showCount($event, entry)" @keydown.space.prevent="showCount($event, entry)" @keydown.esc="hideTooltip">
            <template v-if="mode === 'rooms'">
              <rect v-for="segment in entry.segments" :key="segment.room" role="button" tabindex="0"
                :aria-label="segmentText(entry, segment)"
                :x="currentCenter(index) - barWidth / 2" :y="segmentY(segment)" :width="barWidth" :height="segmentHeight(segment)" :fill="roomColor(segment.room)"
                stroke="white" stroke-width="1.5" paint-order="stroke fill"
                @pointerenter="event => { if (event.pointerType !== 'touch') showSegment(event, entry, segment); }"
                @pointerleave="leaveTooltip" @focus="showSegment($event, entry, segment)" @blur="hideTooltip"
                @click="showSegment($event, entry, segment)" @keydown.enter.prevent="showSegment($event, entry, segment)"
                @keydown.space.prevent="showSegment($event, entry, segment)" @keydown.esc="tooltip = null" />
            </template>
            <rect v-else :x="currentCenter(index) - barWidth / 2" :y="310 - barHeight(entry)" :width="barWidth" :height="barHeight(entry)" rx="4" fill="var(--brand)" />
            <text :x="currentCenter(index)" :y="(barParts(entry).length > 1 ? 284 : 298) - barHeight(entry)" text-anchor="middle" :font-size="comparing ? 12 : 14" fill="var(--brand-strong)" data-testid="bar-amount"><tspan v-for="(part, row) in barParts(entry)" :key="row" :x="currentCenter(index)" :dy="row ? 14 : 0" :textLength="fitMonths && part.length * 7 > amountWidth ? amountWidth : undefined" lengthAdjust="spacingAndGlyphs">{{ part }}</tspan></text>
            <text :x="barCenter(index)" y="338" text-anchor="middle" font-size="12" fill="var(--muted)" data-testid="bar-month">{{ fitMonths ? shortMonths[entry.category - 1] : label(entry) }}</text>
            <text v-if="!isCount" :x="barCenter(index)" y="358" text-anchor="middle" font-size="12" fill="var(--muted)" data-testid="bar-count"><tspan v-for="(part, row) in footerParts(entry)" :key="row" :x="barCenter(index)" :dy="row ? 14 : 0" :textLength="fitMonths && part.length * 6 > step - 8 ? step - 8 : undefined" lengthAdjust="spacingAndGlyphs">{{ part }}</tspan></text>
          </g>
          <g v-for="(entry, index) in comparing ? previous : []" :key="`previous-${entry.category}`" class="comparison-column" role="group" tabindex="0"
            :aria-label="previousText(entry)" @focus="showPrevious($event, entry)" @blur="hideTooltip"
            @click="showPrevious($event, entry)" @keydown.enter.prevent="showPrevious($event, entry)" @keydown.space.prevent="showPrevious($event, entry)" @keydown.esc="hideTooltip"
            @pointerenter="event => { if (event.pointerType !== 'touch') showPrevious(event, entry); }"
            @pointerleave="leaveTooltip">
            <template v-if="mode === 'rooms'">
              <rect v-for="segment in entry.segments" :key="segment.room" role="button" tabindex="0"
                :aria-label="`${previousPeriod(entry)} · ${segment.room} սենյակ · ${fullAmount(segment.amount)} ֏ · ${segment.count} բնակարան`" :x="previousCenter(index) - barWidth / 2" :y="segmentY(segment)"
                :width="barWidth" :height="segmentHeight(segment)" :fill="roomColor(segment.room)" fill-opacity=".4" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 2"
                @focus.stop="showPrevious($event, entry, segment)" @blur="hideTooltip"
                @pointerenter.stop="event => { if (event.pointerType !== 'touch') showPrevious(event, entry, segment); }"
                @click.stop="showPrevious($event, entry, segment)" @keydown.enter.stop.prevent="showPrevious($event, entry, segment)"
                @keydown.space.stop.prevent="showPrevious($event, entry, segment)" @keydown.esc.stop="hideTooltip" />
            </template>
            <rect v-else :x="previousCenter(index) - barWidth / 2" :y="310 - barHeight(entry)" :width="barWidth" :height="barHeight(entry)" rx="4"
              fill="var(--ink)" fill-opacity=".35" stroke="var(--ink)" stroke-dasharray="3 2" />
            <text :x="previousCenter(index)" :y="(barParts(entry).length > 1 ? 284 : 298) - barHeight(entry)" text-anchor="middle" font-size="12"
              fill="var(--muted)" data-testid="comparison-amount"><tspan v-for="(part, row) in barParts(entry)" :key="row" :x="previousCenter(index)" :dy="row ? 14 : 0"
                :textLength="fitMonths && part.length * 6 > amountWidth ? amountWidth : undefined" lengthAdjust="spacingAndGlyphs">{{ part }}</tspan></text>
          </g>
        </svg>
        </div>
      </div>
      <p v-if="tooltip" id="histogram-tooltip" role="tooltip" class="histogram-tooltip"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px`, width: `${tooltip.width}px` }">{{ tooltip.text }}</p>
      <div class="histogram-summary">
        <p aria-live="polite" data-testid="total-count">Գործարքների քանակ՝ {{ totalCount }}</p>
        <p>{{ axisTitle }} · Գործարքների քանակ · X</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.deals-histogram { position: relative; width: 100%; margin: var(--section-gap, 24px) auto 0; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
.histogram-wide { width: 100%; }
.histogram-controls { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px 12px; border-bottom: 1px solid var(--brand-tint); }
.histogram-controls h2, .histogram-axis { font-size: 14px; font-weight: 500; color: var(--muted); }
.histogram-controls h2 { text-align: center; }
.histogram-graph-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 24px 20px 0; }
.histogram-comparison-toggle { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; color: var(--muted); font-size: 14px; cursor: pointer; }
.histogram-comparison-toggle input { width: 16px; height: 16px; accent-color: var(--brand-strong); }
.histogram-year-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; padding: 16px 20px 0; font-size: 14px; color: var(--muted); }
.histogram-year-legend span { display: flex; align-items: center; gap: 6px; }
.histogram-year-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 2px; background: var(--brand); }
.histogram-year-legend .previous-year-marker { background: #1d283e59; border: 1px dashed var(--ink); }
.histogram-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: min(100%, 720px); padding: 4px; border-radius: 12px; background: var(--brand-tint); }
.histogram-modes button { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; min-width: 0; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #000; overflow-wrap: anywhere; }
.histogram-modes button img { flex: 0 0 40px; width: 40px; height: 40px; object-fit: contain; filter: brightness(0); opacity: .55; }
.histogram-modes button[aria-pressed="true"] { background: white; color: #000; box-shadow: 0 1px 3px #1d283e1a; }
.histogram-modes button:disabled { opacity: .5; }
.histogram-axis { min-width: 0; }
.histogram-kpi { height: 135px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 0; padding: 20px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; text-align: center; }
.histogram-kpi > p, .histogram-kpi h3 { line-height: 1.5; }
.histogram-kpi h3 { color: var(--ink); font-size: 14px; font-weight: 600; }
.histogram-kpi .histogram-kpi-value { color: var(--ink); font-size: 28px; font-weight: 700; margin: 0; }
.histogram-kpi-change { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; font-size: 16px; font-weight: 600; margin: 8px 0 0; }
.histogram-change-arrow { display: inline-block; transform: scaleY(.85); transform-origin: center; }
.histogram-plot { display: flex; align-items: flex-start; padding: 16px 8px 0; }
.histogram-y-axis { flex: 0 0 100px; background: white; }
.histogram-scroll { flex: 1; min-width: 0; overflow-x: auto; }
.histogram-scroll svg { display: block; width: 100%; }
.chart-column:focus { outline: none; }
.comparison-column:focus, .comparison-column rect:focus { outline: none; }
.comparison-column { cursor: pointer; }
.comparison-column:focus-visible, .comparison-column rect:focus-visible { filter: brightness(.85); }
.chart-column rect[role="button"] { cursor: pointer; }
.chart-column rect:focus { outline: none; }
.chart-column:focus-visible, .chart-column rect:focus-visible { filter: brightness(.85); }
.histogram-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 20px; margin: auto; font-size: 12px; color: var(--muted); }
.histogram-legend li { display: flex; align-items: center; gap: 6px; }
.histogram-legend i { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
.histogram-tooltip { position: fixed; z-index: 20; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: white; box-shadow: 0 4px 16px #1d283e26; color: var(--ink); font-size: 12px; pointer-events: none; }
.histogram-status { display: grid; min-height: 380px; place-items: center; padding: 24px; color: var(--muted); text-align: center; }
.histogram-empty { position: absolute; left: 0; right: 0; margin-top: 8px; text-align: center; color: var(--muted); }
.histogram-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 20px; font-size: 14px; color: var(--muted); }
@media (min-width: 640px) { .histogram-modes button { font-size: 14px; } }
@media (max-width: 639px) { .histogram-modes { grid-template-columns: minmax(0, 1fr); width: min(100%, 360px); } }
</style>
