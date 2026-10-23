import {
  Character,
  Comic,
  ComicStorageAdapter,
  CompiledImagePrompt,
  ImagePromptOptions,
  InitiationPromptOptions,
  LetteringMode,
  Location,
  Page,
  Panel,
  PanelTextElement,
  Prop,
  ProposedAssets,
  Scene,
  SelectionTarget,
  StagedDiff,
  TargetedPatchScope,
  VisualStyle,
} from './types';

function createId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${random}`;
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((existing) => existing.id === item.id);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.push(item);
  }
  return list;
}

export function groupPanelsByTier(
  panels: Panel[],
  panelFilterIds?: Set<string>
): Map<number, Panel[]> {
  const tiers = new Map<number, Panel[]>();
  for (const panel of panels) {
    if (panelFilterIds && panelFilterIds.size > 0 && !panelFilterIds.has(panel.id)) {
      continue;
    }
    const list = tiers.get(panel.row) ?? [];
    list.push(panel);
    tiers.set(panel.row, list);
  }
  return tiers;
}

export function createDefaultComic(): Comic {
  return {
    id: createId('comic'),
    title: 'Untitled Comic',
    synopsis: '',
    manuscript: '',
    storyBible: {
      visualStyle: {
        artTradition: '',
        lineAndInking: '',
        colorPaletteAndShading: '',
        eraAndTone: '',
        negativePrompt: '',
      },
      characters: [],
      locations: [],
      props: [],
    },
    scenes: [],
    pages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createInMemoryStorageAdapter(initial?: Comic | null): ComicStorageAdapter {
  let saved: Comic | null = initial ? structuredClone(initial) : null;
  return {
    async load() {
      return saved ? structuredClone(saved) : null;
    },
    async save(comic: Comic) {
      saved = structuredClone(comic);
    },
  };
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(slice) as Record<string, unknown>;
    }
    throw new Error('Could not extract valid JSON object from LLM response.');
  }
}

function normalizeTextElement(el: Partial<PanelTextElement>): PanelTextElement {
  const id = el.id || createId(el.kind || 'txt');
  if (el.kind === 'dialogue') {
    return {
      id,
      kind: 'dialogue',
      characterId: el.characterId || '',
      speakerName: el.speakerName,
      text: el.text || '',
      balloonStyle: el.balloonStyle || 'speech',
    };
  }
  if (el.kind === 'sfx') {
    return {
      id,
      kind: 'sfx',
      text: el.text || '',
      visualStyle: el.visualStyle,
    };
  }
  return {
    id,
    kind: 'caption',
    text: el.text || '',
  };
}

function normalizePanel(raw: Partial<Panel>, fallbackSceneId: string): Panel {
  const textElements: PanelTextElement[] = (raw.textElements ?? []).map((el) =>
    normalizeTextElement(el)
  );

  return {
    id: raw.id || createId('panel'),
    sceneId: raw.sceneId || fallbackSceneId,
    row: typeof raw.row === 'number' && raw.row >= 1 ? Math.round(raw.row) : 1,
    colSpan: typeof raw.colSpan === 'number' && raw.colSpan >= 1 ? Math.round(raw.colSpan) : 12,
    heightWeight: raw.heightWeight || 'md',
    framing: raw.framing || 'medium',
    visualDescription: raw.visualDescription || '',
    characterIds: Array.isArray(raw.characterIds) ? raw.characterIds : [],
    locationId: raw.locationId,
    propIds: Array.isArray(raw.propIds) ? raw.propIds : [],
    textElements,
    renderedImageDataUrl: raw.renderedImageDataUrl,
  };
}

function normalizePageTiers(page: Page, warnings: string[]): Page {
  const tiers = groupPanelsByTier(page.panels);

  for (const [rowNum, rowPanels] of tiers.entries()) {
    const sum = rowPanels.reduce((acc, p) => acc + p.colSpan, 0);
    if (sum !== 12 && rowPanels.length > 0) {
      warnings.push(
        `Page ${page.pageNumber} Tier ${rowNum} had colSpan sum ${sum}; auto-normalized to 12.`
      );
      let remaining = 12;
      rowPanels.forEach((panel, index) => {
        if (index === rowPanels.length - 1) {
          panel.colSpan = Math.max(1, remaining);
        } else {
          const scaled = Math.max(1, Math.round((panel.colSpan / sum) * 12));
          const maxAllowed = Math.max(1, remaining - (rowPanels.length - 1 - index));
          panel.colSpan = Math.min(scaled, maxAllowed);
          remaining -= panel.colSpan;
        }
      });
    }
  }

  page.panels.sort((a, b) => a.row - b.row);
  return page;
}

function normalizeProposedAssets(rawProposed: unknown): ProposedAssets {
  const raw = (rawProposed ?? {}) as {
    characters?: Partial<Character>[];
    locations?: Partial<Location>[];
    props?: Partial<Prop>[];
  };

  return {
    characters: (raw.characters ?? []).map((c) => ({
      id: c.id || createId('char'),
      name: c.name || 'Unnamed Character',
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      role: c.role || 'supporting',
      appearance: {
        ageAndBuild: c.appearance?.ageAndBuild || '',
        facialFeaturesAndHair: c.appearance?.facialFeaturesAndHair || '',
        signatureOutfitAndColors: c.appearance?.signatureOutfitAndColors || '',
        distinguishingMarks: c.appearance?.distinguishingMarks || '',
        visualPromptTag: c.appearance?.visualPromptTag || c.name || '',
      },
      personality: {
        coreTraits: Array.isArray(c.personality?.coreTraits) ? c.personality.coreTraits : [],
        voiceAndSpeechStyle: c.personality?.voiceAndSpeechStyle || '',
        quirksAndMannerisms: c.personality?.quirksAndMannerisms || '',
      },
      motivation: {
        primaryGoal: c.motivation?.primaryGoal || '',
        coreFearOrConflict: c.motivation?.coreFearOrConflict || '',
        moralAlignmentOrCode: c.motivation?.moralAlignmentOrCode || '',
      },
      background: {
        summary: c.background?.summary || '',
        relationships: Array.isArray(c.background?.relationships)
          ? c.background.relationships
          : [],
      },
    })),
    locations: (raw.locations ?? []).map((l) => ({
      id: l.id || createId('loc'),
      name: l.name || 'Unnamed Location',
      type: l.type || 'exterior',
      architectureAndScale: l.architectureAndScale || '',
      lightingAndAtmosphere: l.lightingAndAtmosphere || '',
      keyVisualLandmarks: Array.isArray(l.keyVisualLandmarks) ? l.keyVisualLandmarks : [],
      loreAndContext: l.loreAndContext || '',
      visualPromptTag: l.visualPromptTag || l.name || '',
    })),
    props: (raw.props ?? []).map((pr) => ({
      id: pr.id || createId('prop'),
      name: pr.name || 'Unnamed Prop',
      category: pr.category || 'general',
      visualDescription: pr.visualDescription || '',
      narrativePurpose: pr.narrativePurpose || '',
      ownerCharacterId: pr.ownerCharacterId,
      visualPromptTag: pr.visualPromptTag || pr.name || '',
    })),
  };
}

function spliceSelectedSlice<T extends { id: string }>(
  list: T[],
  selectedIds: string[],
  replacements: T[]
): T[] {
  const selectedSet = new Set(selectedIds);
  const firstIdx = list.findIndex((item) => selectedSet.has(item.id));
  if (firstIdx === -1) {
    return [...list, ...replacements];
  }
  const result: T[] = [];
  let inserted = false;
  for (const item of list) {
    if (selectedSet.has(item.id)) {
      if (!inserted) {
        result.push(...replacements);
        inserted = true;
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

export interface ComicEngineOptions {
  storage?: ComicStorageAdapter;
  onChange?: (comic: Comic) => void;
}

export type UpsertCharacterInput = Omit<Character, 'id'> & { id?: string };
export type UpsertLocationInput = Omit<Location, 'id'> & { id?: string };
export type UpsertPropInput = Omit<Prop, 'id'> & { id?: string };
export type UpsertSceneInput = Omit<Scene, 'id'> & { id?: string };

export async function createComicEngine(options: ComicEngineOptions = {}) {
  const storage = options.storage ?? createInMemoryStorageAdapter();
  const loaded = await storage.load();
  let comic: Comic = loaded ?? createDefaultComic();
  let stagedDiff: StagedDiff | null = null;

  function persist() {
    comic.updatedAt = new Date().toISOString();
    void storage.save(comic);
    options.onChange?.(structuredClone(comic));
  }

  function resolveSelectionItems(target: SelectionTarget): unknown[] {
    const idSet = new Set(target.selectedIds);
    const resolvers: Record<TargetedPatchScope, () => unknown[]> = {
      pages: () => comic.pages.filter((p) => idSet.has(p.id)),
      panels: () => {
        const page = comic.pages.find((p) => p.id === target.parentId);
        return (page ? page.panels : comic.pages.flatMap((p) => p.panels)).filter((pan) =>
          idSet.has(pan.id)
        );
      },
      'text-elements': () => {
        for (const page of comic.pages) {
          const panel = page.panels.find((pan) => pan.id === target.parentId);
          if (panel) {
            return panel.textElements.filter((t) => idSet.has(t.id));
          }
        }
        return comic.pages
          .flatMap((p) => p.panels)
          .flatMap((pan) => pan.textElements)
          .filter((t) => idSet.has(t.id));
      },
      characters: () => comic.storyBible.characters.filter((c) => idSet.has(c.id)),
      locations: () => comic.storyBible.locations.filter((l) => idSet.has(l.id)),
      props: () => comic.storyBible.props.filter((pr) => idSet.has(pr.id)),
      scenes: () => comic.scenes.filter((s) => idSet.has(s.id)),
    };
    return resolvers[target.scope]();
  }

  function compilePagesPromptBlock(
    targetPages: Page[],
    letteringMode: LetteringMode,
    bespokeInstruction?: string,
    panelFilterIds?: Set<string>
  ): string {
    const charIds = new Set<string>();
    const locIds = new Set<string>();
    const propIds = new Set<string>();

    for (const page of targetPages) {
      for (const panel of page.panels) {
        if (panelFilterIds && panelFilterIds.size > 0 && !panelFilterIds.has(panel.id)) {
          continue;
        }
        panel.characterIds.forEach((id) => charIds.add(id));
        if (panel.locationId) locIds.add(panel.locationId);
        panel.propIds.forEach((id) => propIds.add(id));
      }
    }

    const referencedChars = comic.storyBible.characters.filter((c) => charIds.has(c.id));
    const referencedLocs = comic.storyBible.locations.filter((l) => locIds.has(l.id));
    const referencedProps = comic.storyBible.props.filter((p) => propIds.has(p.id));

    const vs = comic.storyBible.visualStyle;
    const lines: string[] = [
      '# COMIC ILLUSTRATION GENERATION PROMPT',
      targetPages.length > 1
        ? `Render a multi-page comic sequence covering Pages ${targetPages.map((p) => p.pageNumber).join(', ')}.`
        : `Render Comic Page ${targetPages[0]?.pageNumber ?? 1}.`,
      '',
      '## Global Visual Style',
      `- Art Tradition: ${vs.artTradition || 'Modern Comic Art'}`,
      `- Line & Inking: ${vs.lineAndInking || 'Crisp ink lines'}`,
      `- Color Palette & Shading: ${vs.colorPaletteAndShading || 'Balanced comic coloring'}`,
      `- Era & Tone: ${vs.eraAndTone || 'Cinematic'}`,
      vs.negativePrompt ? `- Avoid / Negative Prompt: ${vs.negativePrompt}` : '',
      '',
      '## Lettering Mode',
      letteringMode === 'baked-in'
        ? '- BAKED-IN LETTERING: Render crisp comic Dialogue balloons, narrative Captions, and stylized SFX lettering inside each Panel exactly as specified.'
        : '- CLEAN ART ONLY: Render pure comic artwork and Panel borders ONLY. Include NO speech bubbles, captions, or text inside the Panels.',
    ].filter(Boolean);

    if (bespokeInstruction) {
      lines.push('', '## Bespoke Art Direction', bespokeInstruction);
    }

    if (referencedChars.length > 0 || referencedLocs.length > 0 || referencedProps.length > 0) {
      lines.push('', '## Referenced Story Bible Assets (Maintain Strict Visual Consistency)');
      for (const c of referencedChars) {
        lines.push(
          `- CHARACTER [${c.name}]: ${c.appearance.visualPromptTag} | Build: ${c.appearance.ageAndBuild}; Face/Hair: ${c.appearance.facialFeaturesAndHair}; Outfit: ${c.appearance.signatureOutfitAndColors}; Marks: ${c.appearance.distinguishingMarks}`
        );
      }
      for (const l of referencedLocs) {
        lines.push(
          `- LOCATION [${l.name}]: ${l.visualPromptTag} | Architecture: ${l.architectureAndScale}; Lighting: ${l.lightingAndAtmosphere}`
        );
      }
      for (const pr of referencedProps) {
        lines.push(`- PROP [${pr.name}]: ${pr.visualPromptTag} | ${pr.visualDescription}`);
      }
    }

    for (const page of targetPages) {
      lines.push('', `## Page ${page.pageNumber} Layout & Panels (${page.summary || 'Comic Page'})`);
      const tiers = groupPanelsByTier(page.panels, panelFilterIds);
      const sortedRowNumbers = Array.from(tiers.keys()).sort((a, b) => a - b);
      for (const rowNum of sortedRowNumbers) {
        const rowPanels = tiers.get(rowNum) ?? [];
        lines.push(`### Tier ${rowNum} (12-Column Grid)`);
        rowPanels.forEach((panel, idx) => {
          const widthPct = Math.round((panel.colSpan / 12) * 100);
          lines.push(
            `- Panel ${idx + 1} [Width: ${panel.colSpan}/12 (~${widthPct}%), Height: ${panel.heightWeight}, Framing: ${panel.framing}]: ${panel.visualDescription}`
          );
          if (letteringMode === 'baked-in' && panel.textElements.length > 0) {
            for (const txt of panel.textElements) {
              if (txt.kind === 'dialogue') {
                const speaker =
                  comic.storyBible.characters.find((c) => c.id === txt.characterId)?.name ||
                  txt.speakerName ||
                  txt.characterId;
                lines.push(
                  `  * Dialogue (${speaker}, ${txt.balloonStyle} balloon): "${txt.text}"`
                );
              } else if (txt.kind === 'caption') {
                lines.push(`  * Caption: "${txt.text}"`);
              } else if (txt.kind === 'sfx') {
                lines.push(`  * SFX: "${txt.text}"`);
              }
            }
          }
        });
      }
    }

    return lines.join('\n');
  }

  return {
    getComic(): Comic {
      return structuredClone(comic);
    },

    getStagedDiff(): StagedDiff | null {
      return stagedDiff ? structuredClone(stagedDiff) : null;
    },

    updateComicMeta(patch: { title?: string; synopsis?: string }): Comic {
      if (patch.title !== undefined) comic.title = patch.title;
      if (patch.synopsis !== undefined) comic.synopsis = patch.synopsis;
      persist();
      return this.getComic();
    },

    updateManuscript(manuscript: string): Comic {
      comic.manuscript = manuscript;
      persist();
      return this.getComic();
    },

    updateVisualStyle(patch: Partial<VisualStyle>): VisualStyle {
      comic.storyBible.visualStyle = {
        ...comic.storyBible.visualStyle,
        ...patch,
      };
      persist();
      return structuredClone(comic.storyBible.visualStyle);
    },

    upsertCharacter(input: UpsertCharacterInput): Character {
      const character: Character = { ...input, id: input.id ?? createId('char') };
      upsertById(comic.storyBible.characters, character);
      persist();
      return structuredClone(character);
    },

    deleteCharacter(characterId: string): void {
      comic.storyBible.characters = comic.storyBible.characters.filter(
        (c) => c.id !== characterId
      );
      persist();
    },

    upsertLocation(input: UpsertLocationInput): Location {
      const location: Location = { ...input, id: input.id ?? createId('loc') };
      upsertById(comic.storyBible.locations, location);
      persist();
      return structuredClone(location);
    },

    deleteLocation(locationId: string): void {
      comic.storyBible.locations = comic.storyBible.locations.filter((l) => l.id !== locationId);
      persist();
    },

    upsertProp(input: UpsertPropInput): Prop {
      const prop: Prop = { ...input, id: input.id ?? createId('prop') };
      upsertById(comic.storyBible.props, prop);
      persist();
      return structuredClone(prop);
    },

    deleteProp(propId: string): void {
      comic.storyBible.props = comic.storyBible.props.filter((p) => p.id !== propId);
      persist();
    },

    upsertScene(input: UpsertSceneInput): Scene {
      const scene: Scene = { ...input, id: input.id ?? createId('scene') };
      upsertById(comic.scenes, scene);
      persist();
      return structuredClone(scene);
    },

    deleteScene(sceneId: string): void {
      comic.scenes = comic.scenes.filter((s) => s.id !== sceneId);
      persist();
    },

    addPage(summary = ''): Page {
      const page: Page = {
        id: createId('page'),
        pageNumber: comic.pages.length + 1,
        summary,
        panels: [],
      };
      comic.pages.push(page);
      persist();
      return structuredClone(page);
    },

    updatePage(pageId: string, patch: Partial<Pick<Page, 'summary' | 'renderedImageDataUrl'>>): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      if (patch.summary !== undefined) page.summary = patch.summary;
      if (patch.renderedImageDataUrl !== undefined) {
        page.renderedImageDataUrl = patch.renderedImageDataUrl;
      }
      persist();
    },

    deletePage(pageId: string): void {
      comic.pages = comic.pages
        .filter((p) => p.id !== pageId)
        .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
      persist();
    },

    addPanel(pageId: string, partial: Partial<Panel> = {}): Panel | null {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return null;
      const maxRow = page.panels.reduce((max, p) => Math.max(max, p.row), 0);
      const panel = normalizePanel(
        {
          row: partial.row ?? maxRow + 1,
          colSpan: partial.colSpan ?? 12,
          heightWeight: partial.heightWeight ?? 'md',
          framing: partial.framing ?? 'medium',
          visualDescription: partial.visualDescription ?? 'New panel action...',
          ...partial,
        },
        comic.scenes[0]?.id ?? 'scene-1'
      );
      page.panels.push(panel);
      normalizePageTiers(page, []);
      persist();
      return structuredClone(panel);
    },

    updatePanel(
      pageId: string,
      panelId: string,
      patch: Partial<Panel>,
      options: { normalizeTiers?: boolean } = {}
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      const idx = page.panels.findIndex((p) => p.id === panelId);
      if (idx === -1) return;
      page.panels[idx] = {
        ...page.panels[idx],
        ...patch,
        id: panelId,
      };
      if (options.normalizeTiers) {
        normalizePageTiers(page, []);
      } else {
        page.panels.sort((a, b) => a.row - b.row);
      }
      persist();
    },

    normalizePage(pageId: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      normalizePageTiers(page, []);
      persist();
    },

    deletePanel(pageId: string, panelId: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.panels = page.panels.filter((p) => p.id !== panelId);
      normalizePageTiers(page, []);
      persist();
    },

    addTextElement(
      pageId: string,
      panelId: string,
      element: Partial<PanelTextElement>
    ): PanelTextElement | null {
      const page = comic.pages.find((p) => p.id === pageId);
      const panel = page?.panels.find((pan) => pan.id === panelId);
      if (!panel) return null;
      const normalized = normalizeTextElement(element);
      panel.textElements.push(normalized);
      persist();
      return structuredClone(normalized);
    },

    updateTextElement(
      pageId: string,
      panelId: string,
      elementId: string,
      patch: Partial<PanelTextElement>
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      const panel = page?.panels.find((pan) => pan.id === panelId);
      if (!panel) return;
      const idx = panel.textElements.findIndex((t) => t.id === elementId);
      if (idx === -1) return;
      panel.textElements[idx] = normalizeTextElement({
        ...panel.textElements[idx],
        ...patch,
        id: elementId,
      });
      persist();
    },

    deleteTextElement(pageId: string, panelId: string, elementId: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      const panel = page?.panels.find((pan) => pan.id === panelId);
      if (!panel) return;
      panel.textElements = panel.textElements.filter((t) => t.id !== elementId);
      persist();
    },

    attachPageImage(pageId: string, dataUrl: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.renderedImageDataUrl = dataUrl;
      persist();
    },

    attachPanelImage(pageId: string, panelId: string, dataUrl: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      const panel = page?.panels.find((pan) => pan.id === panelId);
      if (!panel) return;
      panel.renderedImageDataUrl = dataUrl;
      persist();
    },

    exportComicJson(): string {
      return JSON.stringify(comic, null, 2);
    },

    importComicJson(rawJson: string): Comic {
      const parsed = extractJsonObject(rawJson) as unknown as Comic;
      if (!parsed || typeof parsed !== 'object' || !parsed.storyBible) {
        throw new Error('Invalid Comic JSON.');
      }
      comic = structuredClone(parsed);
      persist();
      return this.getComic();
    },

    buildInitiationPrompt(promptOptions: InitiationPromptOptions = {}): string {
      const targetPages = promptOptions.targetPageCount
        ? `Target Page Count: ${promptOptions.targetPageCount}`
        : 'Target Page Count: Choose optimal page count for pacing';
      const density = promptOptions.panelDensity
        ? `Panel Density: ${promptOptions.panelDensity}`
        : 'Panel Density: 4-6 panels per page';
      const bespoke = promptOptions.bespokeInstruction
        ? `\n## Bespoke Author Instructions\n${promptOptions.bespokeInstruction}\n`
        : '';

      return [
        '# SYSTEM INSTRUCTIONS: COMIC ADAPTATION & LAYOUT ARCHITECT',
        'Adapt the provided Manuscript into a structured Comic draft using the Story Bible below.',
        '- Reuse existing Story Bible Asset IDs whenever those Characters, Locations, or Props appear.',
        '- Extract any newly introduced Characters, Locations, or Props into `proposedAssets`.',
        '- Organize each Page into horizontal Tiers (`row`: 1, 2, 3...) on a 12-column grid where all Panels in the same `row` have `colSpan` (1..12) summing to 12.',
        '',
        '## Pacing Configuration',
        `- ${targetPages}`,
        `- ${density}`,
        bespoke,
        '## Manuscript',
        comic.manuscript || '(No manuscript text provided)',
        '',
        '## Existing Story Bible JSON',
        '```json',
        JSON.stringify(comic.storyBible, null, 2),
        '```',
        '',
        '## Required Output JSON Format',
        'Respond with valid JSON matching this schema:',
        '```json',
        JSON.stringify(
          {
            kind: 'initiation-draft',
            synopsis: 'One-paragraph comic synopsis',
            proposedAssets: {
              characters: [
                {
                  id: 'char-example',
                  name: 'Character Name',
                  aliases: [],
                  role: 'protagonist | antagonist | supporting | minor',
                  appearance: {
                    ageAndBuild: '...',
                    facialFeaturesAndHair: '...',
                    signatureOutfitAndColors: '...',
                    distinguishingMarks: '...',
                    visualPromptTag: 'Concise Visual Prompt Tag for image generation',
                  },
                  personality: {
                    coreTraits: ['...'],
                    voiceAndSpeechStyle: '...',
                    quirksAndMannerisms: '...',
                  },
                  motivation: {
                    primaryGoal: '...',
                    coreFearOrConflict: '...',
                    moralAlignmentOrCode: '...',
                  },
                  background: {
                    summary: '...',
                    relationships: [],
                  },
                },
              ],
              locations: [],
              props: [],
            },
            scenes: [
              {
                id: 'scene-1',
                title: 'Scene Title',
                summary: 'Narrative summary',
                dramaticBeat: 'Dramatic function',
                locationId: 'loc-id',
                participatingCharacterIds: ['char-id'],
              },
            ],
            pages: [
              {
                id: 'page-1',
                pageNumber: 1,
                summary: 'Page summary',
                panels: [
                  {
                    id: 'panel-1',
                    sceneId: 'scene-1',
                    row: 1,
                    colSpan: 12,
                    heightWeight: 'sm | md | lg | xl | splash',
                    framing:
                      'extreme-wide | wide | medium | close-up | extreme-close-up | dutch-angle | birds-eye | worms-eye',
                    visualDescription: 'Detailed visual action and composition',
                    characterIds: ['char-id'],
                    locationId: 'loc-id',
                    propIds: [],
                    textElements: [
                      {
                        id: 'dlg-1',
                        kind: 'dialogue',
                        characterId: 'char-id',
                        text: 'Spoken line',
                        balloonStyle: 'speech | thought | whisper | shout',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          null,
          2
        ),
        '```',
      ].join('\n');
    },

    buildSelectionPrompt(target: SelectionTarget, bespokeInstruction: string): string {
      const selectedItems = resolveSelectionItems(target);

      return [
        '# TARGETED COMIC MODIFICATION REQUEST',
        'Modify ONLY the selected elements below according to the instruction. Return the updated replacement slice wrapped in the Targeted Patch Envelope JSON format.',
        '- You may split 1 selected element into multiple elements, merge selected elements, or modify them in place.',
        '- Preserve the exact `scope`, `parentId`, and `selectedIds` values in the envelope so the app can splice your `replacements` array directly into place.',
        '',
        '## Bespoke Instruction',
        bespokeInstruction || '(No instruction provided)',
        '',
        '## Selected Elements (EDIT_TARGET)',
        '```json',
        JSON.stringify(selectedItems, null, 2),
        '```',
        '',
        '## Required Output JSON Format (Targeted Patch Envelope)',
        '```json',
        JSON.stringify(
          {
            kind: 'targeted-patch',
            scope: target.scope,
            parentId: target.parentId,
            selectedIds: target.selectedIds,
            replacements: selectedItems,
            proposedAssets: {
              characters: [],
              locations: [],
              props: [],
            },
          },
          null,
          2
        ),
        '```',
      ].join('\n');
    },

    buildImagePrompts(imgOptions: ImagePromptOptions): CompiledImagePrompt[] {
      const panelFilter =
        imgOptions.panelIds && imgOptions.panelIds.length > 0
          ? new Set(imgOptions.panelIds)
          : undefined;
      const idSet = new Set(imgOptions.pageIds);
      const selectedPages = comic.pages.filter(
        (p) =>
          idSet.has(p.id) ||
          (panelFilter ? p.panels.some((pan) => panelFilter.has(pan.id)) : false)
      );
      if (selectedPages.length === 0) return [];

      if (imgOptions.deliveryMode === 'composite-spread') {
        const pageNums = selectedPages.map((p) => p.pageNumber);
        const rangeLabel =
          pageNums.length > 1
            ? `Pages ${pageNums[0]}–${pageNums[pageNums.length - 1]}`
            : `Page ${pageNums[0]}`;
        return [
          {
            id: createId('img-prompt'),
            title: `${rangeLabel} (${imgOptions.letteringMode === 'baked-in' ? 'Baked-in Lettering' : 'Clean Art'})`,
            pageIds: selectedPages.map((p) => p.id),
            prompt: compilePagesPromptBlock(
              selectedPages,
              imgOptions.letteringMode,
              imgOptions.bespokeInstruction,
              panelFilter
            ),
          },
        ];
      }

      return selectedPages.map((page) => ({
        id: createId('img-prompt'),
        title: `Page ${page.pageNumber} (${imgOptions.letteringMode === 'baked-in' ? 'Baked-in Lettering' : 'Clean Art'})`,
        pageIds: [page.id],
        prompt: compilePagesPromptBlock(
          [page],
          imgOptions.letteringMode,
          imgOptions.bespokeInstruction,
          panelFilter
        ),
      }));
    },

    stageLlmResponse(rawText: string): StagedDiff {
      const parsed = extractJsonObject(rawText);
      const warnings: string[] = [];

      if (parsed.kind === 'targeted-patch') {
        const scope = (parsed.scope as TargetedPatchScope) || 'panels';
        const parentId = typeof parsed.parentId === 'string' ? parsed.parentId : undefined;
        const selectedIds = Array.isArray(parsed.selectedIds)
          ? (parsed.selectedIds as string[])
          : [];
        const rawReplacements = Array.isArray(parsed.replacements) ? parsed.replacements : [];
        const before = resolveSelectionItems({ scope, parentId, selectedIds });
        const fallbackSceneId = comic.scenes[0]?.id ?? 'scene-1';

        const replacements = rawReplacements.map((item, idx) => {
          if (scope === 'panels') {
            return normalizePanel(item as Partial<Panel>, fallbackSceneId);
          }
          if (scope === 'text-elements') {
            return normalizeTextElement(item as Partial<PanelTextElement>);
          }
          if (scope === 'pages') {
            const p = item as Partial<Page>;
            const rawPanels = Array.isArray(p.panels) ? p.panels : [];
            const page: Page = {
              id: p.id || createId('page'),
              pageNumber: typeof p.pageNumber === 'number' ? p.pageNumber : idx + 1,
              summary: p.summary,
              panels: rawPanels.map((pan) => normalizePanel(pan, fallbackSceneId)),
              renderedImageDataUrl: p.renderedImageDataUrl,
            };
            return normalizePageTiers(page, warnings);
          }
          return item;
        });

        const proposedAssets = parsed.proposedAssets
          ? normalizeProposedAssets(parsed.proposedAssets)
          : undefined;

        stagedDiff = {
          kind: 'targeted-patch',
          summary: `Targeted ${scope} patch replacing ${selectedIds.length} item(s) with ${replacements.length} item(s).`,
          scope,
          parentId,
          selectedIds,
          before,
          replacements,
          proposedAssets,
          warnings,
        };

        return this.getStagedDiff()!;
      }

      const rawScenes = Array.isArray(parsed.scenes) ? (parsed.scenes as Partial<Scene>[]) : [];
      const scenes: Scene[] = rawScenes.map((s) => ({
        id: s.id || createId('scene'),
        title: s.title || 'Untitled Scene',
        summary: s.summary || '',
        dramaticBeat: s.dramaticBeat || '',
        locationId: s.locationId,
        participatingCharacterIds: Array.isArray(s.participatingCharacterIds)
          ? s.participatingCharacterIds
          : [],
      }));

      const fallbackSceneId = scenes[0]?.id ?? comic.scenes[0]?.id ?? 'scene-1';
      const rawPages = Array.isArray(parsed.pages) ? (parsed.pages as Partial<Page>[]) : [];
      const pages: Page[] = rawPages.map((p, index) => {
        const rawPanels = Array.isArray(p.panels) ? (p.panels as Partial<Panel>[]) : [];
        const page: Page = {
          id: p.id || createId('page'),
          pageNumber: typeof p.pageNumber === 'number' ? p.pageNumber : index + 1,
          summary: p.summary,
          panels: rawPanels.map((pan) => normalizePanel(pan, fallbackSceneId)),
          renderedImageDataUrl: p.renderedImageDataUrl,
        };
        return normalizePageTiers(page, warnings);
      });

      const proposedAssets = normalizeProposedAssets(parsed.proposedAssets);

      stagedDiff = {
        kind: 'initiation-draft',
        summary: `Initiation draft with ${scenes.length} scene(s) and ${pages.length} page(s).`,
        synopsis: typeof parsed.synopsis === 'string' ? parsed.synopsis : undefined,
        proposedAssets,
        scenes,
        pages,
        warnings,
      };

      return this.getStagedDiff()!;
    },

    applyStagedDiff(): Comic {
      if (!stagedDiff) {
        return this.getComic();
      }

      const mergeProposedAssets = (proposed?: ProposedAssets) => {
        if (!proposed) return;
        proposed.characters.forEach((char) => upsertById(comic.storyBible.characters, char));
        proposed.locations.forEach((loc) => upsertById(comic.storyBible.locations, loc));
        proposed.props.forEach((prop) => upsertById(comic.storyBible.props, prop));
      };

      if (stagedDiff.kind === 'initiation-draft') {
        if (stagedDiff.synopsis) {
          comic.synopsis = stagedDiff.synopsis;
        }
        mergeProposedAssets(stagedDiff.proposedAssets);
        comic.scenes = stagedDiff.scenes;
        comic.pages = stagedDiff.pages;
      } else if (stagedDiff.kind === 'targeted-patch') {
        mergeProposedAssets(stagedDiff.proposedAssets);
        const { scope, parentId, selectedIds, replacements } = stagedDiff;
        const warnings: string[] = [];

        const appliers: Record<TargetedPatchScope, () => void> = {
          pages: () => {
            comic.pages = spliceSelectedSlice(
              comic.pages,
              selectedIds,
              replacements as Page[]
            ).map((page, index) => ({
              ...page,
              pageNumber: index + 1,
            }));
          },
          panels: () => {
            const page = comic.pages.find((p) => p.id === parentId) ?? comic.pages[0];
            if (page) {
              page.panels = spliceSelectedSlice(
                page.panels,
                selectedIds,
                replacements as Panel[]
              );
              normalizePageTiers(page, warnings);
            }
          },
          'text-elements': () => {
            for (const page of comic.pages) {
              const panel = page.panels.find((pan) => pan.id === parentId);
              if (panel) {
                panel.textElements = spliceSelectedSlice(
                  panel.textElements,
                  selectedIds,
                  replacements as PanelTextElement[]
                );
                break;
              }
            }
          },
          characters: () => {
            comic.storyBible.characters = spliceSelectedSlice(
              comic.storyBible.characters,
              selectedIds,
              replacements as Character[]
            );
          },
          locations: () => {
            comic.storyBible.locations = spliceSelectedSlice(
              comic.storyBible.locations,
              selectedIds,
              replacements as Location[]
            );
          },
          props: () => {
            comic.storyBible.props = spliceSelectedSlice(
              comic.storyBible.props,
              selectedIds,
              replacements as Prop[]
            );
          },
          scenes: () => {
            comic.scenes = spliceSelectedSlice(
              comic.scenes,
              selectedIds,
              replacements as Scene[]
            );
          },
        };
        appliers[scope]();
      }

      stagedDiff = null;
      persist();
      return this.getComic();
    },

    discardStagedDiff(): void {
      stagedDiff = null;
    },
  };
}

export type ComicEngine = Awaited<ReturnType<typeof createComicEngine>>;
