use std::sync::Arc;
use dashmap::DashMap;

pub struct RoomHandle;

pub struct RoomManager {
    pub rooms: Arc<DashMap<String, RoomHandle>>,
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
        }
    }
}

pub async fn expiry_task(_rooms: Arc<DashMap<String, RoomHandle>>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
    }
}
