import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComicStudio } from './comic-studio';
import { createInMemoryStorageAdapter } from '@/domain/comic-engine';

describe('ComicStudio UI (Seam 2: 3-Pane Studio Integration)', () => {
  it('supports defining Story Bible assets, running the Initiation prompt & Staged Diff flow, selective panel/dialogue refinement, and multi-page image prompt generation', async () => {
    const storage = createInMemoryStorageAdapter();
    const clipboardSpy = vi.fn().mockResolvedValue(undefined);

    render(<ComicStudio storage={storage} onCopyToClipboard={clipboardSpy} />);

    // Wait for initial engine load
    await screen.findByDisplayValue('Untitled Comic');

    // 1. Navigate to Story Bible and add a Character & Location
    fireEvent.click(screen.getByRole('button', { name: /Story Bible/i }));
    fireEvent.click(screen.getByRole('button', { name: /\+ New Character/i }));

    const charNameInput = screen.getByLabelText(/Character Name/i);
    fireEvent.change(charNameInput, { target: { value: 'Aria Vance' } });

    const charTagInput = screen.getByLabelText(/Visual Prompt Tag/i);
    fireEvent.change(charTagInput, {
      target: { value: 'Aria Vance (silver bob, brass loupe, ochre coat)' },
    });

    // Verify auto-save persisted the character
    const savedAfterChar = await storage.load();
    expect(savedAfterChar?.storyBible.characters[0]?.name).toBe('Aria Vance');
    const ariaId = savedAfterChar!.storyBible.characters[0].id;

    // 2. Switch to Initiation mode, enter Manuscript & Bespoke Instruction, and copy Initiation Prompt
    fireEvent.click(screen.getByRole('button', { name: /Initiation & Manuscript/i }));
    const manuscriptInput = screen.getByLabelText(/Manuscript Source Text/i);
    fireEvent.change(manuscriptInput, {
      target: { value: 'Aria crosses Sector 7 Skybridge as rain lashes the iron girders.' },
    });

    const initBespokeInput = screen.getByLabelText(/Initiation Bespoke Instruction/i);
    fireEvent.change(initBespokeInput, {
      target: { value: 'Break into 2 dramatic panels on Page 1.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy Initiation Prompt/i }));
    expect(clipboardSpy).toHaveBeenCalledTimes(1);
    const copiedInitPrompt = clipboardSpy.mock.calls[0][0] as string;
    expect(copiedInitPrompt).toContain('Aria crosses Sector 7 Skybridge');
    expect(copiedInitPrompt).toContain('Break into 2 dramatic panels on Page 1.');
    expect(copiedInitPrompt).toContain(ariaId);

    // 3. Paste LLM Draft JSON into the Import modal/drawer and review Staged Diff
    const llmDraftJson = JSON.stringify({
      kind: 'initiation-draft',
      synopsis: 'Aria braves the storm on the bridge.',
      scenes: [
        {
          id: 'scene-1',
          title: 'Skybridge Storm',
          summary: 'Aria crosses the bridge',
          dramaticBeat: 'Opening',
          participatingCharacterIds: [ariaId],
        },
      ],
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          summary: 'Aria on the bridge',
          panels: [
            {
              id: 'panel-1',
              sceneId: 'scene-1',
              row: 1,
              colSpan: 12,
              heightWeight: 'lg',
              framing: 'wide',
              visualDescription: 'Wide shot of Aria stepping onto the rain-swept bridge.',
              characterIds: [ariaId],
              propIds: [],
              textElements: [
                {
                  id: 'dlg-1',
                  kind: 'dialogue',
                  characterId: ariaId,
                  text: 'The storm is worsening.',
                  balloonStyle: 'speech',
                },
              ],
            },
          ],
        },
        {
          id: 'page-2',
          pageNumber: 2,
          summary: 'The far tower',
          panels: [
            {
              id: 'panel-2',
              sceneId: 'scene-1',
              row: 1,
              colSpan: 12,
              heightWeight: 'md',
              framing: 'medium',
              visualDescription: 'The Spire looms through lightning.',
              characterIds: [ariaId],
              propIds: [],
              textElements: [],
            },
          ],
        },
      ],
    });

    const importTextarea = screen.getByLabelText(/Paste LLM JSON Response/i);
    fireEvent.change(importTextarea, { target: { value: llmDraftJson } });
    fireEvent.click(screen.getByRole('button', { name: /Stage & Preview JSON/i }));

    // Staged Diff review banner/modal appears
    await screen.findByText(/Staged Diff Review/i);
    fireEvent.click(screen.getByRole('button', { name: /Accept & Apply Changes/i }));

    // 4. Verify Comic Canvas renders the pages, panels, and dialogue
    await screen.findByText(/Wide shot of Aria stepping onto the rain-swept bridge./i);
    expect(screen.getByText(/The storm is worsening./i)).toBeInTheDocument();

    // 5. Select Dialogue 'The storm is worsening.' on the canvas, enter bespoke instruction, and copy selection prompt
    fireEvent.click(screen.getByText(/The storm is worsening./i));

    const refineInstructionInput = screen.getByLabelText(/Selection Bespoke Instruction/i);
    fireEvent.change(refineInstructionInput, {
      target: { value: 'Make her line sharper and more urgent.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy Selection Prompt/i }));
    expect(clipboardSpy).toHaveBeenCalledTimes(2);
    const copiedSelectionPrompt = clipboardSpy.mock.calls[1][0] as string;
    expect(copiedSelectionPrompt).toContain('The storm is worsening.');
    expect(copiedSelectionPrompt).toContain('Make her line sharper and more urgent.');
    // Lightweight prompt omits Page 2
    expect(copiedSelectionPrompt).not.toContain('The Spire looms through lightning.');

    // 6. Switch Right Dock to Image Prompts tab and copy a multi-page prompt
    fireEvent.click(screen.getByRole('button', { name: /Image Prompts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Select All Pages/i }));
    fireEvent.click(screen.getByRole('button', { name: /Copy Image Prompt/i }));

    await waitFor(() => {
      expect(clipboardSpy).toHaveBeenCalledTimes(3);
    });
    const copiedImagePrompt = clipboardSpy.mock.calls[2][0] as string;
    expect(copiedImagePrompt).toContain('Aria Vance (silver bob, brass loupe, ochre coat)');
    expect(copiedImagePrompt).toContain('Wide shot of Aria stepping onto the rain-swept bridge.');
  });
});
