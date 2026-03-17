# Pxlpad Aseprite Extension

Syncs sprite data from Aseprite to the Pxlpad iPad editor via a local WebSocket server.

## Installation

1. Open Aseprite.
2. Go to **Edit > Preferences > Extensions > Add Extension**.
3. Select this folder (or a `.zip` of it).
4. Restart Aseprite.

Alternatively, copy (or symlink) the `extension/` folder into your Aseprite extensions directory:

- **macOS**: `~/Library/Application Support/Aseprite/extensions/pxlpad/`
- **Windows**: `%APPDATA%\Aseprite\extensions\pxlpad\`
- **Linux**: `~/.config/aseprite/extensions/pxlpad/`

## Usage

- The extension automatically connects to `ws://localhost:9874` on startup.
- Use **Pxlpad: Connect** from the menu to manually reconnect.
- The server address can be changed in the extension preferences.
