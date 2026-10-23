'use client';

import React from 'react';
import {
  Character,
  CharacterRole,
  Comic,
  Location,
  LocationType,
  Prop,
  SelectionTarget,
} from '@/domain/types';
import { ComicEngine } from '@/domain/comic-engine';

export type StoryBibleTab = 'characters' | 'locations' | 'props' | 'visual-style';

export interface StoryBibleViewProps {
  comic: Comic;
  engine: ComicEngine;
  bibleTab: StoryBibleTab;
  setBibleTab: (tab: StoryBibleTab) => void;
  activeCharacter?: Character;
  setActiveCharacterId: (id: string) => void;
  activeLocation?: Location;
  setActiveLocationId: (id: string) => void;
  activeProp?: Prop;
  setActivePropId: (id: string) => void;
  onSelectElement: (scope: SelectionTarget['scope'], id: string) => void;
  onAddCharacter: () => void;
  onAddLocation: () => void;
  onAddProp: () => void;
}

export function StoryBibleView({
  comic,
  engine,
  bibleTab,
  setBibleTab,
  activeCharacter,
  setActiveCharacterId,
  activeLocation,
  setActiveLocationId,
  activeProp,
  setActivePropId,
  onSelectElement,
  onAddCharacter,
  onAddLocation,
  onAddProp,
}: StoryBibleViewProps) {
  return (
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
            onClick={onAddCharacter}
            className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
          >
            + New Character
          </button>
          <button
            type="button"
            onClick={onAddLocation}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            + New Location
          </button>
          <button
            type="button"
            onClick={onAddProp}
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
                  onSelectElement('characters', c.id);
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

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Relationships</span>
                      <button
                        type="button"
                        onClick={() =>
                          engine.upsertCharacter({
                            ...activeCharacter,
                            background: {
                              ...activeCharacter.background,
                              relationships: [
                                ...activeCharacter.background.relationships,
                                {
                                  targetCharacterId:
                                    comic.storyBible.characters.find(
                                      (c) => c.id !== activeCharacter.id
                                    )?.id ?? '',
                                  relation: 'Rival / Ally',
                                },
                              ],
                            },
                          })
                        }
                        className="text-xs text-amber-300 hover:underline"
                      >
                        + Add Relationship
                      </button>
                    </div>
                    {activeCharacter.background.relationships.map((rel, relIdx) => (
                      <div key={relIdx} className="flex gap-2">
                        <select
                          aria-label={`Relationship Target ${relIdx + 1}`}
                          value={rel.targetCharacterId}
                          onChange={(e) => {
                            const updatedRels = [...activeCharacter.background.relationships];
                            updatedRels[relIdx] = {
                              ...rel,
                              targetCharacterId: e.target.value,
                            };
                            engine.upsertCharacter({
                              ...activeCharacter,
                              background: {
                                ...activeCharacter.background,
                                relationships: updatedRels,
                              },
                            });
                          }}
                          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                        >
                          <option value="">Select Character</option>
                          {comic.storyBible.characters
                            .filter((c) => c.id !== activeCharacter.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label={`Relationship Description ${relIdx + 1}`}
                          value={rel.relation}
                          onChange={(e) => {
                            const updatedRels = [...activeCharacter.background.relationships];
                            updatedRels[relIdx] = {
                              ...rel,
                              relation: e.target.value,
                            };
                            engine.upsertCharacter({
                              ...activeCharacter,
                              background: {
                                ...activeCharacter.background,
                                relationships: updatedRels,
                              },
                            });
                          }}
                          className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Click &ldquo;+ New Character&rdquo; to define a character in your Story Bible.
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
                  onSelectElement('locations', l.id);
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
                  onSelectElement('props', p.id);
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
                  onChange={(e) => engine.upsertProp({ ...activeProp, name: e.target.value })}
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
                <div>
                  <label
                    htmlFor="prop-owner-select"
                    className="block text-xs font-semibold text-slate-300"
                  >
                    Owner Character
                  </label>
                  <select
                    id="prop-owner-select"
                    aria-label="Prop Owner Character"
                    value={activeProp.ownerCharacterId ?? ''}
                    onChange={(e) =>
                      engine.upsertProp({
                        ...activeProp,
                        ownerCharacterId: e.target.value || undefined,
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  >
                    <option value="">None / Unassigned</option>
                    {comic.storyBible.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
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
  );
}
