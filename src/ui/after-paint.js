import { nextTick } from 'vue';
export async function afterPaint() {
  await nextTick();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
