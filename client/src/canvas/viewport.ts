import { Application } from "pixi.js";
import { Viewport } from "pixi-viewport";

export async function createApp(): Promise<Application> {
  const app = new Application();

  await app.init({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  return app;
}

export function setupViewport(
  app: Application,
  onZoomChanged: (zoom: number) => void,
): Viewport {
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

  viewport.on("zoomed", () => {
    onZoomChanged(viewport.scale.x * 100);
  });

  return viewport;
}
