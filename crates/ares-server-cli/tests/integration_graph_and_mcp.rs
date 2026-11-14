//! Integration tests for `ares-server-cli`:
//! 1. Verifies all 8 FastMCP Context-Mode tools (< 150 tokens / <= 600 bytes valid JSON).
//! 2. Verifies that the generated physical knowledge graph files exist on disk in
//!    `data/knowledge_graph/` and `graphify-out/` and contain all 24 cataloged datasets.

use ares_core_types::constants::MAX_MCP_CONTEXT_MODE_BYTES;
use ares_security_privacy::sanitizer::StrictMcpSanitizer;
use ares_server_cli::fastmcp_router::{JsonRpcRequest, handle_fastmcp_jsonrpc_request};
use ares_server_cli::ws_server::SharedMissionState;
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

#[test]
fn test_integration_fastmcp_8_tools_budget_and_provenance() {
    let bidmc_dir = repo_root().join("data").join("bidmc");
    let state = SharedMissionState::from_data_dir(&bidmc_dir).expect("load bidmc state");
    let ctx = state.fastmcp_context().expect("fastmcp context");
    let sanitizer = StrictMcpSanitizer;

    let cases = [
        ("get_crew_health_summary", json!({})),
        ("explain_causal_anomaly", json!({})),
        ("simulate_countermeasure_impact", json!({})),
        ("get_medops_playbook", json!({})),
        ("query_dataset_graph", json!({ "query": "OSD-818" })),
        (
            "explain_biomarker_path",
            json!({ "from": "CSA CANS", "to": "pheno_sans_papilledema" }),
        ),
        ("get_timestral_quantile_cones", json!({})),
        ("get_hypergraph_spatial_status", json!({})),
    ];

    for (tool, args) in cases {
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(1)),
            method: "tools/call".to_string(),
            params: json!({ "name": tool, "arguments": args }),
        };
        let resp = handle_fastmcp_jsonrpc_request(&req, &ctx, &sanitizer);
        assert!(
            resp.error.is_none(),
            "Tool {tool} returned error: {:?}",
            resp.error
        );
        let text = resp.result.expect("result")["content"][0]["text"]
            .as_str()
            .expect("text payload")
            .to_string();
        assert!(
            text.len() <= MAX_MCP_CONTEXT_MODE_BYTES,
            "Tool {tool} exceeded 600-byte (<150 token) cap: {} bytes",
            text.len()
        );
        let parsed: Value = serde_json::from_str(&text).expect("valid JSON");
        assert!(parsed.is_object(), "Tool {tool} must return JSON object");
        assert_eq!(parsed["model_status"], "ILLUSTRATIVE_UNVALIDATED", "{tool}");
    }
}

#[test]
fn test_integration_physical_knowledge_graph_files_exist_with_all_24_datasets() {
    let root = repo_root();
    let files = [
        root.join("data")
            .join("knowledge_graph")
            .join("ares_dataset_graph.json"),
        root.join("data")
            .join("knowledge_graph")
            .join("GRAPH_REPORT.md"),
        root.join("graphify-out").join("graph.json"),
        root.join("graphify-out").join("GRAPH_REPORT.md"),
    ];

    for path in &files {
        assert!(
            path.is_file(),
            "Expected generated knowledge graph artifact missing: {}",
            path.display()
        );
        let meta = fs::metadata(path).expect("metadata");
        assert!(meta.len() > 0, "Empty artifact: {}", path.display());
    }

    for json_path in [&files[0], &files[2]] {
        let raw = fs::read_to_string(json_path).expect("read graph json");
        let doc: Value = serde_json::from_str(&raw).expect("parse graph json");
        assert_eq!(doc["graph"]["name"], "ARES-DatasetGraph");
        assert_eq!(doc["graph"]["total_datasets"], "24");

        let nodes = doc["nodes"].as_array().expect("nodes array");
        let dataset_nodes: Vec<&Value> = nodes
            .iter()
            .filter(|n| n["category"] == "Dataset")
            .collect();
        assert_eq!(
            dataset_nodes.len(),
            24,
            "Expected all 24 Dataset nodes in {}",
            json_path.display()
        );

        let slice_nodes: Vec<&Value> = nodes
            .iter()
            .filter(|n| n["category"] == "TimeWindowSlice")
            .collect();
        assert!(
            slice_nodes.len() >= 27,
            "Expected >= 27 TimeWindowSlice nodes from BIDMC CSVs, got {}",
            slice_nodes.len()
        );

        let links = doc["links"].as_array().expect("links array");
        assert!(!links.is_empty(), "Expected non-empty links");
        assert!(
            !doc["god_nodes"].as_array().expect("god_nodes").is_empty(),
            "Expected non-empty god_nodes"
        );
        assert!(
            !doc["communities"]
                .as_object()
                .expect("communities")
                .is_empty(),
            "Expected non-empty communities"
        );
    }
}
