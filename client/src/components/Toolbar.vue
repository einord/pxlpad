<script setup lang="ts">
import { Pencil, Eraser, Pipette, PaintBucket } from "lucide-vue-next";
import PxlButton from "./ui/PxlButton.vue";
import { useDrawingState } from "../composables/useDrawingState.ts";
import type { ToolType } from "../canvas/drawing.ts";

const { state, setTool } = useDrawingState();

const tools: Array<{ id: ToolType; icon: typeof Pencil; label: string }> = [
  { id: "pencil", icon: Pencil, label: "Pencil" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper" },
  { id: "fill", icon: PaintBucket, label: "Fill" },
];
</script>

<template>
  <div class="pxl-panel pxl-toolbar">
    <PxlButton
      v-for="tool in tools"
      :key="tool.id"
      :active="state.tool === tool.id"
      :title="tool.label"
      @click="setTool(tool.id)"
    >
      <component :is="tool.icon" :size="20" :stroke-width="2" />
    </PxlButton>
  </div>
</template>

<style scoped>
.pxl-toolbar {
  position: fixed;
  top: 52px;
  left: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--ui-bg);
  border-radius: 0 var(--ui-panel-radius) var(--ui-panel-radius) 0;
  border-right: 1px solid var(--ui-border);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
}
</style>
