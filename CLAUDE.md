# Pxlpad

iPad pixel art editor that syncs with Aseprite in real-time via a local Tauri server.

## Architecture

```
iPad (PWA)  ←── WebSocket ──→  Tauri Server (Mac)  ←── WebSocket ──→  Aseprite Extension
client/                        server/                                 extension/
```

- **client/** — PixiJS PWA, vanilla TypeScript, Vite
- **server/** — Tauri v2 macOS menu bar app, Rust + TypeScript
- **extension/** — Aseprite Lua plugin

WebSocket communication flows through the server which acts as a relay. The server runs on port 9874. The client connects via Vite proxy at `/ws` (required for iPad Safari compatibility).

## Development

```bash
pnpm dev          # Start server + client concurrently
pnpm dev:server   # Tauri server only
pnpm dev:client   # PWA client only (with --host for iPad access)
pnpm ext:pack     # Package extension to /tmp/pxlpad.aseprite-extension
```

## Code conventions

### Principles
- **Single responsibility** — each file, function, and module should do one thing well
- **Reuse first** — before creating new UI, check if an existing component can be reused or extended. Every button, panel, toolbar, input, and visual element should be a reusable component. Only create a new component when nothing existing fits.
- **Ask rather than guess** — when requirements, design decisions, or expected behavior are unclear, ask the user before making assumptions
- All code, comments, and variable names in English
- Prefer simple, direct solutions over abstractions
- No unnecessary error handling for internal code paths

### File organization
- **Max 400 lines per file** — if a file exceeds this, split it by responsibility
- **Co-locate related files** using nested naming for IDE grouping:
  - `Toolbar.vue` — component
  - `Toolbar.types.ts` — types (if complex enough)
- Place new files next to related code, not in a flat global folder
- Client structure:
  - `client/src/components/` — reusable Vue components (buttons, panels, swatches)
  - `client/src/composables/` — Vue composables (shared reactive state, WebSocket)
  - `client/src/canvas/` — PixiJS/drawing logic (vanilla TS, not Vue)
- Server structure: Rust in `server/src-tauri/src/`, frontend in `server/src/`

### Vue & TypeScript (client/)
- Vue 3 with `<script setup lang="ts">` and Composition API
- PixiJS canvas and drawing logic stays as vanilla TypeScript — not wrapped in Vue
- Strict TypeScript — no `any`, no `as` casts unless unavoidable
- Functions should be short and well-named — avoid comments when the code is self-explanatory
- Use `interface` for object shapes, `type` for unions/aliases
- Imports from pixi.js should be specific, not `import * as PIXI`

### Rust (server/src-tauri/)
- Follow standard Rust conventions (rustfmt, clippy with `-D warnings`)
- Use `///` doc comments for public functions
- Prefer `is_some_and` over `map_or(false, ...)`

### Lua (extension/)
- The global `plugin` variable is only available inside `init(p)` and `exit(p)` — never use it at file scope
- Aseprite's WebSocket API has a single `onreceive(messageType, data, error)` callback, not separate callbacks
- Use `WebSocketMessageType.OPEN/TEXT/CLOSE` to distinguish events
- JSON encode/decode manually since Aseprite's json module availability varies

### CSS/UI
- Dark theme matching Aseprite aesthetics
- Minimum 44px touch targets for all interactive elements
- UI panels use `pointer-events: auto`, canvas area handles drawing
- Use Lucide icons (`lucide` package) for all UI icons

## WebSocket protocol

Messages are JSON with a `type` field. Key message types:

| Direction | Type | Purpose |
|-----------|------|---------|
| Both → Server | `register` | Identify as `extension` or `client` |
| Extension → Clients | `sprite-list` | List of open sprites |
| Extension → Clients | `sprite-data` | Full RGBA pixel data (base64) |
| Client → Extension | `request-sprite-list` | Request sprite list |
| Client → Extension | `request-sprite-data` | Request pixel data |
| Client → Extension | `draw` | Single pixel draw command |
| Server → All | `status` | Connection status update |

## Known platform quirks

- **iPadOS Scribble** swallows rapid Apple Pencil pointer events — workaround: `preventDefault()` on `touchmove` (WebKit bug #217430)
- **iPad Safari** blocks `ws://` connections to separate ports — workaround: Vite proxy at `/ws`
- **Aseprite extensions** don't load from symlinked folders — use `pnpm ext:pack` and reinstall via UI
- **macOS tray-only app** requires `ActivationPolicy::Accessory` in Rust, not Info.plist

## Git conventions

- Conventional commits enforced by commitlint: `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- Work on `develop` branch, merge to `main` for releases
- CI runs on push/PR to `main` only
- release-please handles versioning and changelogs on `main`
