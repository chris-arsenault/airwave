use crate::upnp::soap;

const SERVICE_TYPE: &str = "urn:schemas-upnp-org:service:ConnectionManager:1";

/// Audio MIME types we support, as DLNA protocol info strings.
const SOURCE_PROTOCOLS: &str = "\
http-get:*:audio/mpeg:*,\
http-get:*:audio/flac:*,\
http-get:*:audio/x-flac:*,\
http-get:*:audio/wav:*,\
http-get:*:audio/x-wav:*,\
http-get:*:audio/aac:*,\
http-get:*:audio/mp4:*,\
http-get:*:audio/x-m4a:*,\
http-get:*:audio/ogg:*,\
http-get:*:audio/x-aiff:*,\
http-get:*:audio/L16:*,\
http-get:*:audio/x-ms-wma:*";

pub fn handle_action(action: &soap::SoapAction) -> Result<(String, u16), (String, u16)> {
    match action.action_name.as_str() {
        "GetProtocolInfo" => {
            let body = soap::soap_response(
                SERVICE_TYPE,
                "GetProtocolInfo",
                &[("Source", SOURCE_PROTOCOLS), ("Sink", "")],
            );
            Ok((body, 200))
        }
        "GetCurrentConnectionIDs" => {
            let body = soap::soap_response(
                SERVICE_TYPE,
                "GetCurrentConnectionIDs",
                &[("ConnectionIDs", "0")],
            );
            Ok((body, 200))
        }
        "GetCurrentConnectionInfo" => {
            let body = soap::soap_response(
                SERVICE_TYPE,
                "GetCurrentConnectionInfo",
                &[
                    ("RcsID", "-1"),
                    ("AVTransportID", "-1"),
                    ("ProtocolInfo", ""),
                    ("PeerConnectionManager", ""),
                    ("PeerConnectionID", "-1"),
                    ("Direction", "Output"),
                    ("Status", "OK"),
                ],
            );
            Ok((body, 200))
        }
        _ => {
            let body = soap::soap_fault("s:Client", "UPnPError", 401, "Invalid Action");
            Err((body, 401))
        }
    }
}
