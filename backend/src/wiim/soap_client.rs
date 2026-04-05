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

    #[allow(dead_code)]
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Call a SOAP action on the device, retrying transient failures with backoff.
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

        const MAX_RETRIES: u32 = 3;
        const BASE_DELAY_MS: u64 = 300;

        let mut last_err = None;
        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(
                    BASE_DELAY_MS * 2u64.pow(attempt - 1),
                ))
                .await;
            }

            let result = self
                .http
                .post(&url)
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPAction", &soap_action)
                .body(body.clone())
                .send()
                .await;

            let resp = match result {
                Ok(r) => r,
                Err(e) => {
                    // Network/timeout errors are retryable.
                    last_err = Some(SoapError::Http(e));
                    continue;
                }
            };

            let status = resp.status();
            let text = resp.text().await?;

            if status == 500 {
                // SOAP faults are not transient — don't retry.
                return Err(parse_soap_fault(&text));
            }
            if !status.is_success() {
                last_err = Some(SoapError::Xml(format!("HTTP {}: {}", status, text)));
                continue;
            }

            return parse_soap_response(&text, action);
        }

        Err(last_err.unwrap())
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
