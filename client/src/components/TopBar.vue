<script setup lang="ts">
import { Menu, Settings } from "lucide-vue-next";
import PxlButton from "./ui/PxlButton.vue";
import { useEditorState } from "../composables/useEditorState.ts";
import { useDrawingState } from "../composables/useDrawingState.ts";

const { state: editorState } = useEditorState();
const { state: drawingState, setBrushSize } = useDrawingState();

const brushSizes = [1, 2, 3, 5];
</script>

<template>
  <div class="pxl-panel pxl-top-bar">
    <PxlButton>
      <Menu :size="20" :stroke-width="2" />
    </PxlButton>

    <span class="pxl-sprite-name">{{ editorState.spriteName }}</span>

    <span
      class="pxl-status-indicator"
      :style="{
        backgroundColor: editorState.isConnected
          ? 'rgba(34,139,34,0.75)'
          : 'rgba(180,30,30,0.75)',
      }"
    >
      {{ editorState.connectionStatus }}
    </span>

    <div class="pxl-context-bar">
      <span>Size:</span>
      <PxlButton
        v-for="size in brushSizes"
        :key="size"
        small
        class="pxl-size-btn"
        :active="drawingState.brushSize === size"
        @click="setBrushSize(size)"
      >
        {{ size }}px
      </PxlButton>
    </div>

    <PxlButton>
      <Settings :size="20" :stroke-width="2" />
    </PxlButton>
  </div>
</template>

<style scoped>
.pxl-top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border);
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  color: var(--ui-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  font-size: 13px;
}

.pxl-sprite-name {
  font-size: 13px;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.pxl-status-indicator {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 3px;
  white-space: nowrap;
  color: #fff;
}

.pxl-context-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  margin-right: 8px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.pxl-size-btn {
  min-width: 36px;
  min-height: 32px;
  font-size: 12px;
}
</style>
