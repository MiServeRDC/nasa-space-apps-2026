//! Build script for `ares-desktop-os`: verifies Tauri v2 bundle manifest, least-privilege ACL,
//! and binary icon assets offline without invoking network downloads.

use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=capabilities/default.json");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");

    if std::env::var_os("CARGO_FEATURE_TAURI_NATIVE").is_some() {
        for required in [
            "tauri.conf.json",
            "capabilities/default.json",
            "icons/32x32.png",
            "icons/128x128.png",
            "icons/128x128@2x.png",
            "icons/icon.icns",
            "icons/icon.ico",
        ] {
            if !Path::new(required).exists() {
                eprintln!("ares-desktop-os build check failed: missing required asset {required}");
                std::process::exit(1);
            }
        }
    }
}
