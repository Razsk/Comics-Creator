'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Character,
  CharacterRole,
  Comic,
  ComicStorageAdapter,
  DialogueBalloonStyle,
  ImagePromptDeliveryMode,
  LetteringMode,
  Location,
  LocationType,
  PanelFraming,
  PanelHeightWeight,
  PanelTextElement,
  Prop,
  SelectionTarget,
  StagedDiff,
} from '@/domain/types';
import { ComicEngine, createComicEngine } from '@/domain/comic-engine';
import { createBrowserStorageAdapter } from '@/domain/indexeddb-storage';

export interface ComicStudioProps {
  storage?: ComicStorageAdapter;
  onCopyToClipboard?: (text: string) => Promise<void> | void;
}

type WorkspaceMode = 'initiation' | 'story-bible' | 'canvas';
type StoryBibleTab = 'characters' | 'locations' | 'props' | 'visual-style';
type RightDockTab = 'refine' | 'inspector' | 'image-prompts';

const HEIGHT_CLASS_MAP: Record<PanelHeightWeight, string> = {
  sm: 'min-h-[130px]',
  md: 'min-h-[190px]',
  lg: 'min-h-[260px]',
  xl: 'min-h-[340px]',
  splash: 'min-h-[440px]',
};

const COL_SPAN_STYLE = (colSpan: number): React.CSSProperties => ({
  gridColumn: `span ${Math.min(12, Math.max(1, colSpan))} / span ${Math.min(12, Math.max(1, colSpan))}`,
});

export function ComicStudio({ storage, onCopyToClipboard }: ComicStudioProps) {
  const [engine, setEngine] = useState<ComicEngine | null>(null);
  const [comic, setComic] = useState<Comic | null>(null);
  const [stagedDiff, setStagedDiff] = useState<StagedDiff | null>(null);

  const [mode, setMode] = useState<WorkspaceMode>('canvas');
  const [bibleTab, setBibleTab] = useState<StoryBibleTab>('characters');
  const [rightTab, setRightTab] = useState<RightDockTab>('refine');

  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [activePropId, setActivePropId] = useState<string | null>(null);

  // Initiation options
  const [targetPageCount, setTargetPageCount] = useState<number>(3);
  const [panelDensity, setPanelDensity] = useState<string>('medium (4-6 panels/page)');
  const [initBespokeInstruction, setInitBespokeInstruction] = useState<string>('');

  // Selection & LLM Clipboard Bridge state
  const [selection, setSelection] = useState<SelectionTarget>({
    scope: 'pages',
    selectedIds: [],
  });
  const [selectionInstruction, setSelectionInstruction] = useState<string>('');
  const [rawLlmInput, setRawLlmInput] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [lastCopiedPrompt, setLastCopiedPrompt] = useState<string>('');

  // Image prompt state
  const [selectedImagePageIds, setSelectedImagePageIds] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<ImagePromptDeliveryMode>('composite-spread');
  const [letteringMode, setLetteringMode] = useState<LetteringMode>('baked-in');
  const [imageBespokeInstruction, setImageBespokeInstruction] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const adapter = storage ?? createBrowserStorageAdapter();
    createComicEngine({
      storage: adapter,
      onChange: (updated) => {
        if (mounted) {
          setComic(updated);
        }
      },
    }).then((eng) => {
      if (!mounted) return;
      setEngine(eng);
      const initial = eng.getComic();
      setComic(initial);
      if (initial.storyBible.characters[0]) {
        setActiveCharacterId(initial.storyBible.characters[0].id);
      }
      if (initial.storyBible.locations[0]) {
        setActiveLocationId(initial.storyBible.locations[0].id);
      }
      if (initial.storyBible.props[0]) {
        setActivePropId(initial.storyBible.props[0].id);
      }
      if (initial.pages.length > 0) {
        setSelectedImagePageIds([initial.pages[0].id]);
      }
    });
    return () => {
      mounted = false;
    };
  }, [storage]);

  const copyText = async (text: string, label: string) => {
    setLastCopiedPrompt(text);
    if (onCopyToClipboard) {
      await onCopyToClipboard(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setStatusToast(`${label} copied to clipboard`);
  };

  const activeCharacter: Character | undefined = useMemo(() => {
    if (!comic) return undefined;
    return (
      comic.storyBible.characters.find((c) => c.id === activeCharacterId) ??
      comic.storyBible.characters[0]
    );
  }, [comic, activeCharacterId]);

  const activeLocation: Location | undefined = useMemo(() => {
    if (!comic) return undefined;
    return (
      comic.storyBible.locations.find((l) => l.id === activeLocationId) ??
      comic.storyBible.locations[0]
    );
  }, [comic, activeLocationId]);

  const activeProp: Prop | undefined = useMemo(() => {
    if (!comic) return undefined;
    return (
      comic.storyBible.props.find((p) => p.id === activePropId) ??
      comic.storyBible.props[0]
    );
  }, [comic, activePropId]);

  const compiledImagePrompts = useMemo(() => {
    if (!engine || !comic) return [];
    const targetIds =
      selectedImagePageIds.length > 0
        ? selectedImagePageIds
        : comic.pages.slice(0, 1).map((p) => p.id);
    return engine.buildImagePrompts({
      pageIds: targetIds,
      deliveryMode,
      letteringMode,
      bespokeInstruction: imageBespokeInstruction || undefined,
    });
  }, [engine, comic, selectedImagePageIds, deliveryMode, letteringMode, imageBespokeInstruction]);

  if (!engine || !comic) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading Comics Creator Studio...
      </div>
    );
  }

  const handleAddCharacter = () => {
    const created = engine.upsertCharacter({
      name: 'New Character',
      aliases: [],
      role: 'protagonist',
      appearance: {
        ageAndBuild: '',
        facialFeaturesAndHair: '',
        signatureOutfitAndColors: '',
        distinguishingMarks: '',
        visualPromptTag: '',
      },
      personality: {
        coreTraits: [],
        voiceAndSpeechStyle: '',
        quirksAndMannerisms: '',
      },
      motivation: {
        primaryGoal: '',
        coreFearOrConflict: '',
        moralAlignmentOrCode: '',
      },
      background: {
        summary: '',
        relationships: [],
      },
    });
    setActiveCharacterId(created.id);
    setBibleTab('characters');
  };

  const handleAddLocation = () => {
    const created = engine.upsertLocation({
      name: 'New Location',
      type: 'exterior',
      architectureAndScale: '',
      lightingAndAtmosphere: '',
      keyVisualLandmarks: [],
      loreAndContext: '',
      visualPromptTag: '',
    });
    setActiveLocationId(created.id);
    setBibleTab('locations');
  };

  const handleAddProp = () => {
    const created = engine.upsertProp({
      name: 'New Prop',
      category: 'artifact',
      visualDescription: '',
      narrativePurpose: '',
      visualPromptTag: '',
    });
    setActivePropId(created.id);
    setBibleTab('props');
  };

  const handleCopyInitiationPrompt = async () => {
    const prompt = engine.buildInitiationPrompt({
      targetPageCount,
      panelDensity,
      bespokeInstruction: initBespokeInstruction || undefined,
    });
    await copyText(prompt, 'Initiation prompt');
  };

  const handleStageLlmJson = () => {
    setImportError(null);
    try {
      const staged = engine.stageLlmResponse(rawLlmInput);
      setStagedDiff(staged);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse JSON');
    }
  };

  const handleApplyStagedDiff = () => {
    const updated = engine.applyStagedDiff();
    setStagedDiff(null);
    setRawLlmInput('');
    setMode('canvas');
    if (updated.pages.length > 0 && selectedImagePageIds.length === 0) {
      setSelectedImagePageIds([updated.pages[0].id]);
    }
    setStatusToast('Staged LLM changes applied and saved.');
  };

  const handleDiscardStagedDiff = () => {
    engine.discardStagedDiff();
    setStagedDiff(null);
  };

  const handleSelectElement = (
    nextScope: SelectionTarget['scope'],
    id: string,
    parentId?: string,
    toggleMulti = false
  ) => {
    setSelection((prev) => {
      if (toggleMulti && prev.scope === nextScope && prev.parentId === parentId) {
        const exists = prev.selectedIds.includes(id);
        const nextIds = exists
          ? prev.selectedIds.filter((item) => item !== id)
          : [...prev.selectedIds, id];
        return { scope: nextScope, parentId, selectedIds: nextIds };
      }
      return { scope: nextScope, parentId, selectedIds: [id] };
    });
  };

  const handleCopySelectionPrompt = async () => {
    if (selection.selectedIds.length === 0) return;
    const prompt = engine.buildSelectionPrompt(selection, selectionInstruction);
    await copyText(prompt, 'Selection prompt');
  };

  // Resolve active selected object for direct inspector editing
  const selectedPage =
    selection.scope === 'pages'
      ? comic.pages.find((p) => p.id === selection.selectedIds[0])
      : comic.pages.find((p) => p.id === selection.parentId);

  const selectedPanel =
    selection.scope === 'panels'
      ? comic.pages
          .flatMap((p) => p.panels.map((pan) => ({ pageId: p.id, panel: pan })))
          .find((entry) => entry.panel.id === selection.selectedIds[0])
      : undefined;

  const selectedTextElement =
    selection.scope === 'text-elements'
      ? comic.pages
          .flatMap((p) =>
            p.panels.flatMap((pan) =>
              pan.textElements.map((txt) => ({
                pageId: p.id,
                panelId: pan.id,
                element: txt,
              }))
            )
          )
          .find((entry) => entry.element.id === selection.selectedIds[0])
      : undefined;

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Top Studio Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold tracking-wider text-amber-300 uppercase">
            Comics Creator
          </span>
          <input
            aria-label="Comic Title"
            value={comic.title}
            onChange={(e) => engine.updateComicMeta({ title: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-1 text-sm font-semibold text-white focus:border-amber-400 focus:outline-none"
          />
          <span className="text-xs text-emerald-400">● Auto-saved</span>
        </div>

        <div className="flex items-center gap-2">
          {statusToast && (
            <span className="rounded bg-emerald-950/90 px-3 py-1 text-xs text-emerald-300 border border-emerald-700/50">
              {statusToast}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const json = engine.exportComicJson();
              void copyText(json, 'Full Comic JSON');
            }}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Export Comic JSON
          </button>
          <label className="cursor-pointer rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700">
            Import Comic JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    engine.importComicJson(String(reader.result || ''));
                    setStatusToast('Comic JSON project imported.');
                  } catch (err) {
                    setImportError(err instanceof Error ? err.message : 'Invalid Comic JSON');
                  }
                };
                reader.readAsText(file);
              }}
            />
          </label>
        </div>
      </header>

      {/* Staged Diff Review Banner / Modal */}
      {stagedDiff && (
        <div
          role="region"
          aria-label="Staged Diff Review"
          className="border-b border-amber-500/50 bg-amber-950/40 px-6 py-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wide">
                Staged Diff Review — {stagedDiff.summary}
              </h2>
              {stagedDiff.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-200">
                  {stagedDiff.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}
              {stagedDiff.kind === 'targeted-patch' && (
                <p className="mt-1 text-xs text-slate-300">
                  Scope: <strong>{stagedDiff.scope}</strong> | Replacing{' '}
                  <strong>{stagedDiff.selectedIds.join(', ')}</strong> ({stagedDiff.before.length}{' '}
                  before → {stagedDiff.replacements.length} after)
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyStagedDiff}
                className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Accept & Apply Changes
              </button>
              <button
                type="button"
                onClick={handleDiscardStagedDiff}
                className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main 3-Pane Workspace */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* Left Sidebar: Navigation & Outline */}
        <aside className="col-span-2 flex flex-col border-r border-slate-800 bg-slate-900/60 p-3 overflow-y-auto">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setMode('initiation')}
              className={`w-full rounded px-3 py-2 text-left text-xs font-semibold ${
                mode === 'initiation'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Initiation & Manuscript
            </button>
            <button
              type="button"
              onClick={() => setMode('story-bible')}
              className={`w-full rounded px-3 py-2 text-left text-xs font-semibold ${
                mode === 'story-bible'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Story Bible ({comic.storyBible.characters.length}C /{' '}
              {comic.storyBible.locations.length}L / {comic.storyBible.props.length}P)
            </button>
            <button
              type="button"
              onClick={() => setMode('canvas')}
              className={`w-full rounded px-3 py-2 text-left text-xs font-semibold ${
                mode === 'canvas'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Comic Canvas ({comic.pages.length} Pages)
            </button>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Scenes ({comic.scenes.length})</span>
              <button
                type="button"
                onClick={() =>
                  engine.upsertScene({
                    title: `Scene ${comic.scenes.length + 1}`,
                    summary: '',
                    dramaticBeat: '',
                    participatingCharacterIds: [],
                  })
                }
                className="text-amber-400 hover:text-amber-300"
              >
                + Scene
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {comic.scenes.map((scene) => (
                <li
                  key={scene.id}
                  className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-slate-300"
                >
                  <div className="font-medium text-amber-200">{scene.title}</div>
                  {scene.summary && (
                    <div className="truncate text-[11px] text-slate-400">{scene.summary}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Pages Outline</span>
              <button
                type="button"
                onClick={() => {
                  const p = engine.addPage('New comic page');
                  engine.addPanel(p.id);
                  setMode('canvas');
                }}
                className="text-amber-400 hover:text-amber-300"
              >
                + Page
              </button>
            </div>
            <ul className="mt-2 space-y-1.5 text-xs">
              {comic.pages.map((page) => {
                const isPageSelected =
                  selection.scope === 'pages' && selection.selectedIds.includes(page.id);
                return (
                  <li key={page.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        setMode('canvas');
                        handleSelectElement('pages', page.id, undefined, e.shiftKey || e.ctrlKey);
                      }}
                      className={`w-full rounded px-2 py-1 text-left font-medium ${
                        isPageSelected
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                          : 'bg-slate-950/70 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      Page {page.pageNumber} ({page.panels.length} panels)
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="col-span-6 overflow-y-auto p-6">
          {mode === 'initiation' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-lg font-bold text-white">
                  Initiation Phase — Manuscript to Comic Draft
                </h1>
                <p className="text-xs text-slate-400">
                  Paste or upload your manuscript below. Click &ldquo;Copy Initiation Prompt&rdquo;
                  to bundle your Manuscript, Story Bible Assets, bespoke instructions, and required
                  JSON format into the clipboard for your LLM.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="manuscript-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Manuscript Source Text
                  </label>
                  <label className="cursor-pointer rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-amber-300 hover:bg-slate-700">
                    Upload Manuscript (.txt / .md)
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          engine.updateManuscript(String(reader.result || ''));
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
                <textarea
                  id="manuscript-input"
                  aria-label="Manuscript Source Text"
                  rows={10}
                  value={comic.manuscript}
                  onChange={(e) => engine.updateManuscript(e.target.value)}
                  placeholder="Paste your story manuscript, scene outline, or script here..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="target-pages-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Target Page Count
                  </label>
                  <input
                    id="target-pages-input"
                    type="number"
                    min={1}
                    max={50}
                    value={targetPageCount}
                    onChange={(e) => setTargetPageCount(Number(e.target.value) || 1)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="panel-density-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                  >
                    Panel Density
                  </label>
                  <input
                    id="panel-density-input"
                    type="text"
                    value={panelDensity}
                    onChange={(e) => setPanelDensity(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="init-bespoke-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Initiation Bespoke Instruction
                </label>
                <textarea
                  id="init-bespoke-input"
                  aria-label="Initiation Bespoke Instruction"
                  rows={3}
                  value={initBespokeInstruction}
                  onChange={(e) => setInitBespokeInstruction(e.target.value)}
                  placeholder="Optional: e.g. Start with a full-width establishing tier and emphasize noir tension..."
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-3 text-sm text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleCopyInitiationPrompt}
                className="w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                Copy Initiation Prompt to Clipboard
              </button>
            </div>
          )}

          {mode === 'story-bible' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBibleTab('characters')}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      bibleTab === 'characters'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Characters ({comic.storyBible.characters.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBibleTab('locations')}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      bibleTab === 'locations'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Locations ({comic.storyBible.locations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBibleTab('props')}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      bibleTab === 'props'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Props ({comic.storyBible.props.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBibleTab('visual-style')}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      bibleTab === 'visual-style'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Visual Style
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddCharacter}
                    className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                  >
                    + New Character
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLocation}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    + New Location
                  </button>
                  <button
                    type="button"
                    onClick={handleAddProp}
                    className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    + New Prop
                  </button>
                </div>
              </div>

              {bibleTab === 'characters' && (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-1.5">
                    {comic.storyBible.characters.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setActiveCharacterId(c.id);
                          handleSelectElement('characters', c.id);
                        }}
                        className={`w-full rounded border p-2.5 text-left text-xs ${
                          activeCharacter?.id === c.id
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="font-bold">{c.name}</div>
                        <div className="text-[11px] uppercase text-amber-400">{c.role}</div>
                      </button>
                    ))}
                  </div>

                  <div className="col-span-8">
                    {activeCharacter ? (
                      <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="char-name-input"
                              className="block text-xs font-semibold text-slate-300"
                            >
                              Character Name
                            </label>
                            <input
                              id="char-name-input"
                              aria-label="Character Name"
                              value={activeCharacter.name}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  name: e.target.value,
                                })
                              }
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="char-role-select"
                              className="block text-xs font-semibold text-slate-300"
                            >
                              Narrative Role
                            </label>
                            <select
                              id="char-role-select"
                              value={activeCharacter.role}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  role: e.target.value as CharacterRole,
                                })
                              }
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-white"
                            >
                              <option value="protagonist">Protagonist</option>
                              <option value="antagonist">Antagonist</option>
                              <option value="supporting">Supporting</option>
                              <option value="minor">Minor</option>
                            </select>
                          </div>
                        </div>

                        <fieldset className="space-y-2 rounded border border-slate-800 p-3">
                          <legend className="px-1 text-xs font-bold uppercase text-amber-400">
                            Appearance
                          </legend>
                          <div>
                            <label
                              htmlFor="char-tag-input"
                              className="block text-xs font-semibold text-slate-300"
                            >
                              Visual Prompt Tag
                            </label>
                            <input
                              id="char-tag-input"
                              aria-label="Visual Prompt Tag"
                              value={activeCharacter.appearance.visualPromptTag}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  appearance: {
                                    ...activeCharacter.appearance,
                                    visualPromptTag: e.target.value,
                                  },
                                })
                              }
                              placeholder="Concise visual descriptor injected into image prompts..."
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              aria-label="Age and Build"
                              placeholder="Age & Build"
                              value={activeCharacter.appearance.ageAndBuild}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  appearance: {
                                    ...activeCharacter.appearance,
                                    ageAndBuild: e.target.value,
                                  },
                                })
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                            />
                            <input
                              aria-label="Facial Features and Hair"
                              placeholder="Facial Features & Hair"
                              value={activeCharacter.appearance.facialFeaturesAndHair}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  appearance: {
                                    ...activeCharacter.appearance,
                                    facialFeaturesAndHair: e.target.value,
                                  },
                                })
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                            />
                            <input
                              aria-label="Signature Outfit and Colors"
                              placeholder="Signature Outfit & Colors"
                              value={activeCharacter.appearance.signatureOutfitAndColors}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  appearance: {
                                    ...activeCharacter.appearance,
                                    signatureOutfitAndColors: e.target.value,
                                  },
                                })
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                            />
                            <input
                              aria-label="Distinguishing Marks"
                              placeholder="Distinguishing Marks"
                              value={activeCharacter.appearance.distinguishingMarks}
                              onChange={(e) =>
                                engine.upsertCharacter({
                                  ...activeCharacter,
                                  appearance: {
                                    ...activeCharacter.appearance,
                                    distinguishingMarks: e.target.value,
                                  },
                                })
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                        </fieldset>

                        <fieldset className="space-y-2 rounded border border-slate-800 p-3">
                          <legend className="px-1 text-xs font-bold uppercase text-amber-400">
                            Personality & Voice
                          </legend>
                          <input
                            aria-label="Character Aliases"
                            placeholder="Aliases (comma-separated)"
                            value={activeCharacter.aliases.join(', ')}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                aliases: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            aria-label="Core Traits"
                            placeholder="Core Traits (comma-separated)"
                            value={activeCharacter.personality.coreTraits.join(', ')}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                personality: {
                                  ...activeCharacter.personality,
                                  coreTraits: e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            aria-label="Voice and Speech Style"
                            placeholder="Voice & Speech Style (guides dialogue generation)"
                            value={activeCharacter.personality.voiceAndSpeechStyle}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                personality: {
                                  ...activeCharacter.personality,
                                  voiceAndSpeechStyle: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            aria-label="Quirks and Mannerisms"
                            placeholder="Quirks & Mannerisms"
                            value={activeCharacter.personality.quirksAndMannerisms}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                personality: {
                                  ...activeCharacter.personality,
                                  quirksAndMannerisms: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                        </fieldset>

                        <fieldset className="space-y-2 rounded border border-slate-800 p-3">
                          <legend className="px-1 text-xs font-bold uppercase text-amber-400">
                            Motivation & Background
                          </legend>
                          <input
                            aria-label="Primary Goal"
                            placeholder="Primary Goal"
                            value={activeCharacter.motivation.primaryGoal}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                motivation: {
                                  ...activeCharacter.motivation,
                                  primaryGoal: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            aria-label="Core Fear or Conflict"
                            placeholder="Core Fear or Conflict"
                            value={activeCharacter.motivation.coreFearOrConflict}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                motivation: {
                                  ...activeCharacter.motivation,
                                  coreFearOrConflict: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            aria-label="Moral Alignment or Code"
                            placeholder="Moral Alignment or Code"
                            value={activeCharacter.motivation.moralAlignmentOrCode}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                motivation: {
                                  ...activeCharacter.motivation,
                                  moralAlignmentOrCode: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                          />
                          <textarea
                            aria-label="Background Summary"
                            placeholder="Backstory summary..."
                            rows={3}
                            value={activeCharacter.background.summary}
                            onChange={(e) =>
                              engine.upsertCharacter({
                                ...activeCharacter,
                                background: {
                                  ...activeCharacter.background,
                                  summary: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                          />
                        </fieldset>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Click &ldquo;+ New Character&rdquo; to define a character in your Story
                        Bible.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {bibleTab === 'locations' && (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-1.5">
                    {comic.storyBible.locations.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => {
                          setActiveLocationId(l.id);
                          handleSelectElement('locations', l.id);
                        }}
                        className={`w-full rounded border p-2.5 text-left text-xs ${
                          activeLocation?.id === l.id
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="font-bold">{l.name}</div>
                        <div className="text-[11px] uppercase text-slate-400">{l.type}</div>
                      </button>
                    ))}
                  </div>
                  <div className="col-span-8">
                    {activeLocation ? (
                      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                        <input
                          aria-label="Location Name"
                          value={activeLocation.name}
                          onChange={(e) =>
                            engine.upsertLocation({ ...activeLocation, name: e.target.value })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
                        />
                        <select
                          aria-label="Location Type"
                          value={activeLocation.type}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              type: e.target.value as LocationType,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        >
                          <option value="exterior">Exterior</option>
                          <option value="interior">Interior</option>
                          <option value="mixed">Mixed</option>
                        </select>
                        <input
                          aria-label="Location Visual Prompt Tag"
                          placeholder="Visual Prompt Tag"
                          value={activeLocation.visualPromptTag}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              visualPromptTag: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        />
                        <textarea
                          aria-label="Architecture and Scale"
                          placeholder="Architecture & Scale"
                          rows={2}
                          value={activeLocation.architectureAndScale}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              architectureAndScale: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                        />
                        <textarea
                          aria-label="Lighting and Atmosphere"
                          placeholder="Lighting & Atmosphere"
                          rows={2}
                          value={activeLocation.lightingAndAtmosphere}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              lightingAndAtmosphere: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                        />
                        <input
                          aria-label="Key Visual Landmarks"
                          placeholder="Key Visual Landmarks (comma-separated)"
                          value={activeLocation.keyVisualLandmarks.join(', ')}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              keyVisualLandmarks: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        />
                        <textarea
                          aria-label="Lore and Context"
                          placeholder="Lore & Context"
                          rows={2}
                          value={activeLocation.loreAndContext}
                          onChange={(e) =>
                            engine.upsertLocation({
                              ...activeLocation,
                              loreAndContext: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Click &ldquo;+ New Location&rdquo; to define a location.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {bibleTab === 'props' && (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-1.5">
                    {comic.storyBible.props.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setActivePropId(p.id);
                          handleSelectElement('props', p.id);
                        }}
                        className={`w-full rounded border p-2.5 text-left text-xs ${
                          activeProp?.id === p.id
                            ? 'border-amber-500 bg-amber-500/10 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="font-bold">{p.name}</div>
                        <div className="text-[11px] text-slate-400">{p.category}</div>
                      </button>
                    ))}
                  </div>
                  <div className="col-span-8">
                    {activeProp ? (
                      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                        <input
                          aria-label="Prop Name"
                          value={activeProp.name}
                          onChange={(e) =>
                            engine.upsertProp({ ...activeProp, name: e.target.value })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white"
                        />
                        <input
                          aria-label="Prop Visual Prompt Tag"
                          placeholder="Visual Prompt Tag"
                          value={activeProp.visualPromptTag}
                          onChange={(e) =>
                            engine.upsertProp({
                              ...activeProp,
                              visualPromptTag: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        />
                        <textarea
                          aria-label="Prop Visual Description"
                          placeholder="Visual Description"
                          rows={2}
                          value={activeProp.visualDescription}
                          onChange={(e) =>
                            engine.upsertProp({
                              ...activeProp,
                              visualDescription: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                        />
                        <input
                          aria-label="Prop Category"
                          placeholder="Category (e.g. artifact, vehicle, weapon)"
                          value={activeProp.category}
                          onChange={(e) =>
                            engine.upsertProp({
                              ...activeProp,
                              category: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                        />
                        <textarea
                          aria-label="Prop Narrative Purpose"
                          placeholder="Narrative Purpose"
                          rows={2}
                          value={activeProp.narrativePurpose}
                          onChange={(e) =>
                            engine.upsertProp({
                              ...activeProp,
                              narrativePurpose: e.target.value,
                            })
                          }
                          className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Click &ldquo;+ New Prop&rdquo; to define a prop.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {bibleTab === 'visual-style' && (
                <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <input
                    aria-label="Art Tradition"
                    placeholder="Art Tradition (e.g. Ligne Claire, Manga, Noir Ink)"
                    value={comic.storyBible.visualStyle.artTradition}
                    onChange={(e) => engine.updateVisualStyle({ artTradition: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    aria-label="Line and Inking"
                    placeholder="Line & Inking"
                    value={comic.storyBible.visualStyle.lineAndInking}
                    onChange={(e) => engine.updateVisualStyle({ lineAndInking: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    aria-label="Color Palette and Shading"
                    placeholder="Color Palette & Shading"
                    value={comic.storyBible.visualStyle.colorPaletteAndShading}
                    onChange={(e) =>
                      engine.updateVisualStyle({ colorPaletteAndShading: e.target.value })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    aria-label="Era and Tone"
                    placeholder="Era & Tone"
                    value={comic.storyBible.visualStyle.eraAndTone}
                    onChange={(e) => engine.updateVisualStyle({ eraAndTone: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    aria-label="Negative Prompt"
                    placeholder="Negative Prompt / Avoid in artwork"
                    value={comic.storyBible.visualStyle.negativePrompt}
                    onChange={(e) => engine.updateVisualStyle({ negativePrompt: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
              )}
            </div>
          )}

          {mode === 'canvas' && (
            <div className="space-y-8">
              {comic.pages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
                  <p className="text-sm text-slate-300">
                    No comic pages yet. Start in <strong>Initiation & Manuscript</strong> to
                    generate a draft from your manuscript, or click <strong>+ Page</strong> in the
                    left sidebar.
                  </p>
                </div>
              ) : (
                comic.pages.map((page) => {
                  const isPageSelected =
                    selection.scope === 'pages' && selection.selectedIds.includes(page.id);
                  return (
                    <section
                      key={page.id}
                      className={`rounded-xl border-2 bg-slate-900/90 p-5 shadow-xl transition ${
                        isPageSelected ? 'border-amber-400' : 'border-slate-800'
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={(e) =>
                              handleSelectElement(
                                'pages',
                                page.id,
                                undefined,
                                e.shiftKey || e.ctrlKey
                              )
                            }
                            className={`rounded px-3 py-1 text-xs font-bold uppercase ${
                              isPageSelected
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                            }`}
                          >
                            Page {page.pageNumber}
                          </button>
                          <input
                            aria-label={`Page ${page.pageNumber} Summary`}
                            value={page.summary ?? ''}
                            onChange={(e) =>
                              engine.updatePage(page.id, { summary: e.target.value })
                            }
                            placeholder="Page summary..."
                            className="rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-slate-300 hover:border-slate-700 focus:border-amber-400 focus:bg-slate-950 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700">
                            Attach Page Image
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  engine.attachPageImage(page.id, String(reader.result || ''));
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => engine.addPanel(page.id)}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-amber-300 hover:bg-slate-700"
                          >
                            + Add Panel
                          </button>
                        </div>
                      </div>

                      {page.renderedImageDataUrl && (
                        <div className="mb-4 overflow-hidden rounded-lg border border-slate-700">
                          <img
                            src={page.renderedImageDataUrl}
                            alt={`Rendered Page ${page.pageNumber}`}
                            className="max-h-96 w-full object-contain bg-black"
                          />
                        </div>
                      )}

                      {/* 12-Column Tiered Panel Grid */}
                      <div className="grid grid-cols-12 gap-3">
                        {page.panels.map((panel, panelIdx) => {
                          const isPanelSelected =
                            selection.scope === 'panels' &&
                            selection.selectedIds.includes(panel.id);
                          const scene = comic.scenes.find((s) => s.id === panel.sceneId);

                          return (
                            <div
                              key={panel.id}
                              style={COL_SPAN_STYLE(panel.colSpan)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectElement(
                                  'panels',
                                  panel.id,
                                  page.id,
                                  e.shiftKey || e.ctrlKey
                                );
                              }}
                              className={`flex flex-col justify-between rounded-lg border-2 bg-slate-950 p-3.5 transition cursor-pointer ${
                                HEIGHT_CLASS_MAP[panel.heightWeight]
                              } ${
                                isPanelSelected
                                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                                  : 'border-slate-700 hover:border-slate-500'
                              }`}
                            >
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                  <span className="font-bold text-amber-300">
                                    P{panelIdx + 1} · Tier {panel.row} ({panel.colSpan}/12)
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                                      {panel.framing}
                                    </span>
                                    {scene && (
                                      <span className="rounded bg-indigo-950/80 px-1.5 py-0.5 text-indigo-300">
                                        {scene.title}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <p className="text-xs leading-relaxed text-slate-200">
                                  {panel.visualDescription}
                                </p>
                              </div>

                              {/* Panel Text Elements (Dialogue, Captions, SFX) */}
                              <div className="mt-3 space-y-1.5">
                                {panel.textElements.map((txt) => {
                                  const isTxtSelected =
                                    selection.scope === 'text-elements' &&
                                    selection.selectedIds.includes(txt.id);
                                  const speakerName =
                                    txt.kind === 'dialogue'
                                      ? comic.storyBible.characters.find(
                                          (c) => c.id === txt.characterId
                                        )?.name ||
                                        txt.speakerName ||
                                        'Speaker'
                                      : null;

                                  return (
                                    <div
                                      key={txt.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectElement(
                                          'text-elements',
                                          txt.id,
                                          panel.id,
                                          e.shiftKey || e.ctrlKey
                                        );
                                      }}
                                      className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                                        isTxtSelected
                                          ? 'border-amber-400 bg-amber-500/20 text-white'
                                          : txt.kind === 'caption'
                                            ? 'border-amber-700/40 bg-amber-950/30 text-amber-200 italic'
                                            : txt.kind === 'sfx'
                                              ? 'border-rose-700/40 bg-rose-950/30 font-black tracking-wider text-rose-300 uppercase'
                                              : 'border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500'
                                      }`}
                                    >
                                      {txt.kind === 'dialogue' && (
                                        <span className="mr-1.5 font-bold text-amber-300">
                                          {speakerName}:
                                        </span>
                                      )}
                                      <span>{txt.text}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
        </main>

        {/* Right Dock: LLM Clipboard Bridge, Direct Inspector, and Image Prompt Studio */}
        <aside className="col-span-4 flex flex-col border-l border-slate-800 bg-slate-900/70 p-4 overflow-y-auto">
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setRightTab('refine')}
              className={`flex-1 rounded py-1.5 text-xs font-semibold ${
                rightTab === 'refine'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              LLM Bridge & Refine
            </button>
            <button
              type="button"
              onClick={() => setRightTab('inspector')}
              className={`flex-1 rounded py-1.5 text-xs font-semibold ${
                rightTab === 'inspector'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Field Inspector
            </button>
            <button
              type="button"
              onClick={() => setRightTab('image-prompts')}
              className={`flex-1 rounded py-1.5 text-xs font-semibold ${
                rightTab === 'image-prompts'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Image Prompts
            </button>
          </div>

          {rightTab === 'refine' && (
            <div className="space-y-5">
              {/* Selective Refinement Card */}
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Selected Target ({selection.scope})
                  </span>
                  <span className="text-xs text-slate-400">
                    {selection.selectedIds.length} selected
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Click any Page, Panel, or Dialogue bubble on the canvas to target it. Only the
                  selected elements are sent so you can reuse your active LLM chat window.
                </p>

                <div>
                  <label
                    htmlFor="selection-bespoke-input"
                    className="block text-xs font-semibold text-slate-300"
                  >
                    Selection Bespoke Instruction
                  </label>
                  <textarea
                    id="selection-bespoke-input"
                    aria-label="Selection Bespoke Instruction"
                    rows={3}
                    value={selectionInstruction}
                    onChange={(e) => setSelectionInstruction(e.target.value)}
                    placeholder="e.g. Split this panel into 2 panels, or make this dialogue punchier..."
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                  />
                </div>

                <button
                  type="button"
                  disabled={selection.selectedIds.length === 0}
                  onClick={handleCopySelectionPrompt}
                  className="w-full rounded bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
                >
                  Copy Selection Prompt
                </button>
              </div>

              {/* Paste & Import LLM JSON Card */}
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <label
                  htmlFor="paste-llm-json"
                  className="block text-xs font-bold uppercase tracking-wider text-emerald-400"
                >
                  Paste LLM JSON Response
                </label>
                <textarea
                  id="paste-llm-json"
                  aria-label="Paste LLM JSON Response"
                  rows={7}
                  value={rawLlmInput}
                  onChange={(e) => setRawLlmInput(e.target.value)}
                  placeholder="Paste the JSON response from your LLM here (Initiation draft or Targeted Patch Envelope)..."
                  className="w-full rounded border border-slate-700 bg-slate-900 p-2.5 font-mono text-xs text-slate-100"
                />
                {importError && <p className="text-xs text-rose-400">{importError}</p>}
                <button
                  type="button"
                  onClick={handleStageLlmJson}
                  className="w-full rounded bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  Stage & Preview JSON
                </button>
              </div>

              {lastCopiedPrompt && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-400">
                    Last Copied Clipboard Prompt
                  </span>
                  <pre className="max-h-40 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300 whitespace-pre-wrap">
                    {lastCopiedPrompt}
                  </pre>
                </div>
              )}
            </div>
          )}

          {rightTab === 'inspector' && (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Direct Element Inspector (Auto-Saves)
              </h3>

              {selectedPanel && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400">Tier (Row)</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedPanel.panel.row}
                        onChange={(e) =>
                          engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                            row: Number(e.target.value) || 1,
                          })
                        }
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400">ColSpan (1-12)</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={selectedPanel.panel.colSpan}
                        onChange={(e) =>
                          engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                            colSpan: Number(e.target.value) || 12,
                          })
                        }
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400">Height</label>
                      <select
                        value={selectedPanel.panel.heightWeight}
                        onChange={(e) =>
                          engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                            heightWeight: e.target.value as PanelHeightWeight,
                          })
                        }
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                      >
                        <option value="sm">sm</option>
                        <option value="md">md</option>
                        <option value="lg">lg</option>
                        <option value="xl">xl</option>
                        <option value="splash">splash</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400">Framing</label>
                    <select
                      value={selectedPanel.panel.framing}
                      onChange={(e) =>
                        engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                          framing: e.target.value as PanelFraming,
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                    >
                      <option value="extreme-wide">extreme-wide</option>
                      <option value="wide">wide</option>
                      <option value="medium">medium</option>
                      <option value="close-up">close-up</option>
                      <option value="extreme-close-up">extreme-close-up</option>
                      <option value="dutch-angle">dutch-angle</option>
                      <option value="birds-eye">birds-eye</option>
                      <option value="worms-eye">worms-eye</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400">Visual Description</label>
                    <textarea
                      rows={3}
                      value={selectedPanel.panel.visualDescription}
                      onChange={(e) =>
                        engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                          visualDescription: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      engine.addTextElement(selectedPanel.pageId, selectedPanel.panel.id, {
                        kind: 'dialogue',
                        characterId: comic.storyBible.characters[0]?.id ?? '',
                        text: 'New dialogue line...',
                        balloonStyle: 'speech',
                      })
                    }
                    className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300"
                  >
                    + Add Dialogue Line
                  </button>
                </div>
              )}

              {selectedTextElement && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400">Text Content</label>
                    <textarea
                      rows={3}
                      value={selectedTextElement.element.text}
                      onChange={(e) =>
                        engine.updateTextElement(
                          selectedTextElement.pageId,
                          selectedTextElement.panelId,
                          selectedTextElement.element.id,
                          { text: e.target.value } as Partial<PanelTextElement>
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-white"
                    />
                  </div>
                  {selectedTextElement.element.kind === 'dialogue' && (
                    <div>
                      <label className="block text-[11px] text-slate-400">Balloon Style</label>
                      <select
                        value={selectedTextElement.element.balloonStyle}
                        onChange={(e) =>
                          engine.updateTextElement(
                            selectedTextElement.pageId,
                            selectedTextElement.panelId,
                            selectedTextElement.element.id,
                            {
                              kind: 'dialogue',
                              balloonStyle: e.target.value as DialogueBalloonStyle,
                            }
                          )
                        }
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                      >
                        <option value="speech">speech</option>
                        <option value="thought">thought</option>
                        <option value="whisper">whisper</option>
                        <option value="shout">shout</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {!selectedPanel && !selectedTextElement && !selectedPage && (
                <p className="text-xs text-slate-400">
                  Select a Page, Panel, or Dialogue line on the canvas to edit its fields directly.
                </p>
              )}
            </div>
          )}

          {rightTab === 'image-prompts' && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Target Pages for Image Generation
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedImagePageIds(comic.pages.map((p) => p.id))}
                    className="text-xs font-semibold text-amber-300 hover:underline"
                  >
                    Select All Pages
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {comic.pages.map((p) => {
                    const checked = selectedImagePageIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSelectedImagePageIds((prev) =>
                            prev.includes(p.id)
                              ? prev.filter((id) => id !== p.id)
                              : [...prev, p.id]
                          )
                        }
                        className={`rounded px-2.5 py-1 text-xs font-semibold ${
                          checked
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        Page {p.pageNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400">
                      Multi-Page Delivery
                    </label>
                    <select
                      aria-label="Multi-Page Delivery"
                      value={deliveryMode}
                      onChange={(e) => setDeliveryMode(e.target.value as ImagePromptDeliveryMode)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="composite-spread">Composite Multi-Page Spread</option>
                      <option value="per-page">Per-Page Prompt Pack</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400">
                      Lettering Mode
                    </label>
                    <select
                      aria-label="Lettering Mode"
                      value={letteringMode}
                      onChange={(e) => setLetteringMode(e.target.value as LetteringMode)}
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    >
                      <option value="baked-in">Baked-in Lettering</option>
                      <option value="clean-art">Clean Art Only</option>
                    </select>
                  </div>
                </div>

                <input
                  aria-label="Image Bespoke Art Direction"
                  placeholder="Optional bespoke art direction..."
                  value={imageBespokeInstruction}
                  onChange={(e) => setImageBespokeInstruction(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              {compiledImagePrompts.map((item) => (
                <div
                  key={item.id}
                  className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => copyText(item.prompt, 'Image prompt')}
                      className="rounded bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400"
                    >
                      Copy Image Prompt
                    </button>
                  </div>
                  <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[11px] text-slate-300">
                    {item.prompt}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
