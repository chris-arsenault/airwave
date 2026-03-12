/// DIDL-Lite XML generation for ContentDirectory responses.
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;
use std::io::Cursor;

use crate::media::library::{Container, LibraryObject, Track};

pub struct DidlWriter {
    writer: Writer<Cursor<Vec<u8>>>,
}

impl Default for DidlWriter {
    fn default() -> Self {
        Self::new()
    }
}

impl DidlWriter {
    pub fn new() -> Self {
        let mut writer = Writer::new(Cursor::new(Vec::new()));

        let mut root = BytesStart::new("DIDL-Lite");
        root.push_attribute(("xmlns", "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"));
        root.push_attribute(("xmlns:dc", "http://purl.org/dc/elements/1.1/"));
        root.push_attribute(("xmlns:upnp", "urn:schemas-upnp-org:metadata-1-0/upnp/"));
        root.push_attribute(("xmlns:dlna", "urn:schemas-dlna-org:metadata-1-0/"));
        writer.write_event(Event::Start(root)).unwrap();

        Self { writer }
    }

    pub fn write_container(&mut self, container: &Container) {
        let mut el = BytesStart::new("container");
        el.push_attribute(("id", container.id.as_str()));
        el.push_attribute(("parentID", container.parent_id.as_str()));
        el.push_attribute(("restricted", "true"));
        el.push_attribute(("childCount", container.child_count.to_string().as_str()));
        self.writer.write_event(Event::Start(el)).unwrap();

        self.write_text_element("dc:title", &container.title);
        self.write_text_element("upnp:class", "object.container.storageFolder");

        self.writer
            .write_event(Event::End(BytesEnd::new("container")))
            .unwrap();
    }

    pub fn write_track(&mut self, track: &Track, base_url: &str) {
        let mut el = BytesStart::new("item");
        el.push_attribute(("id", track.id.as_str()));
        el.push_attribute(("parentID", track.parent_id.as_str()));
        el.push_attribute(("restricted", "true"));
        self.writer.write_event(Event::Start(el)).unwrap();

        self.write_text_element("dc:title", &track.meta.title);
        self.write_text_element("dc:creator", &track.meta.artist);
        self.write_text_element("upnp:artist", &track.meta.artist);
        self.write_text_element("upnp:album", &track.meta.album);
        self.write_text_element("upnp:class", "object.item.audioItem.musicTrack");

        if let Some(ref genre) = track.meta.genre {
            self.write_text_element("upnp:genre", genre);
        }

        if let Some(track_num) = track.meta.track_number {
            self.write_text_element("upnp:originalTrackNumber", &track_num.to_string());
        }

        // Resource element
        let stream_url = format!(
            "{}/media/{}",
            base_url,
            percent_encoding::utf8_percent_encode(&track.id, percent_encoding::NON_ALPHANUMERIC)
        );

        let mut res = BytesStart::new("res");
        let protocol_info = format!(
            "http-get:*:{}:DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000",
            track.meta.mime_type
        );
        res.push_attribute(("protocolInfo", protocol_info.as_str()));
        res.push_attribute(("size", track.meta.size_bytes.to_string().as_str()));

        if let Some(duration) = track.meta.duration {
            let secs = duration.as_secs();
            let h = secs / 3600;
            let m = (secs % 3600) / 60;
            let s = secs % 60;
            let frac = duration.subsec_millis();
            let dur_str = format!("{h}:{m:02}:{s:02}.{frac:03}");
            res.push_attribute(("duration", dur_str.as_str()));
        }

        if let Some(sr) = track.meta.sample_rate {
            res.push_attribute(("sampleFrequency", sr.to_string().as_str()));
        }
        if let Some(ch) = track.meta.channels {
            res.push_attribute(("nrAudioChannels", ch.to_string().as_str()));
        }
        if let Some(bd) = track.meta.bit_depth {
            res.push_attribute(("bitsPerSample", bd.to_string().as_str()));
        }

        self.writer.write_event(Event::Start(res)).unwrap();
        self.writer
            .write_event(Event::Text(BytesText::new(&stream_url)))
            .unwrap();
        self.writer
            .write_event(Event::End(BytesEnd::new("res")))
            .unwrap();

        self.writer
            .write_event(Event::End(BytesEnd::new("item")))
            .unwrap();
    }

    pub fn write_object(&mut self, obj: &LibraryObject, base_url: &str) {
        match obj {
            LibraryObject::Container(c) => self.write_container(c),
            LibraryObject::Track(t) => self.write_track(t, base_url),
        }
    }

    pub fn finish(mut self) -> String {
        self.writer
            .write_event(Event::End(BytesEnd::new("DIDL-Lite")))
            .unwrap();
        String::from_utf8(self.writer.into_inner().into_inner()).unwrap()
    }

    fn write_text_element(&mut self, tag: &str, text: &str) {
        self.writer
            .write_event(Event::Start(BytesStart::new(tag)))
            .unwrap();
        self.writer
            .write_event(Event::Text(BytesText::new(text)))
            .unwrap();
        self.writer
            .write_event(Event::End(BytesEnd::new(tag)))
            .unwrap();
    }
}
