# Comics Creator

Comics Creator is a structured authoring environment for adapting manuscripts into comic layouts, managing world-building assets, and orchestrating iterative refinement and page illustration through external language and image models.

## Language

### Core Structure

**Comic**:
The top-level work containing a Manuscript, a Story Bible, a sequence of Scenes, and an ordered set of Pages.
_Avoid_: Project, book, issue, document

**Manuscript**:
The raw source prose, outline, or story text provided by the creator to be adapted into a Comic.
_Avoid_: Input text, raw script, source document

**Scene**:
A distinct narrative beat or dramatic unit of the story. A Scene is referenced by one or more Panels and may span part of a Page or multiple Pages.
_Avoid_: Chapter, act, sequence, segment

**Page**:
A single comic page containing an ordered layout of Panels and an optional rendered page illustration.
_Avoid_: Sheet, canvas, screen, spread

**Panel**:
A single framed comic moment on a Page, referencing one Scene and specifying relative layout dimensions, camera framing, visual action, participating Assets, and text elements.
_Avoid_: Frame, cell, box, tile

**Tier**:
A horizontal band of one or more Panels across a Page within the 12-column page layout grid.
_Avoid_: Row, strip, band

### Story Bible & Assets

**Story Bible**:
The canonical collection of world-building definitions for a Comic, comprising the global Visual Style and all reusable Assets.
_Avoid_: Asset library, world database, compendium, codex

**Visual Style**:
The global artistic direction of a Comic, defining medium, line weight, coloring approach, era, and mood.
_Avoid_: Theme, skin, art preset

**Asset**:
Any reusable world-building entity defined in the Story Bible—specifically a Character, Location, or Prop.
_Avoid_: Entity, resource, object

**Character**:
A recurring person, creature, or sentient agent in the Story Bible, defined by appearance, personality, motivation, and background.
_Avoid_: Actor, NPC, persona, figure

**Location**:
A recurring setting or environment in the Story Bible where narrative action takes place.
_Avoid_: Place, backdrop, environment, stage

**Prop**:
A recurring significant object, vehicle, or artifact in the Story Bible that requires visual consistency across appearances.
_Avoid_: Item, equipment, doodad

**Visual Prompt Tag**:
A condensed, canonical visual descriptor on an Asset that is injected into image generation prompts whenever that Asset appears on a Page or Panel.
_Avoid_: Appearance snippet, prompt fragment, image summary

### Panel Text Elements

**Dialogue**:
A line of speech, thought, whisper, or shout attributed to a specific Character within a Panel.
_Avoid_: Speech bubble, quote, utterance

**Caption**:
A narrative text box within a Panel used for voiceover narration, scene-setting, or time/place transitions.
_Avoid_: Narration box, subtitle, text box

**SFX**:
Stylized onomatopoeic sound-effect lettering displayed within a Panel.
_Avoid_: Sound effect, audio cue, noise

### LLM & Image Workflows

**Clipboard Bridge**:
The workflow that packages selected Comic elements, relevant Story Bible context, bespoke user instructions, and target JSON formatting instructions into the system clipboard for an external LLM, and ingests the returned JSON.
_Avoid_: Copy-paste mode, manual prompt, air-gapped export

**Staged Diff**:
The review state where incoming JSON changes from an external LLM are compared against the current Comic before being accepted into the canonical state.
_Avoid_: Staging area, import preview, draft buffer

**Targeted Patch Envelope**:
The structured JSON payload used for partial LLM updates, anchoring a selection by its parent container and selected IDs and replacing that selection with an ordered array of updated or newly split/merged elements.
_Avoid_: Partial payload, diff wrapper, update response

**Lettering Mode**:
The image-prompt configuration specifying whether Dialogue, Captions, and SFX are drawn inside the generated illustration (*Baked-in Lettering*) or omitted so the application can render them as overlays (*Clean Art Only*).
_Avoid_: Bubble mode, text toggle
