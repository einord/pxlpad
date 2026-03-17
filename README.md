# Pxlpad

**Draw pixel art on your iPad — synced live with Aseprite on your desktop.**

Pxlpad lets you pick up your iPad, open the editor, and start drawing with Apple Pencil — while your work saves directly to Aseprite on your Mac. No manual file transfers, no screen sharing lag, no setup ritual every time you want to draw.

Built for pixel artists who love Aseprite but want the freedom to draw from the couch, the coffee shop, or anywhere else an iPad goes.

## How it works

Pxlpad has three parts that work together:

```
iPad (PWA)  ←── Wi-Fi ──→  Pxlpad Server (Mac)  ←──→  Aseprite Extension
```

1. **Pxlpad Server** sits in your Mac menu bar and acts as a bridge
2. **Aseprite Extension** connects to the server and syncs your sprites in real-time
3. **iPad Editor** is a web app you open in Safari — optimized for touch and Apple Pencil

When you draw on the iPad, the pixels appear in Aseprite. When you edit in Aseprite, the changes appear on the iPad. Everything stays in sync over your local network.

## Features

- **Apple Pencil support** — pressure, tilt, and 240Hz input on iPad Pro
- **Pen draws, fingers navigate** — no switching between tools and pan/zoom
- **Aseprite-inspired UI** — familiar layout with tools on the left, palette on the right
- **Real-time sync** — changes flow both ways between iPad and Aseprite
- **Works on your network** — no cloud, no account, your files stay on your machine
- **PWA** — install to your iPad home screen for a full-screen, app-like experience

### Drawing tools

- Pencil with variable brush size
- Eraser
- Eyedropper / color picker
- Flood fill
- Undo / redo
- Zoom presets and pinch-to-zoom
- Pixel grid overlay

## Installation

### 1. Pxlpad Server (Mac)

Download the latest `.dmg` from [Releases](https://github.com/einord/pxlpad/releases), open it, and drag Pxlpad Server to your Applications folder.

The server runs in your menu bar — look for the Pxlpad icon. It starts a local WebSocket server on port 9874.

### 2. Aseprite Extension

Download `pxlpad-extension-x.x.x.aseprite-extension` from [Releases](https://github.com/einord/pxlpad/releases).

In Aseprite: **Edit → Preferences → Extensions → Add Extension** and select the downloaded file.

The extension connects to the server automatically when Aseprite starts. You can also manually connect via **Pxlpad → Connect** in the menu.

### 3. iPad Editor

With the server running on your Mac, open Safari on your iPad and navigate to:

```
http://<your-mac-ip>:5173
```

To find your Mac's IP address, go to **System Settings → Wi-Fi → Details** on your Mac.

**Install as a PWA** (recommended): Tap the share button in Safari and choose **Add to Home Screen**. This gives you a full-screen experience without the browser chrome.

> Both devices need to be on the same Wi-Fi network.

## Building from source

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+
- [Aseprite](https://www.aseprite.org/) (for testing the extension)

On macOS with Homebrew:

```bash
brew install node pnpm rust
```

### Clone and build

```bash
git clone https://github.com/einord/pxlpad.git
cd pxlpad
```

#### Server (Tauri app)

```bash
cd server
pnpm install
pnpm tauri build
```

The built app will be in `server/src-tauri/target/release/bundle/`.

#### Client (PWA)

```bash
cd client
pnpm install
pnpm run build
```

The built files will be in `client/dist/`. To serve them locally for development:

```bash
pnpm run dev
```

This starts a dev server (default port 5173) that you can access from your iPad.

#### Extension

The extension doesn't need a build step. To install it in Aseprite during development:

1. Open Aseprite
2. Go to **Edit → Preferences → Extensions → Add Extension**
3. Navigate to the `extension/` folder and select it

Or create a packaged extension:

```bash
cd extension
zip -r pxlpad.aseprite-extension .
```

### Development workflow

Start everything with a single command from the project root:

```bash
pnpm dev
```

This starts both the Tauri server and the client dev server concurrently. The client is served with `--host` so your iPad can reach it.

You can also start them individually:

```bash
pnpm dev:server    # Tauri server only
pnpm dev:client    # PWA client only
```

Then open Aseprite with the extension installed and navigate to `http://<mac-ip>:5173` on your iPad.

The client dev server hot-reloads on file changes. The Tauri dev server recompiles Rust code on save.

## License

MIT — see [LICENSE](LICENSE) for details.
