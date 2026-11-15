use ares_server_cli::frontend::with_frontend;
use ares_server_cli::ws_server::{SharedMissionState, build_axum_router};
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use std::path::Path;
use tower::ServiceExt;

fn api() -> axum::Router {
    let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/bidmc");
    build_axum_router(SharedMissionState::from_data_dir(&data).expect("BIDMC"))
}

#[tokio::test]
async fn single_origin_serves_only_frontend_and_preserves_api_statuses()
-> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    let front = temp.path().join("frontend");
    std::fs::create_dir_all(front.join("assets"))?;
    std::fs::write(front.join("index.html"), "<!doctype html><h1>ARES</h1>")?;
    std::fs::write(front.join("assets/app.js"), "console.log('local')")?;
    std::fs::write(temp.path().join("private.txt"), "NOT_PUBLIC")?;
    let app = with_frontend(api(), &front)?;
    for path in ["/", "/?phase=EVALUATE"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("host", "judge.test")
                    .body(Body::empty())?,
            )
            .await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(
            response.headers()["content-security-policy"]
                .to_str()?
                .contains("wss://judge.test")
        );
        assert!(
            String::from_utf8(to_bytes(response.into_body(), 4096).await?.to_vec())?
                .contains("ARES")
        );
    }
    let asset = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/assets/app.js")
                .header("host", "judge.test")
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(asset.status(), StatusCode::OK);
    assert!(
        asset.headers()["content-type"]
            .to_str()?
            .contains("javascript")
    );
    assert_eq!(asset.headers()["x-content-type-options"], "nosniff");
    for path in [
        "/api/unknown",
        "/missing.js",
        "/../private.txt",
        "/%2e%2e/private.txt",
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty())?)
            .await?;
        assert!(
            matches!(
                response.status(),
                StatusCode::NOT_FOUND | StatusCode::BAD_REQUEST
            ),
            "{path}"
        );
        assert!(
            !String::from_utf8_lossy(&to_bytes(response.into_body(), 4096).await?)
                .contains("NOT_PUBLIC")
        );
    }
    let health = app
        .oneshot(Request::builder().uri("/healthz").body(Body::empty())?)
        .await?;
    assert_eq!(health.status(), StatusCode::OK);
    let ready: serde_json::Value =
        serde_json::from_slice(&to_bytes(health.into_body(), 4096).await?)?;
    assert_eq!(ready["service"], "ares-health");
    assert_eq!(ready["ready"], true);
    Ok(())
}

#[tokio::test]
async fn integrated_browser_origin_policy_covers_tls_proxy_and_cross_site_posts()
-> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    std::fs::write(temp.path().join("index.html"), "ARES")?;
    let app = with_frontend(api(), temp.path())?;
    for (origin, forwarded, expected) in [
        ("http://judge.test", "http", StatusCode::OK),
        ("https://judge.test", "https", StatusCode::OK),
        ("https://judge.test", "http", StatusCode::FORBIDDEN),
        ("https://evil.test", "https", StatusCode::FORBIDDEN),
        ("null", "http", StatusCode::FORBIDDEN),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/stress-test")
                    .header("host", "judge.test")
                    .header("origin", origin)
                    .header("x-forwarded-proto", forwarded)
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"preserve_overlay":true}"#))?,
            )
            .await?;
        assert_eq!(
            response.status(),
            expected,
            "origin={origin}, proxy={forwarded}"
        );
        assert!(
            response
                .headers()
                .get("access-control-allow-origin")
                .is_none()
        );
    }
    Ok(())
}

#[tokio::test]
async fn missing_frontend_is_a_startup_error() -> Result<(), Box<dyn std::error::Error>> {
    let temp = tempfile::tempdir()?;
    assert!(with_frontend(api(), temp.path()).is_err());
    Ok(())
}
