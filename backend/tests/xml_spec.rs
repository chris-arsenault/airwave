/// Tests for XML spec consistency of UPnP device/service descriptions,
/// SOAP envelopes, and DIDL-Lite output.
use roxmltree::Document;

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

fn parse_xml(xml: &str) -> Document<'_> {
    Document::parse(xml).unwrap_or_else(|e| panic!("Invalid XML: {e}\n--- XML ---\n{xml}"))
}

fn find_element<'a>(doc: &'a Document, local_name: &str) -> roxmltree::Node<'a, 'a> {
    doc.descendants()
        .find(|n| n.is_element() && n.tag_name().name() == local_name)
        .unwrap_or_else(|| panic!("Element <{local_name}> not found"))
}

fn find_elements<'a>(doc: &'a Document, local_name: &str) -> Vec<roxmltree::Node<'a, 'a>> {
    doc.descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == local_name)
        .collect()
}

fn element_text(doc: &Document, local_name: &str) -> String {
    find_element(doc, local_name)
        .text()
        .unwrap_or("")
        .to_string()
}

// ──────────────────────────────────────────────
// Device Description (device.xml)
// ──────────────────────────────────────────────

mod device_description {
    use super::*;

    fn xml() -> String {
        airwave_server::upnp::xml::device_description(
            "test-uuid-1234",
            "Test Server",
            "http://192.168.1.1:7882",
        )
    }

    #[test]
    fn is_valid_xml() {
        let s = xml();
        parse_xml(&s);
    }

    #[test]
    fn has_correct_root_element() {
        let s = xml();
        let doc = parse_xml(&s);
        let root = doc.root_element();
        assert_eq!(root.tag_name().name(), "root");
        assert_eq!(
            root.tag_name().namespace(),
            Some("urn:schemas-upnp-org:device-1-0")
        );
    }

    #[test]
    fn has_spec_version_1_0() {
        let s = xml();
        let doc = parse_xml(&s);
        assert_eq!(element_text(&doc, "major"), "1");
        assert_eq!(element_text(&doc, "minor"), "0");
    }

    #[test]
    fn has_media_server_device_type() {
        let s = xml();
        let doc = parse_xml(&s);
        assert_eq!(
            element_text(&doc, "deviceType"),
            "urn:schemas-upnp-org:device:MediaServer:1"
        );
    }

    #[test]
    fn has_friendly_name() {
        let s = xml();
        let doc = parse_xml(&s);
        assert_eq!(element_text(&doc, "friendlyName"), "Test Server");
    }

    #[test]
    fn has_udn_with_uuid_prefix() {
        let s = xml();
        let doc = parse_xml(&s);
        let udn = element_text(&doc, "UDN");
        assert!(
            udn.starts_with("uuid:"),
            "UDN must start with 'uuid:': {udn}"
        );
        assert_eq!(udn, "uuid:test-uuid-1234");
    }

    #[test]
    fn has_content_directory_service() {
        let s = xml();
        let doc = parse_xml(&s);
        let services = find_elements(&doc, "service");
        let cd = services.iter().find(|s| {
            s.descendants()
                .any(|n| n.text() == Some("urn:schemas-upnp-org:service:ContentDirectory:1"))
        });
        assert!(cd.is_some(), "ContentDirectory:1 service not found");

        let cd = cd.unwrap();
        let service_id = cd
            .descendants()
            .find(|n| n.tag_name().name() == "serviceId")
            .and_then(|n| n.text());
        assert_eq!(service_id, Some("urn:upnp-org:serviceId:ContentDirectory"));
    }

    #[test]
    fn has_connection_manager_service() {
        let s = xml();
        let doc = parse_xml(&s);
        let services = find_elements(&doc, "service");
        let cm = services.iter().find(|s| {
            s.descendants()
                .any(|n| n.text() == Some("urn:schemas-upnp-org:service:ConnectionManager:1"))
        });
        assert!(cm.is_some(), "ConnectionManager:1 service not found");
    }

    #[test]
    fn has_url_base() {
        let s = xml();
        let doc = parse_xml(&s);
        assert_eq!(element_text(&doc, "URLBase"), "http://192.168.1.1:7882");
    }

    #[test]
    fn has_required_urls_for_each_service() {
        let s = xml();
        let doc = parse_xml(&s);
        let services = find_elements(&doc, "service");
        for svc in services {
            let children: Vec<_> = svc
                .children()
                .filter(|c| c.is_element())
                .map(|c| c.tag_name().name().to_string())
                .collect();
            for required in &[
                "serviceType",
                "serviceId",
                "SCPDURL",
                "controlURL",
                "eventSubURL",
            ] {
                assert!(
                    children.contains(&required.to_string()),
                    "Service missing required element: {required}"
                );
            }
        }
    }
}

// ──────────────────────────────────────────────
// ContentDirectory SCPD
// ──────────────────────────────────────────────

mod content_directory_scpd {
    use super::*;

    fn xml() -> &'static str {
        airwave_server::upnp::xml::content_directory_scpd()
    }

    #[test]
    fn is_valid_xml() {
        parse_xml(xml());
    }

    #[test]
    fn has_correct_root_element() {
        let doc = parse_xml(xml());
        let root = doc.root_element();
        assert_eq!(root.tag_name().name(), "scpd");
        assert_eq!(
            root.tag_name().namespace(),
            Some("urn:schemas-upnp-org:service-1-0")
        );
    }

    #[test]
    fn has_required_actions() {
        let doc = parse_xml(xml());
        let actions: Vec<String> = find_elements(&doc, "action")
            .iter()
            .filter_map(|a| {
                a.descendants()
                    .find(|n| {
                        n.tag_name().name() == "name"
                            && n.parent().unwrap().tag_name().name() == "action"
                    })
                    .and_then(|n| n.text().map(|t| t.to_string()))
            })
            .collect();

        for required in &[
            "Browse",
            "Search",
            "GetSearchCapabilities",
            "GetSortCapabilities",
            "GetSystemUpdateID",
        ] {
            assert!(
                actions.contains(&required.to_string()),
                "Missing required action: {required}. Found: {actions:?}"
            );
        }
    }

    #[test]
    fn browse_has_required_arguments() {
        let doc = parse_xml(xml());
        let browse = find_elements(&doc, "action")
            .into_iter()
            .find(|a| {
                a.descendants()
                    .any(|n| n.tag_name().name() == "name" && n.text() == Some("Browse"))
            })
            .expect("Browse action not found");

        let arg_names: Vec<String> = browse
            .descendants()
            .filter(|n| {
                n.tag_name().name() == "name" && n.parent().unwrap().tag_name().name() == "argument"
            })
            .filter_map(|n| n.text().map(|t| t.to_string()))
            .collect();

        for required in &[
            "ObjectID",
            "BrowseFlag",
            "Filter",
            "StartingIndex",
            "RequestedCount",
            "SortCriteria",
            "Result",
            "NumberReturned",
            "TotalMatches",
            "UpdateID",
        ] {
            assert!(
                arg_names.contains(&required.to_string()),
                "Browse missing argument: {required}. Found: {arg_names:?}"
            );
        }
    }

    #[test]
    fn browse_flag_allows_metadata_and_direct_children() {
        let doc = parse_xml(xml());
        let allowed: Vec<String> = find_elements(&doc, "stateVariable")
            .into_iter()
            .find(|sv| {
                sv.descendants().any(|n| {
                    n.tag_name().name() == "name" && n.text() == Some("A_ARG_TYPE_BrowseFlag")
                })
            })
            .expect("BrowseFlag state variable not found")
            .descendants()
            .filter(|n| n.tag_name().name() == "allowedValue")
            .filter_map(|n| n.text().map(|t| t.to_string()))
            .collect();

        assert!(allowed.contains(&"BrowseMetadata".to_string()));
        assert!(allowed.contains(&"BrowseDirectChildren".to_string()));
    }

    #[test]
    fn has_system_update_id_state_variable_with_events() {
        let doc = parse_xml(xml());
        let sv = find_elements(&doc, "stateVariable")
            .into_iter()
            .find(|sv| {
                sv.descendants()
                    .any(|n| n.tag_name().name() == "name" && n.text() == Some("SystemUpdateID"))
            })
            .expect("SystemUpdateID state variable not found");

        let send_events = sv.attribute("sendEvents");
        assert_eq!(send_events, Some("yes"), "SystemUpdateID must send events");
    }

    #[test]
    fn all_arguments_reference_existing_state_variables() {
        let doc = parse_xml(xml());

        let state_vars: Vec<String> = find_elements(&doc, "stateVariable")
            .iter()
            .filter_map(|sv| {
                sv.descendants()
                    .find(|n| n.tag_name().name() == "name")
                    .and_then(|n| n.text().map(|t| t.to_string()))
            })
            .collect();

        let refs: Vec<String> = find_elements(&doc, "relatedStateVariable")
            .iter()
            .filter_map(|n| n.text().map(|t| t.to_string()))
            .collect();

        for r in &refs {
            assert!(
                state_vars.contains(r),
                "Argument references non-existent state variable: {r}"
            );
        }
    }
}

// ──────────────────────────────────────────────
// ConnectionManager SCPD
// ──────────────────────────────────────────────

mod connection_manager_scpd {
    use super::*;

    fn xml() -> &'static str {
        airwave_server::upnp::xml::connection_manager_scpd()
    }

    #[test]
    fn is_valid_xml() {
        parse_xml(xml());
    }

    #[test]
    fn has_required_actions() {
        let doc = parse_xml(xml());
        let actions: Vec<String> = find_elements(&doc, "action")
            .iter()
            .filter_map(|a| {
                a.descendants()
                    .find(|n| {
                        n.tag_name().name() == "name"
                            && n.parent().unwrap().tag_name().name() == "action"
                    })
                    .and_then(|n| n.text().map(|t| t.to_string()))
            })
            .collect();

        for required in &[
            "GetProtocolInfo",
            "GetCurrentConnectionIDs",
            "GetCurrentConnectionInfo",
        ] {
            assert!(
                actions.contains(&required.to_string()),
                "Missing required action: {required}"
            );
        }
    }

    #[test]
    fn has_evented_source_protocol_info() {
        let doc = parse_xml(xml());
        let sv = find_elements(&doc, "stateVariable")
            .into_iter()
            .find(|sv| {
                sv.descendants().any(|n| {
                    n.tag_name().name() == "name" && n.text() == Some("SourceProtocolInfo")
                })
            })
            .expect("SourceProtocolInfo not found");
        assert_eq!(sv.attribute("sendEvents"), Some("yes"));
    }

    #[test]
    fn all_arguments_reference_existing_state_variables() {
        let doc = parse_xml(xml());

        let state_vars: Vec<String> = find_elements(&doc, "stateVariable")
            .iter()
            .filter_map(|sv| {
                sv.descendants()
                    .find(|n| n.tag_name().name() == "name")
                    .and_then(|n| n.text().map(|t| t.to_string()))
            })
            .collect();

        let refs: Vec<String> = find_elements(&doc, "relatedStateVariable")
            .iter()
            .filter_map(|n| n.text().map(|t| t.to_string()))
            .collect();

        for r in &refs {
            assert!(
                state_vars.contains(r),
                "Argument references non-existent state variable: {r}"
            );
        }
    }
}

// ──────────────────────────────────────────────
// SOAP Envelope
// ──────────────────────────────────────────────

mod soap_envelope {
    use super::*;

    #[test]
    fn response_is_valid_xml() {
        let s = airwave_server::upnp::soap::soap_response(
            "urn:schemas-upnp-org:service:ContentDirectory:1",
            "Browse",
            &[
                ("Result", "&lt;DIDL-Lite/&gt;"),
                ("NumberReturned", "0"),
                ("TotalMatches", "0"),
                ("UpdateID", "1"),
            ],
        );
        parse_xml(&s);
    }

    #[test]
    fn response_has_correct_envelope_structure() {
        let s = airwave_server::upnp::soap::soap_response(
            "urn:schemas-upnp-org:service:ContentDirectory:1",
            "GetSystemUpdateID",
            &[("Id", "42")],
        );
        let doc = parse_xml(&s);

        let envelope = doc.root_element();
        assert_eq!(envelope.tag_name().name(), "Envelope");
        assert_eq!(
            envelope.tag_name().namespace(),
            Some("http://schemas.xmlsoap.org/soap/envelope/")
        );

        let body = find_element(&doc, "Body");
        assert_eq!(
            body.tag_name().namespace(),
            Some("http://schemas.xmlsoap.org/soap/envelope/")
        );

        let response = find_element(&doc, "GetSystemUpdateIDResponse");
        assert!(response.tag_name().namespace().is_some());
    }

    #[test]
    fn response_contains_arguments() {
        let s = airwave_server::upnp::soap::soap_response(
            "urn:schemas-upnp-org:service:ContentDirectory:1",
            "GetSystemUpdateID",
            &[("Id", "42")],
        );
        let doc = parse_xml(&s);
        assert_eq!(element_text(&doc, "Id"), "42");
    }

    #[test]
    fn fault_is_valid_xml() {
        let s =
            airwave_server::upnp::soap::soap_fault("s:Client", "UPnPError", 401, "Invalid Action");
        parse_xml(&s);
    }

    #[test]
    fn fault_has_correct_structure() {
        let s =
            airwave_server::upnp::soap::soap_fault("s:Client", "UPnPError", 701, "No such object");
        let doc = parse_xml(&s);

        assert_eq!(element_text(&doc, "faultcode"), "s:Client");
        assert_eq!(element_text(&doc, "faultstring"), "UPnPError");
        assert_eq!(element_text(&doc, "errorCode"), "701");
        assert_eq!(element_text(&doc, "errorDescription"), "No such object");
    }

    #[test]
    fn parse_soap_action_extracts_args() {
        let body = br#"<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>0</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>0</StartingIndex>
      <RequestedCount>10</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>"#;

        let action = airwave_server::upnp::soap::parse_soap_action(
            "\"urn:schemas-upnp-org:service:ContentDirectory:1#Browse\"",
            body,
        )
        .expect("parse failed");

        assert_eq!(action.action_name, "Browse");
        assert_eq!(action.args.get("ObjectID").unwrap(), "0");
        assert_eq!(
            action.args.get("BrowseFlag").unwrap(),
            "BrowseDirectChildren"
        );
        assert_eq!(action.args.get("RequestedCount").unwrap(), "10");
    }
}

// ──────────────────────────────────────────────
// DIDL-Lite
// ──────────────────────────────────────────────

mod didl_lite {
    use super::*;
    use airwave_server::media::library::{Container, Track};
    use airwave_server::media::metadata::TrackMetadata;
    use airwave_server::upnp::didl::DidlWriter;
    use std::path::PathBuf;
    use std::time::Duration;

    fn sample_container() -> Container {
        Container {
            id: "a1".to_string(),
            parent_id: "0".to_string(),
            title: "Test Artist".to_string(),
            children: vec!["al1".to_string()],
            child_count: 1,
            upnp_class: "object.container.person.musicArtist",
        }
    }

    fn sample_track() -> Track {
        Track {
            id: "t1".to_string(),
            parent_id: "al1".to_string(),
            path: PathBuf::from("/music/test.flac"),
            meta: TrackMetadata {
                title: "Test Song".to_string(),
                artist: "Test Artist".to_string(),
                album: "Test Album".to_string(),
                album_artist: "Test Artist".to_string(),
                track_number: Some(3),
                disc_number: Some(1),
                duration: Some(Duration::from_secs(245)),
                genre: Some("Rock".to_string()),
                year: Some(2024),
                mime_type: "audio/flac".to_string(),
                size_bytes: 30_000_000,
                sample_rate: Some(44100),
                bit_depth: Some(16),
                channels: Some(2),
            },
        }
    }

    #[test]
    fn empty_didl_is_valid_xml() {
        let didl = DidlWriter::new();
        let s = didl.finish();
        let doc = parse_xml(&s);
        let root = doc.root_element();
        assert_eq!(root.tag_name().name(), "DIDL-Lite");
    }

    #[test]
    fn didl_has_required_namespaces() {
        let didl = DidlWriter::new();
        let s = didl.finish();
        let doc = parse_xml(&s);
        let root = doc.root_element();

        let namespaces: Vec<_> = root.namespaces().map(|ns| ns.uri().to_string()).collect();

        assert!(namespaces.contains(&"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/".to_string()));
        assert!(namespaces.contains(&"http://purl.org/dc/elements/1.1/".to_string()));
        assert!(namespaces.contains(&"urn:schemas-upnp-org:metadata-1-0/upnp/".to_string()));
    }

    #[test]
    fn container_has_required_attributes() {
        let mut didl = DidlWriter::new();
        didl.write_container(&sample_container());
        let s = didl.finish();
        let doc = parse_xml(&s);

        let container = find_element(&doc, "container");
        assert_eq!(container.attribute("id"), Some("a1"));
        assert_eq!(container.attribute("parentID"), Some("0"));
        assert_eq!(container.attribute("restricted"), Some("true"));
        assert_eq!(container.attribute("childCount"), Some("1"));
    }

    #[test]
    fn container_has_title_and_class() {
        let mut didl = DidlWriter::new();
        didl.write_container(&sample_container());
        let s = didl.finish();
        let doc = parse_xml(&s);

        assert_eq!(element_text(&doc, "title"), "Test Artist");
        assert_eq!(
            element_text(&doc, "class"),
            "object.container.person.musicArtist"
        );
    }

    #[test]
    fn track_item_has_required_attributes() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let item = find_element(&doc, "item");
        assert_eq!(item.attribute("id"), Some("t1"));
        assert_eq!(item.attribute("parentID"), Some("al1"));
        assert_eq!(item.attribute("restricted"), Some("true"));
    }

    #[test]
    fn track_has_dc_metadata() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        assert_eq!(element_text(&doc, "title"), "Test Song");
        assert_eq!(element_text(&doc, "creator"), "Test Artist");
    }

    #[test]
    fn track_has_upnp_class() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        assert_eq!(
            element_text(&doc, "class"),
            "object.item.audioItem.musicTrack"
        );
    }

    #[test]
    fn track_has_res_element_with_protocol_info() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let res = find_element(&doc, "res");
        let proto = res.attribute("protocolInfo").expect("protocolInfo missing");
        assert!(
            proto.starts_with("http-get:*:audio/flac:"),
            "protocolInfo should start with transport:*:mime: got {proto}"
        );
        assert!(
            proto.contains("DLNA.ORG_OP=01"),
            "protocolInfo must include DLNA.ORG_OP=01 for seek support"
        );
    }

    #[test]
    fn track_res_has_size() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let res = find_element(&doc, "res");
        assert_eq!(res.attribute("size"), Some("30000000"));
    }

    #[test]
    fn track_res_has_duration_in_hhmmss_format() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let res = find_element(&doc, "res");
        let dur = res.attribute("duration").expect("duration missing");
        // 245 seconds = 0:04:05
        assert_eq!(dur, "0:04:05.000");
    }

    #[test]
    fn track_res_has_audio_properties() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let res = find_element(&doc, "res");
        assert_eq!(res.attribute("sampleFrequency"), Some("44100"));
        assert_eq!(res.attribute("nrAudioChannels"), Some("2"));
        assert_eq!(res.attribute("bitsPerSample"), Some("16"));
    }

    #[test]
    fn track_res_url_contains_base_url_and_track_id() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let res = find_element(&doc, "res");
        let url = res.text().expect("res should contain URL text");
        assert!(url.starts_with("http://192.168.1.1:7882/media/"));
        assert!(url.contains("t1"));
    }

    #[test]
    fn track_has_genre_when_present() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        assert_eq!(element_text(&doc, "genre"), "Rock");
    }

    #[test]
    fn track_has_original_track_number() {
        let mut didl = DidlWriter::new();
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        assert_eq!(element_text(&doc, "originalTrackNumber"), "3");
    }

    #[test]
    fn multiple_items_produce_valid_xml() {
        let mut didl = DidlWriter::new();
        didl.write_container(&sample_container());
        didl.write_track(&sample_track(), "http://192.168.1.1:7882");
        let s = didl.finish();
        let doc = parse_xml(&s);

        let containers = find_elements(&doc, "container");
        let items = find_elements(&doc, "item");
        assert_eq!(containers.len(), 1);
        assert_eq!(items.len(), 1);
    }
}

// ──────────────────────────────────────────────
// SSDP Messages
// ──────────────────────────────────────────────

mod ssdp_messages {
    use airwave_server::ssdp::messages;

    #[test]
    fn notify_alive_has_required_headers() {
        let msg = messages::notify_alive(
            "http://192.168.1.1:7882/device.xml",
            "upnp:rootdevice",
            "uuid:test::upnp:rootdevice",
            "Linux/1.0 UPnP/1.0 WiiMDLNA/0.1.0",
            1800,
        );
        assert!(msg.starts_with("NOTIFY * HTTP/1.1\r\n"));
        assert!(msg.contains("HOST: 239.255.255.250:1900"));
        assert!(msg.contains("CACHE-CONTROL: max-age=1800"));
        assert!(msg.contains("LOCATION: http://192.168.1.1:7882/device.xml"));
        assert!(msg.contains("NT: upnp:rootdevice"));
        assert!(msg.contains("NTS: ssdp:alive"));
        assert!(msg.contains("USN: uuid:test::upnp:rootdevice"));
        assert!(msg.ends_with("\r\n\r\n"));
    }

    #[test]
    fn notify_byebye_has_required_headers() {
        let msg = messages::notify_byebye("upnp:rootdevice", "uuid:test::upnp:rootdevice");
        assert!(msg.starts_with("NOTIFY * HTTP/1.1\r\n"));
        assert!(msg.contains("NTS: ssdp:byebye"));
        assert!(msg.contains("NT: upnp:rootdevice"));
        assert!(!msg.contains("LOCATION:"));
    }

    #[test]
    fn search_response_has_required_headers() {
        let msg = messages::search_response(
            "http://192.168.1.1:7882/device.xml",
            "upnp:rootdevice",
            "uuid:test::upnp:rootdevice",
            "Linux/1.0 UPnP/1.0 WiiMDLNA/0.1.0",
            1800,
        );
        assert!(msg.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(msg.contains("CACHE-CONTROL:"));
        assert!(msg.contains("DATE:"));
        assert!(msg.contains("EXT:"));
        assert!(msg.contains("LOCATION:"));
        assert!(msg.contains("ST: upnp:rootdevice"));
        assert!(msg.contains("USN:"));
    }

    #[test]
    fn device_nts_has_five_entries() {
        let nts = messages::device_nts("test-uuid");
        assert_eq!(nts.len(), 5);

        let nt_values: Vec<&str> = nts.iter().map(|(nt, _)| nt.as_str()).collect();
        assert!(nt_values.contains(&"upnp:rootdevice"));
        assert!(nt_values.contains(&"uuid:test-uuid"));
        assert!(nt_values.contains(&"urn:schemas-upnp-org:device:MediaServer:1"));
        assert!(nt_values.contains(&"urn:schemas-upnp-org:service:ContentDirectory:1"));
        assert!(nt_values.contains(&"urn:schemas-upnp-org:service:ConnectionManager:1"));
    }
}

// ──────────────────────────────────────────────
// Library
// ──────────────────────────────────────────────

mod library {
    use airwave_server::media::library;

    #[test]
    fn empty_library_has_root() {
        let lib = library::Library::new();
        let root = lib.get("0").expect("root must exist");
        match root {
            library::LibraryObject::Container(c) => {
                assert_eq!(c.id, "0");
                assert_eq!(c.parent_id, "-1");
                assert_eq!(c.title, "Root");
            }
            _ => panic!("root must be a container"),
        }
    }

    #[test]
    fn scan_nonexistent_dir_returns_empty_library() {
        let lib = library::scan(&["/nonexistent/path/12345".into()]);
        assert_eq!(lib.total_tracks, 0);
    }

    #[test]
    fn children_of_root_has_virtual_containers() {
        let lib = library::Library::new();
        let children = lib.children_of("0");
        assert_eq!(children.len(), 5);
    }
}
