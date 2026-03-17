import { Application, Graphics, RenderTexture, TilingSprite } from "pixi.js";
import { Viewport } from "pixi-viewport";

const CHECKERBOARD_SIZE = 16;
const CHECKERBOARD_COLOR_A = 0xcccccc;
const CHECKERBOARD_COLOR_B = 0xffffff;

const WS_PORT = 9874;
const WS_RECONNECT_INTERVAL_MS = 3000;

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

function connectWebSocket(): void {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.hostname}:${WS_PORT}`;

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      console.log("[WS] Connected to", wsUrl);
    });

    ws.addEventListener("message", (event) => {
      console.log("[WS] Message:", event.data);
      // Future: handle incoming pixel data, sync, etc.
    });

    ws.addEventListener("close", () => {
      console.log(
        "[WS] Disconnected. Reconnecting in",
        WS_RECONNECT_INTERVAL_MS,
        "ms..."
      );
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

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    background: 0x1a1a2e,
    resizeTo: window,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas as HTMLCanvasElement);

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

  await createCheckerboardBackground(app, viewport);

  // Center the viewport on the world origin
  viewport.moveCenter(0, 0);

  // Handle window resize
  window.addEventListener("resize", () => {
    viewport.resize(window.innerWidth, window.innerHeight);
  });

  // Connect to WebSocket server
  connectWebSocket();

  console.log("Pxlpad initialized");
}

main().catch(console.error);
