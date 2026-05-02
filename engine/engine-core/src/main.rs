use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use tower_http::services::ServeDir;
use std::sync::Arc;

mod protocol;
mod room;
mod room_manager;
mod input_delay;
mod broadcast;
mod game_loop;

pub struct AppState {
    pub rooms: Arc<room_manager::RoomManager>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let state = Arc::new(AppState {
        rooms: Arc::new(room_manager::RoomManager::new()),
    });
    // Spawn room expiry background task (D-08)
    tokio::spawn(room_manager::expiry_task(state.rooms.rooms.clone()));
    let app = Router::new()
        .route("/ws/player/:room_code", get(ws_player))
        .route("/ws/spectator/:room_code", get(ws_spectator))
        .nest_service("/mobile", ServeDir::new("mobile/dist"))
        .nest_service("/overlay", ServeDir::new("overlay/dist"))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("engine-core listening on 0.0.0.0:8000");
    axum::serve(listener, app).await.unwrap();
}

async fn ws_player(
    Path(room_code): Path<String>,
    State(app): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_player(socket, room_code, app))
}

async fn handle_player(
    socket: axum::extract::ws::WebSocket,
    room_code: String,
    _app: Arc<AppState>,
) {
    tracing::info!("player connected to room {}", room_code);
    // TODO: wire to room actor in Plan 03
    let _ = socket;
}

async fn ws_spectator(
    Path(room_code): Path<String>,
    State(app): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_spectator(socket, room_code, app))
}

async fn handle_spectator(
    socket: axum::extract::ws::WebSocket,
    room_code: String,
    _app: Arc<AppState>,
) {
    tracing::info!("spectator connected to room {}", room_code);
    // TODO: wire to broadcast channels in Plan 04
    let _ = socket;
}
