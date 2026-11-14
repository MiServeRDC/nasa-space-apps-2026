#!/usr/bin/env python3
"""
Deep Scholar: Cross-Language Academic Literature Search CLI
Autonomous research utility for Google Antigravity, OpenAI Codex, and human engineers.
Queries global open-access APIs (arXiv, Crossref) and generates targeted search URLs
for Western repositories (CVF, Papers With Code, Hugging Face, OpenReview, IEEE, Google Scholar)
and Chinese academic platforms (Baidu Scholar, CNKI, Wanfang, OpenDataLab).
Synergistic with MCP tools: ddg-search and firecrawl.
"""

import sys
import json
import argparse
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional

USER_AGENT = "DeepScholar/2.0 (Academic Research; https://github.com/nasa-space-apps-2026/ares-health)"

def search_arxiv(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Query open-access arXiv Atom API."""
    results = []
    encoded_query = urllib.parse.quote(query)
    url = f"http://export.arxiv.org/api/query?search_query=all:{encoded_query}&start=0&max_results={limit}&sortBy=relevance&sortOrder=descending"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            tree = ET.fromstring(content)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in tree.findall("atom:entry", ns):
                title_elem = entry.find("atom:title", ns)
                title = title_elem.text.strip().replace("\n", " ") if title_elem is not None else "Unknown Title"
                id_elem = entry.find("atom:id", ns)
                paper_url = id_elem.text.strip() if id_elem is not None else ""
                published_elem = entry.find("atom:published", ns)
                year = published_elem.text.strip()[:4] if published_elem is not None else "N/A"
                summary_elem = entry.find("atom:summary", ns)
                summary = summary_elem.text.strip().replace("\n", " ") if summary_elem is not None else ""
                if len(summary) > 280:
                    summary = summary[:277] + "..."
                authors = [a.find("atom:name", ns).text.strip() for a in entry.findall("atom:author", ns) if a.find("atom:name", ns) is not None]

                results.append({
                    "engine": "arXiv",
                    "title": title,
                    "authors": authors[:3] + (["et al."] if len(authors) > 3 else []),
                    "year": year,
                    "url": paper_url,
                    "summary": summary
                })
    except Exception as e:
        results.append({
            "engine": "arXiv",
            "error": f"arXiv query failed: {str(e)}"
        })
    return results

def search_crossref(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Query open-access Crossref API for peer-reviewed papers."""
    results = []
    encoded_query = urllib.parse.quote(query)
    url = f"https://api.crossref.org/works?query={encoded_query}&rows={limit}&sort=relevance"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("message", {}).get("items", [])
            for item in items:
                title = item.get("title", ["Unknown Title"])[0]
                doi = item.get("DOI", "")
                paper_url = f"https://doi.org/{doi}" if doi else item.get("URL", "")
                authors_raw = item.get("author", [])
                authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in authors_raw if a.get("family")]
                if not authors:
                    authors = ["Unknown"]
                
                year = "N/A"
                published = item.get("published-print") or item.get("published-online") or item.get("created")
                if published and "date-parts" in published and published["date-parts"]:
                    year = str(published["date-parts"][0][0])
                
                container = item.get("container-title", [""])[0] if item.get("container-title") else ""

                results.append({
                    "engine": "Crossref/Peer-Reviewed",
                    "title": title,
                    "authors": authors[:3] + (["et al."] if len(authors) > 3 else []),
                    "year": year,
                    "venue": container,
                    "url": paper_url,
                    "doi": doi
                })
    except Exception as e:
        results.append({
            "engine": "Crossref/Peer-Reviewed",
            "error": f"Crossref query failed: {str(e)}"
        })
    return results

def fetch_url_text(url: str) -> str:
    """Fetch text or abstract from a scientific paper URL."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            # Basic tag stripping
            import re
            clean = re.sub(r'<[^>]+>', ' ', raw)
            clean = re.sub(r'\s+', ' ', clean).strip()
            return clean[:2000]
    except Exception as e:
        return f"Fetch error: {str(e)}"

def generate_academic_links(en_query: str, zh_query: Optional[str] = None) -> Dict[str, Dict[str, str]]:
    """Generate canonical search URLs categorized by ecosystem."""
    en_encoded = urllib.parse.quote(en_query)
    zh_encoded = urllib.parse.quote(zh_query if zh_query else en_query)

    return {
        "Global Western Literature & Top Conferences": {
            "CVF Open Access (CVPR / ICCV / WACV Camera-Ready)": f"https://openaccess.thecvf.com/menu?search={en_encoded}",
            "Google Scholar (Global Index & Citations)": f"https://scholar.google.com/scholar?q={en_encoded}",
            "Papers With Code (SOTA Benchmarks & Models)": f"https://paperswithcode.com/search?q={en_encoded}",
            "Hugging Face Papers (Computer Vision Hub)": f"https://huggingface.co/papers?q={en_encoded}",
            "OpenReview (NeurIPS / ICLR Peer-Reviews & Rebuttals)": f"https://openreview.net/search?term={en_encoded}",
            "IEEE Xplore (TPAMI, RA-L, ICRA, IROS)": f"https://ieeexplore.ieee.org/search/searchresult.jsp?newsearch=true&queryText={en_encoded}",
            "ACM Digital Library (SIGGRAPH, Spatial Data)": f"https://dl.acm.org/action/doSearch?AllField={en_encoded}",
            "Semantic Scholar": f"https://www.semanticscholar.org/search?q={en_encoded}",
            "ResearchGate (Author Open Full-Texts)": f"https://www.researchgate.net/search/publication?q={en_encoded}",
            "Medium Engineering / Towards Data Science": f"https://medium.com/search?q={en_encoded}",
        },
        "Chinese Academic Platforms (High-Velocity Vision & Robotics)": {
            "Baidu Scholar (百度学术 - Open Chinese Search)": f"https://xueshu.baidu.com/s?wd={zh_encoded}",
            "CNKI (中国知网 - China National Knowledge Infrastructure)": f"https://scholar.cnki.net/result?q={zh_encoded}",
            "Wanfang Data (万方数据 - Engineering Theses & Standards)": f"https://www.wanfangdata.com.cn/search/searchList.do?searchType=all&pageSize=20&searchWord={zh_encoded}",
            "OpenDataLab (Shanghai AI Lab Dataset Platform)": f"https://opendatalab.com/search?query={en_encoded}",
        },
        "Open Computer Vision Dataset Hubs": {
            "Roboflow Universe (Annotated Keypoints & Small Objects)": f"https://universe.roboflow.com/search?q={en_encoded}",
            "Kaggle Datasets & Tracking Benchmarks": f"https://www.kaggle.com/datasets?search={en_encoded}",
        }
    }

def format_markdown_report(query: str, zh_query: Optional[str], api_results: List[Dict[str, Any]], categorized_links: Dict[str, Dict[str, str]]) -> str:
    """Format academic findings into GitHub Flavored Markdown."""
    lines = []
    lines.append(f"# Deep Scholar Research Report")
    lines.append(f"**English Search Term:** `{query}`")
    if zh_query:
        lines.append(f"**Chinese Academic Term (Mandarin):** `{zh_query}`")
    lines.append("")

    lines.append("## 1. Direct Academic API Findings (arXiv & Crossref/Peer-Reviewed)")
    if not api_results:
        lines.append("_No direct API results retrieved._")
    else:
        for i, res in enumerate(api_results, 1):
            if "error" in res:
                lines.append(f"- **[{res['engine']}] Error:** {res['error']}")
                continue
            title = res.get("title", "Untitled")
            year = res.get("year", "N/A")
            authors = ", ".join(res.get("authors", []))
            url = res.get("url", "#")
            venue = f" ({res['venue']})" if res.get("venue") else ""
            lines.append(f"### {i}. [{title}]({url})")
            lines.append(f"- **Authors:** {authors} | **Year:** {year}{venue}")
            if "doi" in res and res["doi"]:
                lines.append(f"- **DOI:** `{res['doi']}`")
            if "summary" in res and res["summary"]:
                lines.append(f"- **Abstract / Summary:** {res['summary']}")
            lines.append("")

    lines.append("## 2. Dedicated Academic Portals, Chinese Engines & Dataset Hubs")
    for category, links in categorized_links.items():
        lines.append(f"### {category}")
        for name, url in links.items():
            lines.append(f"- **{name}:** [{url}]({url})")
        lines.append("")

    lines.append("## 3. Agent Integration: ddg-search & firecrawl MCP Tools")
    lines.append("Agents can explore and extract full articles using native MCP tools:")
    lines.append("")
    lines.append("```python")
    lines.append("# DuckDuckGo Targeted Search:")
    lines.append("call_mcp_tool('ddg-search', 'search', {'query': f'{query} CVPR', 'max_results': 5})")
    lines.append("call_mcp_tool('ddg-search', 'search', {'query': f'{zh_query}', 'max_results': 5, 'region': 'cn-zh'})")
    lines.append("call_mcp_tool('ddg-search', 'fetch_content', {'url': '<paper_page_url>'})")
    lines.append("")
    lines.append("# Firecrawl Deep Crawl & Paper Scraping:")
    lines.append("call_mcp_tool('firecrawl', 'firecrawl_search', {'query': f'{query}', 'limit': 3, 'categories': ['research']})")
    lines.append("call_mcp_tool('firecrawl', 'firecrawl_scrape', {'url': '<paper_fulltext_url>'})")
    lines.append("```")
    lines.append("")

    lines.append("## 4. Grounding & Codebase Integration Rule")
    lines.append("> [!IMPORTANT]")
    lines.append("> Any hyperparameter, mathematical model, or architectural heuristic derived from this search")
    lines.append("> must be recorded in `docs/architecture/IMPLEMENTATION_STACK.md` and `memory-bank/experienceLog.md`.")

    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Deep Scholar: Cross-Language Academic Literature Search")
    parser.add_argument("--query", "-q", required=True, help="English academic search query")
    parser.add_argument("--chinese-query", "-z", help="Chinese academic search query (Mandarin)")
    parser.add_argument("--engines", "-e", default="arxiv,crossref", help="Comma-separated API engines (arxiv,crossref)")
    parser.add_argument("--limit", "-l", type=int, default=5, help="Number of results per API engine")
    parser.add_argument("--fetch-url", "-f", help="Fetch and inspect text of a specific URL")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of Markdown")
    parser.add_argument("--output", "-o", help="Write output directly to specified file")

    args = parser.parse_args()

    if args.fetch_url:
        print(f"Fetching: {args.fetch_url}")
        content = fetch_url_text(args.fetch_url)
        print(content)
        return

    api_results = []
    engines = [eng.strip().lower() for eng in args.engines.split(",")]

    if "arxiv" in engines:
        api_results.extend(search_arxiv(args.query, limit=args.limit))
    if "crossref" in engines:
        api_results.extend(search_crossref(args.query, limit=args.limit))

    links = generate_academic_links(args.query, args.chinese_query)

    if args.json:
        output_data = {
            "query": args.query,
            "chinese_query": args.chinese_query,
            "api_results": api_results,
            "academic_portal_links": links
        }
        rendered = json.dumps(output_data, indent=2, ensure_ascii=False)
    else:
        rendered = format_markdown_report(args.query, args.chinese_query, api_results, links)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(rendered)
        print(f"Deep Scholar results written to: {args.output}")
    else:
        print(rendered)

if __name__ == "__main__":
    main()
