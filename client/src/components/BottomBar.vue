<script setup lang="ts">
import { Undo2, Redo2, Grid3x3 } from "lucide-vue-next";
import PxlButton from "./ui/PxlButton.vue";
import { useEditorState } from "../composables/useEditorState.ts";

const { state: editorState, toggleGrid } = useEditorState();

const emit = defineEmits<{
  undo: [];
  redo: [];
  zoomPreset: [scale: number];
}>();

const zoomScales = [1, 2, 4, 8, 16];
</script>

<template>
  <div class="pxl-panel pxl-bottom-bar">
    <PxlButton small @click="emit('undo')">
      <Undo2 :size="18" :stroke-width="2" />
    </PxlButton>

    <PxlButton small @click="emit('redo')">
      <Redo2 :size="18" :stroke-width="2" />
    </PxlButton>

    <div class="pxl-separator" />

    <PxlButton
      small
      :active="editorState.gridVisible"
      title="Toggle grid"
      @click="toggleGrid"
    >
      <Grid3x3 :size="18" :stroke-width="2" />
    </PxlButton>

    <div class="pxl-separator" />

    <PxlButton
      v-for="scale in zoomScales"
      :key="scale"
      small
      class="zoom-btn"
      @click="emit('zoomPreset', scale)"
    >
      {{ scale }}x
    </PxlButton>

    <div class="pxl-info">
      <span>{{ editorState.cursorX }}, {{ editorState.cursorY }}</span>
      <span>Zoom: {{ editorState.zoomLevel }}%</span>
    </div>
  </div>
</template>

<style scoped>
.pxl-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 44px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: var(--ui-bg);
  border-top: 1px solid var(--ui-border);
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  color: var(--ui-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  font-size: 13px;
}

.pxl-separator {
  width: 1px;
  height: 24px;
  background: var(--ui-border);
  margin: 0 4px;
}

.zoom-btn {
  font-size: 12px;
}

.pxl-info {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--ui-text-muted);
  white-space: nowrap;
}
</style>
