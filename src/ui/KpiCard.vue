<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowUp, ArrowDown } from '@lucide/vue';
import kpi from '../report/kpi.cjs';
import KpiChart from './KpiChart.vue';
import buildingIcon from '../../images/building.png';
import walletIcon from '../../images/wallet.png';
const { valueText } = kpi;
const props = defineProps({
  wide: Boolean, metric: String, title: String, data: Object, period: String,
  loading: Boolean, failed: Boolean, resetRevision: Number,
});
const emit = defineEmits(['open']);
const openButton = ref(null);
function open() { if (!props.wide && !unavailable.value) { openButton.value?.focus(); emit('open', props.title, openButton.value); } }
function cardClick(event) {
  if (!event.target.closest('button, a, .kpi-chart')) open();
}
const type = ref('month'), expanded = ref(false);
const types = [['month', 'Ամիսներ'], ['quarter', 'Եռամսյակներ'], ['year', 'Տարիներ']];
const unavailable = computed(() => props.loading || props.failed || !props.data);
const rows = computed(() => props.data?.rankings[props.period === 'last-12' ? 'month' : type.value]?.[props.metric] || []);
const visibleRows = computed(() => expanded.value ? rows.value : rows.value.slice(0, 5));
const change = computed(() => props.data?.changes?.[props.metric]);
watch(() => props.data, () => { expanded.value = false; });
watch(() => props.resetRevision, () => { type.value = 'month'; expanded.value = false; });
function selectType(value) { type.value = value; expanded.value = false; }
</script>

<template>
  <section :tabindex="wide ? -1 : undefined" class="kpi-card" :class="{ 'kpi-clickable': !wide && !unavailable, 'kpi-balanced': wide && !data?.ranking }" :aria-labelledby="`kpi-${metric}-title`" :aria-busy="loading" :data-testid="`kpi-${metric}`" @click="cardClick">
    <div class="kpi-scroll" data-testid="kpi-scroll">
    <div class="kpi-heading"><h2 :id="`kpi-${metric}-title`">{{ title }}</h2>
      <img :src="metric === 'count' ? buildingIcon : walletIcon" alt="" width="40" height="40" />
    </div>
    <div aria-live="polite" aria-atomic="true">
      <p v-if="loading || (!data && !failed)" class="kpi-notice">Տվյալները բեռնվում են…</p>
      <p v-else-if="failed" class="kpi-notice">Տվյալներն անհասանելի են։</p>
      <template v-else>
        <div class="kpi-value-wrap">
          <span v-if="wide" class="kpi-value" data-testid="kpi-value">{{ metric === 'amount' ? kpi.fullKpiAmount(data.current[metric]) : valueText(data.current[metric], metric) }}</span>
          <button v-else ref="openButton" type="button" class="kpi-value" data-testid="kpi-value"
            :aria-label="`${title}՝ բացել գործարքները`"
            @click.stop="open">{{ valueText(data.current[metric], metric) }}</button>
        </div>
        <p v-if="change" class="kpi-change" data-testid="kpi-change">
          <span>{{ change.direction === 'up' ? '+' : '' }}{{ valueText(change.delta, metric) }}</span>
          <span :class="`kpi-${change.direction}`" class="kpi-percentage" data-testid="kpi-percentage"><component :is="change.direction === 'up' ? ArrowUp : ArrowDown" v-if="change.direction !== 'flat'" :size="wide ? 20.5 : 16" aria-hidden="true" />{{ change.percentage ?? '—' }}</span>
        </p>
        <p v-else-if="period === 'custom'" class="kpi-notice">Համեմատության համար նշեք երկու ամսաթվերը։</p>
      </template>
    </div>
    <template v-if="!unavailable">
      <KpiChart :balanced="wide && !data.ranking" :wide="wide" :series="data.series" :metric="metric" :title="title" :period="period" :ranges="data.ranges" />
      <template v-if="data.ranking">
        <div v-if="period === 'all'" class="kpi-types" role="group" :aria-label="`${title}՝ վարկանիշի ժամանակահատված`">
          <button v-for="[value, label] in types" :key="value" type="button" :aria-pressed="type === value" @click="selectType(value)">{{ label }}</button>
        </div>
        <ol v-if="rows.length" :id="`kpi-${metric}-ranking`" class="kpi-ranking" :aria-label="`${title}՝ վարկանիշ`">
          <li v-for="row in visibleRows" :key="row.start" :value="row.rank">
            <span class="kpi-rank" aria-hidden="true">{{ row.rank }}.</span>
            <span class="kpi-period">{{ row.label }}<span v-if="row.incomplete" class="kpi-incomplete">Ընթացիկ՝ ոչ ամբողջական</span></span>
            <span class="kpi-ranking-value">{{ valueText(row.value, metric) }}</span>
          </li>
        </ol>
        <p v-else class="kpi-notice">Տվյալներ չկան</p>
        <button v-if="rows.length > 5" type="button" class="kpi-expand" :aria-expanded="expanded" :aria-controls="`kpi-${metric}-ranking`"
          @click="expanded = !expanded">{{ expanded ? 'Թաքցնել' : 'Ցույց տալ բոլորը' }}</button>
      </template>
    </template>
    </div>
    <div v-if="wide && !unavailable" class="kpi-legend kpi-period-legend">
      <span><i class="kpi-line-0"></i>Ընտրված՝ {{ kpi.rangeText(data.ranges.current) || 'Տվյալներ չկան' }}</span>
      <span v-if="data.ranges.previous"><i class="kpi-line-1"></i>Համեմատություն՝ {{ kpi.rangeText(data.ranges.previous) }}</span>
    </div>
  </section>
</template>
