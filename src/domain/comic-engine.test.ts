import { describe, expect, it } from 'vitest';
import { createComicEngine, createInMemoryStorageAdapter } from './comic-engine';

describe('ComicEngine (Seam 1: Core Domain & Workflow)', () => {
  it('defines Story Bible assets (Visual Style, Character, Location, Prop) and Manuscript with immediate auto-save', async () => {
    const storage = createInMemoryStorageAdapter();
    const engine = await createComicEngine({ storage });

    engine.updateComicMeta({ title: 'Chronicles of Rust' });
    engine.updateManuscript('Aria steps onto the rain-slicked skybridge of Neo-Veridia, clutching the Chrono-Core.');

    engine.updateVisualStyle({
      artTradition: 'Franco-Belgian Ligne Claire meets Cyberpunk Noir',
      lineAndInking: 'Crisp uniform black ink lines with heavy architectural cross-hatching',
      colorPaletteAndShading: 'Teal rain shadows, amber sodium streetlamps, flat cel shading',
      eraAndTone: '2140 post-industrialnoir, tense and atmospheric',
      negativePrompt: 'photorealistic, 3d render, blurry lines',
    });

    const aria = engine.upsertCharacter({
      name: 'Aria Vance',
      aliases: ['The Clockmaker'],
      role: 'protagonist',
      appearance: {
        ageAndBuild: 'Late 20s, wiry athletic build',
        facialFeaturesAndHair: 'Sharp jawline, asymmetrical silver bob, brass ocular loupe over left eye',
        signatureOutfitAndColors: 'Weathered ochre trenchcoat over charcoal oil-stained mechanic jumpsuit',
        distinguishingMarks: 'Faint blue filament scars along right forearm',
        visualPromptTag: 'Aria Vance (late 20s, silver bob, brass ocular loupe on left eye, ochre trenchcoat over charcoal mechanic jumpsuit)',
      },
      personality: {
        coreTraits: ['analytical', 'guarded', 'fiercely loyal'],
        voiceAndSpeechStyle: 'Clipped, precise sentences using mechanical metaphors; rarely wastes words',
        quirksAndMannerisms: 'Adjusts her ocular loupe whenever she spots a lie',
      },
      motivation: {
        primaryGoal: 'Restore the city clockwork heart before the upper spire collapses',
        coreFearOrConflict: 'Terrified of repeating her mentor’s catastrophic calculation error',
        moralAlignmentOrCode: 'Never sacrifice a civilian to save a machine',
      },
      background: {
        summary: 'Former chief apprentice of the High Horologist, exiled to the lower tiers after the Great Stall.',
        relationships: [],
      },
    });

    const skybridge = engine.upsertLocation({
      name: 'Sector 7 Skybridge',
      type: 'exterior',
      architectureAndScale: 'Narrow cantilevered iron truss bridge spanning a mile-deep urban chasm',
      lightingAndAtmosphere: 'Sheets of acid rain illuminated by flickering amber neon kanji signs below',
      keyVisualLandmarks: ['rusted tollbooth gantry', 'exposed steam conduits along railings'],
      loreAndContext: 'The only toll-free crossing between the Foundry District and the Spire lifts.',
      visualPromptTag: 'Sector 7 Skybridge (cantilevered iron truss bridge over deep cyberpunk chasm, heavy rain, amber neon glow)',
    });

    const chronoCore = engine.upsertProp({
      name: 'Chrono-Core',
      category: 'artifact',
      visualDescription: 'Fist-sized brass gyroscope housing a pulsing cerulean tachyon crystal',
      narrativePurpose: 'Key stabilizer needed to restart the Spire’s central pendulum',
      ownerCharacterId: aria.id,
      visualPromptTag: 'Chrono-Core (brass gyroscope sphere with glowing blue crystal core)',
    });

    const state = engine.getComic();
    expect(state.title).toBe('Chronicles of Rust');
    expect(state.manuscript).toContain('Aria steps onto the rain-slicked skybridge');
    expect(state.storyBible.visualStyle.artTradition).toBe('Franco-Belgian Ligne Claire meets Cyberpunk Noir');
    expect(state.storyBible.characters).toHaveLength(1);
    expect(state.storyBible.characters[0]).toMatchObject({
      id: aria.id,
      name: 'Aria Vance',
      personality: {
        voiceAndSpeechStyle: 'Clipped, precise sentences using mechanical metaphors; rarely wastes words',
      },
    });
    expect(state.storyBible.locations[0].id).toBe(skybridge.id);
    expect(state.storyBible.props[0]).toMatchObject({
      id: chronoCore.id,
      ownerCharacterId: aria.id,
    });

    // Verify auto-save persisted the canonical JSON to storage without a manual save call
    const reloadedEngine = await createComicEngine({ storage });
    expect(reloadedEngine.getComic()).toEqual(state);
  });

  it('compiles the Initiation Prompt and imports an LLM draft via Staged Diff with 12-column Tier normalization and Asset extraction', async () => {
    const storage = createInMemoryStorageAdapter();
    const engine = await createComicEngine({ storage });

    engine.updateComicMeta({ title: 'Chronicles of Rust' });
    engine.updateManuscript(
      'Aria crosses Sector 7 Skybridge in the rain. Inspector Vane blocks the far gantry with a shock-halberd.'
    );
    const aria = engine.upsertCharacter({
      name: 'Aria Vance',
      aliases: [],
      role: 'protagonist',
      appearance: {
        ageAndBuild: 'Late 20s, wiry',
        facialFeaturesAndHair: 'Silver bob, brass ocular loupe',
        signatureOutfitAndColors: 'Ochre trenchcoat',
        distinguishingMarks: 'Blue filament scars',
        visualPromptTag: 'Aria Vance (silver bob, brass loupe, ochre trenchcoat)',
      },
      personality: {
        coreTraits: ['analytical'],
        voiceAndSpeechStyle: 'Clipped mechanical metaphors',
        quirksAndMannerisms: 'Touches loupe',
      },
      motivation: {
        primaryGoal: 'Restart the Spire pendulum',
        coreFearOrConflict: 'Calculation failure',
        moralAlignmentOrCode: 'Protect civilians',
      },
      background: {
        summary: 'Exiled horologist apprentice',
        relationships: [],
      },
    });

    const prompt = engine.buildInitiationPrompt({
      targetPageCount: 2,
      panelDensity: 'medium (4-6 panels/page)',
      bespokeInstruction: 'Open with a dramatic establishing tier, then build tension.',
    });

    expect(prompt).toContain('Aria crosses Sector 7 Skybridge in the rain');
    expect(prompt).toContain(aria.id);
    expect(prompt).toContain('Open with a dramatic establishing tier, then build tension.');
    expect(prompt).toContain('"colSpan"');
    expect(prompt).toContain('"scenes"');
    expect(prompt).toContain('"pages"');

    // Simulate LLM response wrapped in prose + markdown fences, with unnormalized colSpans (4 + 4 instead of 6 + 6)
    // and a newly discovered character (Inspector Vane) and location (Sector 7 Skybridge)
    const rawLlmOutput = `Here is your comic draft based on the manuscript:

\`\`\`json
{
  "kind": "initiation-draft",
  "synopsis": "Aria confronts Inspector Vane on the rain-swept skybridge.",
  "proposedAssets": {
    "characters": [
      {
        "id": "char-vane",
        "name": "Inspector Vane",
        "aliases": ["The Iron Hound"],
        "role": "antagonist",
        "appearance": {
          "ageAndBuild": "50s, broad-shouldered cyborg",
          "facialFeaturesAndHair": "Steel jawplate, buzzed gray hair",
          "signatureOutfitAndColors": "Black magistrategreatcoat with brasspauldrons",
          "distinguishingMarks": "Glowing red optic sensor",
          "visualPromptTag": "Inspector Vane (50s cyborg, steel jaw, black magistrate coat, red optic)"
        },
        "personality": {
          "coreTraits": ["relentless", "authoritarian"],
          "voiceAndSpeechStyle": "Booming legalistic decrees",
          "quirksAndMannerisms": "Taps shock-halberd on iron grating"
        },
        "motivation": {
          "primaryGoal": "Confiscate the Chrono-Core",
          "coreFearOrConflict": "Disorder in the lower tiers",
          "moralAlignmentOrCode": "Absolute law"
        },
        "background": {
          "summary": "Chief enforcer of the Spire Council.",
          "relationships": []
        }
      }
    ],
    "locations": [
      {
        "id": "loc-skybridge",
        "name": "Sector 7 Skybridge",
        "type": "exterior",
        "architectureAndScale": "Cantilevered iron truss bridge over a mile-deep chasm",
        "lightingAndAtmosphere": "Heavy rain and amber neon",
        "keyVisualLandmarks": ["tollbooth gantry"],
        "loreAndContext": "Main crossing to the Spire.",
        "visualPromptTag": "Sector 7 Skybridge (iron truss bridge in heavy cyberpunk rain)"
      }
    ],
    "props": []
  },
  "scenes": [
    {
      "id": "scene-1",
      "title": "Ambush on the Skybridge",
      "summary": "Vane intercepts Aria mid-crossing.",
      "dramaticBeat": "Inciting confrontation",
      "locationId": "loc-skybridge",
      "participatingCharacterIds": ["${aria.id}", "char-vane"]
    }
  ],
  "pages": [
    {
      "id": "page-1",
      "pageNumber": 1,
      "summary": "Aria steps onto the bridge and spots Vane.",
      "panels": [
        {
          "id": "panel-1",
          "sceneId": "scene-1",
          "row": 1,
          "colSpan": 12,
          "heightWeight": "lg",
          "framing": "extreme-wide",
          "visualDescription": "Establishing shot of Sector 7 Skybridge in pouring rain.",
          "characterIds": ["${aria.id}"],
          "locationId": "loc-skybridge",
          "propIds": [],
          "textElements": [
            { "id": "cap-1", "kind": "caption", "text": "SECTOR 7 SKYBRIDGE — 02:14 HOURS." }
          ]
        },
        {
          "id": "panel-2",
          "sceneId": "scene-1",
          "row": 2,
          "colSpan": 4,
          "heightWeight": "md",
          "framing": "close-up",
          "visualDescription": "Aria's brass loupe whirs as she spots a figure ahead.",
          "characterIds": ["${aria.id}"],
          "locationId": "loc-skybridge",
          "propIds": [],
          "textElements": [
            {
              "id": "dlg-1",
              "kind": "dialogue",
              "characterId": "${aria.id}",
              "text": "Gears are locking up ahead. Someone shut the toll gate.",
              "balloonStyle": "whisper"
            }
          ]
        },
        {
          "id": "panel-3",
          "sceneId": "scene-1",
          "row": 2,
          "colSpan": 4,
          "heightWeight": "md",
          "framing": "medium",
          "visualDescription": "Inspector Vane lowers his crackling shock-halberd.",
          "characterIds": ["char-vane"],
          "locationId": "loc-skybridge",
          "propIds": [],
          "textElements": [
            { "id": "sfx-1", "kind": "sfx", "text": "KZZT-THoom!" },
            {
              "id": "dlg-2",
              "kind": "dialogue",
              "characterId": "char-vane",
              "text": "Halt, Apprentice. By order of the Council, surrender the Core.",
              "balloonStyle": "shout"
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`
Let me know if you want any adjustments!`;

    const staged = engine.stageLlmResponse(rawLlmOutput);
    expect(staged.kind).toBe('initiation-draft');
    expect(staged.warnings.length).toBeGreaterThan(0); // Row 2 colSpan 4+4 normalized to 6+6

    // Canonical comic is untouched until staged diff is applied
    expect(engine.getComic().pages).toHaveLength(0);
    expect(engine.getComic().storyBible.characters).toHaveLength(1);

    const updated = engine.applyStagedDiff();
    expect(engine.getStagedDiff()).toBeNull();
    expect(updated.scenes).toHaveLength(1);
    expect(updated.pages).toHaveLength(1);
    expect(updated.pages[0].panels).toHaveLength(3);
    // Verify Row 2 colSpan was normalized to sum to 12 (6 + 6)
    expect(updated.pages[0].panels[1].colSpan).toBe(6);
    expect(updated.pages[0].panels[2].colSpan).toBe(6);
    // Verify newly proposed character & location were merged into Story Bible alongside existing Aria
    expect(updated.storyBible.characters.map((c) => c.name)).toEqual([
      'Aria Vance',
      'Inspector Vane',
    ]);
    expect(updated.storyBible.locations.map((l) => l.name)).toEqual(['Sector 7 Skybridge']);
  });

  it('builds lightweight selection-only prompts (ADR-0005) and splices Targeted Patch Envelopes for panels and dialogue (ADR-0004)', async () => {
    const engine = await createComicEngine();
    engine.updateManuscript('Secret manuscript text that must NOT be re-sent in partial prompts.');
    engine.upsertCharacter({
      id: 'char-aria',
      name: 'Aria Vance',
      aliases: [],
      role: 'protagonist',
      appearance: {
        ageAndBuild: '20s',
        facialFeaturesAndHair: 'Silver bob',
        signatureOutfitAndColors: 'Ochre coat',
        distinguishingMarks: 'Loupe',
        visualPromptTag: 'Aria Vance (silver bob, ochre coat)',
      },
      personality: {
        coreTraits: ['sharp'],
        voiceAndSpeechStyle: 'Clipped',
        quirksAndMannerisms: '',
      },
      motivation: {
        primaryGoal: 'Save Spire',
        coreFearOrConflict: 'Failure',
        moralAlignmentOrCode: '',
      },
      background: { summary: 'Exiled apprentice', relationships: [] },
    });

    // Seed 2 pages via initiation draft
    engine.stageLlmResponse(
      JSON.stringify({
        kind: 'initiation-draft',
        scenes: [
          {
            id: 'scene-1',
            title: 'Bridge Stand-off',
            summary: 'Aria vs Vane',
            dramaticBeat: 'Tension',
            participatingCharacterIds: ['char-aria'],
          },
        ],
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            summary: 'Page One Summary',
            panels: [
              {
                id: 'panel-1',
                sceneId: 'scene-1',
                row: 1,
                colSpan: 12,
                heightWeight: 'md',
                framing: 'wide',
                visualDescription: 'Panel One Establishing Shot',
                characterIds: ['char-aria'],
                propIds: [],
                textElements: [
                  {
                    id: 'dlg-1',
                    kind: 'dialogue',
                    characterId: 'char-aria',
                    text: 'Original first line.',
                    balloonStyle: 'speech',
                  },
                  {
                    id: 'dlg-2',
                    kind: 'dialogue',
                    characterId: 'char-aria',
                    text: 'Original second line to rewrite.',
                    balloonStyle: 'speech',
                  },
                ],
              },
              {
                id: 'panel-2',
                sceneId: 'scene-1',
                row: 2,
                colSpan: 12,
                heightWeight: 'lg',
                framing: 'medium',
                visualDescription: 'Aria draws the Chrono-Core from her satchel.',
                characterIds: ['char-aria'],
                propIds: [],
                textElements: [],
              },
            ],
          },
          {
            id: 'page-2',
            pageNumber: 2,
            summary: 'Unselected Page Two Secret Summary',
            panels: [],
          },
        ],
      })
    );
    engine.applyStagedDiff();

    // 1. Select ONLY panel-2 on page-1 and ask the LLM to split it into two panels
    const panelPrompt = engine.buildSelectionPrompt(
      {
        scope: 'panels',
        parentId: 'page-1',
        selectedIds: ['panel-2'],
      },
      'Split this panel into two side-by-side panels: first her hand unlatching the brass satchel, then the glowing Chrono-Core emerging.'
    );

    // Must contain the selected panel and bespoke instruction
    expect(panelPrompt).toContain('Aria draws the Chrono-Core from her satchel.');
    expect(panelPrompt).toContain('Split this panel into two side-by-side panels');
    // Must NOT include unselected panels, unselected pages, or the full manuscript (ADR-0005)
    expect(panelPrompt).not.toContain('Panel One Establishing Shot');
    expect(panelPrompt).not.toContain('Unselected Page Two Secret Summary');
    expect(panelPrompt).not.toContain('Secret manuscript text that must NOT be re-sent');

    // Stage and apply the 1-to-2 panel split patch
    const stagedPanelPatch = engine.stageLlmResponse(
      JSON.stringify({
        kind: 'targeted-patch',
        scope: 'panels',
        parentId: 'page-1',
        selectedIds: ['panel-2'],
        replacements: [
          {
            id: 'panel-2a',
            sceneId: 'scene-1',
            row: 2,
            colSpan: 6,
            heightWeight: 'lg',
            framing: 'close-up',
            visualDescription: 'Close-up on Aria’s gloved fingers unlatching the brass buckle.',
            characterIds: ['char-aria'],
            propIds: [],
            textElements: [],
          },
          {
            id: 'panel-2b',
            sceneId: 'scene-1',
            row: 2,
            colSpan: 6,
            heightWeight: 'lg',
            framing: 'extreme-close-up',
            visualDescription: 'The Chrono-Core rises from the satchel, casting cerulean light.',
            characterIds: ['char-aria'],
            propIds: [],
            textElements: [],
          },
        ],
      })
    );

    expect(stagedPanelPatch.kind).toBe('targeted-patch');
    const afterPanelSplit = engine.applyStagedDiff();
    expect(afterPanelSplit.pages[0].panels.map((p) => p.id)).toEqual([
      'panel-1',
      'panel-2a',
      'panel-2b',
    ]);

    // 2. Select ONLY dialogue dlg-2 inside panel-1 and rewrite it
    const dialoguePrompt = engine.buildSelectionPrompt(
      {
        scope: 'text-elements',
        parentId: 'panel-1',
        selectedIds: ['dlg-2'],
      },
      'Make this line sound more urgent and use a clockwork metaphor.'
    );

    expect(dialoguePrompt).toContain('Original second line to rewrite.');
    expect(dialoguePrompt).not.toContain('Original first line.');

    engine.stageLlmResponse(
      JSON.stringify({
        kind: 'targeted-patch',
        scope: 'text-elements',
        parentId: 'panel-1',
        selectedIds: ['dlg-2'],
        replacements: [
          {
            id: 'dlg-2',
            kind: 'dialogue',
            characterId: 'char-aria',
            text: 'The mainspring is wound to snapping—move now!',
            balloonStyle: 'shout',
          },
        ],
      })
    );
    const afterDialogueEdit = engine.applyStagedDiff();
    expect(afterDialogueEdit.pages[0].panels[0].textElements).toEqual([
      {
        id: 'dlg-1',
        kind: 'dialogue',
        characterId: 'char-aria',
        speakerName: undefined,
        text: 'Original first line.',
        balloonStyle: 'speech',
      },
      {
        id: 'dlg-2',
        kind: 'dialogue',
        characterId: 'char-aria',
        speakerName: undefined,
        text: 'The mainspring is wound to snapping—move now!',
        balloonStyle: 'shout',
      },
    ]);
  });

  it('compiles single-page and multi-page image generation prompts with referenced Assets, Tier layout, and Lettering Mode toggle', async () => {
    const engine = await createComicEngine();

    engine.updateVisualStyle({
      artTradition: 'Ligne Claire Cyberpunk',
      lineAndInking: 'Bold black ink outlines',
      colorPaletteAndShading: 'Amber neon and rain-washed teal',
      eraAndTone: '2140 noir',
      negativePrompt: 'blurry, 3d render',
    });

    engine.upsertCharacter({
      id: 'char-aria',
      name: 'Aria Vance',
      aliases: [],
      role: 'protagonist',
      appearance: {
        ageAndBuild: 'Late 20s',
        facialFeaturesAndHair: 'Silver bob, brass loupe',
        signatureOutfitAndColors: 'Ochre trenchcoat',
        distinguishingMarks: 'Blue scars',
        visualPromptTag: 'Aria Vance (silver bob, brass ocular loupe, ochre trenchcoat)',
      },
      personality: { coreTraits: [], voiceAndSpeechStyle: '', quirksAndMannerisms: '' },
      motivation: { primaryGoal: '', coreFearOrConflict: '', moralAlignmentOrCode: '' },
      background: { summary: '', relationships: [] },
    });

    engine.upsertCharacter({
      id: 'char-unused',
      name: 'Lord Morvath',
      aliases: [],
      role: 'antagonist',
      appearance: {
        ageAndBuild: '70s',
        facialFeaturesAndHair: 'Tall velvet mitre',
        signatureOutfitAndColors: 'Crimson robes',
        distinguishingMarks: 'Gold staff',
        visualPromptTag: 'Lord Morvath (crimson robes, velvet mitre)',
      },
      personality: { coreTraits: [], voiceAndSpeechStyle: '', quirksAndMannerisms: '' },
      motivation: { primaryGoal: '', coreFearOrConflict: '', moralAlignmentOrCode: '' },
      background: { summary: '', relationships: [] },
    });

    engine.upsertLocation({
      id: 'loc-bridge',
      name: 'Sector 7 Skybridge',
      type: 'exterior',
      architectureAndScale: 'Iron truss bridge',
      lightingAndAtmosphere: 'Heavy rain',
      keyVisualLandmarks: ['tollbooth'],
      loreAndContext: '',
      visualPromptTag: 'Sector 7 Skybridge (iron truss bridge in heavy rain)',
    });

    engine.upsertProp({
      id: 'prop-core',
      name: 'Chrono-Core',
      category: 'artifact',
      visualDescription: 'Brass gyroscope',
      narrativePurpose: '',
      visualPromptTag: 'Chrono-Core (glowing blue brass gyroscope)',
    });

    engine.stageLlmResponse(
      JSON.stringify({
        kind: 'initiation-draft',
        scenes: [
          {
            id: 'scene-1',
            title: 'Crossing',
            summary: 'Aria crosses the bridge',
            dramaticBeat: 'Opening',
            locationId: 'loc-bridge',
            participatingCharacterIds: ['char-aria'],
          },
        ],
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            summary: 'Aria enters the bridge',
            panels: [
              {
                id: 'panel-1',
                sceneId: 'scene-1',
                row: 1,
                colSpan: 12,
                heightWeight: 'lg',
                framing: 'wide',
                visualDescription: 'Aria steps onto the rain-slicked iron bridge.',
                characterIds: ['char-aria'],
                locationId: 'loc-bridge',
                propIds: [],
                textElements: [
                  {
                    id: 'dlg-1',
                    kind: 'dialogue',
                    characterId: 'char-aria',
                    text: 'Almost across.',
                    balloonStyle: 'whisper',
                  },
                ],
              },
            ],
          },
          {
            id: 'page-2',
            pageNumber: 2,
            summary: 'Aria activates the core',
            panels: [
              {
                id: 'panel-2',
                sceneId: 'scene-1',
                row: 1,
                colSpan: 6,
                heightWeight: 'md',
                framing: 'close-up',
                visualDescription: 'Aria holds up the Chrono-Core.',
                characterIds: ['char-aria'],
                locationId: 'loc-bridge',
                propIds: ['prop-core'],
                textElements: [
                  {
                    id: 'sfx-1',
                    kind: 'sfx',
                    text: 'VMMMM!',
                  },
                ],
              },
              {
                id: 'panel-3',
                sceneId: 'scene-1',
                row: 1,
                colSpan: 6,
                heightWeight: 'md',
                framing: 'medium',
                visualDescription: 'Blue light floods the tollbooth.',
                characterIds: [],
                locationId: 'loc-bridge',
                propIds: ['prop-core'],
                textElements: [],
              },
            ],
          },
        ],
      })
    );
    engine.applyStagedDiff();

    // 1. Composite multi-page spread prompt with Baked-in Lettering
    const compositePrompts = engine.buildImagePrompts({
      pageIds: ['page-1', 'page-2'],
      deliveryMode: 'composite-spread',
      letteringMode: 'baked-in',
      bespokeInstruction: 'Emphasize rain reflections on the iron girders.',
    });

    expect(compositePrompts).toHaveLength(1);
    expect(compositePrompts[0].title).toContain('Pages 1–2');
    expect(compositePrompts[0].prompt).toContain('Ligne Claire Cyberpunk');
    expect(compositePrompts[0].prompt).toContain(
      'Aria Vance (silver bob, brass ocular loupe, ochre trenchcoat)'
    );
    expect(compositePrompts[0].prompt).toContain(
      'Sector 7 Skybridge (iron truss bridge in heavy rain)'
    );
    expect(compositePrompts[0].prompt).toContain(
      'Chrono-Core (glowing blue brass gyroscope)'
    );
    // Unused character Lord Morvath must NOT pollute the image prompt
    expect(compositePrompts[0].prompt).not.toContain('Lord Morvath');
    // Baked-in lettering includes dialogue & SFX
    expect(compositePrompts[0].prompt).toContain('Almost across.');
    expect(compositePrompts[0].prompt).toContain('VMMMM!');
    expect(compositePrompts[0].prompt).toContain('Emphasize rain reflections');

    // 2. Per-page prompts with Clean Art Only (no lettering)
    const perPageCleanPrompts = engine.buildImagePrompts({
      pageIds: ['page-1', 'page-2'],
      deliveryMode: 'per-page',
      letteringMode: 'clean-art',
    });

    expect(perPageCleanPrompts).toHaveLength(2);
    expect(perPageCleanPrompts[0].prompt).not.toContain('Almost across.');
    expect(perPageCleanPrompts[0].prompt).toContain('NO speech bubbles, captions, or text');
    // Page 1 does not use Chrono-Core, so Page 1's individual prompt omits Chrono-Core
    expect(perPageCleanPrompts[0].prompt).not.toContain('Chrono-Core');
    expect(perPageCleanPrompts[1].prompt).toContain('Chrono-Core');

    // 3. Attach generated image to Page 1 and verify persistence
    engine.attachPageImage('page-1', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
    expect(engine.getComic().pages[0].renderedImageDataUrl).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    );
  });
});



