use roxmltree::Document;

use super::schema::{ActionSchema, ArgumentSchema, DeviceSchema, Direction, ServiceSchema};

const UPNP_NS: &str = "urn:schemas-upnp-org:device-1-0";
const SCPD_NS: &str = "urn:schemas-upnp-org:service-1-0";

/// Fetch and parse the device description XML from a UPnP device.
pub async fn fetch_device_schema(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<DeviceSchema, Box<dyn std::error::Error + Send + Sync>> {
    let desc_url = format!("{}/description.xml", base_url);
    let desc_xml = client.get(&desc_url).send().await?.text().await?;
    let doc = Document::parse(&desc_xml)?;

    let device_node =
        find_element(&doc, UPNP_NS, "device").ok_or("No <device> element in description.xml")?;

    let friendly_name = child_text(&device_node, UPNP_NS, "friendlyName").unwrap_or_default();
    let model_name = child_text(&device_node, UPNP_NS, "modelName").unwrap_or_default();
    let model_number = child_text(&device_node, UPNP_NS, "modelNumber").unwrap_or_default();
    let udn = child_text(&device_node, UPNP_NS, "UDN").unwrap_or_default();

    let mut services = Vec::new();
    for svc_node in device_node
        .descendants()
        .filter(|n| n.is_element() && n.tag_name().name() == "service")
    {
        let service_type = child_text(&svc_node, UPNP_NS, "serviceType").unwrap_or_default();
        let service_id = child_text(&svc_node, UPNP_NS, "serviceId").unwrap_or_default();
        let control_url = child_text(&svc_node, UPNP_NS, "controlURL").unwrap_or_default();
        let scpd_url = child_text(&svc_node, UPNP_NS, "SCPDURL").unwrap_or_default();
        let event_url = child_text(&svc_node, UPNP_NS, "eventSubURL").unwrap_or_default();

        let actions = if !scpd_url.is_empty() {
            let full_url = format!("{}{}", base_url, scpd_url);
            match fetch_actions(client, &full_url).await {
                Ok(a) => a,
                Err(e) => {
                    tracing::warn!("Failed to fetch SCPD from {}: {}", full_url, e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        services.push(ServiceSchema {
            service_type,
            service_id,
            control_url,
            scpd_url,
            event_url,
            actions,
        });
    }

    Ok(DeviceSchema {
        friendly_name,
        model_name,
        model_number,
        udn,
        services,
    })
}

async fn fetch_actions(
    client: &reqwest::Client,
    scpd_url: &str,
) -> Result<Vec<ActionSchema>, Box<dyn std::error::Error + Send + Sync>> {
    let xml = client.get(scpd_url).send().await?.text().await?;
    let doc = Document::parse(&xml)?;
    let mut actions = Vec::new();

    for action_node in doc.descendants().filter(|n| {
        n.is_element()
            && n.tag_name().name() == "action"
            && n.tag_name().namespace() == Some(SCPD_NS)
    }) {
        let name = child_text(&action_node, SCPD_NS, "name").unwrap_or_default();
        let mut arguments = Vec::new();

        for arg_node in action_node.descendants().filter(|n| {
            n.is_element()
                && n.tag_name().name() == "argument"
                && n.tag_name().namespace() == Some(SCPD_NS)
        }) {
            let arg_name = child_text(&arg_node, SCPD_NS, "name").unwrap_or_default();
            let direction_str = child_text(&arg_node, SCPD_NS, "direction").unwrap_or_default();
            let related =
                child_text(&arg_node, SCPD_NS, "relatedStateVariable").unwrap_or_default();

            let direction = match direction_str.as_str() {
                "in" => Direction::In,
                _ => Direction::Out,
            };

            arguments.push(ArgumentSchema {
                name: arg_name,
                direction,
                related_state_variable: related,
            });
        }

        actions.push(ActionSchema { name, arguments });
    }

    Ok(actions)
}

fn find_element<'a>(
    doc: &'a Document,
    ns: &str,
    local_name: &str,
) -> Option<roxmltree::Node<'a, 'a>> {
    doc.descendants().find(|n| {
        n.is_element() && n.tag_name().name() == local_name && n.tag_name().namespace() == Some(ns)
    })
}

fn child_text(parent: &roxmltree::Node, ns: &str, local_name: &str) -> Option<String> {
    parent
        .children()
        .find(|n| {
            n.is_element()
                && n.tag_name().name() == local_name
                && (n.tag_name().namespace() == Some(ns) || n.tag_name().namespace().is_none())
        })
        .and_then(|n| n.text().map(|t| t.trim().to_string()))
}
