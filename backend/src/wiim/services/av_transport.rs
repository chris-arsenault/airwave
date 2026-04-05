use std::collections::HashMap;

use crate::wiim::soap_client::{SoapClient, SoapError};

const SERVICE_TYPE: &str = "urn:schemas-upnp-org:service:AVTransport:1";
const DEFAULT_CONTROL_URL: &str = "/upnp/control/rendertransport1";

#[derive(Debug, Clone)]
pub struct AvTransport {
    client: SoapClient,
    control_url: String,
}

#[derive(Debug)]
pub struct PositionInfo {
    pub track: u32,
    pub track_duration: String,
    pub track_metadata: String,
    pub track_uri: String,
    pub rel_time: String,
    pub abs_time: String,
}

#[derive(Debug)]
pub struct TransportInfo {
    pub current_transport_state: String,
    pub current_transport_status: String,
    pub current_speed: String,
}

#[derive(Debug)]
pub struct MediaInfo {
    pub nr_tracks: u32,
    pub media_duration: String,
    pub current_uri: String,
    pub current_uri_metadata: String,
    pub track_source: String,
}

#[derive(Debug)]
pub struct TransportSettings {
    pub play_mode: String,
    pub rec_quality_mode: String,
}

/// Extended info — WiiM-specific action returning transport + volume + multi-room state.
#[derive(Debug)]
pub struct InfoEx {
    pub transport_state: String,
    pub track_duration: String,
    pub track_metadata: String,
    pub track_uri: String,
    pub rel_time: String,
    pub loop_mode: String,
    pub play_type: String,
    pub current_volume: String,
    pub current_mute: String,
    pub slave_flag: String,
    pub master_uuid: String,
    pub slave_list: String,
    pub track_source: String,
    pub raw: HashMap<String, String>,
}

impl AvTransport {
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
        let mut full_args = vec![("InstanceID", "0")];
        full_args.extend_from_slice(args);
        let resp = self
            .client
            .call(&self.control_url, SERVICE_TYPE, action, &full_args)
            .await?;
        Ok(resp.values)
    }

    pub async fn play(&self) -> Result<(), SoapError> {
        self.call("Play", &[("Speed", "1")]).await?;
        Ok(())
    }

    pub async fn pause(&self) -> Result<(), SoapError> {
        self.call("Pause", &[]).await?;
        Ok(())
    }

    pub async fn stop(&self) -> Result<(), SoapError> {
        self.call("Stop", &[]).await?;
        Ok(())
    }

    pub async fn next(&self) -> Result<(), SoapError> {
        self.call("Next", &[]).await?;
        Ok(())
    }

    pub async fn previous(&self) -> Result<(), SoapError> {
        self.call("Previous", &[]).await?;
        Ok(())
    }

    pub async fn seek(&self, target: &str) -> Result<(), SoapError> {
        self.call("Seek", &[("Unit", "REL_TIME"), ("Target", target)])
            .await?;
        Ok(())
    }

    pub async fn set_av_transport_uri(&self, uri: &str, metadata: &str) -> Result<(), SoapError> {
        self.call(
            "SetAVTransportURI",
            &[("CurrentURI", uri), ("CurrentURIMetaData", metadata)],
        )
        .await?;
        Ok(())
    }

    pub async fn set_next_av_transport_uri(
        &self,
        uri: &str,
        metadata: &str,
    ) -> Result<(), SoapError> {
        self.call(
            "SetNextAVTransportURI",
            &[("NextURI", uri), ("NextURIMetaData", metadata)],
        )
        .await?;
        Ok(())
    }

    pub async fn set_play_mode(&self, mode: &str) -> Result<(), SoapError> {
        self.call("SetPlayMode", &[("NewPlayMode", mode)]).await?;
        Ok(())
    }

    pub async fn get_position_info(&self) -> Result<PositionInfo, SoapError> {
        let v = self.call("GetPositionInfo", &[]).await?;
        Ok(PositionInfo {
            track: v.get("Track").and_then(|s| s.parse().ok()).unwrap_or(0),
            track_duration: v.get("TrackDuration").cloned().unwrap_or_default(),
            track_metadata: v.get("TrackMetaData").cloned().unwrap_or_default(),
            track_uri: v.get("TrackURI").cloned().unwrap_or_default(),
            rel_time: v.get("RelTime").cloned().unwrap_or_default(),
            abs_time: v.get("AbsTime").cloned().unwrap_or_default(),
        })
    }

    pub async fn get_transport_info(&self) -> Result<TransportInfo, SoapError> {
        let v = self.call("GetTransportInfo", &[]).await?;
        Ok(TransportInfo {
            current_transport_state: v.get("CurrentTransportState").cloned().unwrap_or_default(),
            current_transport_status: v.get("CurrentTransportStatus").cloned().unwrap_or_default(),
            current_speed: v.get("CurrentSpeed").cloned().unwrap_or_default(),
        })
    }

    pub async fn get_media_info(&self) -> Result<MediaInfo, SoapError> {
        let v = self.call("GetMediaInfo", &[]).await?;
        Ok(MediaInfo {
            nr_tracks: v.get("NrTracks").and_then(|s| s.parse().ok()).unwrap_or(0),
            media_duration: v.get("MediaDuration").cloned().unwrap_or_default(),
            current_uri: v.get("CurrentURI").cloned().unwrap_or_default(),
            current_uri_metadata: v.get("CurrentURIMetaData").cloned().unwrap_or_default(),
            track_source: v.get("TrackSource").cloned().unwrap_or_default(),
        })
    }

    pub async fn seek_forward(&self) -> Result<(), SoapError> {
        self.call("SeekForward", &[]).await?;
        Ok(())
    }

    pub async fn seek_backward(&self) -> Result<(), SoapError> {
        self.call("SeekBackward", &[]).await?;
        Ok(())
    }

    pub async fn get_current_transport_actions(&self) -> Result<Vec<String>, SoapError> {
        let v = self.call("GetCurrentTransportActions", &[]).await?;
        let actions = v.get("Actions").cloned().unwrap_or_default();
        Ok(actions
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect())
    }

    pub async fn get_transport_settings(&self) -> Result<TransportSettings, SoapError> {
        let v = self.call("GetTransportSettings", &[]).await?;
        Ok(TransportSettings {
            play_mode: v.get("PlayMode").cloned().unwrap_or_default(),
            rec_quality_mode: v.get("RecQualityMode").cloned().unwrap_or_default(),
        })
    }

    pub async fn get_info_ex(&self) -> Result<InfoEx, SoapError> {
        let v = self.call("GetInfoEx", &[]).await?;
        Ok(InfoEx {
            transport_state: v.get("CurrentTransportState").cloned().unwrap_or_default(),
            track_duration: v.get("TrackDuration").cloned().unwrap_or_default(),
            track_metadata: v.get("TrackMetaData").cloned().unwrap_or_default(),
            track_uri: v.get("TrackURI").cloned().unwrap_or_default(),
            rel_time: v.get("RelTime").cloned().unwrap_or_default(),
            loop_mode: v.get("LoopMode").cloned().unwrap_or_default(),
            play_type: v.get("PlayType").cloned().unwrap_or_default(),
            current_volume: v.get("CurrentVolume").cloned().unwrap_or_default(),
            current_mute: v.get("CurrentMute").cloned().unwrap_or_default(),
            slave_flag: v.get("SlaveFlag").cloned().unwrap_or_default(),
            master_uuid: v.get("MasterUUID").cloned().unwrap_or_default(),
            slave_list: v.get("SlaveList").cloned().unwrap_or_default(),
            track_source: v.get("TrackSource").cloned().unwrap_or_default(),
            raw: v,
        })
    }
}
