//! SSDP message templates per UPnP Device Architecture 1.0

pub fn notify_alive(
    location: &str,
    nt: &str,
    usn: &str,
    server: &str,
    cache_control_secs: u32,
) -> String {
    format!(
        "NOTIFY * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         CACHE-CONTROL: max-age={cache_control_secs}\r\n\
         LOCATION: {location}\r\n\
         NT: {nt}\r\n\
         NTS: ssdp:alive\r\n\
         SERVER: {server}\r\n\
         USN: {usn}\r\n\
         \r\n"
    )
}

#[allow(dead_code)]
pub fn notify_byebye(nt: &str, usn: &str) -> String {
    format!(
        "NOTIFY * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         NT: {nt}\r\n\
         NTS: ssdp:byebye\r\n\
         USN: {usn}\r\n\
         \r\n"
    )
}

pub fn search_response(
    location: &str,
    st: &str,
    usn: &str,
    server: &str,
    cache_control_secs: u32,
) -> String {
    let date = httpdate::fmt_http_date(std::time::SystemTime::now());
    format!(
        "HTTP/1.1 200 OK\r\n\
         CACHE-CONTROL: max-age={cache_control_secs}\r\n\
         DATE: {date}\r\n\
         EXT:\r\n\
         LOCATION: {location}\r\n\
         SERVER: {server}\r\n\
         ST: {st}\r\n\
         USN: {usn}\r\n\
         \r\n"
    )
}

/// The notification types (NT) and USN values a MediaServer:1 device must advertise.
pub fn device_nts(uuid: &str) -> Vec<(String, String)> {
    let device_udn = format!("uuid:{uuid}");
    vec![
        // Root device
        (
            "upnp:rootdevice".to_string(),
            format!("{device_udn}::upnp:rootdevice"),
        ),
        // Device UUID
        (device_udn.clone(), device_udn.clone()),
        // MediaServer device type
        (
            "urn:schemas-upnp-org:device:MediaServer:1".to_string(),
            format!("{device_udn}::urn:schemas-upnp-org:device:MediaServer:1"),
        ),
        // ContentDirectory service
        (
            "urn:schemas-upnp-org:service:ContentDirectory:1".to_string(),
            format!("{device_udn}::urn:schemas-upnp-org:service:ContentDirectory:1"),
        ),
        // ConnectionManager service
        (
            "urn:schemas-upnp-org:service:ConnectionManager:1".to_string(),
            format!("{device_udn}::urn:schemas-upnp-org:service:ConnectionManager:1"),
        ),
    ]
}
