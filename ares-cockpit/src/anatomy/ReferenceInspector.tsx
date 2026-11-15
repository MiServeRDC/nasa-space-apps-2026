import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnatomyModelSession, type GeometryIssue } from './modelSession';
import type { SemanticBatch, SemanticHit } from './semanticGeometry';
import type { AnatomicalStructure, AnatomyAnnotation } from './contracts';
import { NOTE_KEY, readReferenceNotes, registerReferenceCatalog, type ReferenceCatalog } from './referenceCatalog';
import {
  resolveMissingStructureMeta,
  selectActiveMissingOverlays,
} from './missingOverlays';
import { useTelemetry } from '../lib/useTelemetry';
import { DEFAULT_WHATIF } from '../lib/scenario';
import { buildClinicalViewModel, type ClinicalMetric } from '../lib/clinicalViewModel';
import { ClinicalDataNotice } from '../workbench/ClinicalDataNotice';
import { WebGlErrorBoundary } from '../modules/body-3d-heatmap/webglErrorBoundary';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const Canvas = lazy(() => import('./FixtureCanvas'));

type TreeTab = 'all' | 'mapped' | 'missing';

const SYSTEM_CHIP_LABELS: Readonly<Record<string, string>> = {
  skeletal: 'Skeletal',
  muscular: 'Muscular',
  cardiovascular: 'Vascular',
  nervous: 'Nervous',
  visceral: 'Visceral',
  'pelvis-v15': 'Pelvis v1.5',
};

const compactButton =
  'ares-interactive inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l2)] px-2.5 py-1 text-left font-sans text-xs text-[var(--color-ink-display)] disabled:opacity-40';

export default function ReferenceInspector() {
  const [referenceModel, setReferenceModel] = useState('existing');
  const [catalog, setCatalog] = useState<ReferenceCatalog | null>(null);
  const [systemId, setSystemId] = useState('cardiovascular');
  const [treeTab, setTreeTab] = useState<TreeTab>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<readonly SemanticBatch[]>([]);
  const [issues, setIssues] = useState<readonly GeometryIssue[]>([]);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const [loadedSystem, setLoadedSystem] = useState<string | null>(null);
  const [notice, setNotice] = useState('Loading reference catalog');
  const [ready, setReady] = useState(false);
  const [spatialNotice, setSpatialNotice] = useState<string | null>(null);
  const [stats, setStats] = useState({ geometries: 0, materials: 0, decodedGeometryBytes: 0 });
  const [gpu, setGpu] = useState(0);
  const [anchor, setAnchor] = useState<SemanticHit | null>(null);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<AnatomyAnnotation[]>([]);
  const [noteStatus, setNoteStatus] = useState('');
  const [showMissingOverlays, setShowMissingOverlays] = useState(true);
  const [provenanceOpen, setProvenanceOpen] = useState(false);

  const owner = useRef<AnatomyModelSession | null>(null);
  const limitationsRef = useRef<HTMLElement | null>(null);

  const { packet, status } = useTelemetry(DEFAULT_WHATIF, null, 0, false);
  const clinical = useMemo(() => buildClinicalViewModel(packet), [packet]);
  const registry = useMemo(() => (catalog ? registerReferenceCatalog(catalog) : null), [catalog]);
  const system = catalog?.systems.find((s) => s.id === systemId);

  const systemStructures = useMemo(
    () => catalog?.model.structures.filter((s) => s.meshes.some((r) => r.assetId === systemId)) ?? [],
    [catalog, systemId],
  );

  const mappedStructures = useMemo(
    () =>
      systemStructures.filter(
        (s) => s.coverage !== 'MISSING' && !s.unavailableReason && (ready ? loaded.has(s.id) : true),
      ),
    [systemStructures, ready, loaded],
  );

  const missingStructures = useMemo<AnatomicalStructure[]>(() => {
    if (!catalog) return [];
    const modelMissing = catalog.model.structures.filter((s) => s.coverage === 'MISSING');
    if (catalog.model.referenceSex === 'FEMALE') return modelMissing;

    // Male Z-Anatomy: expose empty required targets (optic_sheath) and excluded female supplements explicitly.
    const emptyTargets: AnatomicalStructure[] = catalog.systems.flatMap((sys) =>
      sys.targets
        .filter((t) => t.nodeIds.length === 0)
        .map((t) => ({
          id: `male-missing:${t.id}`,
          label: `${t.label[0]?.toUpperCase() ?? ''}${t.label.slice(1)} (${sys.label})`,
          sourceConceptId: `ARES_REQUIRED:${t.id}`,
          laterality: 'UNSPECIFIED' as const,
          ontology: null,
          coverage: 'MISSING' as const,
          meshes: [],
          clinicalBindings: [],
          unavailableReason: `Required target "${t.label}" has zero exact source nodes in ${sys.label}`,
        })),
    );
    const excludedInSystem = systemStructures.filter((s) => s.unavailableReason !== null);
    return [...modelMissing, ...emptyTargets, ...excludedInSystem];
  }, [catalog, systemStructures]);

  const structure = useMemo(() => {
    if (!selected) return null;
    return (
      catalog?.model.structures.find((s) => s.id === selected) ??
      missingStructures.find((s) => s.id === selected) ??
      null
    );
  }, [catalog, missingStructures, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (treeTab === 'missing') {
      return missingStructures.filter((s) => {
        if (!q) return true;
        return resolveMissingStructureMeta(s).searchText.includes(q);
      });
    }
    const base = treeTab === 'mapped' ? mappedStructures : systemStructures;
    if (!q) return base;
    return base.filter((s) => `${s.label} ${s.id}`.toLowerCase().includes(q));
  }, [treeTab, missingStructures, mappedStructures, systemStructures, query]);

  const activeMissingOverlays = useMemo(
    () =>
      selectActiveMissingOverlays({
        model: catalog?.model,
        systemId,
        selectedId: selected,
        showMissingOverlays,
        isolateMissingMode: treeTab === 'missing',
      }),
    [catalog?.model, systemId, selected, showMissingOverlays, treeTab],
  );

  const noteKey = catalog ? `${NOTE_KEY}:${catalog.model.revisionSha256}` : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      referenceModel === 'existing' ? '/anatomy/reference-catalog.json' : '/anatomy/female-hra/catalog.json',
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw Error('Catalog unavailable');
        return r.json();
      })
      .then((data: ReferenceCatalog) => {
        if (controller.signal.aborted) return;
        registerReferenceCatalog(data);
        setCatalog(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNotice(String(e));
      });
    return () => controller.abort();
  }, [referenceModel]);

  useEffect(() => {
    if (!registry || !catalog || !noteKey) return;
    try {
      setNotes(readReferenceNotes(localStorage.getItem(noteKey), registry, catalog.model.id));
      setNoteStatus('Notes stay in this browser, bound to this exact reference revision.');
    } catch (e) {
      setNotes([]);
      setNoteStatus(`Stored notes unavailable: ${String(e)}`);
    }
  }, [registry, catalog, noteKey]);

  useEffect(() => {
    const session = new AnatomyModelSession();
    owner.current = session;
    let cancelled = false;
    setBatches([]);
    setStats(session.stats);
    setReady(false);
    setLoadedSystem(null);
    setIssues([]);
    setLoaded(new Set());
    setSelected(null);
    setAnchor(null);
    setQuery('');
    setPage(0);

    if (!system?.chunk) {
      setVisible(new Set());
      setNotice(
        catalog
          ? system
            ? 'Source geometry unavailable for this system; no substitute loaded.'
            : 'No reference loaded'
          : 'Loading reference catalog',
      );
      return () => {
        session.close();
        if (owner.current === session) owner.current = null;
      };
    }

    const ids = new Set(system.chunk.sourceNodes?.map((n) => n.structureId));
    const initial = new Set(system.defaultIds);
    setVisible(initial);
    setNotice('Loading local reference geometry');

    void session
      .load([system.chunk], ids, initial)
      .then(() => {
        if (cancelled) return;
        const allIssues = [
          ...session.issues,
          ...(catalog?.sourceIssues
            ?.filter((i) => i.layer === system.id)
            .map((i) => ({
              structureId: i.structureId,
              nodeId: `source-node:${i.sourceNodeIndex}`,
              reason: `${i.label}: ${i.reason}`,
            })) ?? []),
        ];
        setBatches([...session.batches]);
        setStats(session.stats);
        setIssues(allIssues);
        setLoaded(session.loadedIds);
        setLoadedSystem(system.id);
        setReady(true);
        setNotice(
          `Reference ready: ${session.loadedIds.size} source nodes with usable geometry; ${new Set(allIssues.map((i) => i.structureId)).size} nodes have excluded or invalid parts.`,
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setNotice(`Reference unavailable: ${String(e)}`);
          setStats(session.stats);
        }
      });

    return () => {
      cancelled = true;
      session.close();
      if (owner.current === session) owner.current = null;
    };
  }, [system, catalog]);

  const switchModel = (nextModel: string) => {
    setReady(false);
    setBatches([]);
    setCatalog(null);
    setSelected(null);
    setAnchor(null);
    setNotes([]);
    setText('');
    setTreeTab('all');
    setProvenanceOpen(false);
    setSystemId('cardiovascular');
    setReferenceModel(nextModel);
  };

  const switchSystem = (nextSystemId: string) => {
    setReady(false);
    setBatches([]);
    setSelected(null);
    setAnchor(null);
    setSystemId(nextSystemId);
  };

  const show = (ids: ReadonlySet<string>) => {
    if (!ready || !owner.current) return false;
    try {
      owner.current.setVisible(ids);
      setVisible(new Set(ids));
      setBatches([...owner.current.batches]);
      setStats(owner.current.stats);
      setNotice('Reference visibility updated');
      setAnchor(null);
      return true;
    } catch (e) {
      setNotice(`${String(e)}. Previous view retained; isolate a smaller selection.`);
      return false;
    }
  };

  const select = (id: string, hit: SemanticHit | null = null) => {
    setSelected(id);
    setAnchor(hit);
    setText('');
  };

  const openMissingProvenance = () => {
    setProvenanceOpen(true);
    limitationsRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  };

  const focusMissingCoverage = () => {
    setTreeTab('missing');
    setPage(0);
    setShowMissingOverlays(true);
    setProvenanceOpen(true);
  };

  const save = () => {
    if (!catalog || !registry || !noteKey || !structure || !anchor?.assetSha256 || !anchor.nodeId || !text.trim()) {
      return;
    }
    if (notes.length >= 500) {
      setNoteStatus('Note limit reached (500); delete an existing note first.');
      return;
    }
    const note: AnatomyAnnotation = {
      id: crypto.randomUUID(),
      modelId: catalog.model.id,
      modelRevision: catalog.model.revisionSha256,
      structureId: structure.id,
      text: text.trim(),
      anchor: {
        assetSha256: anchor.assetSha256,
        nodeId: anchor.nodeId,
        positionM: anchor.point.toArray() as [number, number, number],
      },
    };
    if (registry.annotationsForModel([note], catalog.model.id).length !== 1) {
      setNoteStatus('Anchor rejected: reference identity mismatch.');
      return;
    }
    const next = [...notes, note];
    try {
      localStorage.setItem(noteKey, JSON.stringify(next));
      setNotes(next);
      setText('');
      setNoteStatus('Reference note saved locally.');
    } catch (e) {
      setNoteStatus(`Note not saved: ${String(e)}`);
    }
  };

  const removeNote = (id: string) => {
    if (!noteKey) return;
    const next = notes.filter((n) => n.id !== id);
    try {
      localStorage.setItem(noteKey, JSON.stringify(next));
      setNotes(next);
      setNoteStatus('Reference note deleted.');
    } catch (e) {
      setNoteStatus(`Deletion not saved: ${String(e)}`);
    }
  };

  const clinicalKeys = [
    ...new Set([
      ...(structure?.clinicalBindings.flatMap((b) => b.channels) ?? []),
      ...(system?.targets.filter((t) => t.nodeIds.includes(selected ?? '')).flatMap((t) => t.channels) ?? []),
    ]),
  ];
  const region = structure?.clinicalBindings[0]?.backendRegion;
  const selectedIssues = issues.filter((i) => i.structureId === selected);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 40));
  const safePage = Math.min(page, totalPages - 1);
  const pagedItems = treeTab === 'missing' ? filtered : filtered.slice(safePage * 40, (safePage + 1) * 40);

  return (
    <TooltipProvider delayDuration={180}>
      <main
        className="min-h-screen bg-[var(--color-oled)] p-2.5 text-[var(--color-ink-display)] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden lg:p-2"
        aria-label="Reference anatomy atlas"
      >
        {/* Compact Flight-Deck Studio Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-1.5 lg:flex-nowrap">
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <a
              href="/"
              className="ares-interactive inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-2.5 font-mono text-[11px] text-[var(--color-accent-spatial)]"
            >
              Return to cockpit
            </a>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-accent-spatial)] xl:inline">
              ARES // ANATOMY
            </span>
            <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--color-ink-display)]">
              Explore the anatomy reference
            </h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-5 shrink-0 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-l2)] px-1.5 font-mono text-[9.5px] text-[var(--color-ink-meta)]"
                >
                  Scope
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                {referenceModel === 'existing'
                  ? 'Existing generic male atlas with mixed source contributions.'
                  : 'Female HRA partial reference; source releases kept in separate frames. Mandatory structures remain missing.'}{' '}
                Anatomy and registration remain unreviewed. This reference does not represent the monitored person or change their physiological profile.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-1.5 lg:w-auto lg:flex-nowrap">
            <label className="inline-flex w-full min-w-0 max-w-full flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-[var(--color-ink-meta)] sm:w-auto sm:flex-nowrap">
              <span className="shrink-0">Reference model</span>
              <select
                aria-label="Reference model"
                value={referenceModel}
                onChange={(e) => switchModel(e.target.value)}
                className="h-8 w-full max-w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-2 font-sans text-xs text-[var(--color-ink-display)] sm:w-auto lg:max-w-[190px] xl:max-w-[230px]"
              >
                <option value="existing">Existing generic male reference</option>
                <option value="female-hra">HRA female — partial, unreviewed reference</option>
              </select>
            </label>

            <label className="inline-flex w-full min-w-0 max-w-full flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-[var(--color-ink-meta)] sm:w-auto sm:flex-nowrap">
              <span className="shrink-0">Anatomical system</span>
              <select
                aria-label="Anatomical system"
                value={systemId}
                onChange={(e) => switchSystem(e.target.value)}
                className="h-8 w-full max-w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] px-2 font-sans text-xs text-[var(--color-ink-display)] sm:w-auto lg:max-w-[170px] xl:max-w-[210px]"
              >
                {catalog?.systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
                <option value="none">No reference (unload)</option>
              </select>
            </label>

            <Badge variant={ready ? 'nominal' : system?.chunk ? 'caution' : 'outline'}>
              {ready ? 'READY' : system?.chunk ? 'SYNCING' : 'UNLOADED'}
            </Badge>
          </div>
        </header>

        {/* Single-Line Provenance & Status Bar */}
        <div className="mt-1 flex shrink-0 flex-wrap items-center justify-between gap-2 pb-0.5">
          <p
            role="status"
            data-reference-status
            data-reference-model={catalog?.model.id ?? 'none'}
            data-ready={ready}
            data-loaded-system={ready ? loadedSystem : 'none'}
            className="min-w-0 flex-1 font-mono text-[10.5px] leading-tight text-[var(--color-status-caution)] lg:truncate"
          >
            {notice}
          </p>

          {catalog?.model.referenceSex === 'FEMALE' ? (
            <button
              type="button"
              onClick={focusMissingCoverage}
              className="ares-missing-hatch ares-interactive inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-micro)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-status-caution)]"
            >
              <span>{missingStructures.length} NATIVE GAPS · 0 MALE SUBSTITUTION</span>
            </button>
          ) : null}
        </div>

        {/* 3-Column Split-Viewport Studio Grid (lg >= 1024px) */}
        <div className="mt-1 grid min-h-0 flex-1 gap-2.5 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[280px_minmax(0,1fr)_310px] lg:overflow-hidden">
          {/* LEFT PANE: Bounded Scrollable Structure Tree + Tabs + Quick System Chips */}
          <section
            aria-label="Source structure search"
            className="flex min-h-0 min-w-0 flex-col gap-2 rounded-[var(--radius-shell)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-2.5 lg:h-full lg:overflow-hidden"
          >
            {/* Quick System Filter Chips */}
            <div className="flex shrink-0 flex-wrap gap-1" role="group" aria-label="System filter chips">
              {catalog?.systems.map((sys) => {
                const isSelectedSystem = systemId === sys.id;
                const chipLabel = SYSTEM_CHIP_LABELS[sys.id] ?? sys.label;
                return (
                  <button
                    key={sys.id}
                    type="button"
                    aria-pressed={isSelectedSystem}
                    onClick={() => switchSystem(sys.id)}
                    className={`ares-interactive rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                      isSelectedSystem
                        ? 'border-[oklch(0.72_0.16_235/0.60)] bg-[oklch(0.72_0.16_235/0.16)] text-[var(--color-accent-spatial)]'
                        : !sys.chunk
                          ? 'ares-missing-hatch text-[var(--color-status-caution)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-l3)] text-[var(--color-ink-meta)] hover:text-[var(--color-ink-display)]'
                    }`}
                  >
                    {chipLabel}
                  </button>
                );
              })}
            </div>

            {/* shadcn Tabs: All / Mapped / Missing Coverage */}
            <Tabs
              value={treeTab}
              onValueChange={(v) => {
                setTreeTab(v as TreeTab);
                setPage(0);
              }}
              className="shrink-0"
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-between gap-0.5 lg:flex-nowrap">
                <TabsTrigger value="all" className="flex-1 px-1.5 py-1 text-[10px]">
                  All ({systemStructures.length})
                </TabsTrigger>
                <TabsTrigger value="mapped" className="flex-1 px-1.5 py-1 text-[10px]">
                  Mapped ({mappedStructures.length})
                </TabsTrigger>
                <TabsTrigger value="missing" className="px-2 py-1 text-[10px]">
                  Missing Coverage ({missingStructures.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <label className="block shrink-0 font-mono text-[10.5px] text-[var(--color-ink-meta)]">
              Search exact source labels
              <input
                type="search"
                aria-label="Search source structures"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={treeTab === 'missing' ? 'Filter internal_jugular, vagus, optic_sheath...' : 'Filter nodes or IDs...'}
                className="mt-1 h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l3)] px-2 font-sans text-xs text-[var(--color-ink-display)] placeholder:text-[var(--color-ink-muted)]"
              />
            </label>

            <p className="shrink-0 font-mono text-[10px] text-[var(--color-ink-meta)]">
              {treeTab === 'missing'
                ? `${filtered.length} unresolved gaps (0 male substitution).`
                : `${filtered.length} source nodes. Select to inspect; isolate to reveal covered geometry.`}
            </p>

            {/* Bounded Scrollable Structure List */}
            <div className="max-h-[340px] min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-none">
              {pagedItems.map((s) => {
                const isMissing = s.coverage === 'MISSING';
                const missingMeta = isMissing ? resolveMissingStructureMeta(s) : null;
                const isSelected = selected === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ares-interactive w-full break-words rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left text-xs ${
                      isMissing
                        ? isSelected
                          ? 'ares-missing-hatch border-[var(--color-status-caution)] text-[var(--color-ink-display)]'
                          : 'ares-missing-hatch text-[var(--color-ink-body)]'
                        : isSelected
                          ? 'border-[oklch(0.72_0.16_235/0.60)] bg-[oklch(0.72_0.16_235/0.16)] text-[var(--color-ink-display)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-l2)] text-[var(--color-ink-body)]'
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => select(s.id)}
                    data-structure-id={s.id}
                    data-geometry-loaded={loaded.has(s.id)}
                    data-missing-coverage={isMissing ? 'true' : undefined}
                    data-canonical-target={missingMeta?.canonicalKey}
                    data-male-substitution={isMissing ? 'false' : undefined}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="min-w-0 font-medium leading-snug text-[var(--color-ink-display)]">
                        {s.label}
                      </span>
                      {isMissing ? (
                        <Badge variant="missing" className="shrink-0 text-[9px]">
                          MISSING
                        </Badge>
                      ) : null}
                    </div>
                    <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-ink-meta)]">
                      {isMissing
                        ? `${missingMeta?.canonicalKey ?? s.id} · ${missingMeta?.regionLabel ?? 'Unresolved'} · 0 male sub`
                        : `${ready ? (loaded.has(s.id) ? (visible.has(s.id) ? 'Visible' : 'Hidden') : 'Geometry unavailable') : 'Not loaded'}${issues.some((i) => i.structureId === s.id) ? ' / source issue' : ''}`}
                    </span>
                  </button>
                );
              })}

              {pagedItems.length === 0 ? (
                <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l3)] p-3 font-mono text-[11px] text-[var(--color-ink-meta)]">
                  No structures match the active filter.
                </p>
              ) : null}
            </div>

            {treeTab !== 'missing' ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 font-mono text-[11px]">
                <button
                  type="button"
                  className={compactButton}
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <span className="ares-tabular-metric text-[var(--color-ink-meta)]">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className={compactButton}
                  disabled={(safePage + 1) * 40 >= filtered.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>

          {/* CENTER PANE: Sticky 3D Reference Viewport */}
          <section
            className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-shell)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-2 lg:h-full lg:overflow-hidden"
            aria-label="Reference geometry"
          >
            <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className={compactButton}
                  disabled={!ready}
                  onClick={() =>
                    show(
                      new Set(
                        system?.chunk?.sourceNodes?.filter((n) => !n.excluded).map((n) => n.structureId),
                      ),
                    )
                  }
                >
                  Show all
                </button>
                <button
                  type="button"
                  className={compactButton}
                  disabled={!ready}
                  onClick={() => show(new Set(system?.defaultIds))}
                >
                  Default view
                </button>
                <button
                  type="button"
                  className={compactButton}
                  disabled={!ready}
                  onClick={() => show(new Set())}
                >
                  Hide all
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {catalog?.model.referenceSex === 'FEMALE' ? (
                  <button
                    type="button"
                    aria-pressed={showMissingOverlays}
                    onClick={() => setShowMissingOverlays((v) => !v)}
                    className={`ares-interactive rounded-[var(--radius-md)] border px-2 py-1 font-mono text-[10px] ${
                      showMissingOverlays
                        ? 'border-[oklch(0.78_0.16_75/0.55)] bg-[oklch(0.78_0.16_75/0.14)] text-[var(--color-status-caution)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-l2)] text-[var(--color-ink-meta)]'
                    }`}
                  >
                    Missing Halos: {showMissingOverlays ? 'On' : 'Off'}
                  </button>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l2)] px-2 py-1 font-mono text-[10px] text-[var(--color-ink-meta)]"
                    >
                      Controls
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Drag to rotate; scroll or pinch to zoom; tap a visible surface to select an exact source node. Keyboard: focus the viewport, use arrows to pan (Control + arrows to rotate), then Enter to pick a real surface under the center cross. Coordinates use the glTF reference frame, not patient measurements.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {systemId === 'muscular' && referenceModel === 'existing' ? (
              <p className="mb-1 shrink-0 font-mono text-[10.5px] text-[var(--color-status-caution)]">
                The default view shows the soleus pair to stay within the geometry budget. Search and isolate other muscles individually.
              </p>
            ) : null}
            {spatialNotice ? (
              <p role="status" className="mb-1 shrink-0 font-mono text-[11px] text-[var(--color-status-caution)]">
                {spatialNotice}
              </p>
            ) : null}

            {/* Primary 3D Canvas Container */}
            <div className="relative min-h-0 flex-1">
              <WebGlErrorBoundary fallback={() => <p className="p-3 text-xs text-[var(--color-ink-body)]">3D unavailable; source search remains available.</p>}>
                <Suspense fallback={<p className="p-3 font-mono text-xs text-[var(--color-ink-meta)]">Loading optional 3D</p>}>
                  <Canvas
                    batches={batches}
                    missingOverlays={activeMissingOverlays}
                    autoFrame
                    keyboardPicking
                    label="Existing anatomy reference"
                    selectedId={selected}
                    onSelect={(id, _point, hit) => select(id, hit)}
                    onSelectMissingOverlay={(id) => {
                      setTreeTab('missing');
                      select(id, null);
                    }}
                    onOpenMissingProvenance={openMissingProvenance}
                    onUnavailable={setSpatialNotice}
                    onMemory={setGpu}
                  />
                </Suspense>
              </WebGlErrorBoundary>
            </div>

            {/* Compact Frame, Target Quick-Focus & Owned-Geometry Footer */}
            <div className="mt-1.5 shrink-0 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p
                  className="min-w-0 max-w-full break-words font-mono text-[10.5px] text-[var(--color-status-caution)] lg:truncate"
                  title={system?.coordinateFrame ?? 'glTF reference frame (uncalibrated)'}
                  data-reference-frame
                >
                  {system?.coordinateFrame ?? 'glTF reference frame (uncalibrated)'}
                </p>
                <output
                  className="ares-tabular-metric min-w-0 max-w-full break-words text-[10.5px] text-[var(--color-ink-meta)]"
                  data-owned-bytes={stats.decodedGeometryBytes}
                  data-owned-geometries={stats.geometries}
                  data-gpu-geometries={gpu}
                >
                  Owned geometry: {(stats.decodedGeometryBytes / 1e6).toFixed(2)} MB / 64 MB; {stats.geometries} geometry objects; {stats.materials} materials; GPU geometry objects: {gpu}.
                </output>
              </div>

              <div
                className="flex max-h-[56px] flex-wrap gap-1 overflow-y-auto"
                aria-label="Required structure groups"
              >
                {system?.targets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${compactButton} !px-2 !py-0.5 !text-[10.5px] font-mono`}
                    disabled={!ready || !t.nodeIds.length}
                    onClick={() => {
                      if (show(new Set(t.nodeIds))) {
                        select(t.nodeIds.find((id) => loaded.has(id)) ?? t.nodeIds[0]);
                      }
                    }}
                  >
                    {t.label}
                    {!t.nodeIds.length ? ' — missing' : ''}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT PANE: Audit, Provenance, Structure Details & Surface Notes */}
          <section
            aria-label="Structure details"
            className="flex min-h-0 min-w-0 flex-col gap-3 rounded-[var(--radius-shell)] border border-[var(--color-border)] bg-[var(--color-surface-l1)] p-3 lg:h-full lg:overflow-y-auto"
          >
            {catalog?.model.referenceSex === 'FEMALE' ? (
              <section
                ref={limitationsRef}
                aria-label="Female reference limitations"
                className="rounded-[var(--radius-md)] border border-[oklch(0.78_0.16_75/0.40)] bg-[oklch(0.78_0.16_75/0.07)] p-2.5 text-xs text-[var(--color-status-caution)]"
              >
                <p className="leading-relaxed">
                  Partial HRA female reference. Contributor-specific donor identity and sex are not individually established; nervous includes Allen-labelled contributions. No registered composite, male completion or individualized scan.
                </p>
                <details
                  className="mt-1.5"
                  open={provenanceOpen}
                  onToggle={(e) => setProvenanceOpen(e.currentTarget.open)}
                >
                  <summary className="cursor-pointer font-mono text-[11px] font-semibold text-[var(--color-ink-display)]">
                    Missing mandatory coverage
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-[11px]">
                    {catalog.model.structures
                      .filter((s) => s.coverage === 'MISSING')
                      .map((s) => (
                        <li key={s.id} className="ares-missing-hatch rounded px-1.5 py-1 text-[var(--color-ink-body)]">
                          <button
                            type="button"
                            onClick={() => {
                              setTreeTab('missing');
                              select(s.id, null);
                            }}
                            className="text-left underline decoration-dotted hover:text-[var(--color-ink-display)]"
                          >
                            {s.label}: {s.unavailableReason}
                          </button>
                        </li>
                      ))}
                  </ul>
                </details>
                <a
                  href="/anatomy/female-hra/review.json"
                  className="mt-1.5 inline-block font-mono text-[11px] text-[var(--color-accent-spatial)] underline"
                >
                  Source provenance and review status
                </a>
              </section>
            ) : null}

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-base font-semibold text-[var(--color-ink-display)]" data-selected-source>
                  {structure?.label ?? 'Select a source structure'}
                </h2>
                {structure ? (
                  <Badge variant={structure.coverage === 'MISSING' ? 'missing' : 'caution'}>
                    {structure.coverage === 'MISSING' ? 'MISSING_NATIVE_SOURCE' : structure.coverage}
                  </Badge>
                ) : null}
              </div>

              {structure ? (
                <>
                  <p className="break-all font-mono text-[10.5px] text-[var(--color-ink-meta)]">
                    {structure.id}
                    <br />
                    {structure.sourceConceptId}
                  </p>

                  {structure.coverage === 'MISSING' ? (
                    <div className="ares-missing-hatch space-y-2 rounded-[var(--radius-md)] p-2.5 text-xs">
                      <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-status-caution)]">
                        Unresolved Native Coverage · 0 Male Substitution
                      </p>
                      <p className="text-[var(--color-ink-body)]">
                        {structure.unavailableReason ?? 'Native anatomical source geometry has not been acquired or verified.'}
                      </p>
                      <p className="font-mono text-[10px] text-[var(--color-ink-meta)]">
                        Translucent dashed/hatched bounding halo marks approximate reference-frame region only; surface coordinate anchoring is disabled without real mesh geometry.
                      </p>
                      {catalog?.model.referenceSex === 'FEMALE' ? (
                        <button
                          type="button"
                          onClick={openMissingProvenance}
                          className="font-mono text-[11px] text-[var(--color-accent-spatial)] underline"
                        >
                          Open provenance &amp; missing coverage ledger
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--color-ink-body)]">
                        Reference status: unverified. Laterality: {structure.laterality}. Ontology: not independently reviewed.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={compactButton}
                          disabled={!ready || !loaded.has(structure.id)}
                          onClick={() => show(new Set([structure.id]))}
                        >
                          Isolate selection
                        </button>
                        <button
                          type="button"
                          className={compactButton}
                          disabled={!ready || !visible.has(structure.id)}
                          onClick={() => show(new Set([...visible].filter((id) => id !== structure.id)))}
                        >
                          Hide selection
                        </button>
                      </div>
                      {selectedIssues.map((i, n) => (
                        <p className="text-xs text-[var(--color-status-caution)]" key={n}>
                          Source part unavailable: {i.reason}. Other valid primitives, if any, remain selectable.
                        </p>
                      ))}
                    </>
                  )}

                  <div className="space-y-2 border-t border-[var(--color-border)] pt-2.5">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-meta)]">
                      Associated clinical context
                    </h3>
                    <ClinicalDataNotice packet={packet} />
                    <p className="font-mono text-[11px] text-[var(--color-ink-body)]">
                      {status.isStale
                        ? 'STALE TELEMETRY — do not interpret as current.'
                        : status.heldSample
                          ? 'Held telemetry sample.'
                          : 'Source timestamp: ' + new Date(packet.timestamp_ms).toISOString()}
                    </p>
                    {clinicalKeys.map((key) => {
                      const metric = clinical[key as keyof typeof clinical] as ClinicalMetric | undefined;
                      const isAvailable =
                        metric && typeof metric === 'object' && 'value' in metric && metric.value !== null;
                      return (
                        <p
                          key={key}
                          className={`rounded px-2 py-1 font-mono text-[11px] ${
                            isAvailable
                              ? 'border border-[var(--color-border)] bg-[var(--color-surface-l3)] text-[var(--color-ink-display)]'
                              : 'ares-missing-hatch text-[var(--color-status-caution)]'
                          }`}
                          data-reference-clinical={key}
                          data-source-record={
                            metric && typeof metric === 'object' && 'sourceRecordId' in metric
                              ? metric.sourceRecordId
                              : undefined
                          }
                          data-clinical-availability={isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                        >
                          {key}:{' '}
                          {isAvailable
                            ? `${metric.value!.toFixed(2)} ${metric.unit} (${metric.provenance})`
                            : 'Unavailable'}
                        </p>
                      );
                    })}
                    {!clinicalKeys.length ? (
                      <p className="text-xs text-[var(--color-ink-meta)]">
                        No supported numeric channels bound to this source node.
                      </p>
                    ) : null}
                    <p className="text-[11px] text-[var(--color-ink-meta)]">
                      Source-group context only (including descendant branches): these values are not measurements of the selected mesh.
                    </p>
                    {region ? (
                      <a
                        className="inline-block font-mono text-xs text-[var(--color-accent-spatial)] underline"
                        href={`/?phase=EVALUATE&anatomyRegion=${encodeURIComponent(region)}`}
                      >
                        Open supported region in cockpit
                      </a>
                    ) : (
                      <p className="text-xs text-[var(--color-ink-meta)]">
                        No backend region binding. Reference selection stays local.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-[var(--color-border)] pt-2.5">
                    <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-meta)]">
                      Local reference notes
                    </h3>
                    <p className="text-xs text-[var(--color-ink-body)]">
                      {anchor
                        ? `Surface anchor: ${anchor.point.toArray().map((x) => x.toFixed(4)).join(', ')} in glTF model metres (not clinically calibrated).`
                        : 'Pick a visible surface by touch, pointer or Enter in the viewport to place a coordinate anchor. List selection alone does not invent a location.'}
                    </p>
                    <label className="block font-mono text-[10.5px] text-[var(--color-ink-meta)]">
                      Reference note
                      <textarea
                        aria-label="Reference note"
                        maxLength={2000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="mt-1 min-h-20 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l3)] p-2 font-sans text-xs text-[var(--color-ink-display)]"
                      />
                    </label>
                    <button
                      type="button"
                      className={compactButton}
                      disabled={!anchor || !text.trim()}
                      onClick={save}
                    >
                      Save local note
                    </button>
                    {notes
                      .filter((n) => n.structureId === selected)
                      .map((n) => (
                        <article
                          key={n.id}
                          className="break-words rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-l3)] p-2 text-xs"
                        >
                          <p className="whitespace-pre-wrap text-[var(--color-ink-display)]">{n.text}</p>
                          <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-meta)]">
                            {n.anchor?.nodeId}: {n.anchor?.positionM.map((x) => x.toFixed(4)).join(', ')}
                          </p>
                          <button
                            type="button"
                            className={`${compactButton} mt-1.5`}
                            onClick={() => removeNote(n.id)}
                          >
                            Delete note
                          </button>
                        </article>
                      ))}
                  </div>
                </>
              ) : null}

              <p role="status" className="font-mono text-[11px] text-[var(--color-ink-meta)]">
                {noteStatus}
              </p>
            </div>

            <footer className="mt-auto space-y-1.5 border-t border-[var(--color-border)] pt-2.5 text-[11px] text-[var(--color-ink-meta)]">
              <p>{system?.licenseReview}</p>
              <p>
                Optic sheath coverage remains missing. Eye and optic nerve meshes do not establish ONSD sheath geometry.{' '}
                {referenceModel === 'existing'
                  ? 'Female-labelled source supplements are excluded, not substituted.'
                  : 'Source releases are not superimposed. Missing female counterparts are not borrowed from male anatomy.'}
              </p>
              <a
                className="inline-block font-mono text-[11px] text-[var(--color-accent-spatial)] underline"
                href={referenceModel === 'existing' ? '/anatomy/ATTRIBUTION.md' : '/anatomy/female-hra/ATTRIBUTION.md'}
              >
                Original source credits and license caveats
              </a>
              {issues.length ? (
                <details>
                  <summary className="cursor-pointer font-mono text-[11px] text-[var(--color-ink-body)]">
                    Inspect {issues.length} source-part issues
                  </summary>
                  <ul className="mt-1 max-h-48 overflow-auto font-mono text-[10px]">
                    {issues.map((i, n) => (
                      <li key={n}>
                        {i.structureId} / {i.nodeId}: {i.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </footer>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}
