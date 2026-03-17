import {
  Application,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { BufferImageSource } from "pixi.js";

const CHECKERBOARD_SIZE = 16;
const CHECKERBOARD_COLOR_A = 0xcccccc;
const CHECKERBOARD_COLOR_B = 0xffffff;

const WS_PORT = 9874;
const WS_RECONNECT_INTERVAL_MS = 3000;

// ── State ───────────────────────────────────────────────────────────────

interface SpriteInfo {
  id: string;
  name: string;
  width: number;
  height: number;
}

let ws: WebSocket | null = null;
let spriteList: SpriteInfo[] = [];
let currentSprite: Sprite | null = null;
let currentTextureSource: BufferImageSource | null = null;
let statusEl: HTMLDivElement | null = null;

// ── Status indicator ────────────────────────────────────────────────────

function setStatus(text: string, color: "red" | "green"): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.backgroundColor =
    color === "green" ? "rgba(34,139,34,0.75)" : "rgba(180,30,30,0.75)";
}

// ── Checkerboard background ─────────────────────────────────────────────

async function createCheckerboardBackground(
  app: Application,
  viewport: Viewport
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
    CHECKERBOARD_SIZE
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
    .drag({ mouseButtons: "all" })
    .pinch()
    .wheel()
    .decelerate()
    .clampZoom({ minScale: 0.1, maxScale: 40 });

  app.stage.addChild(viewport);

  viewport.moveCenter(0, 0);

  window.addEventListener("resize", () => {
    viewport.resize(window.innerWidth, window.innerHeight);
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

function renderSpriteData(
  viewport: Viewport,
  data: string,
  width: number,
  height: number
): void {
  const rgbaBytes = decodeBase64ToUint8Array(data);

  if (currentTextureSource && currentSprite) {
    // Update existing texture source in-place
    currentTextureSource.resource = rgbaBytes;
    currentTextureSource.resize(width, height);
    currentTextureSource.update();
  } else {
    // Create new texture source and sprite
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
  }

  setStatus("Synced", "green");
}

// ── WebSocket ───────────────────────────────────────────────────────────

function sendMessage(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function connectWebSocket(viewport: Viewport): void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.hostname}:${WS_PORT}`;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      console.log("[WS] Connected to", wsUrl);
      setStatus("Connected", "green");

      // Register as client
      sendMessage({ type: "register", role: "client" });

      // Request the sprite list
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
          spriteList = msg.sprites as SpriteInfo[];
          console.log("[WS] Sprite list:", spriteList);

          // Auto-request the first sprite
          if (spriteList.length > 0) {
            sendMessage({
              type: "request-sprite-data",
              spriteId: spriteList[0].id,
            });
          }
          break;
        }

        case "sprite-data": {
          const { data, width, height } = msg as {
            data: string;
            width: number;
            height: number;
          };
          console.log(`[WS] Sprite data received (${width}x${height})`);
          renderSpriteData(viewport, data, width, height);
          break;
        }

        case "sprite-update": {
          console.log("[WS] Sprite update notification");
          // Request fresh data
          const spriteId = (msg.spriteId as string) ?? spriteList[0]?.id;
          if (spriteId) {
            sendMessage({ type: "request-sprite-data", spriteId });
          }
          break;
        }

        case "status": {
          console.log("[WS] Status:", msg.message);
          break;
        }

        default:
          console.log("[WS] Unknown message type:", msg.type);
      }
    });

    ws.addEventListener("close", () => {
      console.log(
        "[WS] Disconnected. Reconnecting in",
        WS_RECONNECT_INTERVAL_MS,
        "ms..."
      );
      setStatus("Disconnected", "red");
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
  // Create status indicator
  statusEl = document.getElementById("ws-status") as HTMLDivElement;
  setStatus("Disconnected", "red");

  const app = await createApp();
  const viewport = setupViewport(app);

  await createCheckerboardBackground(app, viewport);

  connectWebSocket(viewport);

  console.log("Pxlpad initialized");
}

main().catch(console.error);
