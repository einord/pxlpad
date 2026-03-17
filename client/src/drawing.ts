import type { Viewport } from "pixi-viewport";
import type { BufferImageSource } from "pixi.js";

// ── Types ──────────────────────────────────────────────────────────────

export type ToolType = "pencil" | "eraser" | "eyedropper" | "fill";

export interface DrawingState {
  tool: ToolType;
  foregroundColor: [number, number, number, number];
  backgroundColor: [number, number, number, number];
  brushSize: number;
  isDrawing: boolean;
  lastPixel: { x: number; y: number } | null;
  spriteWidth: number;
  spriteHeight: number;
  pixelBuffer: Uint8Array | null;
}

export interface DrawCallbacks {
  onDraw: (
    x: number,
    y: number,
    color: [number, number, number, number],
    tool: string,
  ) => void;
  onColorPicked: (color: [number, number, number, number]) => void;
  onTextureUpdate: () => void;
}

// ── Factory ────────────────────────────────────────────────────────────

/** Creates a fresh drawing state with sensible defaults. */
export function createDrawingState(): DrawingState {
  return {
    tool: "pencil",
    foregroundColor: [0, 0, 0, 255],
    backgroundColor: [255, 255, 255, 255],
    brushSize: 1,
    isDrawing: false,
    lastPixel: null,
    spriteWidth: 0,
    spriteHeight: 0,
    pixelBuffer: null,
  };
}

// ── Buffer management ──────────────────────────────────────────────────

/**
 * Replaces the local pixel buffer with new data received from the server.
 * Also updates spriteWidth / spriteHeight on the state.
 */
export function updatePixelBuffer(
  state: DrawingState,
  data: Uint8Array,
  width: number,
  height: number,
): void {
  // Keep our own copy so server data is never mutated by drawing ops
  state.pixelBuffer = new Uint8Array(data);
  state.spriteWidth = width;
  state.spriteHeight = height;
}

// ── Coordinate helpers ─────────────────────────────────────────────────

function worldToPixel(
  worldX: number,
  worldY: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const px = Math.floor(worldX);
  const py = Math.floor(worldY);
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  return { x: px, y: py };
}

// ── Single-pixel operations ────────────────────────────────────────────

function bufferIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function setPixelInBuffer(
  buffer: Uint8Array,
  x: number,
  y: number,
  width: number,
  color: [number, number, number, number],
): void {
  const i = bufferIndex(x, y, width);
  buffer[i] = color[0];
  buffer[i + 1] = color[1];
  buffer[i + 2] = color[2];
  buffer[i + 3] = color[3];
}

function getPixelFromBuffer(
  buffer: Uint8Array,
  x: number,
  y: number,
  width: number,
): [number, number, number, number] {
  const i = bufferIndex(x, y, width);
  return [buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]];
}

function colorsEqual(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// ── Drawing primitives ─────────────────────────────────────────────────

function drawPixel(
  state: DrawingState,
  textureSource: BufferImageSource,
  x: number,
  y: number,
  color: [number, number, number, number],
  callbacks: DrawCallbacks,
  skipTextureUpdate: boolean,
): void {
  if (!state.pixelBuffer) return;
  if (x < 0 || y < 0 || x >= state.spriteWidth || y >= state.spriteHeight)
    return;

  setPixelInBuffer(state.pixelBuffer, x, y, state.spriteWidth, color);

  // Sync the texture source resource to our buffer
  textureSource.resource = state.pixelBuffer;

  if (!skipTextureUpdate) {
    textureSource.update();
    callbacks.onTextureUpdate();
  }

  callbacks.onDraw(x, y, color, state.tool);
}

/**
 * Bresenham's line algorithm — ensures no gaps even with fast pen movement.
 * Returns the list of pixel coordinates drawn.
 */
function drawLine(
  state: DrawingState,
  textureSource: BufferImageSource,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
  callbacks: DrawCallbacks,
): void {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    // Draw but skip per-pixel texture update — we batch at the end
    drawPixel(state, textureSource, x0, y0, color, callbacks, true);

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }

  // Batch texture update after full line
  textureSource.update();
  callbacks.onTextureUpdate();
}

/**
 * Stack-based flood fill to avoid call-stack overflow on large areas.
 */
function floodFill(
  state: DrawingState,
  textureSource: BufferImageSource,
  startX: number,
  startY: number,
  fillColor: [number, number, number, number],
  callbacks: DrawCallbacks,
): void {
  if (!state.pixelBuffer) return;

  const targetColor = getPixelFromBuffer(
    state.pixelBuffer,
    startX,
    startY,
    state.spriteWidth,
  );

  // Nothing to do if target is already the fill color
  if (colorsEqual(targetColor, fillColor)) return;

  const w = state.spriteWidth;
  const h = state.spriteHeight;
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;

    if (x < 0 || y < 0 || x >= w || y >= h) continue;

    const current = getPixelFromBuffer(state.pixelBuffer!, x, y, w);
    if (!colorsEqual(current, targetColor)) continue;

    setPixelInBuffer(state.pixelBuffer!, x, y, w, fillColor);
    callbacks.onDraw(x, y, fillColor, "fill");

    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  // Single texture update after fill is complete
  textureSource.resource = state.pixelBuffer;
  textureSource.update();
  callbacks.onTextureUpdate();
}

function pickColor(
  state: DrawingState,
  x: number,
  y: number,
  callbacks: DrawCallbacks,
): void {
  if (!state.pixelBuffer) return;
  if (x < 0 || y < 0 || x >= state.spriteWidth || y >= state.spriteHeight)
    return;

  const color = getPixelFromBuffer(state.pixelBuffer, x, y, state.spriteWidth);
  state.foregroundColor = color;
  callbacks.onColorPicked(color);
}

// ── Tool application ───────────────────────────────────────────────────

function applyToolAtPixel(
  state: DrawingState,
  textureSource: BufferImageSource,
  x: number,
  y: number,
  callbacks: DrawCallbacks,
): void {
  switch (state.tool) {
    case "pencil":
      drawPixel(
        state,
        textureSource,
        x,
        y,
        state.foregroundColor,
        callbacks,
        false,
      );
      break;
    case "eraser":
      drawPixel(state, textureSource, x, y, [0, 0, 0, 0], callbacks, false);
      break;
    case "eyedropper":
      pickColor(state, x, y, callbacks);
      break;
    case "fill":
      floodFill(state, textureSource, x, y, state.foregroundColor, callbacks);
      break;
  }
}

function applyToolLine(
  state: DrawingState,
  textureSource: BufferImageSource,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  callbacks: DrawCallbacks,
): void {
  const color: [number, number, number, number] =
    state.tool === "eraser" ? [0, 0, 0, 0] : state.foregroundColor;

  drawLine(state, textureSource, x0, y0, x1, y1, color, callbacks);
}

// ── Pointer event handling ─────────────────────────────────────────────

/**
 * Sets up pointer event listeners on the viewport for drawing.
 *
 * Pen and mouse events trigger drawing; touch events are ignored so that
 * pixi-viewport can handle pan/zoom gestures.
 *
 * Pressure is tracked on each event for future brush-dynamics use.
 */
export function setupDrawingInput(
  viewport: Viewport,
  state: DrawingState,
  textureSource: BufferImageSource,
  callbacks: DrawCallbacks,
): void {
  let currentPressure = 0.5;

  function isDrawingPointer(e: PointerEvent): boolean {
    return e.pointerType === "pen" || e.pointerType === "mouse";
  }

  function screenToPixel(
    e: PointerEvent,
  ): { x: number; y: number } | null {
    const rect = (
      viewport.options.events!.domElement as HTMLElement
    ).getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = viewport.toWorld(screenX, screenY);
    return worldToPixel(
      world.x,
      world.y,
      state.spriteWidth,
      state.spriteHeight,
    );
  }

  function handlePointerDown(e: PointerEvent): void {
    if (!isDrawingPointer(e)) return;
    if (!state.pixelBuffer) return;

    currentPressure = e.pressure;
    state.isDrawing = true;

    const pixel = screenToPixel(e);
    if (!pixel) {
      state.lastPixel = null;
      return;
    }

    state.lastPixel = pixel;
    applyToolAtPixel(state, textureSource, pixel.x, pixel.y, callbacks);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!state.isDrawing) return;
    if (!isDrawingPointer(e)) return;
    if (!state.pixelBuffer) return;

    currentPressure = e.pressure;

    // Use coalesced events for smoother strokes when available
    const events: PointerEvent[] =
      typeof e.getCoalescedEvents === "function"
        ? e.getCoalescedEvents()
        : [e];

    // If no coalesced events returned, fall back to the original event
    const points = events.length > 0 ? events : [e];

    for (const pe of points) {
      const pixel = screenToPixel(pe);
      if (!pixel) continue;

      if (state.tool === "eyedropper") {
        pickColor(state, pixel.x, pixel.y, callbacks);
        state.lastPixel = pixel;
        continue;
      }

      if (state.lastPixel) {
        if (
          state.lastPixel.x !== pixel.x ||
          state.lastPixel.y !== pixel.y
        ) {
          applyToolLine(
            state,
            textureSource,
            state.lastPixel.x,
            state.lastPixel.y,
            pixel.x,
            pixel.y,
            callbacks,
          );
        }
      } else {
        applyToolAtPixel(
          state,
          textureSource,
          pixel.x,
          pixel.y,
          callbacks,
        );
      }

      state.lastPixel = pixel;
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!isDrawingPointer(e)) return;
    state.isDrawing = false;
    state.lastPixel = null;
  }

  function handlePointerLeave(e: PointerEvent): void {
    if (!isDrawingPointer(e)) return;
    if (state.isDrawing) {
      state.isDrawing = false;
      state.lastPixel = null;
    }
  }

  // Attach to the canvas element — use capture phase so we handle
  // pen/mouse events before pixi-viewport's drag plugin can consume them.
  const domElement = viewport.options.events!.domElement as HTMLElement;

  domElement.addEventListener("pointerdown", handlePointerDown, true);
  domElement.addEventListener("pointermove", handlePointerMove, true);
  domElement.addEventListener("pointerup", handlePointerUp, true);
  domElement.addEventListener("pointerleave", handlePointerLeave, true);

  // Suppress currentPressure unused warning — exposed for future use
  void currentPressure;
}
