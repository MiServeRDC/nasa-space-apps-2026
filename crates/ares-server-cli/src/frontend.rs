//! Optional single-origin cockpit serving for portable local and judging deployments.

use axum::Router;
use axum::http::{HeaderValue, Request, Uri, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use std::path::Path;
use thiserror::Error;
use tower_http::services::ServeDir;

#[derive(Debug, Error)]
pub enum FrontendError {
    #[error("frontend directory must contain a built index.html")]
    MissingIndex,
    #[error("frontend directory could not be read: {0}")]
    Io(#[from] std::io::Error),
}

/// Keep APIs/WS on the same origin as assets; do not serve repository/data directories.
/// API-only users keep the existing router and its development CORS behavior.
pub fn with_frontend(api: Router, directory: &Path) -> Result<Router, FrontendError> {
    let directory = directory.canonicalize()?;
    if !directory.is_dir() || !directory.join("index.html").is_file() {
        return Err(FrontendError::MissingIndex);
    }
    Ok(api
        .fallback_service(ServeDir::new(directory))
        .layer(middleware::from_fn(integrated_policy)))
}

async fn integrated_policy(req: Request<axum::body::Body>, next: Next) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    // A TLS proxy must overwrite X-Forwarded-Proto and keep this backend private.
    let scheme = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    if let Some(origin) = req.headers().get(header::ORIGIN) {
        let same_origin = origin
            .to_str()
            .ok()
            .and_then(|s| s.parse::<Uri>().ok())
            .filter(|u| matches!(u.scheme_str(), Some("http") | Some("https")))
            .filter(|u| u.scheme_str() == Some(scheme))
            .and_then(|u| {
                u.authority()
                    .map(|a| a.as_str().eq_ignore_ascii_case(&host))
            })
            .unwrap_or(false);
        if !same_origin {
            return axum::http::StatusCode::FORBIDDEN.into_response();
        }
    }
    let hashed_asset = req.uri().path().starts_with("/assets/");
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.remove(header::ACCESS_CONTROL_ALLOW_ORIGIN);
    headers.remove(header::ACCESS_CONTROL_ALLOW_METHODS);
    headers.remove(header::ACCESS_CONTROL_ALLOW_HEADERS);
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(if hashed_asset {
            "public, max-age=31536000, immutable"
        } else {
            "no-store"
        }),
    );
    // Explicit same-host WS schemes also cover browsers that do not map CSP 'self'
    // to WebSocket schemes. Reject non-authority characters before interpolation.
    let valid_host = !host.is_empty()
        && host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-:[]".contains(&b))
        && host.parse::<axum::http::uri::Authority>().is_ok();
    let sockets = if valid_host {
        format!(" ws://{host} wss://{host}")
    } else {
        String::new()
    };
    let csp = format!(
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'{sockets}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    if let Ok(policy) = HeaderValue::from_str(&csp) {
        headers.insert(header::CONTENT_SECURITY_POLICY, policy);
    }
    response
}
