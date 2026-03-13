"""SOAP client for browsing/searching the wiim-dlna ContentDirectory."""

import xml.etree.ElementTree as ET

import httpx

from wiim_control.config import settings

_SOAP_ENVELOPE = """<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:{action} xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      {args}
    </u:{action}>
  </s:Body>
</s:Envelope>"""

_NS = {
    "s": "http://schemas.xmlsoap.org/soap/envelope/",
    "didl": "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "upnp": "urn:schemas-upnp-org:metadata-1-0/upnp/",
}


def _xml_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


async def _soap_call(action: str, args: dict[str, str]) -> ET.Element:
    args_xml = "\n".join(f"<{k}>{_xml_escape(v)}</{k}>" for k, v in args.items())
    body = _SOAP_ENVELOPE.format(action=action, args=args_xml)
    url = f"{settings.dlna_base_url}/control/ContentDirectory"
    headers = {
        "Content-Type": 'text/xml; charset="utf-8"',
        "SOAPAction": f'"urn:schemas-upnp-org:service:ContentDirectory:1#{action}"',
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, content=body, headers=headers, timeout=10.0)
        resp.raise_for_status()

    return ET.fromstring(resp.text)


def _parse_didl(didl_xml: str) -> list[dict]:
    """Parse DIDL-Lite XML into a list of item/container dicts."""
    root = ET.fromstring(didl_xml)
    results = []

    for container in root.findall("didl:container", _NS):
        results.append(
            {
                "type": "container",
                "id": container.get("id"),
                "parent_id": container.get("parentID"),
                "title": _text(container, "dc:title"),
                "class": _text(container, "upnp:class"),
                "child_count": int(container.get("childCount", "0")),
            }
        )

    for item in root.findall("didl:item", _NS):
        res_el = item.find("didl:res", _NS)
        results.append(
            {
                "type": "track",
                "id": item.get("id"),
                "parent_id": item.get("parentID"),
                "title": _text(item, "dc:title"),
                "artist": _text(item, "dc:creator"),
                "album": _text(item, "upnp:album"),
                "genre": _text(item, "upnp:genre"),
                "track_number": _text(item, "upnp:originalTrackNumber"),
                "class": _text(item, "upnp:class"),
                "duration": res_el.get("duration") if res_el is not None else None,
                "stream_url": res_el.text if res_el is not None else None,
                "mime_type": _extract_mime(res_el),
                "sample_rate": res_el.get("sampleFrequency") if res_el is not None else None,
                "bit_depth": res_el.get("bitsPerSample") if res_el is not None else None,
            }
        )

    return results


def _text(el: ET.Element, tag: str) -> str | None:
    child = el.find(tag, _NS)
    return child.text if child is not None else None


def _extract_mime(res_el: ET.Element | None) -> str | None:
    if res_el is None:
        return None
    proto = res_el.get("protocolInfo", "")
    parts = proto.split(":")
    return parts[2] if len(parts) >= 3 else None


async def browse(object_id: str = "0", start: int = 0, count: int = 0) -> dict:
    """Browse a container in the DLNA library."""
    root = await _soap_call(
        "Browse",
        {
            "ObjectID": object_id,
            "BrowseFlag": "BrowseDirectChildren",
            "Filter": "*",
            "StartingIndex": str(start),
            "RequestedCount": str(count),
            "SortCriteria": "",
        },
    )

    body = root.find(".//s:Body", _NS)
    response = body[0] if body is not None and len(body) > 0 else None
    if response is None:
        return {"items": [], "total": 0}

    result_xml = ""
    total = 0
    for child in response:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "Result":
            result_xml = child.text or ""
        elif tag == "TotalMatches":
            total = int(child.text or "0")

    items = _parse_didl(result_xml) if result_xml else []
    return {"items": items, "total": total}


async def search(query: str, start: int = 0, count: int = 0) -> dict:
    """Search the DLNA library."""
    root = await _soap_call(
        "Search",
        {
            "ContainerID": "0",
            "SearchCriteria": f'dc:title contains "{query}"',
            "Filter": "*",
            "StartingIndex": str(start),
            "RequestedCount": str(count),
            "SortCriteria": "",
        },
    )

    body = root.find(".//s:Body", _NS)
    response = body[0] if body is not None and len(body) > 0 else None
    if response is None:
        return {"items": [], "total": 0}

    result_xml = ""
    total = 0
    for child in response:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if tag == "Result":
            result_xml = child.text or ""
        elif tag == "TotalMatches":
            total = int(child.text or "0")

    items = _parse_didl(result_xml) if result_xml else []
    return {"items": items, "total": total}
