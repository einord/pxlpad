// Server status UI — connects to the local WS server to show live status.

const WS_PORT = 9874;

function connectStatusWs(): void {
  const ws = new WebSocket(`ws://localhost:${WS_PORT}`);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "register", role: "client" }));
  });

  ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (msg.type === "status") {
        updateStatus(msg.extensionConnected, msg.clientCount);
      }
    } catch {
      // ignore non-JSON
    }
  });

  ws.addEventListener("close", () => {
    setTimeout(connectStatusWs, 3000);
  });

  ws.addEventListener("error", () => {
    ws.close();
  });
}

function updateStatus(extConnected: boolean, clientCount: number): void {
  const extEl = document.getElementById("ext-status");
  const clientEl = document.getElementById("client-count");

  if (extEl) {
    const dot = extConnected ? '<span class="dot green"></span>' : '<span class="dot red"></span>';
    extEl.innerHTML = `${dot}${extConnected ? "Connected" : "Disconnected"}`;
  }

  if (clientEl) {
    // Subtract 1 because this status window itself counts as a client
    const actual = Math.max(0, clientCount - 1);
    clientEl.textContent = String(actual);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  connectStatusWs();
});
