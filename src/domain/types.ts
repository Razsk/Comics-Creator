export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor';

export interface CharacterAppearance {
  ageAndBuild: string;
  facialFeaturesAndHair: string;
  signatureOutfitAndColors: string;
  distinguishingMarks: string;
  visualPromptTag: string;
}

export interface CharacterPersonality {
  coreTraits: string[];
  voiceAndSpeechStyle: string;
  quirksAndMannerisms: string;
}

export interface CharacterMotivation {
  primaryGoal: string;
  coreFearOrConflict: string;
  moralAlignmentOrCode: string;
}

export interface CharacterRelationship {
  targetCharacterId: string;
  relation: string;
}

export interface CharacterBackground {
  summary: string;
  relationships: CharacterRelationship[];
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  role: CharacterRole;
  appearance: CharacterAppearance;
  personality: CharacterPersonality;
  motivation: CharacterMotivation;
  background: CharacterBackground;
  referenceImageDataUrl?: string;
}

export type LocationType = 'interior' | 'exterior' | 'mixed';

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  architectureAndScale: string;
  lightingAndAtmosphere: string;
  keyVisualLandmarks: string[];
  loreAndContext: string;
  visualPromptTag: string;
  referenceImageDataUrl?: string;
}

export interface Prop {
  id: string;
  name: string;
  category: string;
  visualDescription: string;
  narrativePurpose: string;
  ownerCharacterId?: string;
  visualPromptTag: string;
  referenceImageDataUrl?: string;
}

export interface VisualStyle {
  artTradition: string;
  lineAndInking: string;
  colorPaletteAndShading: string;
  eraAndTone: string;
  negativePrompt: string;
}

export interface StoryBible {
  visualStyle: VisualStyle;
  characters: Character[];
  locations: Location[];
  props: Prop[];
}

export interface Scene {
  id: string;
  title: string;
  summary: string;
  dramaticBeat: string;
  locationId?: string;
  participatingCharacterIds: string[];
}

export type PanelHeightWeight = 'sm' | 'md' | 'lg' | 'xl' | 'splash';

export type PanelFraming =
  | 'extreme-wide'
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close-up'
  | 'dutch-angle'
  | 'birds-eye'
  | 'worms-eye';

export type DialogueBalloonStyle = 'speech' | 'thought' | 'whisper' | 'shout';

export interface DialogueElement {
  id: string;
  kind: 'dialogue';
  characterId: string;
  speakerName?: string;
  text: string;
  balloonStyle: DialogueBalloonStyle;
}

export interface CaptionElement {
  id: string;
  kind: 'caption';
  text: string;
}

export interface SfxElement {
  id: string;
  kind: 'sfx';
  text: string;
  visualStyle?: string;
}

export type PanelTextElement = DialogueElement | CaptionElement | SfxElement;

export interface Panel {
  id: string;
  sceneId: string;
  row: number;
  colSpan: number;
  heightWeight: PanelHeightWeight;
  framing: PanelFraming;
  visualDescription: string;
  characterIds: string[];
  locationId?: string;
  propIds: string[];
  textElements: PanelTextElement[];
  renderedImageDataUrl?: string;
}

export interface Page {
  id: string;
  pageNumber: number;
  summary?: string;
  panels: Panel[];
  renderedImageDataUrl?: string;
}

export interface Comic {
  id: string;
  title: string;
  synopsis: string;
  manuscript: string;
  storyBible: StoryBible;
  scenes: Scene[];
  pages: Page[];
  updatedAt: string;
}

export interface ComicStorageAdapter {
  load(): Promise<Comic | null>;
  save(comic: Comic): Promise<void>;
}

export interface InitiationPromptOptions {
  targetPageCount?: number;
  panelDensity?: string;
  bespokeInstruction?: string;
}

export interface ProposedAssets {
  characters: Character[];
  locations: Location[];
  props: Prop[];
}

export type TargetedPatchScope =
  | 'pages'
  | 'panels'
  | 'text-elements'
  | 'characters'
  | 'locations'
  | 'props'
  | 'scenes';

export interface SelectionTarget {
  scope: TargetedPatchScope;
  parentId?: string;
  selectedIds: string[];
}

export interface StagedInitiationDraft {
  kind: 'initiation-draft';
  summary: string;
  synopsis?: string;
  proposedAssets: ProposedAssets;
  scenes: Scene[];
  pages: Page[];
  warnings: string[];
}

export interface StagedTargetedPatch {
  kind: 'targeted-patch';
  summary: string;
  scope: TargetedPatchScope;
  parentId?: string;
  selectedIds: string[];
  before: unknown[];
  replacements: unknown[];
  proposedAssets?: ProposedAssets;
  warnings: string[];
}

export type StagedDiff = StagedInitiationDraft | StagedTargetedPatch;

export type ImagePromptDeliveryMode = 'composite-spread' | 'per-page';
export type LetteringMode = 'baked-in' | 'clean-art';

export interface ImagePromptOptions {
  pageIds: string[];
  panelIds?: string[];
  deliveryMode: ImagePromptDeliveryMode;
  letteringMode: LetteringMode;
  bespokeInstruction?: string;
}

export interface CompiledImagePrompt {
  id: string;
  title: string;
  pageIds: string[];
  prompt: string;
}

export type SearchReplaceScope =
  | 'all'
  | 'panels-and-speech'
  | 'speech'
  | 'panels'
  | 'story-bible'
  | 'scenes'
  | 'manuscript';

export interface SearchQueryOptions {
  query: string;
  useRegex?: boolean;
  caseSensitive?: boolean;
  scope?: SearchReplaceScope;
  replacement?: string;
}

export interface SearchMatchItem {
  id: string;
  scope: 'speech' | 'panels' | 'story-bible' | 'scenes' | 'manuscript';
  locationLabel: string;
  fieldLabel: string;
  pageId?: string;
  panelId?: string;
  textElementId?: string;
  sourceText: string;
  matchCount: number;
  matches: string[];
  previewAfter?: string;
}

export interface SearchResult {
  totalMatches: number;
  items: SearchMatchItem[];
  error?: string;
}

export interface ReplaceQueryOptions {
  query: string;
  replacement: string;
  useRegex?: boolean;
  caseSensitive?: boolean;
  scope?: SearchReplaceScope;
  targetItemIds?: string[];
}

export interface ReplaceResult {
  replacedCount: number;
  affectedFields: number;
  error?: string;
}

export type PageImageUploadMode = 'fill-empty' | 'append';

export interface UploadedPageImageInput {
  dataUrl: string;
  name?: string;
}





