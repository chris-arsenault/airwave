use std::collections::HashMap;

use crate::wiim::soap_client::{SoapClient, SoapError};

const SERVICE_TYPE: &str = "urn:schemas-wiimu-com:service:PlayQueue:1";
const DEFAULT_CONTROL_URL: &str = "/upnp/control/PlayQueue1";

#[derive(Debug, Clone)]
pub struct PlayQueueService {
    client: SoapClient,
    control_url: String,
}

#[derive(Debug)]
pub struct QueueIndex {
    pub current_index: u32,
    pub preloading_index: u32,
    pub current_page: String,
    pub track_nums: u32,
}

impl PlayQueueService {
    pub fn new(client: SoapClient) -> Self {
        Self {
            client,
            control_url: DEFAULT_CONTROL_URL.to_string(),
        }
    }

    pub fn with_control_url(client: SoapClient, control_url: String) -> Self {
        Self {
            client,
            control_url,
        }
    }

    async fn call(
        &self,
        action: &str,
        args: &[(&str, &str)],
    ) -> Result<HashMap<String, String>, SoapError> {
        let resp = self
            .client
            .call(&self.control_url, SERVICE_TYPE, action, args)
            .await?;
        Ok(resp.values)
    }

    pub async fn create_queue(&self, context: &str) -> Result<(), SoapError> {
        self.call("CreateQueue", &[("QueueContext", context)])
            .await?;
        Ok(())
    }

    pub async fn replace_queue(&self, context: &str) -> Result<(), SoapError> {
        self.call("ReplaceQueue", &[("QueueContext", context)])
            .await?;
        Ok(())
    }

    pub async fn append_queue(&self, context: &str) -> Result<(), SoapError> {
        self.call("AppendQueue", &[("QueueContext", context)])
            .await?;
        Ok(())
    }

    pub async fn delete_queue(&self, name: &str) -> Result<(), SoapError> {
        self.call("DeleteQueue", &[("QueueName", name)]).await?;
        Ok(())
    }

    pub async fn browse_queue(&self, name: &str) -> Result<String, SoapError> {
        let v = self.call("BrowseQueue", &[("QueueName", name)]).await?;
        Ok(v.get("QueueContext").cloned().unwrap_or_default())
    }

    pub async fn browse_queue_ex(
        &self,
        name: &str,
        index: u32,
        count: u32,
    ) -> Result<String, SoapError> {
        let idx = index.to_string();
        let cnt = count.to_string();
        let v = self
            .call(
                "BrowseQueueEx",
                &[
                    ("QueueName", name),
                    ("TrackIndex", &idx),
                    ("TrackNums", &cnt),
                ],
            )
            .await?;
        Ok(v.get("QueueContext").cloned().unwrap_or_default())
    }

    pub async fn play_queue_with_index(&self, name: &str, index: u32) -> Result<(), SoapError> {
        let idx = index.to_string();
        self.call(
            "PlayQueueWithIndex",
            &[("QueueName", name), ("Index", &idx)],
        )
        .await?;
        Ok(())
    }

    pub async fn remove_tracks(
        &self,
        name: &str,
        start: u32,
        end: u32,
        action: &str,
    ) -> Result<(), SoapError> {
        let s = start.to_string();
        let e = end.to_string();
        self.call(
            "RemoveTracksInQueue",
            &[
                ("QueueName", name),
                ("RangStart", &s),
                ("RangEnd", &e),
                ("Action", action),
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn set_loop_mode(&self, mode: &str) -> Result<(), SoapError> {
        self.call("SetQueueLoopMode", &[("LoopMode", mode)]).await?;
        Ok(())
    }

    pub async fn get_loop_mode(&self) -> Result<String, SoapError> {
        let v = self.call("GetQueueLoopMode", &[]).await?;
        Ok(v.get("LoopMode").cloned().unwrap_or_default())
    }

    pub async fn get_queue_index(&self, name: &str) -> Result<QueueIndex, SoapError> {
        let v = self.call("GetQueueIndex", &[("QueueName", name)]).await?;
        Ok(QueueIndex {
            current_index: v
                .get("CurrentIndex")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            preloading_index: v
                .get("PreloadingIndex")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            current_page: v.get("CurrentPage").cloned().unwrap_or_default(),
            track_nums: v.get("TrackNums").and_then(|s| s.parse().ok()).unwrap_or(0),
        })
    }

    pub async fn append_tracks_ex(
        &self,
        context: &str,
        direction: u32,
        start_index: u32,
        play: u32,
        action: &str,
    ) -> Result<(), SoapError> {
        let dir = direction.to_string();
        let si = start_index.to_string();
        let p = play.to_string();
        self.call(
            "AppendTracksInQueueEx",
            &[
                ("QueueContext", context),
                ("Direction", &dir),
                ("StartIndex", &si),
                ("Play", &p),
                ("Action", action),
            ],
        )
        .await?;
        Ok(())
    }
}
