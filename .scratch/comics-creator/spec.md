Status: ready-for-agent

# Comics Creator Specification

## Problem Statement

Creating a comic from a prose manuscript or story idea using external LLMs and image generators is fragmented and error-prone. Creators lose track of character appearances, voices, and locations across chat prompts; LLMs produce inconsistent panel layouts when unstructured; and refining a single panel or line of dialogue requires manually re-stitching prose back into a script. Furthermore, assembling self-contained image generation prompts that accurately combine only the characters, locations, props, panel geometry, and speech bubbles appearing on specific pages requires tedious manual copy-pasting.

## Solution

Comics Creator is a local-first, 3-pane web studio that gives every element of a comic—its **Story Bible** (**Visual Style**, **Characters**, **Locations**, **Props**), **Scenes**, **Pages**, **Tiers**, **Panels**, and **Dialogue**/**Captions**/**SFX**—a canonical JSON structure.

1. **Story Bible Definition**: Users can define and edit **Visual Style**, **Characters** (structured appearance, personality, motivation, and background), **Locations**, and **Props**, each carrying a condensed **Visual Prompt Tag**.
2. **Initiation Phase**: Users paste or upload a **Manuscript**, configure optional pacing hints and bespoke instructions, and click a button to copy a comprehensive Initiation Prompt (including existing Story Bible Assets and the required JSON schema) via the **Clipboard Bridge**.
3. **Draft Rendering & Auto-Normalization**: Pasting the LLM's response back parses the JSON forgivingly, normalizes each Page's **Tier** layout onto a 12-column grid, previews changes in a **Staged Diff**, and renders the comic visually in the center canvas.
4. **Lightweight Selective Refinement**: Users can select whole **Pages**, specific **Panels**, individual **Dialogue**/**Caption**/**SFX** items, or **Story Bible Assets**, enter bespoke instructions, and copy a lightweight prompt containing **only the selected elements** and the **Targeted Patch Envelope** schema (reusing their active LLM chat window's context). Importing the LLM's response splices the replacement slice in place—supporting 1-to-N splits, N-to-1 merges, and in-place rewrites after **Staged Diff** review.
5. **Page & Multi-Page Image Prompts**: Users can select one or more **Pages** (or **Panels**) to generate clipboard-ready image generation prompts that automatically inject the global **Visual Style**, referenced Asset appearances, 12-column panel layout geometry, and panel visuals, with toggles for **Composite Multi-Page Spread vs. Per-Page Prompts** and **Baked-in Lettering vs. Clean Art Only**, plus support for attaching rendered images back onto Pages or Panels.

## User Stories

1. As a comic creator, I want to define and edit the global **Visual Style** (art tradition, line and inking, color palette and shading, era and tone, negative prompt), so that all LLM and image prompts share a unified aesthetic direction.
2. As a comic creator, I want to create and edit **Characters** with structured fields for Appearance (`ageAndBuild`, `facialFeaturesAndHair`, `signatureOutfitAndColors`, `distinguishingMarks`, `visualPromptTag`), Personality (`coreTraits`, `voiceAndSpeechStyle`, `quirksAndMannerisms`), Motivation (`primaryGoal`, `coreFearOrConflict`, `moralAlignmentOrCode`), and Background (`summary`, `relationships`), so that the LLM writes consistent character voices and image models draw consistent character designs.
3. As a comic creator, I want to create and edit **Locations** (`name`, `type`, `architectureAndScale`, `lightingAndAtmosphere`, `keyVisualLandmarks`, `loreAndContext`, `visualPromptTag`), so that recurring settings remain visually and narratively grounded.
4. As a comic creator, I want to create and edit **Props** (`name`, `category`, `visualDescription`, `narrativePurpose`, `ownerCharacterId`, `visualPromptTag`), so that recurring items or vehicles stay consistent across scenes.
5. As a comic creator, I want to paste or upload a **Manuscript** in the Initiation view and set optional pacing hints (target page count, panel density) and a bespoke instruction, so that I can guide how the story is adapted into a comic.
6. As a comic creator, I want to click one button in the Initiation Phase to copy a structured prompt containing my **Manuscript**, existing **Story Bible**, bespoke instructions, and the required Comic JSON schema to my clipboard, so that I can paste it into any external LLM chat window.
7. As a comic creator, I want the Initiation JSON schema to instruct the LLM to break the story into **Scenes**, decide how many **Pages** and **Panels** to use, specify each Panel's relative sizing (`row`, `colSpan` 1–12, `heightWeight`, `framing`), link existing Story Bible Assets by ID, and propose any newly discovered **Characters**, **Locations**, and **Props**, so that I get a complete comic draft and populated Story Bible in one pass.
8. As a comic creator, I want to paste the LLM's response into the app even if it includes markdown ` ```json ` fences or conversational text, and have the app automatically extract the JSON, mint missing IDs, and normalize each Page **Tier**'s `colSpan` values to sum to 12, so that minor LLM formatting quirks never break the import.
9. As a comic creator, I want to inspect incoming LLM drafts and partial patches in a **Staged Diff** review modal showing Before vs. After changes and newly proposed Story Bible Assets before accepting them, so that I never accidentally overwrite work I want to keep.
10. As a comic creator, I want to view my **Pages** rendered visually in a 12-column **Tier** grid canvas where each **Panel** displays its relative width/height, camera framing badge, visual description, participating Asset pills, and styled **Dialogue** balloons, **Captions**, and **SFX**, so that I can read and evaluate the comic's pacing and layout.
11. As a comic creator, I want **Scenes** to be stored as a narrative sequence referenced by each **Panel**'s `sceneId`, so that a single Scene can span multiple Pages or transition mid-page without breaking page layout.
12. As a comic creator, I want to click or multi-select whole **Pages**, specific **Panels**, individual **Dialogue**/**Caption**/**SFX** elements, or **Story Bible Assets**, enter a bespoke instruction, and copy a lightweight prompt containing **only the selected elements**, the instruction, and the **Targeted Patch Envelope** schema, so that I can reuse my existing LLM chat window without re-sending the entire comic.
13. As a comic creator, I want the **Targeted Patch Envelope** import to splice the LLM's ordered `replacements` array directly in place of my `selectedIds` inside the parent container, so that an instruction like *"split this panel into three panels"* or *"merge these two panels"* updates the Page seamlessly without disturbing surrounding panels.
14. As a comic creator, I want to directly edit any field of any **Asset**, **Scene**, **Page**, **Panel** (including `row`, `colSpan`, `heightWeight`, `framing`, visual description, and Asset links), or **Dialogue**/**Caption**/**SFX** in the UI and have every change auto-save immediately to browser storage, so that I can make manual tweaks at any time without an LLM round-trip.
15. As a comic creator, I want to select one or more **Pages** (or **Panels**) and generate a clipboard-ready image generation prompt that automatically compiles the global **Visual Style**, only the **Characters**, **Locations**, and **Props** appearing on those pages (with their `visualPromptTag` and appearance details), the 12-column **Tier** and **Panel** layout geometry, and panel visuals, so that I can generate comic page illustrations in an external image model.
16. As a comic creator, I want to toggle between **Composite Multi-Page Spread** (one prompt rendering multiple pages together) and **Per-Page Prompt Pack** (individual page prompts), and between **Baked-in Lettering** (speech bubbles and text drawn inside the generated image) and **Clean Art Only** (artwork without text bubbles, with app-rendered overlays), so that my image prompts match the capabilities of my chosen image generator.
17. As a comic creator, I want to upload or paste generated images back onto a **Page** or **Panel** in the app, so that I can view the illustrated comic alongside the structured script.
18. As a comic creator, I want to export my entire **Comic** as a `.json` file and import a `.json` file from disk, so that I can back up, version, and share my project.

## Implementation Decisions

- **Page-Centric Layout Hierarchy (`Comic → Page[] → Panel[]` with `Scene[]`)**: Per ADR-0001, `Comic` holds `scenes: Scene[]` and `pages: Page[]`. Each `Panel` references `sceneId: string`.
- **Tiered 12-Column Grid**: Per ADR-0003, each `Panel` has `row: number` (1-based Tier index on the Page), `colSpan: number` (`1..12`), `heightWeight: "sm" | "md" | "lg" | "xl" | "splash"`, and `framing`. An auto-normalizer ensures all panels sharing the same `row` on a `Page` have `colSpan` values summing to `12`.
- **Lightweight Selection-Only Prompts**: Per ADR-0005, partial refinement prompts serialize only the selected elements (`pages`, `panels`, `textElements`, or `assets`), the bespoke instruction, and the `Targeted Patch Envelope` schema instructions, relying on the user's persistent LLM chat session for global context.
- **Slice-Based Targeted Patch Envelope**: Per ADR-0004, partial updates use `{ scope: "pages" | "panels" | "text-elements" | "assets" | "scenes", parentId?: string, selectedIds: string[], replacements: unknown[], proposedAssets?: Partial<StoryBible> }` and splice `replacements` in place of the contiguous/targeted `selectedIds` inside `parentId`.
- **Deep Core Module (`ComicEngine`)**: All domain state transitions, prompt compilation (Initiation, Partial Selection, Image Generation), forgiving JSON extraction, 12-column Tier normalization, Staged Diff computation/application, and persistence coordination sit behind a single deep module interface (`ComicEngine`) decoupled from React and browser APIs via an injectable storage adapter.
- **3-Pane Studio UI**: Next.js (App Router) + React + TypeScript + Tailwind CSS with:
  - Left Sidebar: Mode switcher (`Initiation`, `Story Bible`, `Comic Canvas`), outline tree with multi-selection, and `.json` project export/import.
  - Center Workspace: Manuscript & Initiation view, Story Bible structured editors, or interactive 12-column Page/Panel/Dialogue canvas.
  - Right Dock: Direct Property Inspector (auto-saving on edit), LLM Clipboard Bridge (selection pills, bespoke instruction, prompt copy, JSON import & Staged Diff trigger), and Image Prompt Studio (1+ pages, Composite vs. Per-Page, Baked-in vs. Clean Art lettering, image attachment).

## Testing Decisions

- **What makes a good test**: Tests verify observable behavior and outputs through public interfaces (`ComicEngine` and `<ComicStudioApp />`) using concrete domain scenarios from `GLOSSARY.md`, never mocking internal helpers or asserting tautologies.
- **Seam 1 — Core Domain & Workflow Seam (`ComicEngine`)**:
  - Catches: Story Bible CRUD, Initiation prompt compilation, lightweight selection-only prompt compilation (verifying unselected pages/assets are omitted per ADR-0005), forgiving LLM JSON parsing (markdown fences, prose, missing IDs), Tier 12-column `colSpan` auto-normalization, Staged Diff generation, slice-based `Targeted Patch Envelope` splicing (1-to-N panel splits, N-to-1 merges, dialogue edits), multi-page/single-page image prompt generation (`composite-spread` vs `per-page`, `baked-in` vs `clean-art`), and auto-save persistence via an in-memory storage adapter.
  - Misses: React DOM event binding and visual layout styling.
- **Seam 2 — Studio UI Integration Seam (`<ComicStudioApp />`)**:
  - Catches: User workflows through the 3-pane UI—editing Story Bible assets with auto-save, running the Initiation flow, reviewing and applying a Staged Diff, selecting Pages/Panels/Dialogue on the canvas to generate a partial prompt, applying a partial update, and generating page image prompts.
  - Misses: Real browser visual rendering (verified manually via dev server).

## Out of Scope

- Direct server-side LLM or image generator API calls requiring API keys or billing accounts (all AI interaction uses the Clipboard Bridge per ADR-0002).
- Multi-user real-time cloud collaboration or server-side authentication.
- Freehand drawing/painting tools (raster canvas brush editing).
