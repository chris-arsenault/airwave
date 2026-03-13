use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;
use roxmltree::Document;
use std::collections::HashMap;
use std::io::Cursor;

#[derive(Debug, Clone)]
pub struct SoapClient {
    http: reqwest::Client,
    base_url: String,
}

#[derive(Debug)]
pub struct SoapResponse {
    pub values: HashMap<String, String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SoapError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("XML parse error: {0}")]
    Xml(String),
    #[error("SOAP fault: {code} - {description}")]
    Fault { code: String, description: String },
}

impl SoapClient {
    pub fn new(base_url: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("failed to build HTTP client");
        Self { http, base_url }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Call a SOAP action on the device.
    pub async fn call(
        &self,
        control_url: &str,
        service_type: &str,
        action: &str,
        args: &[(&str, &str)],
    ) -> Result<SoapResponse, SoapError> {
        let url = format!("{}{}", self.base_url, control_url);
        let soap_action = format!("\"{}#{}\"", service_type, action);
        let body = build_soap_envelope(service_type, action, args);

        let resp = self
            .http
            .post(&url)
            .header("Content-Type", "text/xml; charset=\"utf-8\"")
            .header("SOAPAction", &soap_action)
            .body(body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if status == 500 {
            // SOAP fault
            return Err(parse_soap_fault(&text));
        }
        if !status.is_success() {
            return Err(SoapError::Xml(format!("HTTP {}: {}", status, text)));
        }

        parse_soap_response(&text, action)
    }
}

fn build_soap_envelope(service_type: &str, action: &str, args: &[(&str, &str)]) -> String {
    let mut writer = Writer::new(Cursor::new(Vec::new()));

    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))
        .unwrap();

    let mut envelope = BytesStart::new("s:Envelope");
    envelope.push_attribute(("xmlns:s", "http://schemas.xmlsoap.org/soap/envelope/"));
    envelope.push_attribute((
        "s:encodingStyle",
        "http://schemas.xmlsoap.org/soap/encoding/",
    ));
    writer.write_event(Event::Start(envelope)).unwrap();

    writer
        .write_event(Event::Start(BytesStart::new("s:Body")))
        .unwrap();

    let action_tag = format!("u:{}", action);
    let mut action_start = BytesStart::new(action_tag.as_str());
    action_start.push_attribute(("xmlns:u", service_type));
    writer.write_event(Event::Start(action_start)).unwrap();

    for (name, value) in args {
        writer
            .write_event(Event::Start(BytesStart::new(*name)))
            .unwrap();
        writer
            .write_event(Event::Text(BytesText::new(value)))
            .unwrap();
        writer
            .write_event(Event::End(BytesEnd::new(*name)))
            .unwrap();
    }

    writer
        .write_event(Event::End(BytesEnd::new(action_tag.as_str())))
        .unwrap();
    writer
        .write_event(Event::End(BytesEnd::new("s:Body")))
        .unwrap();
    writer
        .write_event(Event::End(BytesEnd::new("s:Envelope")))
        .unwrap();

    String::from_utf8(writer.into_inner().into_inner()).unwrap()
}

fn parse_soap_response(xml: &str, action: &str) -> Result<SoapResponse, SoapError> {
    let doc = Document::parse(xml).map_err(|e| SoapError::Xml(e.to_string()))?;

    let response_tag = format!("{}Response", action);
    let response_node = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == response_tag)
        .ok_or_else(|| SoapError::Xml(format!("No <{}> in response", response_tag)))?;

    let mut values = HashMap::new();
    for child in response_node.children().filter(|n| n.is_element()) {
        let key = child.tag_name().name().to_string();
        let value = child.text().unwrap_or("").to_string();
        values.insert(key, value);
    }

    Ok(SoapResponse { values })
}

fn parse_soap_fault(xml: &str) -> SoapError {
    let doc = match Document::parse(xml) {
        Ok(d) => d,
        Err(_) => {
            return SoapError::Xml(format!("Failed to parse SOAP fault: {}", xml));
        }
    };

    let code = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "errorCode")
        .and_then(|n| n.text())
        .unwrap_or("unknown")
        .to_string();

    let desc = doc
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "errorDescription")
        .and_then(|n| n.text())
        .unwrap_or("unknown")
        .to_string();

    SoapError::Fault {
        code,
        description: desc,
    }
}
