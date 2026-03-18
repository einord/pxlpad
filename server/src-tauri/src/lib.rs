use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_PORT: u16 = 9874;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Role a WebSocket client identifies itself as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Extension,
    Client,
}

/// Minimal envelope used to inspect the `type` (and optionally `role`) field
/// of every incoming JSON message.
#[derive(Debug, Deserialize)]
struct Envelope {
    #[serde(rename = "type")]
    msg_type: String,
    role: Option<String>,
}

/// Per-connection bookkeeping.
struct Peer {
    role: Option<Role>,
    tx: mpsc::UnboundedSender<Message>,
}

/// Shared state across all connections.
type SharedState = Arc<RwLock<HashMap<u64, Peer>>>;

// ---------------------------------------------------------------------------
// Status broadcast helpers
// ---------------------------------------------------------------------------

/// Build a JSON status message reflecting current connection state.
fn build_status_json(state: &HashMap<u64, Peer>) -> String {
    let extension_connected = state
        .values()
        .any(|p| matches!(p.role, Some(Role::Extension)));
    let client_count = state
        .values()
        .filter(|p| matches!(p.role, Some(Role::Client)))
        .count();

    format!(
        r#"{{"type":"status","extensionConnected":{},"clientCount":{}}}"#,
        extension_connected, client_count
    )
}

/// Build a human-readable tooltip string for the system tray.
#[allow(dead_code)]
fn build_tooltip(state: &HashMap<u64, Peer>) -> String {
    let extension_connected = state
        .values()
        .any(|p| matches!(p.role, Some(Role::Extension)));
    let client_count = state
        .values()
        .filter(|p| matches!(p.role, Some(Role::Client)))
        .count();

    format!(
        "pxlpad server – ext:{} clients:{}",
        if extension_connected { "yes" } else { "no" },
        client_count
    )
}

/// Broadcast a status message to every registered peer.
fn broadcast_status(state: &HashMap<u64, Peer>) {
    let status = build_status_json(state);
    let msg = Message::Text(status);
    for peer in state.values() {
        if peer.role.is_some() {
            let _ = peer.tx.send(msg.clone());
        }
    }
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

/// Handle a single WebSocket connection: registration, routing, cleanup.
async fn handle_connection(stream: TcpStream, addr: SocketAddr, state: SharedState, id: u64) {
    println!("New WebSocket connection from: {addr} (id={id})");

    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed for {addr}: {e}");
            return;
        }
    };

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Create an mpsc channel so other tasks can send messages to this connection.
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register the peer (role = None until it sends a register message).
    {
        let mut s = state.write().await;
        s.insert(id, Peer { role: None, tx });
    }

    // Spawn a task that forwards messages from the mpsc channel to the WS sink.
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read loop – process incoming messages.
    while let Some(msg) = ws_read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let envelope: Envelope = match serde_json::from_str(&text) {
                    Ok(e) => e,
                    Err(e) => {
                        eprintln!("Invalid JSON from {addr}: {e}");
                        continue;
                    }
                };

                match envelope.msg_type.as_str() {
                    // --- Registration ---
                    "register" => {
                        let role = match envelope.role.as_deref() {
                            Some("extension") => Role::Extension,
                            Some("client") => Role::Client,
                            other => {
                                eprintln!("Unknown role from {addr}: {other:?}");
                                continue;
                            }
                        };
                        println!("Peer {id} ({addr}) registered as {role:?}");
                        let mut s = state.write().await;
                        if let Some(peer) = s.get_mut(&id) {
                            peer.role = Some(role);
                        }
                        broadcast_status(&s);
                    }

                    // --- Extension → Clients ---
                    "sprite-list" | "sprite-data" | "sprite-update" => {
                        let s = state.read().await;
                        // Verify sender is an extension.
                        let is_extension = s
                            .get(&id)
                            .is_some_and(|p| matches!(p.role, Some(Role::Extension)));
                        if !is_extension {
                            eprintln!("Non-extension peer {id} sent {}", envelope.msg_type);
                            continue;
                        }
                        // Broadcast to all clients.
                        let msg = Message::Text(text);
                        for peer in s.values() {
                            if matches!(peer.role, Some(Role::Client)) {
                                let _ = peer.tx.send(msg.clone());
                            }
                        }
                    }

                    // --- Client → Extension ---
                    "request-sprite-list" | "request-sprite-data" | "draw" => {
                        let s = state.read().await;
                        // Verify sender is a client.
                        let is_client = s
                            .get(&id)
                            .is_some_and(|p| matches!(p.role, Some(Role::Client)));
                        if !is_client {
                            eprintln!("Non-client peer {id} sent {}", envelope.msg_type);
                            continue;
                        }
                        // Forward to all extensions (typically one).
                        let msg = Message::Text(text);
                        for peer in s.values() {
                            if matches!(peer.role, Some(Role::Extension)) {
                                let _ = peer.tx.send(msg.clone());
                            }
                        }
                    }

                    // --- Unknown ---
                    other => {
                        println!("Unknown message type from {addr}: {other}");
                    }
                }
            }
            Ok(Message::Close(_)) => {
                println!("Connection closed: {addr} (id={id})");
                break;
            }
            Ok(_) => {} // ignore binary / ping / pong
            Err(e) => {
                eprintln!("Read error from {addr}: {e}");
                break;
            }
        }
    }

    // Cleanup: remove peer and broadcast updated status.
    {
        let mut s = state.write().await;
        s.remove(&id);
        broadcast_status(&s);
    }

    // Abort the writer task.
    write_task.abort();
    println!("Peer {id} ({addr}) disconnected");
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

/// Start the WebSocket relay server on the given port.
async fn start_ws_server(port: u16) {
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind WebSocket server to {addr}: {e}"));

    println!("WebSocket server listening on {addr}");

    let state: SharedState = Arc::new(RwLock::new(HashMap::new()));
    let mut next_id: u64 = 1;

    loop {
        match listener.accept().await {
            Ok((stream, peer_addr)) => {
                let id = next_id;
                next_id += 1;
                let state_clone = Arc::clone(&state);
                tokio::spawn(handle_connection(stream, peer_addr, state_clone, id));
            }
            Err(e) => {
                eprintln!("Accept error: {e}");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ── Hide dock icon (macOS tray-only app) ─────────────
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // ── System tray ───────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .tooltip("pxlpad server – ext:no clients:0")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ── WebSocket server (spawned on the tokio runtime) ──
            let port = DEFAULT_PORT;
            tauri::async_runtime::spawn(async move {
                start_ws_server(port).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
