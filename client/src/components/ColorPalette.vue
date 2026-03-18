<script setup lang="ts">
import { ArrowRightLeft, ChevronDown } from "lucide-vue-next";
import PxlButton from "./ui/PxlButton.vue";
import ColorSwatch from "./ui/ColorSwatch.vue";
import { useDrawingState } from "../composables/useDrawingState.ts";
import type { RGBA } from "../composables/useDrawingState.ts";

const { state, swapColors, setForegroundColor } = useDrawingState();

const emptyColor: RGBA = [34, 34, 34, 255];

function selectRecentColor(index: number) {
  if (index < state.recentColors.length) {
    setForegroundColor([...state.recentColors[index]] as RGBA);
  }
}

function recentColorAt(index: number): RGBA {
  return index < state.recentColors.length
    ? state.recentColors[index]
    : emptyColor;
}
</script>

<template>
  <div class="pxl-panel pxl-palette">
    <ColorSwatch :color="state.foregroundColor" variant="fg" />
    <ColorSwatch :color="state.backgroundColor" variant="bg" />

    <PxlButton small class="pxl-swap-btn" @click="swapColors">
      <ArrowRightLeft :size="14" :stroke-width="2" />
    </PxlButton>

    <span class="recent-label">Recent</span>

    <div class="pxl-recent-colors">
      <ColorSwatch
        v-for="i in 16"
        :key="i"
        :color="recentColorAt(i - 1)"
        variant="recent"
        @click="selectRecentColor(i - 1)"
      />
    </div>

    <PxlButton small class="pxl-more-btn">
      <ChevronDown :size="16" :stroke-width="2" />
    </PxlButton>
  </div>
</template>

<style scoped>
.pxl-palette {
  position: fixed;
  top: 52px;
  right: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--ui-bg);
  border-radius: var(--ui-panel-radius) 0 0 var(--ui-panel-radius);
  border-left: 1px solid var(--ui-border);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  width: 88px;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  color: var(--ui-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
}

.pxl-swap-btn {
  min-width: 32px;
  min-height: 32px;
  font-size: 14px;
  margin-top: -6px;
}

.recent-label {
  font-size: 10px;
  color: var(--ui-text-muted);
  margin-top: 4px;
}

.pxl-recent-colors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: 100%;
}

.pxl-more-btn {
  font-size: 12px;
  min-height: 32px;
  width: 100%;
}
</style>
