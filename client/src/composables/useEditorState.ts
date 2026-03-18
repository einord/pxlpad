import { reactive } from "vue";

interface EditorState {
  spriteName: string;
  cursorX: number;
  cursorY: number;
  zoomLevel: number;
  gridVisible: boolean;
  connectionStatus: string;
  isConnected: boolean;
}

const state = reactive<EditorState>({
  spriteName: "untitled.ase",
  cursorX: 0,
  cursorY: 0,
  zoomLevel: 100,
  gridVisible: false,
  connectionStatus: "Disconnected",
  isConnected: false,
});

export function useEditorState() {
  function setSpriteName(name: string) {
    state.spriteName = name;
  }

  function setCursorPosition(x: number, y: number) {
    state.cursorX = x;
    state.cursorY = y;
  }

  function setZoomLevel(percent: number) {
    state.zoomLevel = Math.round(percent);
  }

  function toggleGrid() {
    state.gridVisible = !state.gridVisible;
  }

  function setStatus(text: string, connected: boolean) {
    state.connectionStatus = text;
    state.isConnected = connected;
  }

  return {
    state,
    setSpriteName,
    setCursorPosition,
    setZoomLevel,
    toggleGrid,
    setStatus,
  };
}
