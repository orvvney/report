<script setup>
import { computed, onMounted, ref, useId, watch } from 'vue';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from '@lucide/vue';
import buildingIcon from '../../images/building.avif';
import parkingIcon from '../../images/parking.avif';
const props = defineProps({ parking: Boolean, expo: Boolean });
const emit = defineEmits(['expired']);
const helpId = useId();
const headingId = useId();
const helpOpen = ref(false);
const inProgressLabel = ref(null);
function setInProgressLabel(element) { inProgressLabel.value = element; }
watch(inProgressLabel, (label, _, onCleanup) => {
  if (!label) return;
  const range = document.createRange();
  range.selectNodeContents(label);
  function alignDot() {
    const lines = [...range.getClientRects()];
    if (!lines.length) return;
    const left = Math.min(...lines.map(line => line.left));
    label.parentElement.style.setProperty('--stage-dot-offset', `${left - label.getBoundingClientRect().left}px`);
  }
  const observer = new ResizeObserver(alignDot);
  observer.observe(label);
  alignDot();
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });
const stages = ref(null), loading = ref(true), failed = ref(false);
const expoStages = ref(null);
const periods = computed(() => props.expo
  ? [{ label: 'Առաջ', rows: stages.value }, { label: 'Հետո', rows: expoStages.value }]
  : [{ label: null, rows: stages.value }]);
const changes = computed(() => props.expo && expoStages.value
  ? stages.value.map(({ count }, index) => {
    const after = expoStages.value[index].count;
    return count == null || after == null ? null : after - count;
  }) : []);
const numberFormat = new Intl.NumberFormat('hy-AM', { signDisplay: 'exceptZero' });
const signedPercent = new Intl.NumberFormat('hy-AM', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
const withMinus = value => value.replace('-', '−');
function changeLabel(change, before) {
  const ratio = before > 0 ? change / before : change === 0 ? 0 : null;
  return `${withMinus(numberFormat.format(change))} (${ratio === null ? '—' : withMinus(signedPercent.format(ratio))})`;
}
const afterTotal = computed(() => expoStages.value?.reduce((sum, stage) => sum + Math.max(0, stage.count ?? 0), 0) ?? 0);
const expoTotal = computed(() => expoStages.value?.some(stage => stage.count != null)
  ? expoStages.value.reduce((sum, stage) => sum + (stage.count ?? 0), 0) : '—');
function afterShare(count) {
  return afterTotal.value ? Math.max(0, count) / afterTotal.value : 0;
}
const total = computed(() => stages.value?.reduce((sum, stage) => sum + stage.count, 0) ?? 0);
const expoBeforeTotal = computed(() => stages.value?.some(stage => stage.count != null) ? total.value : '—');
const percentFormat = new Intl.NumberFormat('hy-AM', { style: 'percent', maximumFractionDigits: 1 });
function share(count) {
  return percentFormat.format(total.value ? count / total.value : 0);
}
const activeSegment = ref(null);
function showSegment(stage, period, event) {
  const segment = event.currentTarget;
  activeSegment.value = { stage, period, center: segment.offsetLeft + segment.offsetWidth / 2 };
}
let revision = 0;
async function refresh(force = true) {
  const current = ++revision;
  activeSegment.value = null;
  loading.value = true;
  failed.value = false;
  try {
    const endpoint = props.expo ? '/api/expo-stages' : props.parking ? '/api/parking-stages' : '/api/property-stages';
    const response = await fetch(`${endpoint}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (current !== revision) return;
    if (response.status === 401) { emit('expired'); return; }
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (current === revision) {
      stages.value = data.stages;
      expoStages.value = data.after;
    }
  } catch { if (current === revision) failed.value = true; }
  finally { if (current === revision) loading.value = false; }
}
onMounted(() => refresh(false));
function resetView() {
  activeSegment.value = null;
  helpOpen.value = false;
}
defineExpose({ refresh, resetView });
</script>
<template>
  <Teleport v-for="floating in (expo ? [false] : [false, true])" :key="floating" :to="expo ? 'body' : '#floating-property-stages'" defer :disabled="!floating">
    <section class="property-stages" :aria-labelledby="expo ? headingId : undefined"
      :aria-label="expo ? undefined : parking ? 'Կայանատեղիներն ըստ փուլերի' : 'Բնակարաններն ըստ փուլերի'"
      :aria-busy="loading" :tabindex="floating ? 0 : undefined">
      <div class="property-stages-header" :class="{ 'expo-stages-header': expo }">
        <div class="filter-title property-stages-heading" @mouseleave="helpOpen = false" @keydown.esc="helpOpen = false">
          <h2 :id="expo ? headingId : undefined">
            <img :src="parking ? parkingIcon : buildingIcon" alt="" width="20" height="20" />
            <template v-if="expo">
              <span class="desktop-text">Տուն Էքսպոյից առաջ ու հետո</span>
              <span class="mobile-text">Առաջ ու հետո</span>
            </template>
            <span v-else>{{ parking ? 'Կայանատեղիներ' : 'Բնակարաններ' }}</span>
          </h2>
          <template v-if="!floating">
            <button type="button" class="filter-help" aria-label="Փուլերի մասին" :aria-describedby="helpId" :aria-expanded="helpOpen"
              @mouseenter="helpOpen = true" @focus="helpOpen = true" @blur="helpOpen = false" @click="helpOpen = true">i</button>
            <div v-show="helpOpen" :id="helpId" role="tooltip" class="filter-help-tooltip">
              {{ expo ? 'Այս բաժինը նախատեսված է բնակարանների քանակը Տուն Էքսպոյից առաջ ու հետո յուրաքանչյուր փուլում դիտելու համար:' : parking ? 'Այս բաժինը նախատեսված է կայանատեղիների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:' : 'Այս բաժինը նախատեսված է բնակարանների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:' }}
            </div>
          </template>
        </div>
        <p v-if="!expo && stages && !loading && !failed" class="property-stages-total">Ընդհանուր՝ <strong>{{ total }}</strong></p>
        <p v-if="expo && expoStages && !loading && !failed" class="property-stages-total">
          Ընդհանուր՝ <strong class="expo-total-values"><span>{{ expoBeforeTotal }}</span>
            <ArrowRight :size="14" aria-hidden="true" /><span class="sr-only"> → </span><span>{{ expoTotal }}</span>
          </strong>
        </p>
      </div>
      <p v-if="loading || failed" class="property-stages-status" role="status">{{ failed ? 'Տվյալներն անհասանելի են։' : 'Տվյալները բեռնվում են…' }}</p>
      <template v-else-if="stages">
        <div v-for="period in floating ? [] : periods" :key="period.label"
          class="property-stage-distribution" :class="{ 'expo-stage-distribution': expo }"
          :role="expo ? 'group' : undefined" :aria-label="period.label"
          @mouseleave="activeSegment = null" @keydown.esc="activeSegment = null">
          <p v-if="expo" class="expo-stage-value-label">{{ period.label }}</p>
          <div class="property-stage-track">
            <button v-for="stage in period.rows" v-show="stage.count > 0" :key="stage.id ?? stage.name"
              type="button" :style="{ flexGrow: stage.count }"
              :aria-label="expo ? `${stage.name}՝ ${stage.count}` : `${stage.name}՝ ${stage.count}, ${share(stage.count)}`"
              @mouseenter="showSegment(stage, period.label, $event)" @focus="showSegment(stage, period.label, $event)"
              @blur="activeSegment = null" @click="showSegment(stage, period.label, $event)"></button>
          </div>
          <div v-if="activeSegment && activeSegment.period === period.label"
            role="tooltip" class="filter-help-tooltip property-stage-segment-tooltip"
            :style="{ '--segment-center': `${activeSegment.center}px` }">
            {{ activeSegment.stage.name }}՝ {{ activeSegment.stage.count }}<template v-if="!expo">, {{ share(activeSegment.stage.count) }}</template>
          </div>
        </div>
        <div class="property-stages-row" :class="{ 'expo-stage-comparison-row': expo }">
          <article v-for="(card, index) in stages" :key="card.id ?? card.name">
            <div class="property-stage-card-stripe" aria-hidden="true"></div>
            <h3><span :ref="!expo && !floating && index === 2 ? setInProgressLabel : undefined">{{ card.name }}</span></h3>
            <div v-if="expo" class="expo-stage-values">
              <p class="property-stage-value expo-stage-result"><span class="sr-only">Հետո՝ </span>{{ expoStages[index].count ?? '—' }}</p>
              <p class="expo-stage-baseline">Առաջ՝ {{ card.count ?? '—' }}</p>
            </div>
            <p v-else class="property-stage-value">{{ card.count ?? '—' }} <span v-if="!floating && card.count != null" class="property-stage-share">{{ share(card.count) }}</span></p>
            <div v-if="expo && changes[index] != null" class="expo-stage-delta" role="group"
              :aria-label="`Փոփոխություն՝ ${changeLabel(changes[index], card.count)}`">
              <component :is="changes[index] > 0 ? ArrowUpRight : changes[index] < 0 ? ArrowDownRight : ArrowRight"
                :size="14" aria-hidden="true" />
              {{ changeLabel(changes[index], card.count) }}
            </div>
            <div v-if="expo" class="expo-stage-share">
              <p class="expo-stage-value-label">Մասնաբաժինը ընդհանուրում</p>
              <div class="expo-stage-share-row">
                <div class="expo-stage-share-track" :role="expoStages[index].count == null ? undefined : 'meter'"
                  :tabindex="card.count != null && total > 0 ? 0 : undefined"
                  :aria-label="expoStages[index].count == null ? undefined : 'Մասնաբաժինը ընդհանուրում'"
                  :aria-valuenow="expoStages[index].count == null ? undefined : 100 * afterShare(expoStages[index].count)"
                  :aria-valuetext="expoStages[index].count == null ? undefined : `Առաջ՝ ${share(card.count)}, Հետո՝ ${percentFormat.format(afterShare(expoStages[index].count))}`">
                  <span class="expo-stage-share-fill" :style="{ inlineSize: `${100 * afterShare(expoStages[index].count)}%` }"></span>
                  <span v-if="card.count != null && total > 0" class="expo-stage-share-marker"
                    :style="{ insetInlineStart: `${100 * card.count / total}%` }"></span>
                  <span v-if="card.count != null && total > 0" class="filter-help-tooltip expo-stage-share-tooltip" role="tooltip">
                    Նշագիծը ցույց է տալիս&nbsp;նախկին մասնաբաժինը՝ {{ share(card.count) }}
                  </span>
                </div>
                <span class="expo-stage-share-percent" aria-hidden="true">{{ expoStages[index].count == null ? '—' : percentFormat.format(afterShare(expoStages[index].count)) }}</span>
              </div>
            </div>
          </article>
        </div>
      </template>
    </section>
  </Teleport>
</template>
