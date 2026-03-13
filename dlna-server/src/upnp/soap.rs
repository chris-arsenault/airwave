/// SOAP envelope parsing and generation for UPnP actions.
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Reader;
use quick_xml::Writer;
use std::collections::HashMap;
use std::io::Cursor;

/// A parsed SOAP action request.
#[derive(Debug)]
#[allow(dead_code)]
pub struct SoapAction {
    pub service_type: String,
    pub action_name: String,
    pub args: HashMap<String, String>,
}

/// Parse a SOAP action from the SOAPAction header and request body.
pub fn parse_soap_action(soap_action_header: &str, body: &[u8]) -> Result<SoapAction, String> {
    // SOAPAction header: "urn:schemas-upnp-org:service:ContentDirectory:1#Browse"
    let header = soap_action_header.trim_matches('"');
    let (service_type, action_name) = header
        .rsplit_once('#')
        .ok_or_else(|| format!("Invalid SOAPAction header: {header}"))?;

    let mut reader = Reader::from_reader(body);
    let mut args = HashMap::new();
    let mut inside_body = false;
    let mut inside_action = false;
    let mut current_arg: Option<String> = None;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let local = local_name(e.name().as_ref());
                if local == "Body" {
                    inside_body = true;
                } else if inside_body && local == action_name {
                    inside_action = true;
                } else if inside_action {
                    current_arg = Some(local.to_string());
                }
            }
            Ok(Event::Text(ref e)) => {
                if let Some(ref arg_name) = current_arg {
                    let text = e.unescape().map_err(|e| e.to_string())?;
                    args.insert(arg_name.clone(), text.to_string());
                }
            }
            Ok(Event::End(ref e)) => {
                let local = local_name(e.name().as_ref());
                if local == "Body" {
                    inside_body = false;
                } else if inside_action && local == action_name {
                    inside_action = false;
                } else if current_arg.as_deref() == Some(&local) {
                    current_arg = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(SoapAction {
        service_type: service_type.to_string(),
        action_name: action_name.to_string(),
        args,
    })
}

/// Build a SOAP response envelope.
pub fn soap_response(service_type: &str, action_name: &str, args: &[(&str, &str)]) -> String {
    let mut writer = Writer::new(Cursor::new(Vec::new()));

    // XML declaration
    writer
        .write_event(Event::Decl(quick_xml::events::BytesDecl::new(
            "1.0",
            Some("UTF-8"),
            None,
        )))
        .unwrap();

    // s:Envelope
    let mut envelope = BytesStart::new("s:Envelope");
    envelope.push_attribute(("xmlns:s", "http://schemas.xmlsoap.org/soap/envelope/"));
    envelope.push_attribute((
        "s:encodingStyle",
        "http://schemas.xmlsoap.org/soap/encoding/",
    ));
    writer.write_event(Event::Start(envelope)).unwrap();

    // s:Body
    writer
        .write_event(Event::Start(BytesStart::new("s:Body")))
        .unwrap();

    // u:ActionResponse
    let resp_tag = format!("u:{action_name}Response");
    let mut action_el = BytesStart::new(resp_tag.as_str());
    action_el.push_attribute(("xmlns:u", service_type));
    writer.write_event(Event::Start(action_el)).unwrap();

    // Arguments
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

    // Close tags
    writer
        .write_event(Event::End(BytesEnd::new(resp_tag.as_str())))
        .unwrap();
    writer
        .write_event(Event::End(BytesEnd::new("s:Body")))
        .unwrap();
    writer
        .write_event(Event::End(BytesEnd::new("s:Envelope")))
        .unwrap();

    String::from_utf8(writer.into_inner().into_inner()).unwrap()
}

/// Build a SOAP fault response.
pub fn soap_fault(
    fault_code: &str,
    fault_string: &str,
    error_code: u32,
    error_desc: &str,
) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <s:Fault>
      <faultcode>{fault_code}</faultcode>
      <faultstring>{fault_string}</faultstring>
      <detail>
        <UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
          <errorCode>{error_code}</errorCode>
          <errorDescription>{error_desc}</errorDescription>
        </UPnPError>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>"#
    )
}

/// Extract local name from a potentially namespaced XML tag.
fn local_name(name: &[u8]) -> String {
    let s = std::str::from_utf8(name).unwrap_or("");
    match s.rsplit_once(':') {
        Some((_, local)) => local.to_string(),
        None => s.to_string(),
    }
}
