import {
  Application,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
  BufferImageSource,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { createUI } from "./ui.ts";
import type { UICallbacks } from "./ui.ts";
import {
  createDrawingState,
  updatePixelBuffer,
  setupDrawingInput,
} from "./drawing.ts";
import type { ToolType, DrawCallbacks } from "./drawing.ts";

const CHECKERBOARD_SIZE = 16;
const CHECKERBOARD_COLOR_A = 0xcccccc;
const CHECKERBOARD_COLOR_B = 0xffffff;

const WS_RECONNECT_INTERVAL_MS = 3000;

// ── State ───────────────────────────────────────────────────────────────

interface SpriteInfo {
  filename: string;
  width: number;
  height: number;
  colorMode: number;
}

let ws: WebSocket | null = null;
let spriteList: SpriteInfo[] = [];
let currentSprite: Sprite | null = null;
let currentTextureSource: BufferImageSource | null = null;

const drawingState = createDrawingState();
let ui: ReturnType<typeof createUI> | null = null;

// ── Checkerboard background ─────────────────────────────────────────────

async function createCheckerboardBackground(
  app: Application,
  viewport: Viewport,
): Promise<void> {
  const tileSize = CHECKERBOARD_SIZE * 2;
  const checkerGfx = new Graphics();

  checkerGfx.rect(0, 0, CHECKERBOARD_SIZE, CHECKERBOARD_SIZE);
  checkerGfx.fill(CHECKERBOARD_COLOR_A);

  checkerGfx.rect(CHECKERBOARD_SIZE, 0, CHECKERBOARD_SIZE, CHECKERBOARD_SIZE);
  checkerGfx.fill(CHECKERBOARD_COLOR_B);

  checkerGfx.rect(0, CHECKERBOARD_SIZE, CHECKERBOARD_SIZE, CHECKERBOARD_SIZE);
  checkerGfx.fill(CHECKERBOARD_COLOR_B);

  checkerGfx.rect(
    CHECKERBOARD_SIZE,
    CHECKERBOARD_SIZE,
    CHECKERBOARD_SIZE,
    CHECKERBOARD_SIZE,
  );
  checkerGfx.fill(CHECKERBOARD_COLOR_A);

  const renderTexture = RenderTexture.create({
    width: tileSize,
    height: tileSize,
  });
  app.renderer.render({ container: checkerGfx, target: renderTexture });

  const tilingSprite = new TilingSprite({
    texture: renderTexture,
    width: 4096,
    height: 4096,
  });
  tilingSprite.position.set(-2048, -2048);

  viewport.addChildAt(tilingSprite, 0);
}

// ── PixiJS application ──────────────────────────────────────────────────

async function createApp(): Promise<Application> {
  const app = new Application();

  await app.init({
    background: 0x1a1a2e,
    resizeTo: window,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas as HTMLCanvasElement);
  return app;
}

// ── Viewport ────────────────────────────────────────────────────────────

function setupViewport(app: Application): Viewport {
  const viewport = new Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: 4096,
    worldHeight: 4096,
    events: app.renderer.events,
  });

  viewport
    .drag({ mouseButtons: "all", pressDrag: false })
    .pinch()
    .wheel({ smooth: 3, trackpadPinch: true, wheelZoom: false })
    .decelerate()
    .clampZoom({ minScale: 0.1, maxScale: 40 });

  // Prevent browser-level pinch zoom (trackpad sends ctrl+wheel)
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );

  app.stage.addChild(viewport);

  viewport.moveCenter(0, 0);

  window.addEventListener("resize", () => {
    viewport.resize(window.innerWidth, window.innerHeight);
  });

  // Track zoom level changes
  viewport.on("zoomed", () => {
    ui?.setZoomLevel(viewport.scale.x * 100);
  });

  return viewport;
}

// ── Sprite rendering ────────────────────────────────────────────────────

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Delay before accepting server sprite data after drawing stops,
// to avoid overwriting local strokes with stale server data.
const DRAW_SETTLE_MS = 500;
let lastDrawTime = 0;
let pendingSpriteData: { data: string; width: number; height: number } | null =
  null;
let pendingSpriteTimer: ReturnType<typeof setTimeout> | null = null;

function markDrawActivity(): void {
  lastDrawTime = Date.now();
}

function applySpriteData(
  viewport: Viewport,
  rgbaBytes: Uint8Array,
  width: number,
  height: number,
): void {
  updatePixelBuffer(drawingState, rgbaBytes, width, height);

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
    viewport.addChild(sprite);

    // Set up drawing input now that we have a texture source
    const drawCallbacks: DrawCallbacks = {
      onDraw: (x, y, color, tool) => {
        markDrawActivity();
        sendMessage({ type: "draw", x, y, color, tool });
      },
      onColorPicked: (color) => {
        drawingState.foregroundColor = color;
        ui?.setForegroundColor(color);
        ui?.addRecentColor(color);
      },
      onTextureUpdate: () => {
        // Texture already updated by drawing module
      },
    };

    setupDrawingInput(viewport, drawingState, source, drawCallbacks);
  }

  ui?.setStatus("Synced", true);
}

function renderSpriteData(
  viewport: Viewport,
  data: string,
  width: number,
  height: number,
): void {
  const timeSinceDraw = Date.now() - lastDrawTime;

  // If user is actively drawing or just finished, defer the update
  // so we don't overwrite local strokes with stale server data.
  if (drawingState.isDrawing || timeSinceDraw < DRAW_SETTLE_MS) {
    pendingSpriteData = { data, width, height };

    if (!pendingSpriteTimer) {
      pendingSpriteTimer = setTimeout(() => {
        pendingSpriteTimer = null;
        if (pendingSpriteData && !drawingState.isDrawing) {
          const p = pendingSpriteData;
          pendingSpriteData = null;
          const rgbaBytes = decodeBase64ToUint8Array(p.data);
          applySpriteData(viewport, rgbaBytes, p.width, p.height);
        }
      }, DRAW_SETTLE_MS);
    }
    return;
  }

  pendingSpriteData = null;
  const rgbaBytes = decodeBase64ToUint8Array(data);
  applySpriteData(viewport, rgbaBytes, width, height);
}

// ── WebSocket ───────────────────────────────────────────────────────────

function sendMessage(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function connectWebSocket(viewport: Viewport): void {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Use Vite proxy path /ws to avoid cross-port issues on iPad Safari
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      console.log("[WS] Connected to", wsUrl);
      ui?.setStatus("Connected", true);

      sendMessage({ type: "register", role: "client" });
      sendMessage({ type: "request-sprite-list" });
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        console.warn("[WS] Non-JSON message:", event.data);
        return;
      }

      switch (msg.type) {
        case "sprite-list": {
          const sprites = msg.sprites as SpriteInfo[];
          spriteList = sprites;
          console.log("[WS] Sprite list:", spriteList);

          if (spriteList.length > 0) {
            const name = spriteList[0].filename || "untitled.ase";
            ui?.setSpriteName(
              name.split("/").pop() || name,
            );
            sendMessage({
              type: "request-sprite-data",
              filename: spriteList[0].filename,
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
          };
          console.log(`[WS] Sprite data received (${width}x${height})`);
          if (filename) {
            ui?.setSpriteName(
              filename.split("/").pop() || filename,
            );
          }
          renderSpriteData(viewport, data, width, height);
          break;
        }

        case "sprite-update": {
          console.log("[WS] Sprite update notification");
          sendMessage({ type: "request-sprite-data" });
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

    ws.addEventListener("close", (ev) => {
      console.log("[WS] Disconnected. Code:", ev.code, "Reason:", ev.reason);
      ui?.setStatus("Disconnected", false);
      scheduleReconnect();
    });

    ws.addEventListener("error", (err) => {
      console.warn("[WS] Error:", err);
      ws?.close();
    });
  }

  function scheduleReconnect(): void {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, WS_RECONNECT_INTERVAL_MS);
    }
  }

  connect();
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = await createApp();
  const viewport = setupViewport(app);

  // Create UI overlay with callbacks wired to drawing state
  const uiCallbacks: UICallbacks = {
    onToolChange: (tool) => {
      drawingState.tool = tool as ToolType;
    },
    onColorChange: (color) => {
      drawingState.foregroundColor = color;
    },
    onUndo: () => {
      sendMessage({ type: "undo" });
    },
    onRedo: () => {
      sendMessage({ type: "redo" });
    },
    onGridToggle: () => {
      // TODO: toggle pixel grid overlay
      console.log("[UI] Grid toggle");
    },
    onZoomPreset: (scale) => {
      viewport.setZoom(scale, true);
      ui?.setZoomLevel(scale * 100);
    },
    onBrushSizeChange: (size) => {
      drawingState.brushSize = size;
    },
  };

  ui = createUI(uiCallbacks);
  ui.setStatus("Connecting...", false);
  ui.setZoomLevel(viewport.scale.x * 100);

  // Track cursor position over canvas
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = viewport.toWorld(screenX, screenY);
    const px = Math.floor(world.x);
    const py = Math.floor(world.y);
    ui?.setCursorPosition(px, py);
  });

  await createCheckerboardBackground(app, viewport);

  connectWebSocket(viewport);

  console.log("Pxlpad initialized");
}

main().catch(console.error);
