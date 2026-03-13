use axum::response::sse::{Event, KeepAlive, Sse};
use futures_core::Stream;
use serde::Serialize;
use std::convert::Infallible;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use super::state::ControlState;

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<String>,
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub fn publish<T: Serialize>(&self, event_type: &str, data: &T) {
        let payload = serde_json::json!({
            "type": event_type,
            "data": data,
        });
        let _ = self.tx.send(payload.to_string());
    }

    pub fn subscribe(&self) -> impl Stream<Item = Result<Event, Infallible>> {
        let rx = self.tx.subscribe();
        BroadcastStream::new(rx).filter_map(|result| match result {
            Ok(data) => Some(Ok(Event::default().data(data))),
            Err(_) => None,
        })
    }
}

pub async fn sse_handler(
    axum::extract::State(state): axum::extract::State<ControlState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    Sse::new(state.events.subscribe()).keep_alive(KeepAlive::default())
}
