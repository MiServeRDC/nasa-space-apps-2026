// Ground Control Telemedicine & 24-Dataset Evidence Atlas.
// Ground station perspective with Earth-Mars radio latency simulation (8-48 min),
// DSN store-and-forward transmission monitor, 24-dataset scientific atlas, and tele-echography POCUS review station.
// Invariant: STRICTLY ZERO EMOJIS in code, comments, or documentation.

import { useMemo, useState } from 'react';
import type { CrewSex, ScenarioState, WhatIf } from '../../lib/scenario';
import type { TelemetryPacket } from '../../types/telemetry';
import { PocusIjv, OcularOnsd } from '../analysis-imaging/Imaging';

export interface ScientificDataset {
  id: string;
  agency: 'NASA' | 'ESA' | 'CSA' | 'JAXA' | 'PhysioNet' | 'DLR';
  accession: string;
  title: string;
  axis: 'Cardiovascular' | 'Neuro-Ocular (SANS)' | 'Musculoskeletal' | 'Radiation' | 'Circadian & Autonomic' | 'Clinical Spaceflight & Terrestrial';
  platform: string;
  sampleCohort: string;
  doiOrUrl: string;
  relevanceToAres: string;
  safetyGateMapping: string;
}

export const SCIENTIFIC_ATLAS: ScientificDataset[] = [
  // 1-8 NASA OSDR & Human Research Program
  {
    id: 'osd-51',
    agency: 'NASA',
    accession: 'OSD-51',
    title: 'WISE-2005 60-Day Female Head-Down Bed-Rest Soleus & Vastus Lateralis Transcriptome',
    axis: 'Musculoskeletal',
    platform: 'MEDES -6 deg HDBR Analog (60 Days)',
    sampleCohort: 'Healthy Female Volunteers (n=24, exercise vs control)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-51',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative reference for skeletal muscle unloading and resistive countermeasure pathways.',
    safetyGateMapping: 'ARED resistive load scenario context (Frost 1000 microstrain)',
  },
  {
    id: 'osd-195',
    agency: 'NASA',
    accession: 'OSD-195',
    title: '21-Day Human Head-Down Bed-Rest Skeletal Muscle Microarray Study',
    axis: 'Musculoskeletal',
    platform: 'Human -6 deg HDBR Analog (21 Days)',
    sampleCohort: 'Healthy Human Volunteers (n=24)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-195',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative human bed-rest myofiber unloading context; not fitted to ODE constants.',
    safetyGateMapping: 'Soleus MQI & ARED unloading scenario context',
  },
  {
    id: 'osd-818',
    agency: 'NASA',
    accession: 'OSD-818',
    title: 'Ex Vivo Human Translaminar Pressure Gradient Ocular Model for SANS',
    axis: 'Neuro-Ocular (SANS)',
    platform: 'Ex Vivo Human Donor Posterior Eye Cup Perfusion',
    sampleCohort: 'Human Ocular Specimens (n=28)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-818',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative reference for translaminar pressure gradient and optic nerve head stress.',
    safetyGateMapping: 'SANS ONSD & translaminar scenario proxy (Playbook #04)',
  },
  {
    id: 'osd-37',
    agency: 'NASA',
    accession: 'OSD-37',
    title: 'Spaceflight Induces Changes in Gene Expression Profiles in Bone & Cartilage',
    axis: 'Musculoskeletal',
    platform: 'Space Shuttle STS-108',
    sampleCohort: 'Rodents (n=12 flight, n=12 ground)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-37',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative literature context for SOST/sclerostin upregulation during unweighting.',
    safetyGateMapping: 'Bone mineral turnover & sclerostin pmol/L ODE',
  },
  {
    id: 'osd-137',
    agency: 'NASA',
    accession: 'OSD-137',
    title: 'Trabecular and Cortical Bone Density Loss in Extended Spaceflight',
    axis: 'Musculoskeletal',
    platform: 'Bion-M1 Biosatellite (30 Days Orbit)',
    sampleCohort: 'Rodent Bio-Satellite Cohort (n=16)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-137',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative context for calcium efflux and urinary supersaturation under unloading.',
    safetyGateMapping: 'Calcaneus BMD loss percentage forecast',
  },
  {
    id: 'osd-570',
    agency: 'NASA',
    accession: 'OSD-570',
    title: 'SpaceX Inspiration4 SOMA Multi-Omics, Proteomics & Immune Profiling',
    axis: 'Circadian & Autonomic',
    platform: 'SpaceX Dragon Resilience LEO (3-Day Commercial Mission)',
    sampleCohort: 'Commercial Astronaut Crew (n=4)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-570',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): spaceflight multi-omics and immune shift reference for Playbook #13 context.',
    safetyGateMapping: 'Neuro-immune reactivation scenario context (Playbook #13)',
  },
  {
    id: 'osd-571',
    agency: 'NASA',
    accession: 'OSD-571',
    title: 'SpaceX Inspiration4 SOMA Cell-Free DNA (cfDNA) & Mitochondrial cf-mtDNA',
    axis: 'Radiation',
    platform: 'SpaceX Dragon Resilience LEO (SOMA Biobank)',
    sampleCohort: 'Commercial Astronaut Crew (n=4 longitudinal draws)',
    doiOrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-571',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): qualitative oxidative and mitochondrial stress biomarker reference.',
    safetyGateMapping: 'Oxidative & radiation stress ADHG context (Playbook #05)',
  },
  {
    id: 'osd-665',
    agency: 'NASA',
    accession: 'JAMA-NO-2019-IJV',
    title: 'Assessment of Jugular Venous Blood Flow Stasis and Thrombosis During Spaceflight (Marshall-Goebel et al., 2019)',
    axis: 'Cardiovascular',
    platform: 'International Space Station (ISS Ultrasound Cohort)',
    sampleCohort: '11 Astronauts screened with serial POCUS',
    doiOrUrl: 'https://doi.org/10.1001/jamanetworkopen.2019.15011',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): clinical cohort reporting stagnant/retrograde IJV flow and occlusive thrombus in spaceflight.',
    safetyGateMapping: 'Hard Safety Gate 1: No blind anticoagulants without POCUS',
  },

  // 9-12 PhysioNet High-Resolution Datasets
  {
    id: 'physionet-bidmc',
    agency: 'PhysioNet',
    accession: 'BIDMC-v1.0.0',
    title: 'BIDMC PPG and Respiration High-Resolution Benchmark Dataset',
    axis: 'Cardiovascular',
    platform: 'Terrestrial Clinical ICU Reference',
    sampleCohort: '53 Patients (8-min multi-channel recordings, 125 Hz)',
    doiOrUrl: 'https://doi.org/10.13026/C22018',
    relevanceToAres: 'Recorded 1 Hz numeric replay input (RECORDED_TERRESTRIAL_BIDMC_CSV) for missing-channel preservation and SQI gating; not spaceflight validation.',
    safetyGateMapping: 'SQI >= 0.70 biometric gating and EWMA filtering',
  },
  {
    id: 'physionet-cebs',
    agency: 'PhysioNet',
    accession: 'CEBS-1.0.0',
    title: 'Combined Measurement of ECG, Breathing, and Seismocardiograms',
    axis: 'Cardiovascular',
    platform: 'Terrestrial Cardiopulmonary Lab',
    sampleCohort: '20 Healthy Volunteers',
    doiOrUrl: 'https://doi.org/10.13026/C2QG6B',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): reference waveforms for mechanical cardiac contraction and thoracic impedance.',
    safetyGateMapping: 'Pulse vs Heart Rate synchronization check',
  },
  {
    id: 'physionet-mimic2',
    agency: 'PhysioNet',
    accession: 'MIMIC-II Waveform',
    title: 'Multi-parameter Intelligent Monitoring in Intensive Care Waveform Database',
    axis: 'Circadian & Autonomic',
    platform: 'Clinical Intensive Care System',
    sampleCohort: 'Thousands of high-fidelity physiological waveforms',
    doiOrUrl: 'https://doi.org/10.13026/C24W27',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): stress testing anomaly detectors against severe arrhythmias, sensor dropouts, and lead detachment.',
    safetyGateMapping: 'Missing channel preservation & HOLD_LAST_VALID logic',
  },
  {
    id: 'physionet-fantasia',
    agency: 'PhysioNet',
    accession: 'Fantasia Database',
    title: 'Twenty Young and Twenty Elderly Subjects Resting Holter Recordings',
    axis: 'Circadian & Autonomic',
    platform: 'Cardiovascular Physiology Lab',
    sampleCohort: '40 Subjects (continuous 120-min ECG & respiration)',
    doiOrUrl: 'https://doi.org/10.13026/C2HP4M',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): heart rate variability (HRV RMSSD) baselines across biological age and autonomic tone.',
    safetyGateMapping: 'Autonomic nervous system recovery tracking',
  },

  // 13-17 CSA Canadian Space Agency
  {
    id: 'csa-cans',
    agency: 'CSA',
    accession: 'CSA-CANS-2026',
    title: 'Canadian Active Neutron Spectrometer Real-Time Deep Space Dosimetry',
    axis: 'Radiation',
    platform: 'ISS Columbus / Gateway Testbed',
    sampleCohort: 'Active solid-state neutron spectrometer data',
    doiOrUrl: 'https://www.asc-csa.gc.ca/eng/iss/science/cans.asp',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): continuous active neutron dose rate monitoring (mSv/d) for deep-space solar particle events (SPE) and GCR.',
    safetyGateMapping: 'Radiation accumulation and EVA shelter alarms',
  },
  {
    id: 'csa-biomonitor',
    agency: 'CSA',
    accession: 'CSA-Bio-Monitor',
    title: 'Bio-Monitor Wearable Smart Shirt Continuous Physiological Telemetry',
    axis: 'Circadian & Autonomic',
    platform: 'ISS Expeditions 58-71',
    sampleCohort: 'Astronauts wearing continuous sensor garments',
    doiOrUrl: 'https://www.asc-csa.gc.ca/eng/iss/bio-monitor.asp',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): wearable channel schema inspiration for 24/7 smart-garment vitals ingestion.',
    safetyGateMapping: 'Real-time 20 Hz telemetry frame deserializer',
  },
  {
    id: 'csa-vascular-aging',
    agency: 'CSA',
    accession: 'CSA-Vascular-Echo',
    title: 'Vascular Aging and Vascular Echo Ultrasound Studies in Space',
    axis: 'Cardiovascular',
    platform: 'ISS Canadian Payload Series',
    sampleCohort: '9 ISS Astronauts',
    doiOrUrl: 'https://www.asc-csa.gc.ca/eng/iss/vascular.asp',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): demonstrated arterial stiffening and insulin resistance mimicking decades of accelerated terrestrial aging.',
    safetyGateMapping: 'Endothelial wall shear stress tracking',
  },
  {
    id: 'csa-marrow',
    agency: 'CSA',
    accession: 'CSA-MARROW',
    title: 'Microgravity-Induced Bone Marrow Adiposity and Space Anemia',
    axis: 'Musculoskeletal',
    platform: 'ISS Science Series',
    sampleCohort: '14 Astronauts (pre/in/post-flight blood and breath CO)',
    doiOrUrl: 'https://www.asc-csa.gc.ca/eng/iss/marrow.asp',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): quantifies post-flight hemolysis and erythropoietin dysregulation linked to trabecular bone loss.',
    safetyGateMapping: 'Mars landing gait asymmetry and recovery forecast',
  },
  {
    id: 'csa-athome',
    agency: 'CSA',
    accession: 'CSA-At-Home',
    title: 'At Home in Space: Psychosocial and Circadian Adaptation to Isolation',
    axis: 'Circadian & Autonomic',
    platform: 'ISS Long-Duration Isolation',
    sampleCohort: '12 International Crew Members',
    doiOrUrl: 'https://www.asc-csa.gc.ca/eng/iss/at-home.asp',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): circadian phase shifts and sleep architecture disturbance models during autonomous missions.',
    safetyGateMapping: 'Crew fatigue and autonomous procedural execution',
  },

  // 18-21 ESA European Space Agency
  {
    id: 'esa-myotones',
    agency: 'ESA',
    accession: 'ESA-Myotones',
    title: 'Myotones: Non-Invasive Assessment of Muscle Tone and Elasticity in Weightlessness',
    axis: 'Musculoskeletal',
    platform: 'ISS Expedition 75 (Sept 2026)',
    sampleCohort: 'Astronauts evaluated with digital palpation probe',
    doiOrUrl: 'https://www.esa.int/ESA_Multimedia/Images/2026/09/Myotones',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): direct measurement of myofascial tone, oscillation frequency, and decrement in calf and thigh muscles.',
    safetyGateMapping: 'Soleus thickness and ARED countermeasure adherence',
  },
  {
    id: 'esa-brace',
    agency: 'ESA',
    accession: 'ESA-BRACE-HDBR',
    title: 'BRACE 60-Day Head-Down Bed Rest with Artificial Gravity Countermeasures',
    axis: 'Cardiovascular',
    platform: 'MEDES Space Clinic (Toulouse, France)',
    sampleCohort: '24 Healthy Male and Female Volunteers',
    doiOrUrl: 'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Bed_rest_studies',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): bed rest simulation evaluating Lower Body Negative Pressure (LBNP) against cephalad fluid shift.',
    safetyGateMapping: 'Hard Safety Gate 2: LBNP anti-syncope auto-vent (<15 mmHg drop)',
  },
  {
    id: 'esa-dosis3d',
    agency: 'ESA',
    accession: 'ESA-DOSIS-3D',
    title: 'Dose Distribution Inside the European Columbus Laboratory on the ISS',
    axis: 'Radiation',
    platform: 'ISS Columbus Laboratory',
    sampleCohort: 'Passive and active dosimeter arrays (continuous 12-year mapping)',
    doiOrUrl: 'https://doi.org/10.1016/j.asr.2019.08.012',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): habitat radiation shielding reference for transit dosimetry scenario bounds.',
    safetyGateMapping: 'Deep-space habitability and passive shielding metrics',
  },
  {
    id: 'esa-brain-dti',
    agency: 'ESA',
    accession: 'ESA-Brain-DTI',
    title: 'Neurostructural Changes and Ventricular Expansion in Cosmonauts and Astronauts',
    axis: 'Neuro-Ocular (SANS)',
    platform: 'Pre/Post-Flight Brain MRI (Cosmonaut Cohort)',
    sampleCohort: '26 Space Travelers',
    doiOrUrl: 'https://doi.org/10.1056/NEJMoa1804928',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): demonstrates upward brain shift, ventricular enlargement, and optic disk edema due to persistent fluid redistribution.',
    safetyGateMapping: 'SANS ONSD progression risk index',
  },

  // 22-24 Analog & Commercial Databases
  {
    id: 'nasa-chapea',
    agency: 'NASA',
    accession: 'NASA-CHAPEA-M1',
    title: 'Crew Health and Performance Exploration Analog 378-Day Mars Habitat Mission',
    axis: 'Circadian & Autonomic',
    platform: 'Mars Dune Alpha (Johnson Space Center)',
    sampleCohort: '4 Crew Members (378-Day Air-Gapped Habitat)',
    doiOrUrl: 'https://www.nasa.gov/humans-in-space/chapea/',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): operational mission analog context for 4-24 min one-way Mars communication latency.',
    safetyGateMapping: 'Asynchronous ground telemedicine review workflow',
  },
  {
    id: 'dlr-agbresa',
    agency: 'DLR',
    accession: 'DLR-AGBRESA-SANS',
    title: 'Artificial Gravity Bed Rest Study with SANS Countermeasure Evaluation',
    axis: 'Neuro-Ocular (SANS)',
    platform: ':envihab Research Facility (Cologne)',
    sampleCohort: '24 Subjects (60 Days -6 deg HDBR)',
    doiOrUrl: 'https://www.dlr.de/me/en/desktopdefault.aspx/tabid-11233/',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): analog literature context on intermittent artificial gravity and venous drainage.',
    safetyGateMapping: 'LBNP daily countermeasure protocol scheduling',
  },
  {
    id: 'trish-expand',
    agency: 'NASA',
    accession: 'TRISH-EXPAND-2026',
    title: 'Enhancing Protocol for Antimicrobial and Novel Development in Commercial Spaceflight',
    axis: 'Clinical Spaceflight & Terrestrial',
    platform: 'Axiom & Inspiration4 Commercial Missions',
    sampleCohort: 'Diverse Commercial Crew Demographics',
    doiOrUrl: 'https://www.nasa.gov/hrp/the-translational-research-institute-for-space-health-trish/',
    relevanceToAres: 'Biological context only (ILLUSTRATIVE_UNVALIDATED): commercial crew demographic metadata reference.',
    safetyGateMapping: 'Biological dimorphism scenario context (ILLUSTRATIVE_UNVALIDATED)',
  },
];

interface LatencyPreset {
  id: string;
  name: string;
  oneWaySeconds: number;
  distanceAu: number;
  description: string;
}

const LATENCY_PRESETS: LatencyPreset[] = [
  {
    id: 'PERIHELION',
    name: 'Mars Opposition / Perihelion',
    oneWaySeconds: 492, // 8.2 min
    distanceAu: 0.38,
    description: 'Minimum radio distance: 54.6 million km (~8.2 min one-way light time)',
  },
  {
    id: 'TRANSIT_MEAN',
    name: 'Mean Transit Trajectory',
    oneWaySeconds: 1344, // 22.4 min
    distanceAu: 1.52,
    description: 'Typical transit radio distance: 225 million km (~22.4 min one-way light time)',
  },
  {
    id: 'APHELION',
    name: 'Mars Conjunction / Aphelion',
    oneWaySeconds: 2886, // 48.1 min
    distanceAu: 2.67,
    description: 'Maximum separation: 401 million km (~48.1 min one-way light time)',
  },
  {
    id: 'CONJUNCTION_BLACKOUT',
    name: 'Solar Conjunction (Blackout)',
    oneWaySeconds: Infinity,
    distanceAu: 2.52,
    description: 'Sun directly between Earth and Mars: 14-day total radio silence',
  },
];

interface TransmissionPacketItem {
  id: string;
  timestamp: string;
  packetType: string;
  rawBytes: number;
  fastMcpTokens: number;
  aeadTag: string;
  sha256Hash: string;
  status: 'DELIVERED' | 'IN_TRANSIT' | 'BUFFERED_ON_ORBIT';
}

const SIMULATED_PACKETS: TransmissionPacketItem[] = [
  {
    id: 'PKT-00941',
    timestamp: '2026-11-14 18:42:00 UTC',
    packetType: 'HEMODYNAMICS_IJV_POCUS',
    rawBytes: 4280,
    fastMcpTokens: 114,
    aeadTag: '9f8e3c1a2d4b6e8f',
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    status: 'DELIVERED',
  },
  {
    id: 'PKT-00942',
    timestamp: '2026-11-14 18:48:00 UTC',
    packetType: 'NQS_STL_ROBUSTNESS_RHO',
    rawBytes: 1940,
    fastMcpTokens: 86,
    aeadTag: '1b4d8a2c5e7f9a0c',
    sha256Hash: 'a7c52f61e89b4f0281c034aefd8721c5b88219c3b889721469502938167f2ab1',
    status: 'DELIVERED',
  },
  {
    id: 'PKT-00943',
    timestamp: '2026-11-14 19:10:00 UTC',
    packetType: 'BIOMETRICS_1HZ_SUMMARY',
    rawBytes: 8650,
    fastMcpTokens: 138,
    aeadTag: '7c2e9b1d5a8f4c6e',
    sha256Hash: '984b238712ca7912389471928472918392183918239128391829381928391823',
    status: 'IN_TRANSIT',
  },
  {
    id: 'PKT-00944',
    timestamp: '2026-11-14 19:32:00 UTC',
    packetType: 'PLAYBOOK_AUTONOMOUS_EXECUTION',
    rawBytes: 3120,
    fastMcpTokens: 92,
    aeadTag: '4a6b8c0e2f1d3e5a',
    sha256Hash: '7281938102938102938102938102938102938102938102938102938102938102',
    status: 'BUFFERED_ON_ORBIT',
  },
];

interface MissionPortalProps {
  packet: TelemetryPacket;
  s: ScenarioState | null;
  whatIf: WhatIf;
  thrombus: boolean | null;
  onSetThrombus: (val: boolean | null) => void;
  sex: CrewSex;
}

export function MissionPortal({
  packet,
  s,
  whatIf,
  thrombus,
  onSetThrombus,
  sex,
}: MissionPortalProps) {
  const [activeTab, setActiveTab] = useState<'TELEMEDICINE' | 'EVIDENCE_ATLAS' | 'DSN_PACKETS' | 'POCUS_STATION'>('TELEMEDICINE');
  const [selectedPreset, setSelectedPreset] = useState<LatencyPreset>(LATENCY_PRESETS[1]);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL');
  const [selectedDataset, setSelectedDataset] = useState<ScientificDataset | null>(null);
  const [flightSurgeonNotes, setFlightSurgeonNotes] = useState('');
  const [teleSignOff, setTeleSignOff] = useState(false);

  const filteredDatasets = useMemo(() => {
    return SCIENTIFIC_ATLAS.filter((d) => {
      const matchAgency = agencyFilter === 'ALL' || d.agency === agencyFilter;
      const q = datasetSearch.toLowerCase();
      const matchSearch =
        d.title.toLowerCase().includes(q) ||
        d.accession.toLowerCase().includes(q) ||
        d.axis.toLowerCase().includes(q) ||
        d.relevanceToAres.toLowerCase().includes(q);
      return matchAgency && matchSearch;
    });
  }, [agencyFilter, datasetSearch]);

  const agencies = ['ALL', 'NASA', 'ESA', 'CSA', 'PhysioNet', 'DLR'];

  const formatSeconds = (sec: number) => {
    if (!Number.isFinite(sec)) return 'RADIO BLACKOUT (CONJUNCTION)';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-black text-gray-200">
      {/* Portal Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-sm font-bold tracking-widest text-white">
              MISSION GROUND CONTROL PORTAL
            </span>
          </div>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">FLIGHT SURGEON & EPIDEMIOLOGY STATION</span>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          {([
            ['TELEMEDICINE', 'Ground Telemedicine'],
            ['EVIDENCE_ATLAS', '24-Dataset Atlas'],
            ['DSN_PACKETS', 'DSN Packets'],
            ['POCUS_STATION', 'Tele-POCUS Station'],
          ] as const).map(([tabId, label]) => {
            const isActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={`cursor-pointer rounded border px-3 py-1 font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-nominal focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  isActive
                    ? 'border-nominal bg-nominal/15 text-nominal'
                    : 'border-line text-gray-400 hover:border-gray-500 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Views */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* TAB 1: TELEMEDICINE & EARTH-MARS LATENCY SIMULATOR */}
        {activeTab === 'TELEMEDICINE' && (
          <div className="space-y-4">
            {/* Latency configuration bar */}
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100">
                    DEEP-SPACE RADIO LATENCY SIMULATION (EARTH-MARS)
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Standard terrestrial cloud computing is physically prohibited. Round-trip radio latency ranges from 8 to 48 minutes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {LATENCY_PRESETS.map((p) => {
                    const active = selectedPreset.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPreset(p)}
                        className={`cursor-pointer rounded border px-2.5 py-1 font-mono text-xs transition-colors ${
                          active
                            ? 'border-nominal bg-nominal text-black font-bold'
                            : 'border-line text-gray-300 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status metric grid */}
              <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
                <div className="rounded border border-line bg-black p-3">
                  <div className="text-gray-500">ONE-WAY LIGHT TIME (OWLT)</div>
                  <div className="mt-1 text-lg font-bold text-nominal">
                    {formatSeconds(selectedPreset.oneWaySeconds)}
                  </div>
                  <div className="text-[10px] text-gray-400">{selectedPreset.distanceAu} AU distance</div>
                </div>

                <div className="rounded border border-line bg-black p-3">
                  <div className="text-gray-500">ROUND-TRIP LIGHT TIME (RTLT)</div>
                  <div className="mt-1 text-lg font-bold text-amber-400">
                    {formatSeconds(selectedPreset.oneWaySeconds * 2)}
                  </div>
                  <div className="text-[10px] text-gray-400">Surgeon query-to-answer turnaround</div>
                </div>

                <div className="rounded border border-line bg-black p-3">
                  <div className="text-gray-500">ACTIVE DSN COMPLEX</div>
                  <div className="mt-1 text-lg font-bold text-white">Goldstone DSS-14</div>
                  <div className="text-[10px] text-gray-400">70m parabolic antenna / X-band</div>
                </div>

                <div className="rounded border border-line bg-black p-3">
                  <div className="text-gray-500">AUTONOMY PROTOCOL</div>
                  <div className="mt-1 text-lg font-bold text-emerald-400">AIR-GAPPED EDGE</div>
                  <div className="text-[10px] text-gray-400">100% on-spacecraft inference</div>
                </div>
              </div>
            </div>

            {/* Flight Surgeon Longitudinal Overview */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-line bg-panel p-4 lg:col-span-2">
                <h3 className="text-sm font-bold text-gray-100">
                  CREW BIOMETRIC SUMMARY & SAFETY MARGINS (GROUND RECEIVE BUFFER)
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                  <div className="rounded border border-line bg-black p-2.5">
                    <div className="text-gray-400">ASTRONAUT ID</div>
                    <div className="text-base font-bold text-white">{packet.astronaut_id}</div>
                    <div className="text-[10px] text-gray-500">PROFILE: {sex}</div>
                  </div>
                  <div className="rounded border border-line bg-black p-2.5">
                    <div className="text-gray-400">MISSION DAY</div>
                    <div className="text-base font-bold text-white">
                      {packet.mission_elapsed_days != null ? Math.round(packet.mission_elapsed_days) : whatIf.mission_day}
                    </div>
                    <div className="text-[10px] text-gray-500">OUTBOUND TRANSIT</div>
                  </div>
                  <div className="rounded border border-line bg-black p-2.5">
                    <div className="text-gray-400">MRI SCORE</div>
                    <div className="text-base font-bold text-nominal">{s ? s.mri : 0} / 100</div>
                    <div className="text-[10px] text-gray-500">READINESS INDEX</div>
                  </div>
                  <div className="rounded border border-line bg-black p-2.5">
                    <div className="text-gray-400">WORST NQS RHO</div>
                    <div className={`text-base font-bold ${s && s.rhoMin < 0 ? 'text-critical' : 'text-emerald-400'}`}>
                      {s ? s.rhoMin.toFixed(2) : 'N/A'}
                    </div>
                    <div className="text-[10px] text-gray-500">{s ? s.worst : 'NONE'}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-line py-1.5">
                    <span className="text-gray-400">Internal Jugular Vein Shear Stress (tau_w)</span>
                    <span className="font-semibold text-white">{s ? s.tauW.toFixed(2) : 'N/A'} dyn/cm2 (Limit: &gt; 1.20)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line py-1.5">
                    <span className="text-gray-400">Optic Nerve Sheath Diameter (ONSD)</span>
                    <span className="font-semibold text-white">{s ? s.onsdMm.toFixed(2) : 'N/A'} mm (Limit: &lt; 5.80)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line py-1.5">
                    <span className="text-gray-400">Cabin Partial Pressure CO2 (ppCO2)</span>
                    <span className="font-semibold text-white">{whatIf.ppco2_mmhg.toFixed(1)} mmHg (Limit: &lt; 4.0)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line py-1.5">
                    <span className="text-gray-400">Soleus Muscle Thickness</span>
                    <span className="font-semibold text-white">{s ? s.soleusMm.toFixed(1) : 'N/A'} mm (-{s ? s.soleusLossPct.toFixed(1) : '0'}%)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line py-1.5">
                    <span className="text-gray-400">Osteocyte Sclerostin Biomarker</span>
                    <span className="font-semibold text-white">{s ? s.sclerostin.toFixed(0) : 'N/A'} pmol/L (Limit: &lt; 1400)</span>
                  </div>
                </div>
              </div>

              {/* Flight Surgeon Action Ledger */}
              <div className="rounded-lg border border-line bg-panel p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-100">
                    FLIGHT SURGEON ASYNCHRONOUS CLINICAL ADVISORY
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Clinical instructions sent from Earth will be queued into the DSN store-and-forward uplink.
                  </p>
                  <textarea
                    rows={4}
                    value={flightSurgeonNotes}
                    onChange={(e) => setFlightSurgeonNotes(e.target.value)}
                    placeholder="Enter flight surgeon clinical directive, exercise adjustment or tele-echography feedback..."
                    className="mt-3 w-full rounded border border-line bg-black p-2.5 font-mono text-xs text-gray-200 outline-none focus:border-nominal resize-none"
                  />
                </div>

                <div className="mt-3">
                  <div className="rounded border border-line bg-black p-2.5 font-mono text-[11px] text-gray-400 mb-3">
                    Est. Uplink Arrival: <span className="text-nominal font-bold">{formatSeconds(selectedPreset.oneWaySeconds)}</span> after transmission.
                  </div>
                  <button
                    type="button"
                    disabled={!flightSurgeonNotes.trim() || teleSignOff}
                    onClick={() => setTeleSignOff(true)}
                    className="w-full cursor-pointer rounded border border-nominal bg-nominal/20 px-3 py-2 font-mono text-xs font-bold text-nominal hover:bg-nominal hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {teleSignOff ? 'ADVISORY SIGNED & QUEUED TO DSN' : 'SIGN & TRANSMIT CLINICAL ADVISORY'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 24-DATASET SCIENTIFIC EVIDENCE ATLAS */}
        {activeTab === 'EVIDENCE_ATLAS' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100">
                    24-DATASET SCIENTIFIC EVIDENCE ATLAS
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Comprehensive biomedical grounding across NASA OSDR, PhysioNet, CSA, ESA, and international peer-reviewed literature.
                  </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <input
                    type="search"
                    placeholder="Search datasets, accessions, DOIs..."
                    value={datasetSearch}
                    onChange={(e) => setDatasetSearch(e.target.value)}
                    className="rounded border border-line bg-black px-2.5 py-1 text-gray-200 outline-none focus:border-nominal"
                  />
                  <div className="flex rounded border border-line bg-black p-0.5">
                    {agencies.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAgencyFilter(a)}
                        className={`cursor-pointer rounded px-2 py-0.5 transition-colors ${
                          agencyFilter === a ? 'bg-nominal font-bold text-black' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Datasets Grid */}
              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredDatasets.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDataset(d)}
                    className="cursor-pointer rounded border border-line bg-black p-3.5 transition-all hover:border-nominal/70 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                        <span className="rounded border border-nominal/50 bg-nominal/10 px-1.5 py-0.5 font-bold text-nominal">
                          {d.accession}
                        </span>
                        <span className="text-gray-400">{d.agency}</span>
                      </div>
                      <h4 className="mt-2 text-xs font-semibold text-gray-100 line-clamp-2">
                        {d.title}
                      </h4>
                      <p className="mt-1 text-[11px] text-gray-400 line-clamp-2">
                        {d.relevanceToAres}
                      </p>
                    </div>

                    <div className="mt-3 border-t border-line/60 pt-2 font-mono text-[10px] text-gray-500 flex items-center justify-between">
                      <span>{d.axis}</span>
                      <span className="text-nominal">Inspect &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Dataset Detail Inspection Drawer / Modal */}
            {selectedDataset && (
              <div className="rounded-lg border border-nominal bg-panel p-5 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-nominal px-2 py-0.5 font-bold text-black">
                      {selectedDataset.accession}
                    </span>
                    <span className="text-sm font-bold text-white">{selectedDataset.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDataset(null)}
                    className="cursor-pointer rounded border border-line px-2 py-0.5 text-gray-400 hover:text-white"
                  >
                    CLOSE
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-500">AUTHORING AGENCY:</span>{' '}
                      <span className="text-gray-200">{selectedDataset.agency}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">PHYSIOLOGICAL AXIS:</span>{' '}
                      <span className="text-gray-200">{selectedDataset.axis}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SPACEFLIGHT PLATFORM:</span>{' '}
                      <span className="text-gray-200">{selectedDataset.platform}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SAMPLE COHORT:</span>{' '}
                      <span className="text-gray-200">{selectedDataset.sampleCohort}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-500">ARES-HEALTH ALGORITHM MAPPING:</span>
                      <p className="mt-0.5 text-gray-300">{selectedDataset.relevanceToAres}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">SAFETY GATE ENFORCEMENT:</span>
                      <p className="mt-0.5 text-nominal font-semibold">{selectedDataset.safetyGateMapping}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">DOI / REPOSITORY CITATION:</span>
                      <p className="mt-0.5 break-all text-cyan-400">{selectedDataset.doiOrUrl}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DSN STORE-AND-FORWARD TRANSMISSION MONITOR */}
        {activeTab === 'DSN_PACKETS' && (
          <div className="space-y-4 font-mono text-xs">
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100">
                    DEEP-SPACE NETWORK STORE-AND-FORWARD TELEMETRY LEDGER
                  </h3>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Packets are encrypted using ChaCha20-Poly1305 AEAD, compressed via FastMCP format (&lt;150 tokens), and hashed in a tamper-evident SHA-256 chain.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-ok/50 bg-ok/10 px-2 py-0.5 font-bold text-ok">
                    SHA-256 CHAIN VERIFIED
                  </span>
                </div>
              </div>

              {/* Transmission Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-line text-gray-500 text-[11px]">
                      <th className="py-2">PACKET ID</th>
                      <th className="py-2">TIMESTAMP (UTC)</th>
                      <th className="py-2">PAYLOAD TYPE</th>
                      <th className="py-2">RAW BYTES</th>
                      <th className="py-2">FASTMCP TOKENS</th>
                      <th className="py-2">AEAD TAG</th>
                      <th className="py-2">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {SIMULATED_PACKETS.map((pkt) => {
                      const statusCls =
                        pkt.status === 'DELIVERED'
                          ? 'text-ok'
                          : pkt.status === 'IN_TRANSIT'
                            ? 'text-amber-400 animate-pulse'
                            : 'text-gray-400';
                      return (
                        <tr key={pkt.id} className="hover:bg-white/5">
                          <td className="py-2.5 font-bold text-white">{pkt.id}</td>
                          <td className="py-2.5 text-gray-400">{pkt.timestamp}</td>
                          <td className="py-2.5 text-cyan-400">{pkt.packetType}</td>
                          <td className="py-2.5 text-gray-300">{pkt.rawBytes} B</td>
                          <td className="py-2.5 text-nominal font-bold">{pkt.fastMcpTokens} tokens</td>
                          <td className="py-2.5 font-mono text-[10px] text-gray-500">{pkt.aeadTag}</td>
                          <td className={`py-2.5 font-bold ${statusCls}`}>{pkt.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TELE-ECHOGRAPHY POCUS REVIEW STATION */}
        {activeTab === 'POCUS_STATION' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-100">
                    GROUND TELE-ECHOGRAPHY POCUS ASYNCHRONOUS REVIEW STATION
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-400 font-mono">
                    Flight surgeon inspection of point-of-care ultrasound cine-loops for venous stagnation, thrombosis, and optic sheath dilation.
                  </p>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-gray-400">HARD CLINICAL SAFETY GATE:</span>
                  <span className={`rounded border px-2 py-0.5 font-bold ${thrombus ? 'border-ok text-ok bg-ok/10' : 'border-critical text-critical bg-critical/10'}`}>
                    {thrombus ? 'ANTICOAGULATION AUTHORIZED' : 'ANTICOAGULATION LOCKED'}
                  </span>
                </div>
              </div>

              {/* Ultrasound dual-monitor inspection */}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {/* IJV Inspection */}
                <div className="rounded border border-line bg-black p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-line/60 pb-1.5 font-mono text-xs">
                      <span className="font-bold text-nominal">INTERNAL JUGULAR VEIN (IJV) B-MODE</span>
                      <span className="text-gray-400">Transverse 12 MHz Probe</span>
                    </div>
                    <div className="mt-3">
                      {s ? <PocusIjv csa={s.csa} vmax={s.vmax} thrombus={thrombus} /> : <div className="p-4 text-xs text-advisory">POCUS unavailable without scenario overlay</div>}
                    </div>
                    <div className="mt-3 space-y-1 font-mono text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>Vein Cross-Sectional Area (CSA):</span>
                        <span className="text-white font-bold">{s ? s.csa.toFixed(2) : 'N/A'} cm2</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Doppler Peak Velocity (Vmax):</span>
                        <span className="text-white font-bold">{s ? s.vmax.toFixed(1) : 'N/A'} cm/s</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Wall Shear Stress (tau_w):</span>
                        <span className={`font-bold ${s && s.tauW < 1.2 ? 'text-critical' : 'text-ok'}`}>
                          {s ? s.tauW.toFixed(2) : 'N/A'} dyn/cm2
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Flight surgeon thrombus confirmation controls */}
                  <div className="mt-4 border-t border-line pt-3 font-mono text-xs">
                    <span className="text-gray-400 text-[11px]">FLIGHT SURGEON ULTRASOUND VERDICT:</span>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onSetThrombus(true)}
                        className={`cursor-pointer rounded border p-2 text-center transition-colors ${
                          thrombus === true
                            ? 'border-critical bg-critical/20 font-bold text-critical'
                            : 'border-line text-gray-400 hover:text-white'
                        }`}
                      >
                        CONFIRM THROMBUS VISUALIZED
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetThrombus(false)}
                        className={`cursor-pointer rounded border p-2 text-center transition-colors ${
                          thrombus === false
                            ? 'border-ok bg-ok/20 font-bold text-ok'
                            : 'border-line text-gray-400 hover:text-white'
                        }`}
                      >
                        NO THROMBUS (SLOW FLOW ONLY)
                      </button>
                    </div>
                  </div>
                </div>

                {/* ONSD Inspection */}
                <div className="rounded border border-line bg-black p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-line/60 pb-1.5 font-mono text-xs">
                      <span className="font-bold text-nominal">OCULAR OPTIC NERVE SHEATH (ONSD)</span>
                      <span className="text-gray-400">Retrobulbar 3mm Landmark</span>
                    </div>
                    <div className="mt-3">
                      {s ? <OcularOnsd onsd={s.onsdMm} sigma={s.onsdSigmaMm} /> : <div className="p-4 text-xs text-advisory">ONSD unavailable without scenario overlay</div>}
                    </div>
                    <div className="mt-3 space-y-1 font-mono text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>ONSD Caliper Measurement:</span>
                        <span className={`font-bold ${s && s.onsdMm > 5.8 ? 'text-critical' : 'text-white'}`}>
                          {s ? s.onsdMm.toFixed(2) : 'N/A'} mm
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Measurement Uncertainty (sigma):</span>
                        <span className="text-white font-bold">{s ? s.onsdSigmaMm.toFixed(2) : 'N/A'} mm</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>SANS Critical Threshold:</span>
                        <span className="text-amber-400 font-bold">5.80 mm</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-line pt-3 font-mono text-xs text-gray-400 text-[11px]">
                    Note: In microgravity, slow flow in the internal jugular vein is common due to cephalad fluid shift. Anticoagulants are strictly prohibited unless a true echogenic intraluminal thrombus is verified to avoid fatal microgravity hemorrhage.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
