// ── UI overlay for Pxlpad pixel art editor ──────────────────────────────

export interface UICallbacks {
  onToolChange: (tool: string) => void;
  onColorChange: (color: [number, number, number, number]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onGridToggle: () => void;
  onZoomPreset: (scale: number) => void;
  onBrushSizeChange: (size: number) => void;
}

// ── CSS ─────────────────────────────────────────────────────────────────

const UI_CSS = /* css */ `
:root {
  --ui-bg: rgba(51, 51, 51, 0.92);
  --ui-bg-solid: #333;
  --ui-btn: #555;
  --ui-btn-hover: #666;
  --ui-btn-active: #888;
  --ui-text: #ddd;
  --ui-text-muted: #999;
  --ui-border: #444;
  --ui-accent: #6a9fd8;
  --ui-touch-min: 44px;
  --ui-panel-radius: 6px;
}

/* Shared panel styles */
.pxl-panel {
  position: fixed;
  z-index: 100;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
  font-size: 13px;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
}

.pxl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ui-touch-min);
  min-height: var(--ui-touch-min);
  background: var(--ui-btn);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.pxl-btn:hover {
  background: var(--ui-btn-hover);
}

.pxl-btn.active {
  background: var(--ui-btn-active);
  border-color: var(--ui-accent);
  box-shadow: inset 0 0 0 1px var(--ui-accent);
}

.pxl-btn-sm {
  min-width: 36px;
  min-height: 36px;
  font-size: 14px;
  padding: 2px;
}

/* Top bar */
#pxl-top-bar {
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-bottom: 1px solid var(--ui-border);
}

#pxl-top-bar .pxl-sprite-name {
  font-size: 13px;
  color: var(--ui-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

#pxl-top-bar .pxl-context-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  margin-right: 8px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

#pxl-top-bar .pxl-context-bar .pxl-size-btn {
  min-width: 36px;
  min-height: 32px;
  font-size: 12px;
}

#pxl-status-indicator {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 3px;
  white-space: nowrap;
}

/* Toolbar (left) */
#pxl-toolbar {
  top: 52px;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border-radius: 0 var(--ui-panel-radius) var(--ui-panel-radius) 0;
  border-right: 1px solid var(--ui-border);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
}

/* Color palette (right) */
#pxl-palette {
  top: 52px;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: var(--ui-panel-radius) 0 0 var(--ui-panel-radius);
  border-left: 1px solid var(--ui-border);
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
  width: 88px;
}

.pxl-color-swatch {
  width: 44px;
  height: 44px;
  border: 2px solid var(--ui-border);
  border-radius: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pxl-color-swatch.fg {
  width: 48px;
  height: 48px;
  border-color: var(--ui-text);
}

.pxl-color-swatch.bg {
  width: 40px;
  height: 40px;
  margin-top: -12px;
  margin-left: 16px;
}

.pxl-swap-btn {
  min-width: 32px;
  min-height: 32px;
  font-size: 14px;
  margin-top: -6px;
}

.pxl-recent-colors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  width: 100%;
}

.pxl-recent-swatch {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid var(--ui-border);
  border-radius: 2px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pxl-more-btn {
  font-size: 12px;
  min-height: 32px;
  width: 100%;
}

/* Bottom bar */
#pxl-bottom-bar {
  bottom: 0;
  left: 0;
  right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-top: 1px solid var(--ui-border);
}

#pxl-bottom-bar .pxl-separator {
  width: 1px;
  height: 24px;
  background: var(--ui-border);
  margin: 0 4px;
}

#pxl-bottom-bar .pxl-info {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--ui-text-muted);
  white-space: nowrap;
}
`;

// ── Helpers ─────────────────────────────────────────────────────────────

type RGBA = [number, number, number, number];

function rgbaToCSS(c: RGBA): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] / 255})`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(
  text: string,
  className = "pxl-btn",
  onClick?: () => void
): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

// ── createUI ────────────────────────────────────────────────────────────

export function createUI(callbacks: UICallbacks): {
  setActiveTool: (tool: string) => void;
  setForegroundColor: (color: RGBA) => void;
  setBackgroundColor: (color: RGBA) => void;
  addRecentColor: (color: RGBA) => void;
  setSpriteName: (name: string) => void;
  setCursorPosition: (x: number, y: number) => void;
  setZoomLevel: (percent: number) => void;
  setStatus: (text: string, connected: boolean) => void;
} {
  // Inject CSS
  const styleEl = document.createElement("style");
  styleEl.textContent = UI_CSS;
  document.head.appendChild(styleEl);

  // ── State ──
  let activeTool = "pencil";
  let fgColor: RGBA = [0, 0, 0, 255];
  let bgColor: RGBA = [255, 255, 255, 255];
  let activeBrushSize = 1;
  const recentColors: RGBA[] = [];

  // ── Top bar ──
  const topBar = el("div", "pxl-panel");
  topBar.id = "pxl-top-bar";

  const menuBtn = btn("\u2261", "pxl-btn");
  topBar.appendChild(menuBtn);

  const spriteNameEl = el("span", "pxl-sprite-name", "untitled.ase");
  topBar.appendChild(spriteNameEl);

  // Status indicator (replaces old #ws-status)
  const statusIndicator = el("span");
  statusIndicator.id = "pxl-status-indicator";
  statusIndicator.textContent = "Disconnected";
  statusIndicator.style.backgroundColor = "rgba(180,30,30,0.75)";
  statusIndicator.style.color = "#fff";
  topBar.appendChild(statusIndicator);

  // Context bar (brush sizes)
  const contextBar = el("div", "pxl-context-bar");
  const contextLabel = el("span", undefined, "Size:");
  contextBar.appendChild(contextLabel);

  const brushSizes = [1, 2, 3, 5];
  const brushBtns: HTMLButtonElement[] = [];

  for (const size of brushSizes) {
    const b = btn(`${size}px`, "pxl-btn pxl-btn-sm pxl-size-btn", () => {
      activeBrushSize = size;
      brushBtns.forEach((bb, i) => {
        bb.classList.toggle("active", brushSizes[i] === size);
      });
      callbacks.onBrushSizeChange(size);
    });
    if (size === activeBrushSize) b.classList.add("active");
    brushBtns.push(b);
    contextBar.appendChild(b);
  }

  topBar.appendChild(contextBar);

  const settingsBtn = btn("\u2699", "pxl-btn");
  topBar.appendChild(settingsBtn);

  document.body.appendChild(topBar);

  // ── Toolbar (left) ──
  const toolbar = el("div", "pxl-panel");
  toolbar.id = "pxl-toolbar";

  interface ToolDef {
    id: string;
    icon: string;
  }

  const tools: ToolDef[] = [
    { id: "pencil", icon: "\u270F\uFE0F" },
    { id: "eraser", icon: "\u25FB" },
    { id: "eyedropper", icon: "\uD83D\uDCA7" },
    { id: "fill", icon: "\uD83E\uDEA3" },
  ];

  const toolBtns = new Map<string, HTMLButtonElement>();

  for (const tool of tools) {
    const b = btn(tool.icon, "pxl-btn", () => {
      activeTool = tool.id;
      updateToolHighlight();
      callbacks.onToolChange(tool.id);
    });
    b.title = tool.id;
    if (tool.id === activeTool) b.classList.add("active");
    toolBtns.set(tool.id, b);
    toolbar.appendChild(b);
  }

  function updateToolHighlight(): void {
    toolBtns.forEach((b, id) => {
      b.classList.toggle("active", id === activeTool);
    });
  }

  document.body.appendChild(toolbar);

  // ── Color palette (right) ──
  const palette = el("div", "pxl-panel");
  palette.id = "pxl-palette";

  const fgSwatch = el("div", "pxl-color-swatch fg");
  fgSwatch.style.backgroundColor = rgbaToCSS(fgColor);
  palette.appendChild(fgSwatch);

  const bgSwatch = el("div", "pxl-color-swatch bg");
  bgSwatch.style.backgroundColor = rgbaToCSS(bgColor);
  palette.appendChild(bgSwatch);

  const swapBtn = btn("X", "pxl-btn pxl-btn-sm pxl-swap-btn", () => {
    const tmp = fgColor;
    fgColor = bgColor;
    bgColor = tmp;
    fgSwatch.style.backgroundColor = rgbaToCSS(fgColor);
    bgSwatch.style.backgroundColor = rgbaToCSS(bgColor);
    callbacks.onColorChange(fgColor);
  });
  palette.appendChild(swapBtn);

  // Recent colors
  const recentLabel = el("span", undefined, "Recent");
  recentLabel.style.fontSize = "10px";
  recentLabel.style.color = "var(--ui-text-muted)";
  recentLabel.style.marginTop = "4px";
  palette.appendChild(recentLabel);

  const recentGrid = el("div", "pxl-recent-colors");
  // Pre-populate 16 empty slots
  const recentSwatches: HTMLDivElement[] = [];
  for (let i = 0; i < 16; i++) {
    const swatch = el("div", "pxl-recent-swatch");
    swatch.style.backgroundColor = "#222";
    swatch.addEventListener("click", () => {
      if (i < recentColors.length) {
        fgColor = [...recentColors[i]] as RGBA;
        fgSwatch.style.backgroundColor = rgbaToCSS(fgColor);
        callbacks.onColorChange(fgColor);
      }
    });
    recentSwatches.push(swatch);
    recentGrid.appendChild(swatch);
  }
  palette.appendChild(recentGrid);

  const moreBtn = btn("\u25BC More", "pxl-btn pxl-btn-sm pxl-more-btn");
  palette.appendChild(moreBtn);

  document.body.appendChild(palette);

  // ── Bottom bar ──
  const bottomBar = el("div", "pxl-panel");
  bottomBar.id = "pxl-bottom-bar";

  const undoBtn = btn("\u21B6", "pxl-btn pxl-btn-sm", () => callbacks.onUndo());
  bottomBar.appendChild(undoBtn);

  const redoBtn = btn("\u21B7", "pxl-btn pxl-btn-sm", () => callbacks.onRedo());
  bottomBar.appendChild(redoBtn);

  const sep1 = el("div", "pxl-separator");
  bottomBar.appendChild(sep1);

  const gridBtn = btn("\u229E", "pxl-btn pxl-btn-sm", () => {
    gridBtn.classList.toggle("active");
    callbacks.onGridToggle();
  });
  gridBtn.title = "Toggle grid";
  bottomBar.appendChild(gridBtn);

  const sep2 = el("div", "pxl-separator");
  bottomBar.appendChild(sep2);

  // Zoom presets
  const zoomScales = [1, 2, 4, 8, 16];
  for (const scale of zoomScales) {
    const zb = btn(`${scale}x`, "pxl-btn pxl-btn-sm", () => {
      callbacks.onZoomPreset(scale);
    });
    zb.style.fontSize = "12px";
    bottomBar.appendChild(zb);
  }

  // Info section
  const infoSection = el("div", "pxl-info");

  const cursorPosEl = el("span", undefined, "0, 0");
  infoSection.appendChild(cursorPosEl);

  const zoomLevelEl = el("span", undefined, "Zoom: 100%");
  infoSection.appendChild(zoomLevelEl);

  bottomBar.appendChild(infoSection);

  document.body.appendChild(bottomBar);

  // ── Return API ──
  return {
    setActiveTool(tool: string): void {
      activeTool = tool;
      updateToolHighlight();
    },

    setForegroundColor(color: RGBA): void {
      fgColor = color;
      fgSwatch.style.backgroundColor = rgbaToCSS(color);
    },

    setBackgroundColor(color: RGBA): void {
      bgColor = color;
      bgSwatch.style.backgroundColor = rgbaToCSS(color);
    },

    addRecentColor(color: RGBA): void {
      // Remove duplicate if present
      const idx = recentColors.findIndex(
        (c) => c[0] === color[0] && c[1] === color[1] && c[2] === color[2] && c[3] === color[3]
      );
      if (idx !== -1) recentColors.splice(idx, 1);
      recentColors.unshift([...color] as RGBA);
      if (recentColors.length > 16) recentColors.pop();

      // Update swatches
      for (let i = 0; i < 16; i++) {
        if (i < recentColors.length) {
          recentSwatches[i].style.backgroundColor = rgbaToCSS(recentColors[i]);
        } else {
          recentSwatches[i].style.backgroundColor = "#222";
        }
      }
    },

    setSpriteName(name: string): void {
      spriteNameEl.textContent = name;
    },

    setCursorPosition(x: number, y: number): void {
      cursorPosEl.textContent = `${x}, ${y}`;
    },

    setZoomLevel(percent: number): void {
      zoomLevelEl.textContent = `Zoom: ${Math.round(percent)}%`;
    },

    setStatus(text: string, connected: boolean): void {
      statusIndicator.textContent = text;
      statusIndicator.style.backgroundColor = connected
        ? "rgba(34,139,34,0.75)"
        : "rgba(180,30,30,0.75)";
    },
  };
}
