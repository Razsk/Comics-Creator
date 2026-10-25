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
  PageImageUploadMode,
  Panel,
  PanelTextElement,
  Prop,
  ProposedAssets,
  ReplaceQueryOptions,
  ReplaceResult,
  Scene,
  SearchMatchItem,
  SearchQueryOptions,
  SearchReplaceScope,
  SearchResult,
  SelectionTarget,
  StagedDiff,
  TargetedPatchScope,
  UploadedPageImageInput,
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
        ? `Render a multi-page comic sequence covering Pages ${targetPages.map((p) => p.pageNumber).join(', ')}. IMPORTANT: You MUST generate ${targetPages.length} separate, individual images — one standalone image for each requested Page.`
        : `Render Comic Page ${targetPages[0]?.pageNumber ?? 1}.`,
    ];

    if (targetPages.length > 1) {
      lines.push(
        '',
        '## Multi-Page Output Instructions (CRITICAL — READ CAREFULLY)',
        `- GENERATE ${targetPages.length} SEPARATE, INDIVIDUAL IMAGES: You MUST create ${targetPages.length} distinct images in total — one individual image for each requested Page (${targetPages.map((p, idx) => `Image ${idx + 1} = Page ${p.pageNumber}`).join('; ')}).`,
        '- ONE PAGE PER IMAGE: Each generated image must depict ONLY a single Comic Page containing only that page\'s Tiers and Panels.',
        '- DO NOT COMBINE PAGES INTO ONE IMAGE: Do NOT merge, stitch, or composite multiple pages together into a single image canvas, collage, or two-page spread image.'
      );
    }

    lines.push(
      '',
      '## Global Visual Style',
      `- Art Tradition: ${vs.artTradition || 'Modern Comic Art'}`,
      `- Line & Inking: ${vs.lineAndInking || 'Crisp ink lines'}`,
      `- Color Palette & Shading: ${vs.colorPaletteAndShading || 'Balanced comic coloring'}`,
      `- Era & Tone: ${vs.eraAndTone || 'Cinematic'}`,
      ...(vs.negativePrompt ? [`- Avoid / Negative Prompt: ${vs.negativePrompt}`] : []),
      '',
      '## Lettering Mode',
      letteringMode === 'baked-in'
        ? '- BAKED-IN LETTERING: Render crisp comic Dialogue balloons, narrative Captions, and stylized SFX lettering inside each Panel exactly as specified.'
        : '- CLEAN ART ONLY: Render pure comic artwork and Panel borders ONLY. Include NO speech bubbles, captions, or text inside the Panels.'
    );

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

    for (const [pageIdx, page] of targetPages.entries()) {
      lines.push(
        '',
        targetPages.length > 1
          ? `## IMAGE ${pageIdx + 1} OF ${targetPages.length} — Page ${page.pageNumber} Layout & Panels (${page.summary || 'Comic Page'})`
          : `## Page ${page.pageNumber} Layout & Panels (${page.summary || 'Comic Page'})`
      );
      if (targetPages.length > 1) {
        lines.push(
          `> Output Requirement: Create a separate, standalone image for Page ${page.pageNumber} (Individual Image ${pageIdx + 1} of ${targetPages.length}). Do not merge this page with any other page.`
        );
      }
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

    resetComic(): Comic {
      comic = createDefaultComic();
      stagedDiff = null;
      persist();
      return this.getComic();
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

    movePage(pageId: string, target: 'up' | 'down' | number): Page[] {
      const fromIdx = comic.pages.findIndex((p) => p.id === pageId);
      if (fromIdx === -1) return this.getComic().pages;

      let toIdx = fromIdx;
      if (target === 'up') {
        toIdx = Math.max(0, fromIdx - 1);
      } else if (target === 'down') {
        toIdx = Math.min(comic.pages.length - 1, fromIdx + 1);
      } else if (typeof target === 'number') {
        toIdx = Math.max(0, Math.min(comic.pages.length - 1, Math.round(target)));
      }

      if (toIdx !== fromIdx) {
        const [moved] = comic.pages.splice(fromIdx, 1);
        comic.pages.splice(toIdx, 0, moved);
        comic.pages.forEach((p, idx) => {
          p.pageNumber = idx + 1;
        });
        persist();
      }

      return this.getComic().pages;
    },

    reorderPages(orderedPageIds: string[]): Page[] {
      const pageMap = new Map(comic.pages.map((p) => [p.id, p]));
      const seen = new Set<string>();
      const reordered: Page[] = [];

      for (const id of orderedPageIds) {
        const page = pageMap.get(id);
        if (page && !seen.has(id)) {
          reordered.push(page);
          seen.add(id);
        }
      }

      for (const page of comic.pages) {
        if (!seen.has(page.id)) {
          reordered.push(page);
          seen.add(page.id);
        }
      }

      reordered.forEach((p, idx) => {
        p.pageNumber = idx + 1;
      });
      comic.pages = reordered;
      persist();
      return this.getComic().pages;
    },

    uploadPageImages(
      images: UploadedPageImageInput[],
      uploadOptions: { mode?: PageImageUploadMode } = {}
    ): Page[] {
      const mode: PageImageUploadMode = uploadOptions.mode ?? 'fill-empty';

      for (const img of images) {
        if (!img.dataUrl) continue;
        const cleanName = img.name ? img.name.replace(/\.[^.]+$/, '').trim() : '';

        if (mode === 'fill-empty') {
          const emptyPage = comic.pages.find((p) => !p.renderedImageDataUrl);
          if (emptyPage) {
            emptyPage.renderedImageDataUrl = img.dataUrl;
            if (!emptyPage.summary && cleanName) {
              emptyPage.summary = cleanName;
            }
            continue;
          }
        }

        comic.pages.push({
          id: createId('page'),
          pageNumber: comic.pages.length + 1,
          summary: cleanName,
          panels: [],
          renderedImageDataUrl: img.dataUrl,
        });
      }

      comic.pages.forEach((p, idx) => {
        p.pageNumber = idx + 1;
      });
      persist();
      return this.getComic().pages;
    },

    clearPageImage(pageId: string): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      page.renderedImageDataUrl = undefined;
      persist();
    },

    addPanel(pageId: string, partial: Partial<Panel> = {}): Panel | null {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return null;
      const maxRow = page.panels.reduce((max, p) => Math.max(max, p.row), 0);
      const targetRow = partial.row ?? maxRow + 1;
      const existingInRow = page.panels.filter((p) => p.row === targetRow);
      const panel = normalizePanel(
        {
          row: targetRow,
          colSpan: partial.colSpan ?? (existingInRow.length > 0 ? Math.max(1, Math.floor(12 / (existingInRow.length + 1))) : 12),
          heightWeight: partial.heightWeight ?? 'md',
          framing: partial.framing ?? 'medium',
          visualDescription: partial.visualDescription ?? 'New panel action...',
          ...partial,
        },
        comic.scenes[0]?.id ?? 'scene-1'
      );
      page.panels.push(panel);
      if (existingInRow.length > 0) {
        const rowPanels = page.panels.filter((p) => p.row === targetRow);
        const sum = rowPanels.reduce((acc, p) => acc + p.colSpan, 0);
        if (sum > 12 || partial.colSpan === undefined) {
          let remaining = 12;
          rowPanels.forEach((p, idx) => {
            if (idx === rowPanels.length - 1) {
              p.colSpan = Math.max(1, remaining);
            } else {
              const scaled = Math.max(1, Math.round((p.colSpan / sum) * 12));
              const maxAllowed = Math.max(1, remaining - (rowPanels.length - 1 - idx));
              p.colSpan = Math.min(scaled, maxAllowed);
              remaining -= p.colSpan;
            }
          });
        }
      }
      page.panels.sort((a, b) => a.row - b.row);
      persist();
      return structuredClone(panel);
    },

    splitPanel(pageId: string, panelId: string): Panel | null {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return null;
      const idx = page.panels.findIndex((p) => p.id === panelId);
      if (idx === -1) return null;
      const source = page.panels[idx];
      const rowPanels = page.panels.filter((p) => p.row === source.row);
      if (rowPanels.length >= 12) return null;

      let newSpan = 6;
      if (source.colSpan >= 2) {
        newSpan = Math.floor(source.colSpan / 2);
        source.colSpan = source.colSpan - newSpan;
      } else {
        newSpan = 1;
      }

      const sibling = normalizePanel(
        {
          sceneId: source.sceneId,
          row: source.row,
          colSpan: newSpan,
          heightWeight: source.heightWeight,
          framing: source.framing,
          visualDescription: 'New panel action...',
          locationId: source.locationId,
          characterIds: [...source.characterIds],
          propIds: [...source.propIds],
          textElements: [],
        },
        source.sceneId
      );

      page.panels.splice(idx + 1, 0, sibling);

      const updatedRowPanels = page.panels.filter((p) => p.row === source.row);
      const sum = updatedRowPanels.reduce((acc, p) => acc + p.colSpan, 0);
      if (sum > 12) {
        let remaining = 12;
        updatedRowPanels.forEach((p, i) => {
          if (i === updatedRowPanels.length - 1) {
            p.colSpan = Math.max(1, remaining);
          } else {
            const scaled = Math.max(1, Math.round((p.colSpan / sum) * 12));
            const maxAllowed = Math.max(1, remaining - (updatedRowPanels.length - 1 - i));
            p.colSpan = Math.min(scaled, maxAllowed);
            remaining -= p.colSpan;
          }
        });
      }

      page.panels.sort((a, b) => a.row - b.row);
      persist();
      return structuredClone(sibling);
    },

    resizePanel(
      pageId: string,
      panelId: string,
      colSpan: number,
      options: { rebalanceTier?: boolean } = {}
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      const target = page.panels.find((p) => p.id === panelId);
      if (!target) return;

      const rowPanels = page.panels.filter((p) => p.row === target.row);
      const siblings = rowPanels.filter((p) => p.id !== panelId);
      const shouldRebalance = options.rebalanceTier ?? siblings.length > 0;

      if (!shouldRebalance || siblings.length === 0) {
        target.colSpan = Math.min(12, Math.max(1, Math.round(colSpan)));
        persist();
        return;
      }

      const maxTargetSpan = Math.max(1, 12 - siblings.length);
      const clampedTargetSpan = Math.min(maxTargetSpan, Math.max(1, Math.round(colSpan)));
      target.colSpan = clampedTargetSpan;

      let remaining = 12 - clampedTargetSpan;
      const currentSiblingSum = siblings.reduce((acc, s) => acc + s.colSpan, 0);

      siblings.forEach((sib, idx) => {
        if (idx === siblings.length - 1) {
          sib.colSpan = Math.max(1, remaining);
        } else {
          const ratio = currentSiblingSum > 0 ? sib.colSpan / currentSiblingSum : 1 / siblings.length;
          const scaled = Math.max(1, Math.round(ratio * (12 - clampedTargetSpan)));
          const maxAllowed = Math.max(1, remaining - (siblings.length - 1 - idx));
          sib.colSpan = Math.min(scaled, maxAllowed);
          remaining -= sib.colSpan;
        }
      });

      persist();
    },

    movePanel(
      pageId: string,
      panelId: string,
      direction: 'left' | 'right' | 'up' | 'down'
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      const idx = page.panels.findIndex((p) => p.id === panelId);
      if (idx === -1) return;
      const panel = page.panels[idx];

      if (direction === 'up') {
        panel.row = Math.max(1, panel.row - 1);
        page.panels.sort((a, b) => a.row - b.row);
      } else if (direction === 'down') {
        panel.row = panel.row + 1;
        page.panels.sort((a, b) => a.row - b.row);
      } else if (direction === 'left' && idx > 0 && page.panels[idx - 1].row === panel.row) {
        const temp = page.panels[idx - 1];
        page.panels[idx - 1] = panel;
        page.panels[idx] = temp;
      } else if (
        direction === 'right' &&
        idx < page.panels.length - 1 &&
        page.panels[idx + 1].row === panel.row
      ) {
        const temp = page.panels[idx + 1];
        page.panels[idx + 1] = panel;
        page.panels[idx] = temp;
      }
      persist();
    },

    updatePanel(
      pageId: string,
      panelId: string,
      patch: Partial<Panel>,
      options: { normalizeTiers?: boolean; rebalanceTier?: boolean } = {}
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      if (!page) return;
      const idx = page.panels.findIndex((p) => p.id === panelId);
      if (idx === -1) return;
      const sanitizedPatch = { ...patch };
      if (typeof sanitizedPatch.colSpan === 'number') {
        sanitizedPatch.colSpan = Math.min(12, Math.max(1, Math.round(sanitizedPatch.colSpan)));
      }
      if (typeof sanitizedPatch.row === 'number') {
        sanitizedPatch.row = Math.max(1, Math.round(sanitizedPatch.row));
      }
      page.panels[idx] = {
        ...page.panels[idx],
        ...sanitizedPatch,
        id: panelId,
      };
      if (options.rebalanceTier && typeof sanitizedPatch.colSpan === 'number') {
        this.resizePanel(pageId, panelId, sanitizedPatch.colSpan, { rebalanceTier: true });
        return;
      }
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
      page.panels.sort((a, b) => a.row - b.row);
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

    moveTextElement(
      pageId: string,
      panelId: string,
      elementId: string,
      direction: 'up' | 'down'
    ): void {
      const page = comic.pages.find((p) => p.id === pageId);
      const panel = page?.panels.find((pan) => pan.id === panelId);
      if (!panel) return;
      const idx = panel.textElements.findIndex((t) => t.id === elementId);
      if (idx === -1) return;
      if (direction === 'up' && idx > 0) {
        const temp = panel.textElements[idx - 1];
        panel.textElements[idx - 1] = panel.textElements[idx];
        panel.textElements[idx] = temp;
        persist();
      } else if (direction === 'down' && idx < panel.textElements.length - 1) {
        const temp = panel.textElements[idx + 1];
        panel.textElements[idx + 1] = panel.textElements[idx];
        panel.textElements[idx] = temp;
        persist();
      }
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

    searchComic(searchOpts: SearchQueryOptions): SearchResult {
      const query = searchOpts.query ?? '';
      if (!query) {
        return { totalMatches: 0, items: [] };
      }

      const flags = searchOpts.caseSensitive ? 'g' : 'gi';
      let regex: RegExp;
      try {
        const pattern = searchOpts.useRegex
          ? query
          : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pattern, flags);
      } catch (err) {
        return {
          totalMatches: 0,
          items: [],
          error: err instanceof Error ? err.message : 'Invalid regular expression',
        };
      }

      const scopeFilter: SearchReplaceScope = searchOpts.scope ?? 'all';
      const descriptors = collectSearchableFields(comic, scopeFilter);
      const items: SearchMatchItem[] = [];
      let totalMatches = 0;

      for (const desc of descriptors) {
        const sourceText = desc.get();
        if (!sourceText) continue;
        regex.lastIndex = 0;
        const matches: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(sourceText)) !== null) {
          matches.push(match[0]);
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
        if (matches.length > 0) {
          totalMatches += matches.length;
          let previewAfter: string | undefined;
          if (searchOpts.replacement !== undefined) {
            regex.lastIndex = 0;
            previewAfter = searchOpts.useRegex
              ? sourceText.replace(regex, searchOpts.replacement)
              : sourceText.replace(regex, () => searchOpts.replacement!);
          }
          items.push({
            id: desc.id,
            scope: desc.scope,
            locationLabel: desc.locationLabel,
            fieldLabel: desc.fieldLabel,
            pageId: desc.pageId,
            panelId: desc.panelId,
            textElementId: desc.textElementId,
            sourceText,
            matchCount: matches.length,
            matches,
            previewAfter,
          });
        }
      }

      return { totalMatches, items };
    },

    replaceInComic(replaceOpts: ReplaceQueryOptions): ReplaceResult {
      const query = replaceOpts.query ?? '';
      if (!query) {
        return { replacedCount: 0, affectedFields: 0 };
      }

      const flags = replaceOpts.caseSensitive ? 'g' : 'gi';
      let regex: RegExp;
      try {
        const pattern = replaceOpts.useRegex
          ? query
          : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pattern, flags);
      } catch (err) {
        return {
          replacedCount: 0,
          affectedFields: 0,
          error: err instanceof Error ? err.message : 'Invalid regular expression',
        };
      }

      const scopeFilter: SearchReplaceScope = replaceOpts.scope ?? 'all';
      const targetSet =
        replaceOpts.targetItemIds && replaceOpts.targetItemIds.length > 0
          ? new Set(replaceOpts.targetItemIds)
          : null;
      const descriptors = collectSearchableFields(comic, scopeFilter);

      let replacedCount = 0;
      let affectedFields = 0;

      for (const desc of descriptors) {
        if (targetSet && !targetSet.has(desc.id)) continue;
        const sourceText = desc.get();
        if (!sourceText) continue;
        regex.lastIndex = 0;
        let fieldMatches = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(sourceText)) !== null) {
          fieldMatches++;
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
        if (fieldMatches > 0) {
          regex.lastIndex = 0;
          const updated = replaceOpts.useRegex
            ? sourceText.replace(regex, replaceOpts.replacement)
            : sourceText.replace(regex, () => replaceOpts.replacement);
          desc.set(updated);
          replacedCount += fieldMatches;
          affectedFields++;
        }
      }

      if (affectedFields > 0) {
        persist();
      }

      return { replacedCount, affectedFields };
    },
  };
}

interface SearchableFieldDescriptor {
  id: string;
  scope: 'speech' | 'panels' | 'story-bible' | 'scenes' | 'manuscript';
  locationLabel: string;
  fieldLabel: string;
  pageId?: string;
  panelId?: string;
  textElementId?: string;
  get(): string;
  set(val: string): void;
}

function collectSearchableFields(
  comic: Comic,
  scopeFilter: SearchReplaceScope
): SearchableFieldDescriptor[] {
  const fields: SearchableFieldDescriptor[] = [];

  const includeSpeech =
    scopeFilter === 'all' || scopeFilter === 'panels-and-speech' || scopeFilter === 'speech';
  const includePanels =
    scopeFilter === 'all' || scopeFilter === 'panels-and-speech' || scopeFilter === 'panels';
  const includeStoryBible = scopeFilter === 'all' || scopeFilter === 'story-bible';
  const includeScenes = scopeFilter === 'all' || scopeFilter === 'scenes';
  const includeManuscript = scopeFilter === 'all' || scopeFilter === 'manuscript';

  if (includePanels || includeSpeech) {
    comic.pages.forEach((page) => {
      if (includePanels) {
        fields.push({
          id: `page:${page.id}:summary`,
          scope: 'panels',
          locationLabel: `Page ${page.pageNumber}`,
          fieldLabel: 'Page Summary',
          pageId: page.id,
          get: () => page.summary ?? '',
          set: (v) => {
            page.summary = v;
          },
        });
      }

      page.panels.forEach((panel, panelIdx) => {
        const panelNum = panelIdx + 1;
        if (includePanels) {
          fields.push({
            id: `page:${page.id}:panel:${panel.id}:visualDescription`,
            scope: 'panels',
            locationLabel: `Page ${page.pageNumber} · Panel ${panelNum}`,
            fieldLabel: 'Visual Description',
            pageId: page.id,
            panelId: panel.id,
            get: () => panel.visualDescription,
            set: (v) => {
              panel.visualDescription = v;
            },
          });
        }

        if (includeSpeech) {
          panel.textElements.forEach((txt, txtIdx) => {
            const speaker =
              txt.kind === 'dialogue'
                ? comic.storyBible.characters.find((c) => c.id === txt.characterId)?.name ||
                  txt.speakerName ||
                  'Dialogue'
                : txt.kind === 'caption'
                  ? 'Caption'
                  : 'SFX';
            fields.push({
              id: `page:${page.id}:panel:${panel.id}:text:${txt.id}:text`,
              scope: 'speech',
              locationLabel: `Page ${page.pageNumber} · Panel ${panelNum} · ${speaker} #${txtIdx + 1}`,
              fieldLabel: `${txt.kind.toUpperCase()} Text`,
              pageId: page.id,
              panelId: panel.id,
              textElementId: txt.id,
              get: () => txt.text,
              set: (v) => {
                txt.text = v;
              },
            });
            if (txt.kind === 'dialogue' && txt.speakerName !== undefined) {
              fields.push({
                id: `page:${page.id}:panel:${panel.id}:text:${txt.id}:speakerName`,
                scope: 'speech',
                locationLabel: `Page ${page.pageNumber} · Panel ${panelNum} · Dialogue #${txtIdx + 1}`,
                fieldLabel: 'Speaker Name',
                pageId: page.id,
                panelId: panel.id,
                textElementId: txt.id,
                get: () => txt.speakerName ?? '',
                set: (v) => {
                  txt.speakerName = v;
                },
              });
            }
            if (txt.kind === 'sfx' && txt.visualStyle !== undefined) {
              fields.push({
                id: `page:${page.id}:panel:${panel.id}:text:${txt.id}:visualStyle`,
                scope: 'speech',
                locationLabel: `Page ${page.pageNumber} · Panel ${panelNum} · SFX #${txtIdx + 1}`,
                fieldLabel: 'SFX Visual Style',
                pageId: page.id,
                panelId: panel.id,
                textElementId: txt.id,
                get: () => txt.visualStyle ?? '',
                set: (v) => {
                  txt.visualStyle = v;
                },
              });
            }
          });
        }
      });
    });
  }

  if (includeStoryBible) {
    const vs = comic.storyBible.visualStyle;
    const vsKeys: Array<[keyof VisualStyle, string]> = [
      ['artTradition', 'Art Tradition'],
      ['lineAndInking', 'Line & Inking'],
      ['colorPaletteAndShading', 'Color Palette & Shading'],
      ['eraAndTone', 'Era & Tone'],
      ['negativePrompt', 'Negative Prompt'],
    ];
    for (const [key, label] of vsKeys) {
      fields.push({
        id: `bible:visualStyle:${key}`,
        scope: 'story-bible',
        locationLabel: 'Story Bible · Visual Style',
        fieldLabel: label,
        get: () => vs[key],
        set: (v) => {
          vs[key] = v;
        },
      });
    }

    comic.storyBible.characters.forEach((c) => {
      const locLabel = `Character: ${c.name}`;
      fields.push(
        {
          id: `bible:char:${c.id}:name`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Name',
          get: () => c.name,
          set: (v) => {
            c.name = v;
          },
        },
        {
          id: `bible:char:${c.id}:visualPromptTag`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Visual Prompt Tag',
          get: () => c.appearance.visualPromptTag,
          set: (v) => {
            c.appearance.visualPromptTag = v;
          },
        },
        {
          id: `bible:char:${c.id}:ageAndBuild`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Age & Build',
          get: () => c.appearance.ageAndBuild,
          set: (v) => {
            c.appearance.ageAndBuild = v;
          },
        },
        {
          id: `bible:char:${c.id}:facialFeaturesAndHair`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Facial Features & Hair',
          get: () => c.appearance.facialFeaturesAndHair,
          set: (v) => {
            c.appearance.facialFeaturesAndHair = v;
          },
        },
        {
          id: `bible:char:${c.id}:signatureOutfitAndColors`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Signature Outfit & Colors',
          get: () => c.appearance.signatureOutfitAndColors,
          set: (v) => {
            c.appearance.signatureOutfitAndColors = v;
          },
        },
        {
          id: `bible:char:${c.id}:distinguishingMarks`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Distinguishing Marks',
          get: () => c.appearance.distinguishingMarks,
          set: (v) => {
            c.appearance.distinguishingMarks = v;
          },
        },
        {
          id: `bible:char:${c.id}:voiceAndSpeechStyle`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Voice & Speech Style',
          get: () => c.personality.voiceAndSpeechStyle,
          set: (v) => {
            c.personality.voiceAndSpeechStyle = v;
          },
        },
        {
          id: `bible:char:${c.id}:quirksAndMannerisms`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Quirks & Mannerisms',
          get: () => c.personality.quirksAndMannerisms,
          set: (v) => {
            c.personality.quirksAndMannerisms = v;
          },
        },
        {
          id: `bible:char:${c.id}:primaryGoal`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Primary Goal',
          get: () => c.motivation.primaryGoal,
          set: (v) => {
            c.motivation.primaryGoal = v;
          },
        },
        {
          id: `bible:char:${c.id}:coreFearOrConflict`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Core Fear or Conflict',
          get: () => c.motivation.coreFearOrConflict,
          set: (v) => {
            c.motivation.coreFearOrConflict = v;
          },
        },
        {
          id: `bible:char:${c.id}:moralAlignmentOrCode`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Moral Alignment or Code',
          get: () => c.motivation.moralAlignmentOrCode,
          set: (v) => {
            c.motivation.moralAlignmentOrCode = v;
          },
        },
        {
          id: `bible:char:${c.id}:backgroundSummary`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Background Summary',
          get: () => c.background.summary,
          set: (v) => {
            c.background.summary = v;
          },
        }
      );
      c.aliases.forEach((_, idx) => {
        fields.push({
          id: `bible:char:${c.id}:alias:${idx}`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: `Alias #${idx + 1}`,
          get: () => c.aliases[idx] ?? '',
          set: (v) => {
            c.aliases[idx] = v;
          },
        });
      });
    });

    comic.storyBible.locations.forEach((l) => {
      const locLabel = `Location: ${l.name}`;
      fields.push(
        {
          id: `bible:loc:${l.id}:name`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Name',
          get: () => l.name,
          set: (v) => {
            l.name = v;
          },
        },
        {
          id: `bible:loc:${l.id}:visualPromptTag`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Visual Prompt Tag',
          get: () => l.visualPromptTag,
          set: (v) => {
            l.visualPromptTag = v;
          },
        },
        {
          id: `bible:loc:${l.id}:architectureAndScale`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Architecture & Scale',
          get: () => l.architectureAndScale,
          set: (v) => {
            l.architectureAndScale = v;
          },
        },
        {
          id: `bible:loc:${l.id}:lightingAndAtmosphere`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Lighting & Atmosphere',
          get: () => l.lightingAndAtmosphere,
          set: (v) => {
            l.lightingAndAtmosphere = v;
          },
        },
        {
          id: `bible:loc:${l.id}:loreAndContext`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Lore & Context',
          get: () => l.loreAndContext,
          set: (v) => {
            l.loreAndContext = v;
          },
        }
      );
    });

    comic.storyBible.props.forEach((pr) => {
      const locLabel = `Prop: ${pr.name}`;
      fields.push(
        {
          id: `bible:prop:${pr.id}:name`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Name',
          get: () => pr.name,
          set: (v) => {
            pr.name = v;
          },
        },
        {
          id: `bible:prop:${pr.id}:visualPromptTag`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Visual Prompt Tag',
          get: () => pr.visualPromptTag,
          set: (v) => {
            pr.visualPromptTag = v;
          },
        },
        {
          id: `bible:prop:${pr.id}:visualDescription`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Visual Description',
          get: () => pr.visualDescription,
          set: (v) => {
            pr.visualDescription = v;
          },
        },
        {
          id: `bible:prop:${pr.id}:narrativePurpose`,
          scope: 'story-bible',
          locationLabel: locLabel,
          fieldLabel: 'Narrative Purpose',
          get: () => pr.narrativePurpose,
          set: (v) => {
            pr.narrativePurpose = v;
          },
        }
      );
    });
  }

  if (includeScenes) {
    comic.scenes.forEach((s) => {
      const locLabel = `Scene: ${s.title}`;
      fields.push(
        {
          id: `scene:${s.id}:title`,
          scope: 'scenes',
          locationLabel: locLabel,
          fieldLabel: 'Title',
          get: () => s.title,
          set: (v) => {
            s.title = v;
          },
        },
        {
          id: `scene:${s.id}:summary`,
          scope: 'scenes',
          locationLabel: locLabel,
          fieldLabel: 'Summary',
          get: () => s.summary,
          set: (v) => {
            s.summary = v;
          },
        },
        {
          id: `scene:${s.id}:dramaticBeat`,
          scope: 'scenes',
          locationLabel: locLabel,
          fieldLabel: 'Dramatic Beat',
          get: () => s.dramaticBeat,
          set: (v) => {
            s.dramaticBeat = v;
          },
        }
      );
    });
  }

  if (includeManuscript) {
    fields.push(
      {
        id: 'comic:title',
        scope: 'manuscript',
        locationLabel: 'Comic Metadata',
        fieldLabel: 'Title',
        get: () => comic.title,
        set: (v) => {
          comic.title = v;
        },
      },
      {
        id: 'comic:synopsis',
        scope: 'manuscript',
        locationLabel: 'Comic Metadata',
        fieldLabel: 'Synopsis',
        get: () => comic.synopsis,
        set: (v) => {
          comic.synopsis = v;
        },
      },
      {
        id: 'comic:manuscript',
        scope: 'manuscript',
        locationLabel: 'Manuscript',
        fieldLabel: 'Source Text',
        get: () => comic.manuscript,
        set: (v) => {
          comic.manuscript = v;
        },
      }
    );
  }

  return fields;
}

export type ComicEngine = Awaited<ReturnType<typeof createComicEngine>>;
