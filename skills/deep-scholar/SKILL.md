---
name: deep-scholar
description: Autonomous deep scientific literature research across global repositories (arXiv, Crossref, PubMed, IEEE Xplore, Google Scholar, Nature, Science, NASA NTRS) and academic engines. Integrates DuckDuckGo Search (ddg-search) and automated tools for scientific literature review, empirical biomedical grounding, and full-text paper ingestion.
triggers:
  - scientific research
  - academic paper
  - google scholar
  - pubmed
  - space medicine
  - flight surgeon
  - state of the art
  - literature review
  - algorithmic foundation
  - ricerca scientifica
  - paper accademici
  - ddg-search
  - dataset search
  - papers with code
---

# Deep Scholar: Cross-Language Scientific Literature & Academic Engine

## 1. Overview & Architectural Role

`deep-scholar` is the dedicated research and empirical grounding skill for autonomous coding agents (Google Antigravity, OpenAI Codex, Claude Code, Cursor) and human engineers. It enforces a strict engineering invariant:

> **Scientific Grounding Invariant (Zero-Cheating):**  
> Never invent ad-hoc heuristic thresholds, guess physical constants, or hardcode fragile rules for complex sensory, perceptual, biomedical, or physiological problems. When encountering edge cases (e.g. motion artifacts, microgravity fluid shifts, mechanotransduction thresholds, cardiovascular stasis bounds), agents **MUST query peer-reviewed scientific literature** across global academic platforms and open NASA dataset hubs to ground every hyperparameter on published mathematical models.

---

## 2. Multi-Tier Architecture & Tool Integration

`deep-scholar` operates through three synergistic layers, integrating local CLI utilities with search tools (DuckDuckGo Search):

```
+---------------------------------------------------------------------------------------+
|                             AGENT SCIENTIFIC INVESTIGATION                            |
+-------------------------------------------+-------------------------------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                                               |
                    v                                               v
+---------------------------------------+       +---------------------------------------+
| TIER 1: FAST CLI & OPEN APIS          |       | TIER 2: WEB SEARCH & SCHOLAR          |
| (.agents/.../search_academic.py)      |       | (Tool: ddg-search / search_web)       |
| * arXiv Atom API (cs.CV, q-bio, physics)      | * search(query="...", region="us-en") |
| * Crossref API (DOIs, peer-reviewed)  |       | * Targeted PubMed / Nature / IEEE     |
| * Canonical deep links for portals    |       | * Full-text extraction & synthesis    |
+---------------------------------------+       +---------------------------------------+
```

### Layer 1: Fast CLI & Open Academic APIs (`search_academic.py`)
- Direct querying of **arXiv Atom API** (pre-prints) and **Crossref API** (DOIs, authors, peer-reviewed journals).
- Pure Python standard library with zero external dependencies.

```bash
# Query arXiv directly from the terminal
python3 .agents/skills/deep-scholar/scripts/search_academic.py --engine arxiv --query "microgravity internal jugular vein thrombosis" --limit 5

# Query Crossref directly for peer-reviewed DOIs
python3 .agents/skills/deep-scholar/scripts/search_academic.py --engine crossref --query "sclerostin mechanostat bone loss microgravity" --limit 5
```

### Layer 2: Web Search & Deep Investigation
- Use `ddg-search` or `search_web` to locate specific paper titles, author bibliographies (e.g. NASA Flight Surgeons), and recent 2025–2026 journal publications.

---

## 3. Best Practices for Literature Grounding

1. **Verify Mathematical Consistency:** Always verify equations against physical units (e.g., fluid wall shear stress $\tau_w$ in $\text{dyn/cm}^2$, strain in $\mu\varepsilon$).
2. **Prioritize Peer-Reviewed Sources:** Prefer Nature, npj Microgravity, Journal of Applied Physiology, and NASA Technical Reports over unverified blogs.
3. **Traceability:** Cite authors, journal name, and publication year in the documentation and code comments.
