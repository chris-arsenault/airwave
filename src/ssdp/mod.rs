pub mod messages;

use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use tokio::net::UdpSocket;
use tracing::{debug, error, info, warn};

const SSDP_MULTICAST: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const CACHE_CONTROL_SECS: u32 = 1800;

pub struct SsdpService {
    uuid: String,
    location: String,
    server_string: String,
}

impl SsdpService {
    pub fn new(uuid: String, base_url: &str) -> Self {
        let location = format!("{base_url}/device.xml");
        let server_string = format!("Linux/1.0 UPnP/1.0 WiiMDLNA/{}", env!("CARGO_PKG_VERSION"));
        Self {
            uuid,
            location,
            server_string,
        }
    }

    fn nts(&self) -> Vec<(String, String)> {
        messages::device_nts(&self.uuid)
    }

    /// Send SSDP alive notifications for all device/service types.
    pub async fn send_alive(&self, socket: &UdpSocket) {
        let dest: SocketAddr = SocketAddr::V4(SocketAddrV4::new(SSDP_MULTICAST, SSDP_PORT));
        for (nt, usn) in self.nts() {
            let msg = messages::notify_alive(
                &self.location,
                &nt,
                &usn,
                &self.server_string,
                CACHE_CONTROL_SECS,
            );
            if let Err(e) = socket.send_to(msg.as_bytes(), dest).await {
                warn!("Failed to send SSDP alive: {e}");
            }
        }
        debug!("Sent SSDP alive notifications");
    }

    /// Send SSDP byebye notifications.
    #[allow(dead_code)]
    pub async fn send_byebye(&self, socket: &UdpSocket) {
        let dest: SocketAddr = SocketAddr::V4(SocketAddrV4::new(SSDP_MULTICAST, SSDP_PORT));
        for (nt, usn) in self.nts() {
            let msg = messages::notify_byebye(&nt, &usn);
            let _ = socket.send_to(msg.as_bytes(), dest).await;
        }
        debug!("Sent SSDP byebye notifications");
    }

    /// Handle an M-SEARCH request and send response if we match.
    fn handle_msearch(&self, data: &[u8]) -> Vec<String> {
        let text = match std::str::from_utf8(data) {
            Ok(t) => t,
            Err(_) => return Vec::new(),
        };

        if !text.starts_with("M-SEARCH") {
            return Vec::new();
        }

        let st = text
            .lines()
            .find(|l| l.to_ascii_uppercase().starts_with("ST:"))
            .map(|l| l[3..].trim().to_string());

        let st = match st {
            Some(s) => s,
            None => return Vec::new(),
        };

        let mut responses = Vec::new();
        for (nt, usn) in self.nts() {
            if st == "ssdp:all" || st == nt {
                responses.push(messages::search_response(
                    &self.location,
                    &nt,
                    &usn,
                    &self.server_string,
                    CACHE_CONTROL_SECS,
                ));
            }
        }
        responses
    }
}

/// Create a multicast UDP socket bound to SSDP port.
pub fn create_ssdp_socket(bind_ip: Ipv4Addr) -> std::io::Result<std::net::UdpSocket> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    socket.set_reuse_address(true)?;
    socket.set_nonblocking(true)?;

    let addr = SockAddr::from(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, SSDP_PORT));
    socket.bind(&addr)?;
    socket.join_multicast_v4(&SSDP_MULTICAST, &bind_ip)?;
    socket.set_multicast_if_v4(&bind_ip)?;
    socket.set_multicast_ttl_v4(4)?;

    Ok(socket.into())
}

/// Run the SSDP listener + periodic advertiser.
pub async fn run(uuid: String, base_url: String, bind_ip: Ipv4Addr) {
    let service = SsdpService::new(uuid, &base_url);

    let std_socket = match create_ssdp_socket(bind_ip) {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to create SSDP socket: {e}");
            return;
        }
    };

    let socket = UdpSocket::from_std(std_socket).expect("tokio UdpSocket from std");
    let socket = std::sync::Arc::new(socket);

    // Initial alive burst (send 3 times per spec recommendation)
    for _ in 0..3 {
        service.send_alive(&socket).await;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    info!("SSDP discovery active");

    let listen_socket = socket.clone();
    let advertise_socket = socket.clone();

    // Listener task
    let listen_service = SsdpService::new(service.uuid.clone(), &base_url);
    let listener = tokio::spawn(async move {
        let mut buf = [0u8; 2048];
        loop {
            match listen_socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    let responses = listen_service.handle_msearch(&buf[..len]);
                    for resp in responses {
                        if let Err(e) = listen_socket.send_to(resp.as_bytes(), addr).await {
                            debug!("Failed to send M-SEARCH response: {e}");
                        }
                    }
                }
                Err(e) => {
                    warn!("SSDP recv error: {e}");
                }
            }
        }
    });

    // Periodic advertiser (re-announce every cache_control / 2)
    let advertiser = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(
            CACHE_CONTROL_SECS as u64 / 2,
        ));
        loop {
            interval.tick().await;
            service.send_alive(&advertise_socket).await;
        }
    });

    tokio::select! {
        _ = listener => {},
        _ = advertiser => {},
    }
}
