#!/usr/bin/env python3
"""
Generate professional aerospace-style SVG diagrams for ARES-Health documentation.
"""
import os

DIAGRAMS_DIR = "/Users/fabiomalagutti/Desktop/NASA_Space_Apps_2026/diagrams"
os.makedirs(DIAGRAMS_DIR, exist_ok=True)

# 1. Architecture Diagram
arch_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 480" width="100%" height="100%" style="background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.08" />
    </filter>
    <marker id="arrow-down" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" />
    </marker>
    <marker id="arrow-up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" />
    </marker>
    <marker id="arrow-purple-down" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed" />
    </marker>
    <marker id="arrow-purple-up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed" />
    </marker>
  </defs>

  <!-- Title Badge -->
  <rect x="250" y="15" width="400" height="34" rx="17" fill="#0f172a" />
  <text x="450" y="37" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700" letter-spacing="1.5">ARES-HEALTH DUAL-TRANSPORT TOPOLOGY</text>

  <!-- Box 1: Astronaut Cockpit (Top Left) -->
  <g transform="translate(40, 70)" filter="url(#shadow)">
    <rect width="380" height="130" rx="12" fill="#ffffff" stroke="#0284c7" stroke-width="2" />
    <rect width="380" height="36" rx="12" fill="#e0f2fe" />
    <path d="M 0 24 L 0 36 L 380 36 L 380 24 Z" fill="#e0f2fe" />
    <text x="20" y="24" fill="#0369a1" font-size="14" font-weight="700">ASTRONAUT COCKPIT (UI Layer)</text>
    <text x="360" y="24" text-anchor="end" fill="#0284c7" font-size="11" font-weight="600">PORT 8080</text>
    
    <text x="20" y="58" fill="#0f172a" font-size="12" font-weight="600">React 19 • TypeScript • Tailwind CSS • Three.js WebGL</text>
    <text x="20" y="78" fill="#475569" font-size="11">• OLED Dark-Theme (#000000) ergonomico per microgravita'</text>
    <text x="20" y="96" fill="#475569" font-size="11">• Console What-If Stress-Test con 4 slider tempo reale (&lt;1 ms)</text>
    <text x="20" y="114" fill="#475569" font-size="11">• Runner MedOps Playbook con overlay guida ecografica POCUS</text>
  </g>

  <!-- Box 2: Local AI Copilot (Top Right) -->
  <g transform="translate(480, 70)" filter="url(#shadow)">
    <rect width="380" height="130" rx="12" fill="#ffffff" stroke="#7c3aed" stroke-width="2" />
    <rect width="380" height="36" rx="12" fill="#f3e8ff" />
    <path d="M 0 24 L 0 36 L 380 36 L 380 24 Z" fill="#f3e8ff" />
    <text x="20" y="24" fill="#6d28d9" font-size="14" font-weight="700">ON-BOARD EDGE AI COPILOT</text>
    <text x="360" y="24" text-anchor="end" fill="#7c3aed" font-size="11" font-weight="600">STDIO PIPELINE</text>
    
    <text x="20" y="58" fill="#0f172a" font-size="12" font-weight="600">Quantized Local LLM (llama.cpp / Ollama)</text>
    <text x="20" y="78" fill="#475569" font-size="11">• 100% Offline • Zero Dipendenze Cloud • Air-Gapped</text>
    <text x="20" y="96" fill="#475569" font-size="11">• Macro-Tool FastMCP compatti (&lt;150 token di contesto)</text>
    <text x="20" y="114" fill="#475569" font-size="11">• Zero Allucinazioni: ancorato al grafo causale matematico</text>
  </g>

  <!-- Interconnect Pipes / Arrows -->
  <!-- Left pipe -->
  <line x1="230" y1="205" x2="230" y2="250" stroke="#0284c7" stroke-width="2.5" marker-end="url(#arrow-down)" />
  <line x1="235" y1="250" x2="235" y2="205" stroke="#0284c7" stroke-width="2.5" marker-end="url(#arrow-up)" />
  <rect x="110" y="214" width="240" height="24" rx="6" fill="#ffffff" stroke="#bae6fd" stroke-width="1.5" />
  <text x="230" y="230" text-anchor="middle" fill="#0369a1" font-size="10.5" font-weight="700">20 Hz WebSocket + REST (axum)</text>

  <!-- Right pipe -->
  <line x1="670" y1="205" x2="670" y2="250" stroke="#7c3aed" stroke-width="2.5" marker-end="url(#arrow-purple-down)" />
  <line x1="675" y1="250" x2="675" y2="205" stroke="#7c3aed" stroke-width="2.5" marker-end="url(#arrow-purple-up)" />
  <rect x="555" y="214" width="235" height="24" rx="6" fill="#ffffff" stroke="#ddd6fe" stroke-width="1.5" />
  <text x="672" y="230" text-anchor="middle" fill="#6d28d9" font-size="10.5" font-weight="700">JSON-RPC FastMCP (stdio Pipe)</text>

  <!-- Box 3: Safe Rust Core Engine (Bottom Big Box) -->
  <g transform="translate(40, 260)" filter="url(#shadow)">
    <rect width="820" height="200" rx="14" fill="#ffffff" stroke="#0f172a" stroke-width="2.5" />
    <rect width="820" height="42" rx="14" fill="#0f172a" />
    <path d="M 0 28 L 0 42 L 820 42 L 820 28 Z" fill="#0f172a" />
    <text x="24" y="27" fill="#ffffff" font-size="15" font-weight="700">ARES-ENGINE (Safe Rust Core Binary • Tokio Runtime)</text>
    <text x="796" y="27" text-anchor="end" fill="#38bdf8" font-size="12" font-weight="600">Arc&lt;RwLock&lt;MissionState&gt;&gt; • RAM &lt; 20 MB • Latenza &lt; 15 µs</text>
    
    <!-- 5 Internal Modules in columns -->
    <!-- Mod 1: Telemetry -->
    <g transform="translate(18, 56)">
      <rect width="148" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <rect width="148" height="26" rx="8" fill="#e2e8f0" />
      <path d="M 0 16 L 0 26 L 148 26 L 148 16 Z" fill="#e2e8f0" />
      <text x="74" y="17" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">telemetry.rs</text>
      <text x="8" y="44" fill="#334155" font-size="9.5" font-weight="600">• Multi-Rate Ring Buffer</text>
      <text x="8" y="60" fill="#64748b" font-size="9">(ECG 100Hz, Radar 20Hz)</text>
      <text x="8" y="80" fill="#334155" font-size="9.5" font-weight="600">• Filtro SQI Spettrale</text>
      <text x="8" y="96" fill="#64748b" font-size="9">Reiezione artefatti sudore</text>
      <text x="8" y="116" fill="#334155" font-size="9.5" font-weight="600">• Notch Armonico ECLSS</text>
    </g>

    <!-- Mod 2: Graph -->
    <g transform="translate(178, 56)">
      <rect width="148" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <rect width="148" height="26" rx="8" fill="#e2e8f0" />
      <path d="M 0 16 L 0 26 L 148 26 L 148 16 Z" fill="#e2e8f0" />
      <text x="74" y="17" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">graph.rs</text>
      <text x="8" y="44" fill="#334155" font-size="9.5" font-weight="600">• Grafo Causale ADHG</text>
      <text x="8" y="60" fill="#64748b" font-size="9">Topologia petgraph</text>
      <text x="8" y="80" fill="#334155" font-size="9.5" font-weight="600">• ODE Frost-Hargens</text>
      <text x="8" y="96" fill="#64748b" font-size="9">Sclerostina e atrofia</text>
      <text x="8" y="116" fill="#334155" font-size="9.5" font-weight="600">• Shear Stress tau_w</text>
    </g>

    <!-- Mod 3: STL -->
    <g transform="translate(338, 56)">
      <rect width="148" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <rect width="148" height="26" rx="8" fill="#e2e8f0" />
      <path d="M 0 16 L 0 26 L 148 26 L 148 16 Z" fill="#e2e8f0" />
      <text x="74" y="17" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">stl.rs</text>
      <text x="8" y="44" fill="#334155" font-size="9.5" font-weight="600">• Monitor NQS-STL</text>
      <text x="8" y="60" fill="#64748b" font-size="9">Scala rho in (-inf, +1]</text>
      <text x="8" y="80" fill="#334155" font-size="9.5" font-weight="600">• Lemire Wedges O(1)</text>
      <text x="8" y="96" fill="#64748b" font-size="9">Valutazione finestra STL</text>
      <text x="8" y="116" fill="#334155" font-size="9.5" font-weight="600">• Stima TTV a 14 giorni</text>
    </g>

    <!-- Mod 4: Playbooks -->
    <g transform="translate(498, 56)">
      <rect width="148" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <rect width="148" height="26" rx="8" fill="#e2e8f0" />
      <path d="M 0 16 L 0 26 L 148 26 L 148 16 Z" fill="#e2e8f0" />
      <text x="74" y="17" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">playbooks.rs</text>
      <text x="8" y="44" fill="#334155" font-size="9.5" font-weight="600">• MedOps State Machine</text>
      <text x="8" y="60" fill="#64748b" font-size="9">DAG clinici deterministici</text>
      <text x="8" y="80" fill="#dc2626" font-size="9.5" font-weight="700">• Hard Safety Gate #1</text>
      <text x="8" y="96" fill="#64748b" font-size="9">No anticoagulanti in stasi</text>
      <text x="8" y="116" fill="#dc2626" font-size="9.5" font-weight="700">• Hard Safety Gate #2</text>
    </g>

    <!-- Mod 5: MCP -->
    <g transform="translate(658, 56)">
      <rect width="144" height="128" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
      <rect width="144" height="26" rx="8" fill="#e2e8f0" />
      <path d="M 0 16 L 0 26 L 144 26 L 144 16 Z" fill="#e2e8f0" />
      <text x="72" y="17" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="700">mcp.rs</text>
      <text x="8" y="44" fill="#334155" font-size="9.5" font-weight="600">• FastMCP Server</text>
      <text x="8" y="60" fill="#64748b" font-size="9">JSON-RPC su stdio</text>
      <text x="8" y="80" fill="#334155" font-size="9.5" font-weight="600">• 3 Macro-Tool</text>
      <text x="8" y="96" fill="#64748b" font-size="9">get_mission_status</text>
      <text x="8" y="110" fill="#64748b" font-size="9">explain_causal_path</text>
      <text x="8" y="124" fill="#64748b" font-size="9">run_what_if_stress</text>
    </g>
  </g>
</svg>
"""

with open(os.path.join(DIAGRAMS_DIR, "diagram_architecture.svg"), "w") as fp:
    fp.write(arch_svg.strip())

# 2. Functional Closed Loop Diagram
loop_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 200" width="100%" height="100%" style="background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <filter id="shadow-loop" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.08" />
    </filter>
    <marker id="arrow-navy" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a" />
    </marker>
  </defs>

  <!-- Step 1: Gather -->
  <g transform="translate(30, 20)" filter="url(#shadow-loop)">
    <rect width="240" height="160" rx="12" fill="#ffffff" stroke="#0284c7" stroke-width="2" />
    <rect width="240" height="34" rx="12" fill="#0284c7" />
    <path d="M 0 22 L 0 34 L 240 34 L 240 22 Z" fill="#0284c7" />
    <text x="120" y="23" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700">1. GATHER (Raccolta)</text>
    <text x="16" y="56" fill="#0f172a" font-size="11" font-weight="600">• Radar Notturno Contactless</text>
    <text x="24" y="72" fill="#64748b" font-size="10">RF / Wi-Fi CSI (zero dermatiti)</text>
    <text x="16" y="92" fill="#0f172a" font-size="11" font-weight="600">• Biosegnali Indossabili</text>
    <text x="24" y="108" fill="#64748b" font-size="10">ECG con filtro SQI anti-sudore</text>
    <text x="16" y="128" fill="#0f172a" font-size="11" font-weight="600">• Biomarcatori Omici POC</text>
    <text x="24" y="144" fill="#64748b" font-size="10">i-STAT Troponina, cf-mtDNA</text>
  </g>

  <!-- Arrow 1 -> 2 -->
  <line x1="280" y1="100" x2="310" y2="100" stroke="#0f172a" stroke-width="3" marker-end="url(#arrow-navy)" />

  <!-- Step 2: Evaluate -->
  <g transform="translate(320, 20)" filter="url(#shadow-loop)">
    <rect width="240" height="160" rx="12" fill="#ffffff" stroke="#059669" stroke-width="2" />
    <rect width="240" height="34" rx="12" fill="#059669" />
    <path d="M 0 22 L 0 34 L 240 34 L 240 22 Z" fill="#059669" />
    <text x="120" y="23" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700">2. EVALUATE (Valutazione)</text>
    <text x="16" y="56" fill="#0f172a" font-size="11" font-weight="600">• Grafo Causale ADHG</text>
    <text x="24" y="72" fill="#64748b" font-size="10">Asse Soleo -&gt; Sclerostina -&gt; IJV</text>
    <text x="16" y="92" fill="#0f172a" font-size="11" font-weight="600">• Margini di Sicurezza NQS-STL</text>
    <text x="24" y="108" fill="#64748b" font-size="10">Scala rho &gt; 0, TTV a 14 giorni</text>
    <text x="16" y="128" fill="#0f172a" font-size="11" font-weight="600">• Osservatore Bayesiano POCUS</text>
    <text x="24" y="144" fill="#64748b" font-size="10">Stima continua + snap a zero</text>
  </g>

  <!-- Arrow 2 -> 3 -->
  <line x1="570" y1="100" x2="600" y2="100" stroke="#0f172a" stroke-width="3" marker-end="url(#arrow-navy)" />

  <!-- Step 3: Act -->
  <g transform="translate(610, 20)" filter="url(#shadow-loop)">
    <rect width="240" height="160" rx="12" fill="#ffffff" stroke="#d97706" stroke-width="2" />
    <rect width="240" height="34" rx="12" fill="#d97706" />
    <path d="M 0 22 L 0 34 L 240 34 L 240 22 Z" fill="#d97706" />
    <text x="120" y="23" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700">3. ACT (Azione e Prescrizione)</text>
    <text x="16" y="56" fill="#0f172a" font-size="11" font-weight="600">• Cockpit OLED Dark 3D</text>
    <text x="24" y="72" fill="#64748b" font-size="10">Manichino olografico WebGL</text>
    <text x="16" y="92" fill="#0f172a" font-size="11" font-weight="600">• Slider What-If (&lt;1 ms)</text>
    <text x="24" y="108" fill="#64748b" font-size="10">Test da sforzo e cabina ppCO2</text>
    <text x="16" y="128" fill="#0f172a" font-size="11" font-weight="600">• Playbook MedOps con Gates</text>
    <text x="24" y="144" fill="#64748b" font-size="10">Stop anticoagulanti • LBNP safe</text>
  </g>
</svg>
"""

with open(os.path.join(DIAGRAMS_DIR, "diagram_gather_evaluate_act.svg"), "w") as fp:
    fp.write(loop_svg.strip())

# 3. Multi-Organ Causal Cascade Diagram
causal_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 320" width="100%" height="100%" style="background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <filter id="shadow-c" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.08" />
    </filter>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" />
    </marker>
  </defs>

  <rect x="260" y="12" width="400" height="30" rx="15" fill="#0f172a" />
  <text x="460" y="32" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700" letter-spacing="1">CASCATA FISIOPATOLOGICA ACCOPPIATA (GRAFO ADHG)</text>

  <!-- Row 1: Muscle and Bone -->
  <!-- Box A: Microgravity -->
  <g transform="translate(30, 60)" filter="url(#shadow-c)">
    <rect width="180" height="90" rx="10" fill="#ffffff" stroke="#64748b" stroke-width="2" />
    <rect width="180" height="26" rx="10" fill="#f1f5f9" />
    <path d="M 0 16 L 0 26 L 180 26 L 180 16 Z" fill="#f1f5f9" />
    <text x="90" y="18" text-anchor="middle" fill="#334155" font-size="11" font-weight="700">Microgravita' (0g)</text>
    <text x="12" y="46" fill="#0f172a" font-size="10.5" font-weight="600">Assenza carico posturale</text>
    <text x="12" y="62" fill="#64748b" font-size="9.5">Disuso muscolare</text>
    <text x="12" y="78" fill="#64748b" font-size="9.5">Scarico meccanico cronico</text>
  </g>

  <!-- Arrow A -> B -->
  <line x1="220" y1="105" x2="250" y2="105" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />

  <!-- Box B: Sarcopenia -->
  <g transform="translate(260, 60)" filter="url(#shadow-c)">
    <rect width="190" height="90" rx="10" fill="#ffffff" stroke="#ea580c" stroke-width="2" />
    <rect width="190" height="26" rx="10" fill="#ffedd5" />
    <path d="M 0 16 L 0 26 L 190 26 L 190 16 Z" fill="#ffedd5" />
    <text x="95" y="18" text-anchor="middle" fill="#c2410c" font-size="11" font-weight="700">Atrofia Soleo / Polpaccio</text>
    <text x="12" y="46" fill="#0f172a" font-size="10.5" font-weight="600">-1.5% spessore / mese</text>
    <text x="12" y="62" fill="#c2410c" font-size="9.5" font-weight="600">Crollo Irisina circolante</text>
    <text x="12" y="78" fill="#64748b" font-size="9.5">Perdita secretoma miR-126</text>
  </g>

  <!-- Arrow B -> C -->
  <line x1="460" y1="105" x2="490" y2="105" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />

  <!-- Box C: Bone Osteopenia -->
  <g transform="translate(500, 60)" filter="url(#shadow-c)">
    <rect width="190" height="90" rx="10" fill="#ffffff" stroke="#b45309" stroke-width="2" />
    <rect width="190" height="26" rx="10" fill="#fef3c7" />
    <path d="M 0 16 L 0 26 L 190 26 L 190 16 Z" fill="#fef3c7" />
    <text x="95" y="18" text-anchor="middle" fill="#92400e" font-size="11" font-weight="700">Osteopenia &amp; Sclerostina</text>
    <text x="12" y="46" fill="#0f172a" font-size="10.5" font-weight="600">Modello Frost-Hargens ODE</text>
    <text x="12" y="62" fill="#92400e" font-size="9.5" font-weight="600">Perdita BMD Calcagno e L1-L4</text>
    <text x="12" y="78" fill="#64748b" font-size="9.5">Ipercalciuria (rischio calcoli)</text>
  </g>

  <!-- Arrow C -> D (downwards) -->
  <line x1="595" y1="160" x2="595" y2="195" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />

  <!-- Row 2: Hemodynamics and Thrombosis -->
  <!-- Box D: Venous Compliance Loss -->
  <g transform="translate(500, 205)" filter="url(#shadow-c)">
    <rect width="190" height="95" rx="10" fill="#ffffff" stroke="#0284c7" stroke-width="2" />
    <rect width="190" height="26" rx="10" fill="#e0f2fe" />
    <path d="M 0 16 L 0 26 L 190 26 L 190 16 Z" fill="#e0f2fe" />
    <text x="95" y="18" text-anchor="middle" fill="#0369a1" font-size="11" font-weight="700">Perdita Capacitanza Crurale</text>
    <text x="12" y="46" fill="#0f172a" font-size="10.5" font-weight="600">Collasso seni venosi soleo</text>
    <text x="12" y="62" fill="#0369a1" font-size="9.5" font-weight="600">~2 Litri fluidi verso la testa</text>
    <text x="12" y="78" fill="#64748b" font-size="9.5">Ipervolemia toraco-cefalica</text>
  </g>

  <!-- Arrow D -> E (leftwards) -->
  <line x1="490" y1="252" x2="460" y2="252" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />

  <!-- Box E: Jugular Stasis -->
  <g transform="translate(260, 205)" filter="url(#shadow-c)">
    <rect width="190" height="95" rx="10" fill="#ffffff" stroke="#7c3aed" stroke-width="2" />
    <rect width="190" height="26" rx="10" fill="#f3e8ff" />
    <path d="M 0 16 L 0 26 L 190 26 L 190 16 Z" fill="#f3e8ff" />
    <text x="95" y="18" text-anchor="middle" fill="#6d28d9" font-size="11" font-weight="700">Stasi Giugulare Interna (IJV)</text>
    <text x="12" y="46" fill="#0f172a" font-size="10.5" font-weight="600">IJV-CSA &gt; 2.5 cm² (sovradistesa)</text>
    <text x="12" y="62" fill="#6d28d9" font-size="9.5" font-weight="600">Flusso lento v &lt; 5 cm/s</text>
    <text x="12" y="78" fill="#dc2626" font-size="9.5" font-weight="700">tau_w &lt; 4.0 dyn/cm² (critico)</text>
  </g>

  <!-- Arrow E -> F (leftwards) -->
  <line x1="250" y1="252" x2="220" y2="252" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />

  <!-- Box F: Thrombosis Risk -->
  <g transform="translate(30, 205)" filter="url(#shadow-c)">
    <rect width="180" height="95" rx="10" fill="#ffffff" stroke="#dc2626" stroke-width="2.5" />
    <rect width="180" height="26" rx="10" fill="#fee2e2" />
    <path d="M 0 16 L 0 26 L 180 26 L 180 16 Z" fill="#fee2e2" />
    <text x="90" y="18" text-anchor="middle" fill="#b91c1c" font-size="11" font-weight="700">Rischio Trombosi Venosa</text>
    <text x="12" y="46" fill="#b91c1c" font-size="10.5" font-weight="700">TRIADE DI VIRCHOW</text>
    <text x="12" y="62" fill="#334155" font-size="9.5">Stasi + Danno Endoteliale</text>
    <text x="12" y="78" fill="#dc2626" font-size="9.5" font-weight="600">TTV residuo: 11-14 giorni</text>
  </g>
</svg>
"""

with open(os.path.join(DIAGRAMS_DIR, "diagram_causal_graph.svg"), "w") as fp:
    fp.write(causal_svg.strip())

print("All 3 vector SVG diagrams successfully created.")
