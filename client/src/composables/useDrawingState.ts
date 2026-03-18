import { reactive } from "vue";
import type { ToolType } from "../canvas/drawing.ts";

export type RGBA = [number, number, number, number];

interface DrawingState {
  tool: ToolType;
  foregroundColor: RGBA;
  backgroundColor: RGBA;
  brushSize: number;
  recentColors: RGBA[];
}

const state = reactive<DrawingState>({
  tool: "pencil",
  foregroundColor: [0, 0, 0, 255],
  backgroundColor: [255, 255, 255, 255],
  brushSize: 1,
  recentColors: [],
});

export function useDrawingState() {
  function setTool(tool: ToolType) {
    state.tool = tool;
  }

  function setForegroundColor(color: RGBA) {
    state.foregroundColor = color;
  }

  function setBackgroundColor(color: RGBA) {
    state.backgroundColor = color;
  }

  function setBrushSize(size: number) {
    state.brushSize = size;
  }

  function swapColors() {
    const tmp = state.foregroundColor;
    state.foregroundColor = state.backgroundColor;
    state.backgroundColor = tmp;
  }

  function addRecentColor(color: RGBA) {
    const idx = state.recentColors.findIndex(
      (c) =>
        c[0] === color[0] &&
        c[1] === color[1] &&
        c[2] === color[2] &&
        c[3] === color[3],
    );
    if (idx !== -1) state.recentColors.splice(idx, 1);
    state.recentColors.unshift([...color] as RGBA);
    if (state.recentColors.length > 16) state.recentColors.pop();
  }

  return {
    state,
    setTool,
    setForegroundColor,
    setBackgroundColor,
    setBrushSize,
    swapColors,
    addRecentColor,
  };
}
