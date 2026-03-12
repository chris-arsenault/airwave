use crate::media::library::SharedLibrary;
use crate::upnp::{didl::DidlWriter, soap};

const SERVICE_TYPE: &str = "urn:schemas-upnp-org:service:ContentDirectory:1";

pub fn handle_action(
    action: &soap::SoapAction,
    library: &SharedLibrary,
    base_url: &str,
) -> Result<(String, u16), (String, u16)> {
    match action.action_name.as_str() {
        "Browse" => handle_browse(action, library, base_url),
        "Search" => handle_search(action, library, base_url),
        "GetSearchCapabilities" => {
            let body = soap::soap_response(
                SERVICE_TYPE,
                "GetSearchCapabilities",
                &[("SearchCaps", "dc:title,dc:creator,upnp:artist,upnp:album")],
            );
            Ok((body, 200))
        }
        "GetSortCapabilities" => {
            let body =
                soap::soap_response(SERVICE_TYPE, "GetSortCapabilities", &[("SortCaps", "")]);
            Ok((body, 200))
        }
        "GetSystemUpdateID" => {
            let lib = library.read();
            let id = lib.system_update_id().to_string();
            let body = soap::soap_response(SERVICE_TYPE, "GetSystemUpdateID", &[("Id", &id)]);
            Ok((body, 200))
        }
        _ => {
            let body = soap::soap_fault("s:Client", "UPnPError", 401, "Invalid Action");
            Err((body, 401))
        }
    }
}

fn handle_search(
    action: &soap::SoapAction,
    library: &SharedLibrary,
    base_url: &str,
) -> Result<(String, u16), (String, u16)> {
    let search_criteria = action
        .args
        .get("SearchCriteria")
        .map(|s| s.as_str())
        .unwrap_or("");
    let start: usize = action
        .args
        .get("StartingIndex")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let requested: usize = action
        .args
        .get("RequestedCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // Extract a plain-text query from the UPnP search criteria.
    // WiiM sends criteria like: dc:title contains "query"
    // We do a simple substring extraction of the quoted value.
    let query = extract_search_query(search_criteria);

    let lib = library.read();
    let update_id = lib.system_update_id();
    let results = lib.search(&query);
    let total = results.len();

    let count = if requested == 0 { total } else { requested };
    let page: Vec<_> = results.into_iter().skip(start).take(count).collect();
    let returned = page.len();

    let mut didl = DidlWriter::new();
    for obj in &page {
        didl.write_object(obj, base_url);
    }
    let result = didl.finish();

    let body = soap::soap_response(
        SERVICE_TYPE,
        "Search",
        &[
            ("Result", &result),
            ("NumberReturned", &returned.to_string()),
            ("TotalMatches", &total.to_string()),
            ("UpdateID", &update_id.to_string()),
        ],
    );
    Ok((body, 200))
}

/// Extract a plain-text search term from UPnP search criteria.
/// Handles patterns like: `dc:title contains "query"` or `* = "query"`
/// Falls back to using the entire string as the query.
fn extract_search_query(criteria: &str) -> String {
    // Look for a quoted string
    if let Some(start) = criteria.find('"') {
        if let Some(end) = criteria[start + 1..].find('"') {
            return criteria[start + 1..start + 1 + end].to_string();
        }
    }
    criteria.to_string()
}

fn handle_browse(
    action: &soap::SoapAction,
    library: &SharedLibrary,
    base_url: &str,
) -> Result<(String, u16), (String, u16)> {
    let object_id = action
        .args
        .get("ObjectID")
        .map(|s| s.as_str())
        .unwrap_or("0");
    let browse_flag = action
        .args
        .get("BrowseFlag")
        .map(|s| s.as_str())
        .unwrap_or("BrowseDirectChildren");
    let start: usize = action
        .args
        .get("StartingIndex")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let requested: usize = action
        .args
        .get("RequestedCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let lib = library.read();
    let update_id = lib.system_update_id();

    match browse_flag {
        "BrowseMetadata" => {
            let obj = match lib.get(object_id) {
                Some(o) => o,
                None => {
                    let body = soap::soap_fault("s:Client", "UPnPError", 701, "No such object");
                    return Err((body, 500));
                }
            };
            let mut didl = DidlWriter::new();
            didl.write_object(obj, base_url);
            let result = didl.finish();
            let body = soap::soap_response(
                SERVICE_TYPE,
                "Browse",
                &[
                    ("Result", &result),
                    ("NumberReturned", "1"),
                    ("TotalMatches", "1"),
                    ("UpdateID", &update_id.to_string()),
                ],
            );
            Ok((body, 200))
        }
        "BrowseDirectChildren" => {
            let children = lib.children_of(object_id);
            let total = children.len();

            // Apply pagination
            let count = if requested == 0 { total } else { requested };
            let page: Vec<_> = children.into_iter().skip(start).take(count).collect();
            let returned = page.len();

            let mut didl = DidlWriter::new();
            for obj in &page {
                didl.write_object(obj, base_url);
            }
            let result = didl.finish();

            let body = soap::soap_response(
                SERVICE_TYPE,
                "Browse",
                &[
                    ("Result", &result),
                    ("NumberReturned", &returned.to_string()),
                    ("TotalMatches", &total.to_string()),
                    ("UpdateID", &update_id.to_string()),
                ],
            );
            Ok((body, 200))
        }
        _ => {
            let body = soap::soap_fault("s:Client", "UPnPError", 402, "Invalid Args");
            Err((body, 500))
        }
    }
}
