# Tool Guidance & Agent-Computer Interface (ACI) Protocol: ARES-Health

> **Reference Framework:** Google Research Harness² (*arXiv:2610.14224*, Oct 2026) & AAIF Open Agent Standard.

## 1. Tool Selection Matrix for the 5-Person Team & AI Agents

| Task Category | Primary Tool / Action | Fallback | Anti-Pattern (DO NOT DO) |
| :--- | :--- | :--- | :--- |
| **Session Initialization & Context** | Read `memory-bank/projectbrief.md` & `activeContext.md` | Read `AGENTS.md` | Writing code before checking `memory-bank/` |
| **JSON Contract Inspection** | Read `contracts/telemetry_schema.json` | Inspect `crates/ares-core-types` | Inventing ad-hoc JSON field names between Rust & React |
| **Pre-Commit Verification** | `./scripts/agent_probe.sh --fast` | `./scripts/agent_probe.sh --all` | Pushing to `work/<user>` or `main` without running the probe |
| **Scientific & Dataset Lookup** | Read `05_Official_NASA_Challenge_Brief_and_Resources.md` & `11_Official_Submission_Guide_and_Ready_To_Paste_Form.md` | Run `.agents/skills/deep-scholar/scripts/search_academic.py` | Guessing physiological thresholds without citing NASA/CSA/ESA datasets |
| **Team Ownership Check** | Read `docs/team/TEAM_COORDINATION_AND_OWNERSHIP.md` & `.github/CODEOWNERS` | Check `memory-bank/issuesBacklog.md` | Editing another teammate's crate without coordination |
