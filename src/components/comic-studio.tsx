'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Character,
  Comic,
  ComicStorageAdapter,
  DialogueBalloonStyle,
  ImagePromptDeliveryMode,
  LetteringMode,
  Location,
  PanelFraming,
  PanelHeightWeight,
  PanelTextElement,
  Prop,
  SearchReplaceScope,
  SelectionTarget,
  StagedDiff,
} from '@/domain/types';
import { ComicEngine, createComicEngine, groupPanelsByTier } from '@/domain/comic-engine';
import { createBrowserStorageAdapter } from '@/domain/indexeddb-storage';
import {
  downloadJsonFile,
  extractClipboardImageAsDataUrl,
  readFileAsDataUrl,
  readFileAsText,
} from './file-utils';
import { StagedDiffBanner } from './staged-diff-banner';
import { StoryBibleTab, StoryBibleView } from './story-bible-view';

export interface ComicStudioProps {
  storage?: ComicStorageAdapter;
  onCopyToClipboard?: (text: string) => Promise<void> | void;
}

type WorkspaceMode = 'initiation' | 'story-bible' | 'canvas';
type RightDockTab = 'refine' | 'inspector' | 'search-replace' | 'image-prompts';

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

  const [targetPageCount, setTargetPageCount] = useState<number>(3);
  const [panelDensity, setPanelDensity] = useState<string>('medium (4-6 panels/page)');
  const [initBespokeInstruction, setInitBespokeInstruction] = useState<string>('');

  const [selection, setSelection] = useState<SelectionTarget>({
    scope: 'pages',
    selectedIds: [],
  });
  const [selectionInstruction, setSelectionInstruction] = useState<string>('');
  const [rawLlmInput, setRawLlmInput] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const [selectedImagePageIds, setSelectedImagePageIds] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<ImagePromptDeliveryMode>('composite-spread');
  const [letteringMode, setLetteringMode] = useState<LetteringMode>('baked-in');
  const [imageBespokeInstruction, setImageBespokeInstruction] = useState<string>('');

  const [manualEditAll, setManualEditAll] = useState<boolean>(false);
  const [editingPanelIds, setEditingPanelIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [searchScope, setSearchScope] = useState<SearchReplaceScope>('all');

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
    const panelIds =
      selection.scope === 'panels' && selection.selectedIds.length > 0
        ? selection.selectedIds
        : undefined;
    return engine.buildImagePrompts({
      pageIds: targetIds,
      panelIds,
      deliveryMode,
      letteringMode,
      bespokeInstruction: imageBespokeInstruction || undefined,
    });
  }, [
    engine,
    comic,
    selectedImagePageIds,
    selection,
    deliveryMode,
    letteringMode,
    imageBespokeInstruction,
  ]);

  const searchResult = useMemo(() => {
    if (!engine || !comic) return { totalMatches: 0, items: [] };
    return engine.searchComic({
      query: searchQuery,
      useRegex,
      caseSensitive,
      scope: searchScope,
      replacement: replaceText,
    });
  }, [engine, comic, searchQuery, replaceText, useRegex, caseSensitive, searchScope]);

  const togglePanelInlineEdit = (panelId: string) => {
    setEditingPanelIds((prev) =>
      prev.includes(panelId) ? prev.filter((id) => id !== panelId) : [...prev, panelId]
    );
  };

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

  const handleNewComic = () => {
    engine.resetComic();
    setStagedDiff(null);
    setActiveCharacterId(null);
    setActiveLocationId(null);
    setActivePropId(null);
    setSelection({ scope: 'pages', selectedIds: [] });
    setSelectionInstruction('');
    setRawLlmInput('');
    setImportError(null);
    setSelectedImagePageIds([]);
    setEditingPanelIds([]);
    setManualEditAll(false);
    setStatusToast('New Comic created.');
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

  const selectedScene =
    selection.scope === 'scenes'
      ? comic.scenes.find((s) => s.id === selection.selectedIds[0])
      : undefined;

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
    <div
      className="flex h-screen flex-col bg-slate-950 text-slate-100"
      onPaste={(e) => {
        if (selectedPanel) {
          extractClipboardImageAsDataUrl(e.clipboardData, (dataUrl) => {
            engine.attachPanelImage(selectedPanel.pageId, selectedPanel.panel.id, dataUrl);
            setStatusToast('Clipboard image attached to Panel.');
          });
        } else if (selectedPage) {
          extractClipboardImageAsDataUrl(e.clipboardData, (dataUrl) => {
            engine.attachPageImage(selectedPage.id, dataUrl);
            setStatusToast('Clipboard image attached to Page.');
          });
        }
      }}
    >
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
            onClick={handleNewComic}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
          >
            New Comic
          </button>
          <button
            type="button"
            onClick={() => {
              const json = engine.exportComicJson();
              downloadJsonFile(`${comic.title.toLowerCase().replace(/\s+/g, '-') || 'comic'}.json`, json);
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
                readFileAsText(file, (content) => {
                  try {
                    engine.importComicJson(content);
                    setStatusToast('Comic JSON imported.');
                  } catch (err) {
                    setImportError(err instanceof Error ? err.message : 'Invalid Comic JSON');
                  }
                });
              }}
            />
          </label>
        </div>
      </header>

      {stagedDiff && (
        <StagedDiffBanner
          comic={comic}
          stagedDiff={stagedDiff}
          onAccept={handleApplyStagedDiff}
          onDiscard={handleDiscardStagedDiff}
        />
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
                onClick={() => {
                  const s = engine.upsertScene({
                    title: `Scene ${comic.scenes.length + 1}`,
                    summary: '',
                    dramaticBeat: '',
                    participatingCharacterIds: [],
                  });
                  handleSelectElement('scenes', s.id);
                  setRightTab('inspector');
                }}
                className="text-amber-400 hover:text-amber-300"
              >
                + Scene
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {comic.scenes.map((scene) => {
                const isSceneSelected =
                  selection.scope === 'scenes' && selection.selectedIds.includes(scene.id);
                return (
                  <li key={scene.id}>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectElement('scenes', scene.id);
                        setRightTab('inspector');
                      }}
                      className={`w-full rounded border px-2 py-1.5 text-left ${
                        isSceneSelected
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-medium text-amber-200">{scene.title}</div>
                      {scene.summary && (
                        <div className="truncate text-[11px] text-slate-400">{scene.summary}</div>
                      )}
                    </button>
                  </li>
                );
              })}
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
                  Paste or upload your Manuscript below. Click &ldquo;Copy Initiation Prompt&rdquo;
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
                        readFileAsText(file, (content) => engine.updateManuscript(content));
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
                  placeholder="Paste your story manuscript, scene outline, or prose here..."
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
            <StoryBibleView
              comic={comic}
              engine={engine}
              bibleTab={bibleTab}
              setBibleTab={setBibleTab}
              activeCharacter={activeCharacter}
              setActiveCharacterId={setActiveCharacterId}
              activeLocation={activeLocation}
              setActiveLocationId={setActiveLocationId}
              activeProp={activeProp}
              setActivePropId={setActivePropId}
              onSelectElement={handleSelectElement}
              onAddCharacter={handleAddCharacter}
              onAddLocation={handleAddLocation}
              onAddProp={handleAddProp}
            />
          )}

          {mode === 'canvas' && (
            <div className="space-y-6">
              {/* Canvas Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="font-semibold text-white">Comic Canvas</span>
                  <span className="text-slate-500">·</span>
                  <span>
                    {comic.pages.length} Page(s) ·{' '}
                    {comic.pages.reduce((acc, p) => acc + p.panels.length, 0)} Panel(s)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label="Edit All Panels & Speech"
                    onClick={() => setManualEditAll((prev) => !prev)}
                    className={`rounded border px-3 py-1 text-xs font-semibold transition ${
                      manualEditAll
                        ? 'border-amber-400 bg-amber-500 text-slate-950'
                        : 'border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700'
                    }`}
                  >
                    {manualEditAll
                      ? '✓ Editing All Panels & Speech'
                      : 'Edit All Panels & Speech'}
                  </button>
                </div>
              </div>

              {comic.pages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
                  <p className="text-sm text-slate-300">
                    No comic Pages yet. Start in <strong>Initiation & Manuscript</strong> to
                    generate a draft from your Manuscript, or click <strong>+ Page</strong> in the
                    left sidebar.
                  </p>
                </div>
              ) : (
                comic.pages.map((page) => {
                  const isPageSelected =
                    selection.scope === 'pages' && selection.selectedIds.includes(page.id);
                  const tiers = groupPanelsByTier(page.panels);
                  const sortedTierRows = Array.from(tiers.keys()).sort((a, b) => a - b);

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
                                readFileAsDataUrl(file, (dataUrl) =>
                                  engine.attachPageImage(page.id, dataUrl)
                                );
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
                          <button
                            type="button"
                            aria-label={`Delete Page ${page.pageNumber}`}
                            onClick={() => engine.deletePage(page.id)}
                            className="rounded border border-rose-800/60 bg-rose-950/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/50"
                          >
                            Delete Page
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
                      <div className="space-y-3">
                        {sortedTierRows.map((rowNum) => {
                          const rowPanels = tiers.get(rowNum) ?? [];
                          return (
                            <div key={rowNum} className="grid grid-cols-12 gap-3">
                              {rowPanels.map((panel) => {
                                const panelIndexOnPage = page.panels.findIndex(
                                  (p) => p.id === panel.id
                                );
                                const panelNum = panelIndexOnPage + 1;
                                const isPanelSelected =
                                  selection.scope === 'panels' &&
                                  selection.selectedIds.includes(panel.id);
                                const isInlineEditing =
                                  manualEditAll || editingPanelIds.includes(panel.id);
                                const scene = comic.scenes.find((s) => s.id === panel.sceneId);
                                const panelLocation = comic.storyBible.locations.find(
                                  (l) => l.id === panel.locationId
                                );
                                const panelCharacters = comic.storyBible.characters.filter((c) =>
                                  panel.characterIds.includes(c.id)
                                );
                                const panelProps = comic.storyBible.props.filter((pr) =>
                                  panel.propIds.includes(pr.id)
                                );

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
                                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-bold text-amber-300">
                                            Tier {panel.row} ({panel.colSpan}/12 · {panel.heightWeight})
                                          </span>

                                          {/* Direct Panel Width Adjuster */}
                                          <div
                                            className="flex items-center gap-0.5 rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              aria-label={`Decrease Panel ${panelNum} Width`}
                                              title="Decrease Panel Width"
                                              onClick={() =>
                                                engine.resizePanel(
                                                  page.id,
                                                  panel.id,
                                                  panel.colSpan - 1
                                                )
                                              }
                                              className="px-1 font-bold text-slate-300 hover:text-amber-300"
                                            >
                                              −
                                            </button>
                                            <select
                                              aria-label={`Panel ${panelNum} Width`}
                                              value={panel.colSpan}
                                              onChange={(e) =>
                                                engine.resizePanel(
                                                  page.id,
                                                  panel.id,
                                                  Number(e.target.value)
                                                )
                                              }
                                              className="bg-transparent text-[10px] font-semibold text-amber-200 focus:outline-none"
                                            >
                                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => (
                                                <option
                                                  key={w}
                                                  value={w}
                                                  className="bg-slate-900 text-white"
                                                >
                                                  {w}/12
                                                </option>
                                              ))}
                                            </select>
                                            <button
                                              type="button"
                                              aria-label={`Increase Panel ${panelNum} Width`}
                                              title="Increase Panel Width"
                                              onClick={() =>
                                                engine.resizePanel(
                                                  page.id,
                                                  panel.id,
                                                  panel.colSpan + 1
                                                )
                                              }
                                              className="px-1 font-bold text-slate-300 hover:text-amber-300"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </div>

                                        <div
                                          className="flex flex-wrap items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                                            {panel.framing}
                                          </span>
                                          {scene && (
                                            <span className="rounded bg-indigo-950/80 px-1.5 py-0.5 text-indigo-300">
                                              {scene.title}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            aria-label={`Split Panel ${panelNum}`}
                                            title="Split Panel in Tier"
                                            onClick={() => engine.splitPanel(page.id, panel.id)}
                                            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-slate-800"
                                          >
                                            + Split
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Edit Panel ${panelNum}`}
                                            onClick={() => togglePanelInlineEdit(panel.id)}
                                            className={`rounded border px-1.5 py-0.5 text-[10px] ${
                                              isInlineEditing
                                                ? 'border-amber-400 bg-amber-500 text-slate-950 font-semibold'
                                                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                                            }`}
                                          >
                                            {isInlineEditing ? 'Done' : 'Edit'}
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Delete Panel ${panelNum}`}
                                            onClick={() => engine.deletePanel(page.id, panel.id)}
                                            className="rounded border border-rose-800/50 bg-rose-950/40 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-900/50"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      </div>

                                      {/* Participating Asset Pills */}
                                      {(panelLocation ||
                                        panelCharacters.length > 0 ||
                                        panelProps.length > 0) && (
                                        <div className="flex flex-wrap gap-1 text-[10px]">
                                          {panelLocation && (
                                            <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-emerald-300">
                                              📍 {panelLocation.name}
                                            </span>
                                          )}
                                          {panelCharacters.map((c) => (
                                            <span
                                              key={c.id}
                                              className="rounded bg-amber-950/80 px-1.5 py-0.5 text-amber-200"
                                            >
                                              👤 {c.name}
                                            </span>
                                          ))}
                                          {panelProps.map((pr) => (
                                            <span
                                              key={pr.id}
                                              className="rounded bg-sky-950/80 px-1.5 py-0.5 text-sky-200"
                                            >
                                              ⚙️ {pr.name}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {panel.renderedImageDataUrl && (
                                        <img
                                          src={panel.renderedImageDataUrl}
                                          alt="Rendered Panel"
                                          className="max-h-48 w-full rounded border border-slate-800 object-contain bg-black"
                                        />
                                      )}

                                      {isInlineEditing ? (
                                        <div
                                          className="space-y-2 rounded border border-slate-800 bg-slate-900/80 p-2 text-xs"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="grid grid-cols-3 gap-1.5">
                                            <div>
                                              <label className="block text-[10px] text-slate-400">
                                                Tier (Row)
                                              </label>
                                              <input
                                                aria-label={`Page ${page.pageNumber} Panel ${panelNum} Tier`}
                                                type="number"
                                                min={1}
                                                value={panel.row}
                                                onChange={(e) =>
                                                  engine.updatePanel(page.id, panel.id, {
                                                    row: Number(e.target.value) || 1,
                                                  })
                                                }
                                                className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-white"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] text-slate-400">
                                                Height
                                              </label>
                                              <select
                                                aria-label={`Page ${page.pageNumber} Panel ${panelNum} Height`}
                                                value={panel.heightWeight}
                                                onChange={(e) =>
                                                  engine.updatePanel(page.id, panel.id, {
                                                    heightWeight:
                                                      e.target.value as PanelHeightWeight,
                                                  })
                                                }
                                                className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-white"
                                              >
                                                <option value="sm">sm</option>
                                                <option value="md">md</option>
                                                <option value="lg">lg</option>
                                                <option value="xl">xl</option>
                                                <option value="splash">splash</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label className="block text-[10px] text-slate-400">
                                                Framing
                                              </label>
                                              <select
                                                aria-label={`Page ${page.pageNumber} Panel ${panelNum} Framing`}
                                                value={panel.framing}
                                                onChange={(e) =>
                                                  engine.updatePanel(page.id, panel.id, {
                                                    framing: e.target.value as PanelFraming,
                                                  })
                                                }
                                                className="w-full rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-white"
                                              >
                                                <option value="extreme-wide">extreme-wide</option>
                                                <option value="wide">wide</option>
                                                <option value="medium">medium</option>
                                                <option value="close-up">close-up</option>
                                                <option value="extreme-close-up">
                                                  extreme-close-up
                                                </option>
                                                <option value="dutch-angle">dutch-angle</option>
                                                <option value="birds-eye">birds-eye</option>
                                                <option value="worms-eye">worms-eye</option>
                                              </select>
                                            </div>
                                          </div>
                                          <div>
                                            <label className="block text-[10px] text-slate-400">
                                              Visual Description
                                            </label>
                                            <textarea
                                              aria-label={`Page ${page.pageNumber} Panel ${panelNum} Visual Description`}
                                              rows={2}
                                              value={panel.visualDescription}
                                              onChange={(e) =>
                                                engine.updatePanel(page.id, panel.id, {
                                                  visualDescription: e.target.value,
                                                })
                                              }
                                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-xs text-white"
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-xs leading-relaxed text-slate-200">
                                          {panel.visualDescription}
                                        </p>
                                      )}
                                    </div>

                                    {/* Panel Text Elements (Dialogue, Captions, SFX) */}
                                    <div className="mt-3 space-y-1.5">
                                      {panel.textElements.map((txt, txtIdx) => {
                                        const speechNum = txtIdx + 1;
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

                                        if (isInlineEditing) {
                                          return (
                                            <div
                                              key={txt.id}
                                              onClick={(e) => e.stopPropagation()}
                                              className="space-y-1.5 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs"
                                            >
                                              <div className="flex flex-wrap items-center justify-between gap-1">
                                                <select
                                                  aria-label={`Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum} Kind`}
                                                  value={txt.kind}
                                                  onChange={(e) =>
                                                    engine.updateTextElement(
                                                      page.id,
                                                      panel.id,
                                                      txt.id,
                                                      {
                                                        kind: e.target
                                                          .value as PanelTextElement['kind'],
                                                      }
                                                    )
                                                  }
                                                  className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300"
                                                >
                                                  <option value="dialogue">Dialogue</option>
                                                  <option value="caption">Caption</option>
                                                  <option value="sfx">SFX</option>
                                                </select>

                                                {txt.kind === 'dialogue' && (
                                                  <>
                                                    <select
                                                      aria-label={`Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum} Speaker`}
                                                      value={txt.characterId}
                                                      onChange={(e) =>
                                                        engine.updateTextElement(
                                                          page.id,
                                                          panel.id,
                                                          txt.id,
                                                          {
                                                            kind: 'dialogue',
                                                            characterId: e.target.value,
                                                          }
                                                        )
                                                      }
                                                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-white"
                                                    >
                                                      <option value="">Custom Speaker</option>
                                                      {comic.storyBible.characters.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                          {c.name}
                                                        </option>
                                                      ))}
                                                    </select>
                                                    <input
                                                      aria-label={`Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum} Speaker Name`}
                                                      placeholder="Speaker name..."
                                                      value={txt.speakerName ?? ''}
                                                      onChange={(e) =>
                                                        engine.updateTextElement(
                                                          page.id,
                                                          panel.id,
                                                          txt.id,
                                                          {
                                                            kind: 'dialogue',
                                                            speakerName: e.target.value,
                                                          }
                                                        )
                                                      }
                                                      className="w-28 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-white"
                                                    />
                                                    <select
                                                      aria-label={`Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum} Balloon Style`}
                                                      value={txt.balloonStyle}
                                                      onChange={(e) =>
                                                        engine.updateTextElement(
                                                          page.id,
                                                          panel.id,
                                                          txt.id,
                                                          {
                                                            kind: 'dialogue',
                                                            balloonStyle: e.target
                                                              .value as DialogueBalloonStyle,
                                                          }
                                                        )
                                                      }
                                                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-200"
                                                    >
                                                      <option value="speech">speech</option>
                                                      <option value="thought">thought</option>
                                                      <option value="whisper">whisper</option>
                                                      <option value="shout">shout</option>
                                                    </select>
                                                  </>
                                                )}

                                                <div className="flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    aria-label={`Move Speech ${speechNum} Up`}
                                                    onClick={() =>
                                                      engine.moveTextElement(
                                                        page.id,
                                                        panel.id,
                                                        txt.id,
                                                        'up'
                                                      )
                                                    }
                                                    className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                                                  >
                                                    ↑
                                                  </button>
                                                  <button
                                                    type="button"
                                                    aria-label={`Move Speech ${speechNum} Down`}
                                                    onClick={() =>
                                                      engine.moveTextElement(
                                                        page.id,
                                                        panel.id,
                                                        txt.id,
                                                        'down'
                                                      )
                                                    }
                                                    className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                                                  >
                                                    ↓
                                                  </button>
                                                  <button
                                                    type="button"
                                                    aria-label={`Delete Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum}`}
                                                    onClick={() =>
                                                      engine.deleteTextElement(
                                                        page.id,
                                                        panel.id,
                                                        txt.id
                                                      )
                                                    }
                                                    className="rounded border border-rose-800/50 bg-rose-950/40 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-900/50"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                              </div>

                                              <input
                                                aria-label={`Page ${page.pageNumber} Panel ${panelNum} Speech ${speechNum} Text`}
                                                value={txt.text}
                                                onChange={(e) =>
                                                  engine.updateTextElement(
                                                    page.id,
                                                    panel.id,
                                                    txt.id,
                                                    { text: e.target.value }
                                                  )
                                                }
                                                placeholder="Enter speech, caption, or SFX text..."
                                                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                                              />
                                            </div>
                                          );
                                        }

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

                                      {/* Quick Add Speech Controls on Every Panel */}
                                      <div
                                        className="flex flex-wrap gap-1 pt-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          aria-label={`Add Dialogue to Panel ${panelNum}`}
                                          onClick={() => {
                                            engine.addTextElement(page.id, panel.id, {
                                              kind: 'dialogue',
                                              characterId:
                                                comic.storyBible.characters[0]?.id ?? '',
                                              text: 'New dialogue line...',
                                              balloonStyle: 'speech',
                                            });
                                            if (!manualEditAll && !editingPanelIds.includes(panel.id)) {
                                              setEditingPanelIds((prev) => [...prev, panel.id]);
                                            }
                                          }}
                                          className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/20"
                                        >
                                          + Dialogue
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Add Caption to Panel ${panelNum}`}
                                          onClick={() => {
                                            engine.addTextElement(page.id, panel.id, {
                                              kind: 'caption',
                                              text: 'Narrative caption...',
                                            });
                                            if (!manualEditAll && !editingPanelIds.includes(panel.id)) {
                                              setEditingPanelIds((prev) => [...prev, panel.id]);
                                            }
                                          }}
                                          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                                        >
                                          + Caption
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Add SFX to Panel ${panelNum}`}
                                          onClick={() => {
                                            engine.addTextElement(page.id, panel.id, {
                                              kind: 'sfx',
                                              text: 'KRAK-BOOM!',
                                            });
                                            if (!manualEditAll && !editingPanelIds.includes(panel.id)) {
                                              setEditingPanelIds((prev) => [...prev, panel.id]);
                                            }
                                          }}
                                          className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20"
                                        >
                                          + SFX
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
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

        {/* Right Dock: LLM Clipboard Bridge, Direct Inspector, Search & Replace, and Image Prompt Studio */}
        <aside className="col-span-4 flex flex-col border-l border-slate-800 bg-slate-900/70 p-4 overflow-y-auto">
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setRightTab('refine')}
              className={`flex-1 rounded py-1.5 px-2 text-xs font-semibold ${
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
              className={`flex-1 rounded py-1.5 px-2 text-xs font-semibold ${
                rightTab === 'inspector'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Field Inspector
            </button>
            <button
              type="button"
              onClick={() => setRightTab('search-replace')}
              className={`flex-1 rounded py-1.5 px-2 text-xs font-semibold ${
                rightTab === 'search-replace'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Search & Replace
            </button>
            <button
              type="button"
              onClick={() => setRightTab('image-prompts')}
              className={`flex-1 rounded py-1.5 px-2 text-xs font-semibold ${
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
                  Click any Page, Panel, or Dialogue balloon on the canvas to target it. Only the
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
            </div>
          )}

          {rightTab === 'inspector' && (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Direct Element Inspector (Auto-Saves)
              </h3>

              {selectedScene && (
                <div className="space-y-3 text-xs">
                  <input
                    aria-label="Scene Title"
                    placeholder="Scene Title"
                    value={selectedScene.title}
                    onChange={(e) =>
                      engine.upsertScene({ ...selectedScene, title: e.target.value })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
                  />
                  <textarea
                    aria-label="Scene Summary"
                    placeholder="Scene Summary"
                    rows={2}
                    value={selectedScene.summary}
                    onChange={(e) =>
                      engine.upsertScene({ ...selectedScene, summary: e.target.value })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-white"
                  />
                  <input
                    aria-label="Scene Dramatic Beat"
                    placeholder="Dramatic Beat"
                    value={selectedScene.dramaticBeat}
                    onChange={(e) =>
                      engine.upsertScene({ ...selectedScene, dramaticBeat: e.target.value })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
                  />
                  <select
                    aria-label="Scene Location"
                    value={selectedScene.locationId ?? ''}
                    onChange={(e) =>
                      engine.upsertScene({
                        ...selectedScene,
                        locationId: e.target.value || undefined,
                      })
                    }
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white"
                  >
                    <option value="">No Location Linked</option>
                    {comic.storyBible.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                        aria-label="Selected Panel Width"
                        type="number"
                        min={1}
                        max={12}
                        value={selectedPanel.panel.colSpan}
                        onChange={(e) =>
                          engine.resizePanel(
                            selectedPanel.pageId,
                            selectedPanel.panel.id,
                            Number(e.target.value) || 12
                          )
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

                  <button
                    type="button"
                    onClick={() => engine.normalizePage(selectedPanel.pageId)}
                    className="w-full rounded border border-slate-700 bg-slate-900 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    Normalize Page Tiers to 12 Columns
                  </button>

                  <div className="grid grid-cols-2 gap-2">
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
                      <label className="block text-[11px] text-slate-400">Scene</label>
                      <select
                        aria-label="Panel Scene"
                        value={selectedPanel.panel.sceneId}
                        onChange={(e) =>
                          engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                            sceneId: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                      >
                        {comic.scenes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400">Location</label>
                    <select
                      aria-label="Panel Location"
                      value={selectedPanel.panel.locationId ?? ''}
                      onChange={(e) =>
                        engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                          locationId: e.target.value || undefined,
                        })
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                    >
                      <option value="">None</option>
                      {comic.storyBible.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400">
                      Participating Characters
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {comic.storyBible.characters.map((c) => {
                        const active = selectedPanel.panel.characterIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              const nextIds = active
                                ? selectedPanel.panel.characterIds.filter((id) => id !== c.id)
                                : [...selectedPanel.panel.characterIds, c.id];
                              engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                                characterIds: nextIds,
                              });
                            }}
                            className={`rounded px-2 py-0.5 text-[11px] ${
                              active
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400">Participating Props</label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {comic.storyBible.props.map((pr) => {
                        const active = selectedPanel.panel.propIds.includes(pr.id);
                        return (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => {
                              const nextIds = active
                                ? selectedPanel.panel.propIds.filter((id) => id !== pr.id)
                                : [...selectedPanel.panel.propIds, pr.id];
                              engine.updatePanel(selectedPanel.pageId, selectedPanel.panel.id, {
                                propIds: nextIds,
                              });
                            }}
                            className={`rounded px-2 py-0.5 text-[11px] ${
                              active
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {pr.name}
                          </button>
                        );
                      })}
                    </div>
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

                  <div className="flex flex-wrap gap-1.5">
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
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300"
                    >
                      + Dialogue
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        engine.addTextElement(selectedPanel.pageId, selectedPanel.panel.id, {
                          kind: 'caption',
                          text: 'Narrative caption...',
                        })
                      }
                      className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200"
                    >
                      + Caption
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        engine.addTextElement(selectedPanel.pageId, selectedPanel.panel.id, {
                          kind: 'sfx',
                          text: 'KRAK-BOOM!',
                        })
                      }
                      className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300"
                    >
                      + SFX
                    </button>
                    <label className="cursor-pointer rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                      Attach Panel Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          readFileAsDataUrl(file, (dataUrl) =>
                            engine.attachPanelImage(
                              selectedPanel.pageId,
                              selectedPanel.panel.id,
                              dataUrl
                            )
                          );
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {selectedTextElement && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400">Element Kind</label>
                    <select
                      aria-label="Speech Element Kind"
                      value={selectedTextElement.element.kind}
                      onChange={(e) =>
                        engine.updateTextElement(
                          selectedTextElement.pageId,
                          selectedTextElement.panelId,
                          selectedTextElement.element.id,
                          { kind: e.target.value as PanelTextElement['kind'] }
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                    >
                      <option value="dialogue">Dialogue</option>
                      <option value="caption">Caption</option>
                      <option value="sfx">SFX</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400">Text Content</label>
                    <textarea
                      aria-label="Speech Text Content"
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
                    <>
                      <div>
                        <label className="block text-[11px] text-slate-400">Speaker</label>
                        <select
                          aria-label="Dialogue Speaker"
                          value={selectedTextElement.element.characterId}
                          onChange={(e) =>
                            engine.updateTextElement(
                              selectedTextElement.pageId,
                              selectedTextElement.panelId,
                              selectedTextElement.element.id,
                              {
                                kind: 'dialogue',
                                characterId: e.target.value,
                              }
                            )
                          }
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                        >
                          <option value="">Select Speaker</option>
                          {comic.storyBible.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">
                          Custom Speaker Name
                        </label>
                        <input
                          aria-label="Dialogue Custom Speaker Name"
                          placeholder="Optional custom speaker label..."
                          value={selectedTextElement.element.speakerName ?? ''}
                          onChange={(e) =>
                            engine.updateTextElement(
                              selectedTextElement.pageId,
                              selectedTextElement.panelId,
                              selectedTextElement.element.id,
                              {
                                kind: 'dialogue',
                                speakerName: e.target.value,
                              }
                            )
                          }
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Balloon Style</label>
                        <select
                          aria-label="Dialogue Balloon Style"
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
                    </>
                  )}
                  <button
                    type="button"
                    aria-label="Delete Selected Speech Element"
                    onClick={() =>
                      engine.deleteTextElement(
                        selectedTextElement.pageId,
                        selectedTextElement.panelId,
                        selectedTextElement.element.id
                      )
                    }
                    className="w-full rounded border border-rose-800/60 bg-rose-950/40 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/50"
                  >
                    Delete Speech Element
                  </button>
                </div>
              )}

              {!selectedScene && !selectedPanel && !selectedTextElement && !selectedPage && (
                <p className="text-xs text-slate-400">
                  Select a Scene, Page, Panel, or Dialogue element to edit its fields directly, or
                  click &ldquo;Edit All Panels &amp; Speech&rdquo; on the canvas.
                </p>
              )}
            </div>
          )}

          {rightTab === 'search-replace' && (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Search &amp; Replace (String / Regex)
                </h3>
                <span className="text-[11px] text-slate-400">
                  {searchResult.totalMatches} match(es)
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label htmlFor="search-query-input" className="block text-[11px] text-slate-300">
                    Search Query
                  </label>
                  <input
                    id="search-query-input"
                    aria-label="Search Query"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      useRegex
                        ? 'Regex pattern (e.g. Chrono-Core v(\\d+))...'
                        : 'Search text...'
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="replace-with-input" className="block text-[11px] text-slate-300">
                    Replace With
                  </label>
                  <input
                    id="replace-with-input"
                    aria-label="Replace With"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder={
                      useRegex
                        ? 'Replacement (supports $1, $2 capture groups)...'
                        : 'Replacement text...'
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                    <input
                      type="checkbox"
                      aria-label="Use Regex"
                      checked={useRegex}
                      onChange={(e) => setUseRegex(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-amber-500"
                    />
                    <span>Use Regex (.*)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                    <input
                      type="checkbox"
                      aria-label="Case Sensitive"
                      checked={caseSensitive}
                      onChange={(e) => setCaseSensitive(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-amber-500"
                    />
                    <span>Case Sensitive (Aa)</span>
                  </label>
                </div>

                <div>
                  <label htmlFor="search-scope-select" className="block text-[11px] text-slate-300">
                    Search Scope
                  </label>
                  <select
                    id="search-scope-select"
                    aria-label="Search Scope"
                    value={searchScope}
                    onChange={(e) => setSearchScope(e.target.value as SearchReplaceScope)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="all">All Comic Fields</option>
                    <option value="panels-and-speech">Panels &amp; Speech Only</option>
                    <option value="speech">Speech (Dialogue, Captions, SFX) Only</option>
                    <option value="panels">Panel Visual Descriptions Only</option>
                    <option value="story-bible">Story Bible Only</option>
                    <option value="scenes">Scenes Only</option>
                    <option value="manuscript">Manuscript &amp; Metadata Only</option>
                  </select>
                </div>

                {searchResult.error && (
                  <p className="rounded border border-rose-800/60 bg-rose-950/50 p-2 text-xs text-rose-300">
                    Invalid Regex: {searchResult.error}
                  </p>
                )}

                <button
                  type="button"
                  aria-label="Replace All Matches"
                  disabled={!searchQuery || searchResult.totalMatches === 0 || !!searchResult.error}
                  onClick={() => {
                    const res = engine.replaceInComic({
                      query: searchQuery,
                      replacement: replaceText,
                      useRegex,
                      caseSensitive,
                      scope: searchScope,
                    });
                    setStatusToast(
                      `Replaced ${res.replacedCount} occurrence(s) across ${res.affectedFields} field(s).`
                    );
                  }}
                  className="w-full rounded bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
                >
                  Replace All Matches ({searchResult.totalMatches})
                </button>
              </div>

              {/* Match Results Preview List */}
              {searchResult.items.length > 0 && (
                <div className="max-h-96 space-y-2 overflow-y-auto pt-2">
                  {searchResult.items.map((item) => (
                    <div
                      key={item.id}
                      className="space-y-1.5 rounded border border-slate-800 bg-slate-900/90 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-amber-300">
                          {item.locationLabel} · {item.fieldLabel}
                        </span>
                        <button
                          type="button"
                          aria-label={`Replace in ${item.locationLabel} ${item.fieldLabel}`}
                          onClick={() => {
                            const res = engine.replaceInComic({
                              query: searchQuery,
                              replacement: replaceText,
                              useRegex,
                              caseSensitive,
                              scope: searchScope,
                              targetItemIds: [item.id],
                            });
                            setStatusToast(`Replaced ${res.replacedCount} match(es).`);
                          }}
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                        >
                          Replace ({item.matchCount})
                        </button>
                      </div>
                      <div className="rounded bg-slate-950 p-1.5 font-mono text-[11px] text-slate-300">
                        {item.sourceText}
                      </div>
                      {item.previewAfter !== undefined && item.previewAfter !== item.sourceText && (
                        <div className="rounded border border-emerald-800/40 bg-emerald-950/30 p-1.5 font-mono text-[11px] text-emerald-300">
                          → {item.previewAfter}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
