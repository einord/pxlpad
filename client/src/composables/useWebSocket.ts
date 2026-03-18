import { useEditorState } from "./useEditorState.ts";

const WS_RECONNECT_INTERVAL_MS = 3000;

type MessageHandler = (msg: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let onMessageHandler: MessageHandler | null = null;

export function useWebSocket() {
  const { setStatus } = useEditorState();

  function sendMessage(msg: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function connect(onMessage: MessageHandler): void {
    onMessageHandler = onMessage;

    const wsProtocol =
      window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function doConnect(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        console.log("[WS] Connected to", wsUrl);
        setStatus("Connected", true);

        sendMessage({ type: "register", role: "client" });
        sendMessage({ type: "request-sprite-list" });
        sendMessage({ type: "request-palette" });
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          console.warn("[WS] Non-JSON message:", event.data);
          return;
        }
        onMessageHandler?.(msg);
      });

      ws.addEventListener("close", (ev) => {
        console.log(
          "[WS] Disconnected. Code:",
          ev.code,
          "Reason:",
          ev.reason,
        );
        setStatus("Disconnected", false);
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
          doConnect();
        }, WS_RECONNECT_INTERVAL_MS);
      }
    }

    doConnect();
  }

  return { sendMessage, connect };
}
