<script setup>
import { computed, onMounted, ref, useId, watch } from 'vue';
import buildingIcon from '../../images/building.avif';
import parkingIcon from '../../images/parking.avif';
const props = defineProps({ parking: Boolean });
const emit = defineEmits(['expired']);
const helpId = useId();
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
const total = computed(() => stages.value?.reduce((sum, stage) => sum + stage.count, 0) ?? 0);
const percentFormat = new Intl.NumberFormat('hy-AM', { style: 'percent', maximumFractionDigits: 1 });
function share(count) {
  return percentFormat.format(total.value ? count / total.value : 0);
}
const activeSegment = ref(null);
function showSegment(stage, event) {
  const segment = event.currentTarget;
  activeSegment.value = { stage, center: segment.offsetLeft + segment.offsetWidth / 2 };
}
let revision = 0;
async function refresh(force = true) {
  const current = ++revision;
  activeSegment.value = null;
  loading.value = true;
  failed.value = false;
  try {
    const endpoint = props.parking ? '/api/parking-stages' : '/api/property-stages';
    const response = await fetch(`${endpoint}${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
    if (current !== revision) return;
    if (response.status === 401) { emit('expired'); return; }
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (current === revision) stages.value = data.stages;
  } catch { if (current === revision) failed.value = true; }
  finally { if (current === revision) loading.value = false; }
}
onMounted(() => refresh(false));
defineExpose({ refresh });
</script>
<template>
  <Teleport v-for="floating in [false, true]" :key="floating" to="#floating-property-stages" defer :disabled="!floating">
    <section class="property-stages" :aria-label="parking ? 'Կայանատեղիներն ըստ փուլերի' : 'Բնակարաններն ըստ փուլերի'" :aria-busy="loading" :tabindex="floating ? 0 : undefined">
      <div class="property-stages-header">
        <div class="filter-title property-stages-heading" @mouseleave="helpOpen = false" @keydown.esc="helpOpen = false">
          <h2>
            <img :src="parking ? parkingIcon : buildingIcon" alt="" width="20" height="20" />
            <span>{{ parking ? 'Կայանատեղիներ' : 'Բնակարաններ' }}</span>
          </h2>
          <template v-if="!floating">
            <button type="button" class="filter-help" aria-label="Փուլերի մասին" :aria-describedby="helpId" :aria-expanded="helpOpen"
              @mouseenter="helpOpen = true" @focus="helpOpen = true" @blur="helpOpen = false" @click="helpOpen = true">i</button>
            <div v-show="helpOpen" :id="helpId" role="tooltip" class="filter-help-tooltip">
              {{ parking ? 'Այս բաժինը նախատեսված է կայանատեղիների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:' : 'Այս բաժինը նախատեսված է բնակարանների քանակն ու մասնաբաժինը յուրաքանչյուր փուլում դիտելու համար:' }}
            </div>
          </template>
        </div>
        <p v-if="stages && !loading && !failed" class="property-stages-total">Ընդհանուր <strong>{{ total }}</strong></p>
      </div>
      <p v-if="loading || failed" class="property-stages-status" role="status">{{ failed ? 'Տվյալներն անհասանելի են։' : 'Տվյալները բեռնվում են…' }}</p>
      <template v-else-if="stages">
        <div v-if="!floating" class="property-stage-distribution" @mouseleave="activeSegment = null" @keydown.esc="activeSegment = null">
          <div class="property-stage-track">
            <button v-for="stage in stages" v-show="stage.count > 0" :key="stage.name"
              type="button" :style="{ flexGrow: stage.count }" :aria-label="`${stage.name}՝ ${stage.count}, ${share(stage.count)}`"
              @mouseenter="showSegment(stage, $event)" @focus="showSegment(stage, $event)"
              @blur="activeSegment = null" @click="showSegment(stage, $event)"></button>
          </div>
          <div v-if="activeSegment" role="tooltip" class="filter-help-tooltip property-stage-segment-tooltip"
            :style="{ '--segment-center': `${activeSegment.center}px` }">
            {{ activeSegment.stage.name }}՝ {{ activeSegment.stage.count }}, {{ share(activeSegment.stage.count) }}
          </div>
        </div>
        <div class="property-stages-row">
          <article v-for="(card, index) in stages" :key="card.name">
            <h3><span :ref="!floating && index === 2 ? setInProgressLabel : undefined">{{ card.name }}</span></h3>
            <p class="property-stage-value">{{ card.count }} <span v-if="!floating" class="property-stage-share">{{ share(card.count) }}</span></p>
          </article>
        </div>
      </template>
    </section>
  </Teleport>
</template>
