use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_PORT: u16 = 9874;

/// Accept a single WebSocket connection and echo messages back.
async fn handle_connection(stream: TcpStream, addr: SocketAddr) {
    println!("New WebSocket connection from: {addr}");

    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed for {addr}: {e}");
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                println!("Received from {addr}: {text}");
                // Echo back for now – will be replaced with bridge logic later
                if let Err(e) = write.send(Message::Text(text)).await {
                    eprintln!("Send error to {addr}: {e}");
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                println!("Connection closed: {addr}");
                break;
            }
            Ok(_) => {} // ignore binary / ping / pong for now
            Err(e) => {
                eprintln!("Read error from {addr}: {e}");
                break;
            }
        }
    }
}

/// Start the WebSocket server on the given port.
async fn start_ws_server(port: u16) {
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind WebSocket server to {addr}: {e}"));

    println!("WebSocket server listening on {addr}");

    loop {
        match listener.accept().await {
            Ok((stream, peer_addr)) => {
                tokio::spawn(handle_connection(stream, peer_addr));
            }
            Err(e) => {
                eprintln!("Accept error: {e}");
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ── System tray ───────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("pxlpad server")
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
