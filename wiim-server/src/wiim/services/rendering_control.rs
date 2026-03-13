use std::collections::HashMap;

use crate::wiim::soap_client::{SoapClient, SoapError};

const SERVICE_TYPE: &str = "urn:schemas-upnp-org:service:RenderingControl:1";
const CONTROL_URL: &str = "/upnp/control/rendercontrol1";

#[derive(Debug, Clone)]
pub struct RenderingControl {
    client: SoapClient,
}

#[derive(Debug)]
pub struct SimpleDeviceInfo {
    pub multi_type: String,
    pub slave_mask: String,
    pub play_mode: String,
    pub name: String,
    pub volume: u32,
    pub channel: String,
    pub slave_list: String,
    pub raw: HashMap<String, String>,
}

#[derive(Debug)]
pub struct ControlDeviceInfo {
    pub multi_type: String,
    pub play_mode: String,
    pub router: String,
    pub ssid: String,
    pub slave_mask: String,
    pub volume: u32,
    pub muted: bool,
    pub channel: String,
    pub slave_list: String,
    pub status: String,
    pub raw: HashMap<String, String>,
}

impl RenderingControl {
    pub fn new(client: SoapClient) -> Self {
        Self { client }
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
            .call(CONTROL_URL, SERVICE_TYPE, action, &full_args)
            .await?;
        Ok(resp.values)
    }

    pub async fn get_volume(&self) -> Result<u32, SoapError> {
        let v = self.call("GetVolume", &[("Channel", "Master")]).await?;
        Ok(v.get("CurrentVolume")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0))
    }

    pub async fn set_volume(&self, volume: u32) -> Result<(), SoapError> {
        let vol_str = volume.to_string();
        self.call(
            "SetVolume",
            &[("Channel", "Master"), ("DesiredVolume", &vol_str)],
        )
        .await?;
        Ok(())
    }

    pub async fn get_mute(&self) -> Result<bool, SoapError> {
        let v = self.call("GetMute", &[("Channel", "Master")]).await?;
        Ok(v.get("CurrentMute")
            .map(|s| s == "1" || s == "true")
            .unwrap_or(false))
    }

    pub async fn set_mute(&self, mute: bool) -> Result<(), SoapError> {
        let val = if mute { "1" } else { "0" };
        self.call("SetMute", &[("Channel", "Master"), ("DesiredMute", val)])
            .await?;
        Ok(())
    }

    pub async fn get_equalizer(&self) -> Result<String, SoapError> {
        let v = self.call("GetEqualizer", &[("Channel", "Master")]).await?;
        Ok(v.get("CurrentEqualizer").cloned().unwrap_or_default())
    }

    pub async fn set_equalizer(&self, eq: &str) -> Result<(), SoapError> {
        self.call(
            "SetEqualizer",
            &[("Channel", "Master"), ("DesiredEqualizer", eq)],
        )
        .await?;
        Ok(())
    }

    pub async fn list_presets(&self) -> Result<String, SoapError> {
        let v = self.call("ListPresets", &[]).await?;
        Ok(v.get("CurrentPresetNameList").cloned().unwrap_or_default())
    }

    pub async fn select_preset(&self, preset: &str) -> Result<(), SoapError> {
        self.call("SelectPreset", &[("PresetName", preset)]).await?;
        Ok(())
    }

    pub async fn multiroom_join_group(&self, master_info: &str) -> Result<(), SoapError> {
        self.call("MultiRoomJoinGroup", &[("MasterInfo", master_info)])
            .await?;
        Ok(())
    }

    pub async fn multiroom_leave_group(&self) -> Result<(), SoapError> {
        self.call("MultiRoomLeaveGroup", &[]).await?;
        Ok(())
    }

    pub async fn get_simple_device_info(&self) -> Result<SimpleDeviceInfo, SoapError> {
        let v = self.call("GetSimpleDeviceInfo", &[]).await?;
        Ok(SimpleDeviceInfo {
            multi_type: v.get("MultiType").cloned().unwrap_or_default(),
            slave_mask: v.get("SlaveMask").cloned().unwrap_or_default(),
            play_mode: v.get("PlayMode").cloned().unwrap_or_default(),
            name: v.get("Name").cloned().unwrap_or_default(),
            volume: v
                .get("CurrentVolume")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            channel: v.get("CurrentChannel").cloned().unwrap_or_default(),
            slave_list: v.get("SlaveList").cloned().unwrap_or_default(),
            raw: v,
        })
    }

    pub async fn get_control_device_info(&self) -> Result<ControlDeviceInfo, SoapError> {
        let v = self.call("GetControlDeviceInfo", &[]).await?;
        Ok(ControlDeviceInfo {
            multi_type: v.get("MultiType").cloned().unwrap_or_default(),
            play_mode: v.get("PlayMode").cloned().unwrap_or_default(),
            router: v.get("Router").cloned().unwrap_or_default(),
            ssid: v.get("Ssid").cloned().unwrap_or_default(),
            slave_mask: v.get("SlaveMask").cloned().unwrap_or_default(),
            volume: v
                .get("CurrentVolume")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            muted: v
                .get("CurrentMute")
                .map(|s| s == "1" || s == "true")
                .unwrap_or(false),
            channel: v.get("CurrentChannel").cloned().unwrap_or_default(),
            slave_list: v.get("SlaveList").cloned().unwrap_or_default(),
            status: v.get("Status").cloned().unwrap_or_default(),
            raw: v,
        })
    }

    pub async fn set_device_name(&self, name: &str) -> Result<(), SoapError> {
        self.call("SetDeviceName", &[("Name", name)]).await?;
        Ok(())
    }
}
