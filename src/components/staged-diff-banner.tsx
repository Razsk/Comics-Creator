'use client';

import React from 'react';
import { Comic, StagedDiff } from '@/domain/types';

export interface StagedDiffBannerProps {
  comic: Comic;
  stagedDiff: StagedDiff;
  onAccept: () => void;
  onDiscard: () => void;
}

export function StagedDiffBanner({
  comic,
  stagedDiff,
  onAccept,
  onDiscard,
}: StagedDiffBannerProps) {
  const proposed = stagedDiff.proposedAssets;
  const hasProposedAssets =
    proposed &&
    (proposed.characters.length > 0 ||
      proposed.locations.length > 0 ||
      proposed.props.length > 0);

  const beforePayload =
    stagedDiff.kind === 'targeted-patch'
      ? stagedDiff.before
      : { scenes: comic.scenes, pages: comic.pages };

  const afterPayload =
    stagedDiff.kind === 'targeted-patch'
      ? stagedDiff.replacements
      : { scenes: stagedDiff.scenes, pages: stagedDiff.pages };

  return (
    <div
      role="region"
      aria-label="Staged Diff Review"
      className="border-b border-amber-500/50 bg-amber-950/40 px-6 py-4 space-y-3"
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
            onClick={onAccept}
            className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Accept & Apply Changes
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            Discard
          </button>
        </div>
      </div>

      {hasProposedAssets && proposed && (
        <div className="rounded border border-amber-500/30 bg-slate-950/70 p-2.5 text-xs">
          <div className="font-semibold text-amber-300">
            Newly Proposed Story Bible Assets:
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {proposed.characters.map((c) => (
              <span
                key={c.id}
                className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-200"
              >
                Character: {c.name}
              </span>
            ))}
            {proposed.locations.map((l) => (
              <span
                key={l.id}
                className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-200"
              >
                Location: {l.name}
              </span>
            ))}
            {proposed.props.map((p) => (
              <span
                key={p.id}
                className="rounded bg-indigo-500/20 px-2 py-0.5 text-indigo-200"
              >
                Prop: {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="mb-1 font-semibold uppercase text-slate-400">Before</div>
          <pre className="max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300 whitespace-pre-wrap">
            {JSON.stringify(beforePayload, null, 2)}
          </pre>
        </div>
        <div>
          <div className="mb-1 font-semibold uppercase text-emerald-400">After (Proposed)</div>
          <pre className="max-h-36 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-emerald-200 whitespace-pre-wrap">
            {JSON.stringify(afterPayload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
