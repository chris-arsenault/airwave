use axum::body::Body;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use std::path::Path;
use tokio::io::AsyncReadExt;
use tokio_util::io::ReaderStream;

/// Parse an HTTP Range header: "bytes=START-END" or "bytes=START-"
fn parse_range(range_header: &str, file_size: u64) -> Option<(u64, u64)> {
    let range = range_header.strip_prefix("bytes=")?;
    let (start_str, end_str) = range.split_once('-')?;
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        file_size - 1
    } else {
        end_str.parse().ok()?
    };
    if start <= end && end < file_size {
        Some((start, end))
    } else {
        None
    }
}

/// Serve a media file with HTTP Range support.
pub async fn serve_file(path: &Path, headers: &HeaderMap) -> Response {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(m) => m,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let file_size = metadata.len();
    let mime = mime_guess::from_path(path)
        .first()
        .map(|m| m.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // DLNA content features header
    let content_features =
        "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000";

    if let Some(range_str) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((start, end)) = parse_range(range_str, file_size) {
            let length = end - start + 1;
            match tokio::fs::File::open(path).await {
                Ok(mut file) => {
                    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                    }
                    let limited = file.take(length);
                    let stream = ReaderStream::new(limited);
                    let body = Body::from_stream(stream);

                    Response::builder()
                        .status(StatusCode::PARTIAL_CONTENT)
                        .header(header::CONTENT_TYPE, &mime)
                        .header(header::CONTENT_LENGTH, length.to_string())
                        .header(
                            header::CONTENT_RANGE,
                            format!("bytes {start}-{end}/{file_size}"),
                        )
                        .header(header::ACCEPT_RANGES, "bytes")
                        .header("contentFeatures.dlna.org", content_features)
                        .header("transferMode.dlna.org", "Streaming")
                        .body(body)
                        .unwrap()
                }
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        } else {
            Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{file_size}"))
                .body(Body::empty())
                .unwrap()
        }
    } else {
        // Full file response
        match tokio::fs::File::open(path).await {
            Ok(file) => {
                let stream = ReaderStream::new(file);
                let body = Body::from_stream(stream);

                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, &mime)
                    .header(header::CONTENT_LENGTH, file_size.to_string())
                    .header(header::ACCEPT_RANGES, "bytes")
                    .header("contentFeatures.dlna.org", content_features)
                    .header("transferMode.dlna.org", "Streaming")
                    .body(body)
                    .unwrap()
            }
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    }
}

use tokio::io::AsyncSeekExt;
