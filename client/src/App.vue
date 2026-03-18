<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Sprite,
  Texture,
  BufferImageSource,
} from "pixi.js";
import type { Viewport } from "pixi-viewport";

import TopBar from "./components/TopBar.vue";
import Toolbar from "./components/Toolbar.vue";
import ColorPalette from "./components/ColorPalette.vue";
import BottomBar from "./components/BottomBar.vue";

import { createApp, setupViewport } from "./canvas/viewport.ts";
import { updateSpriteFrame } from "./canvas/sprite-frame.ts";
import {
  createDrawingState,
  updatePixelBuffer,
  setupDrawingInput,
} from "./canvas/drawing.ts";
import type { DrawCallbacks } from "./canvas/drawing.ts";

import { useDrawingState } from "./composables/useDrawingState.ts";
import type { RGBA } from "./composables/useDrawingState.ts";
import { useEditorState } from "./composables/useEditorState.ts";
import { useWebSocket } from "./composables/useWebSocket.ts";

const canvasContainer = ref<HTMLDivElement | null>(null);

const {
  state: drawingReactive,
  setForegroundColor,
  addRecentColor,
  setPalette,
} = useDrawingState();
const { setSpriteName, setCursorPosition, setZoomLevel, setStatus } =
  useEditorState();
const { sendMessage, connect } = useWebSocket();

// Internal vanilla drawing state (non-reactive, used by canvas engine)
const drawingState = createDrawingState();

// Sync reactive state -> vanilla state
function syncDrawingState() {
  drawingState.tool = drawingReactive.tool;
  drawingState.foregroundColor = drawingReactive.foregroundColor;
  drawingState.backgroundColor = drawingReactive.backgroundColor;
  drawingState.brushSize = drawingReactive.brushSize;
}

// Draw activity tracking
const DRAW_SETTLE_MS = 800;
let lastDrawTime = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function markDrawActivity(): void {
  lastDrawTime = Date.now();
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

function scheduleRefresh(): void {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    if (!drawingState.isDrawing) {
      sendMessage({ type: "request-sprite-data" });
    }
  }, DRAW_SETTLE_MS);
}

// Sprite state
let currentSprite: Sprite | null = null;
let currentTextureSource: BufferImageSource | null = null;
let viewport: Viewport | null = null;

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function applySpriteData(
  vp: Viewport,
  rgbaBytes: Uint8Array,
  width: number,
  height: number,
): void {
  updatePixelBuffer(drawingState, rgbaBytes, width, height);
  updateSpriteFrame(vp, width, height);

  if (currentTextureSource && currentSprite) {
    currentTextureSource.resource = rgbaBytes;
    currentTextureSource.resize(width, height);
    currentTextureSource.update();
  } else {
    const source = new BufferImageSource({
      resource: rgbaBytes,
      width,
      height,
      format: "rgba8unorm",
      scaleMode: "nearest",
    });

    currentTextureSource = source;

    const texture = new Texture({ source });
    const sprite = new Sprite(texture);
    sprite.position.set(0, 0);

    currentSprite = sprite;
    vp.addChild(sprite);

    // Center and fit sprite in viewport, accounting for UI panels
    const toolbarWidth = 60;
    const paletteWidth = 92;
    const topBarHeight = 48;
    const bottomBarHeight = 48;
    const margin = 24;

    const availW =
      vp.screenWidth - toolbarWidth - paletteWidth - margin * 2;
    const availH =
      vp.screenHeight - topBarHeight - bottomBarHeight - margin * 2;
    const fitScale = Math.min(availW / width, availH / height);

    vp.setZoom(fitScale, true);
    const offsetX = (toolbarWidth - paletteWidth) / 2 / fitScale;
    const offsetY = (topBarHeight - bottomBarHeight) / 2 / fitScale;
    vp.moveCenter(width / 2 - offsetX, height / 2 - offsetY);
    setZoomLevel(fitScale * 100);

    const drawCallbacks: DrawCallbacks = {
      onDraw: (x, y, color, tool) => {
        markDrawActivity();
        sendMessage({ type: "draw", x, y, color, tool });
      },
      onColorPicked: (color) => {
        drawingState.foregroundColor = color;
        setForegroundColor(color);
        addRecentColor(color);
      },
      onTextureUpdate: () => {
        // Texture already updated by drawing module
      },
      onStrokeEnd: () => {
        markDrawActivity();
        scheduleRefresh();
      },
    };

    setupDrawingInput(vp, drawingState, source, drawCallbacks);
  }

  setStatus("Synced", true);
}

function renderSpriteData(
  vp: Viewport,
  data: string,
  width: number,
  height: number,
): void {
  const timeSinceDraw = Date.now() - lastDrawTime;
  if (drawingState.isDrawing || timeSinceDraw < DRAW_SETTLE_MS) {
    scheduleRefresh();
    return;
  }
  const rgbaBytes = decodeBase64ToUint8Array(data);
  applySpriteData(vp, rgbaBytes, width, height);
}

// Undo/redo/zoom handlers for BottomBar
function handleUndo() {
  sendMessage({ type: "undo" });
}

function handleRedo() {
  sendMessage({ type: "redo" });
}

function handleZoomPreset(scale: number) {
  if (!viewport) return;
  viewport.setZoom(scale, true);
  setZoomLevel(scale * 100);
}

onMounted(async () => {
  const app = await createApp();
  const canvas = app.canvas as HTMLCanvasElement;

  if (canvasContainer.value) {
    canvasContainer.value.appendChild(canvas);
  }

  viewport = setupViewport(app, (zoom) => {
    setZoomLevel(zoom);
  });

  // Track cursor position
  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    if (!viewport) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = viewport.toWorld(screenX, screenY);
    setCursorPosition(Math.floor(world.x), Math.floor(world.y));
  });

  // Sync reactive state to vanilla state on each animation frame
  app.ticker.add(() => {
    syncDrawingState();
  });

  // Connect WebSocket
  const vp = viewport;
  connect((msg) => {
    switch (msg.type) {
      case "sprite-list": {
        const sprites = msg.sprites as Array<{
          filename: string;
          width: number;
          height: number;
          colorMode: number;
        }>;
        console.log("[WS] Sprite list:", sprites);

        if (sprites.length > 0) {
          const name = sprites[0].filename || "untitled.ase";
          setSpriteName(name.split("/").pop() || name);
          sendMessage({
            type: "request-sprite-data",
            filename: sprites[0].filename,
          });
        }
        break;
      }

      case "sprite-data": {
        const { data, width, height, filename } = msg as {
          data: string;
          width: number;
          height: number;
          filename: string;
          type: string;
        };
        console.log(`[WS] Sprite data received (${width}x${height})`);
        if (filename) {
          setSpriteName(filename.split("/").pop() || filename);
        }
        renderSpriteData(vp, data, width, height);
        break;
      }

      case "sprite-update": {
        console.log("[WS] Sprite update notification");
        sendMessage({ type: "request-sprite-data" });
        break;
      }

      case "palette-data": {
        const colors = msg.colors as number[][];
        console.log(`[WS] Palette received (${colors.length} colors)`);
        setPalette(colors.map((c) => [c[0], c[1], c[2], c[3]] as RGBA));
        break;
      }

      case "status": {
        console.log("[WS] Status:", msg);
        break;
      }

      default:
        console.log("[WS] Unknown message type:", msg.type);
    }
  });

  setStatus("Connecting...", false);
  setZoomLevel(vp.scale.x * 100);

  console.log("Pxlpad initialized");
});
</script>

<template>
  <div ref="canvasContainer" class="canvas-container" />
  <TopBar />
  <Toolbar />
  <ColorPalette />
  <BottomBar
    @undo="handleUndo"
    @redo="handleRedo"
    @zoom-preset="handleZoomPreset"
  />
</template>

<style scoped>
.canvas-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.canvas-container :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
