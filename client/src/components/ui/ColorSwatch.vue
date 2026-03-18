<script setup lang="ts">
import { computed } from "vue";
import type { RGBA } from "../../composables/useDrawingState.ts";

const props = defineProps<{
  color: RGBA;
  variant?: "fg" | "bg" | "recent";
}>();

defineEmits<{
  click: [];
}>();

const cssColor = computed(() => {
  const [r, g, b, a] = props.color;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
});
</script>

<template>
  <div
    class="pxl-color-swatch"
    :class="variant"
    :style="{ backgroundColor: cssColor }"
    @click="$emit('click')"
  />
</template>

<style scoped>
.pxl-color-swatch {
  width: 44px;
  height: 44px;
  border: 2px solid var(--ui-border);
  border-radius: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pxl-color-swatch.fg {
  width: 48px;
  height: 48px;
  border-color: var(--ui-text);
}

.pxl-color-swatch.bg {
  width: 40px;
  height: 40px;
  margin-top: -12px;
  margin-left: 16px;
}

.pxl-color-swatch.recent {
  width: 100%;
  aspect-ratio: 1;
  border-width: 1px;
  border-radius: 2px;
  height: auto;
}
</style>
