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

  it('supports manual editing of all panels and speech, adjusting panel widths, and searching/replacing strings and regex', async () => {
    const storage = createInMemoryStorageAdapter();
    render(<ComicStudio storage={storage} />);

    await screen.findByDisplayValue('Untitled Comic');

    // Create a Page with a Panel on the Canvas
    fireEvent.click(screen.getByRole('button', { name: /\+ Page/i }));
    await screen.findByText(/New panel action\.\.\./i);

    // 1. Adjust panel width directly and split panel in Tier 1
    const widthSelect = screen.getByLabelText(/^Panel 1 Width$/i);
    fireEvent.change(widthSelect, { target: { value: '8' } });
    expect((await storage.load())?.pages[0].panels[0].colSpan).toBe(8);

    const decreaseWidthBtn = screen.getByRole('button', { name: /Decrease Panel 1 Width/i });
    fireEvent.click(decreaseWidthBtn);
    expect((await storage.load())?.pages[0].panels[0].colSpan).toBe(7);

    // Split panel 1 into two side-by-side panels and adjust width to rebalance tier
    fireEvent.click(screen.getByRole('button', { name: /Split Panel 1/i }));
    let saved = await storage.load();
    expect(saved?.pages[0].panels).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/^Panel 1 Width$/i), { target: { value: '9' } });
    saved = await storage.load();
    expect(saved?.pages[0].panels.map((p) => p.colSpan)).toEqual([9, 3]);

    // 2. Toggle "Edit All Panels & Speech" mode on the canvas to manually edit all panels and speech inline
    fireEvent.click(screen.getByRole('button', { name: /Edit All Panels & Speech/i }));

    const panel1DescInput = screen.getByLabelText(/Page 1 Panel 1 Visual Description/i);
    fireEvent.change(panel1DescInput, {
      target: { value: 'Aria aims the Chrono-Blaster v1 at the iron gate.' },
    });

    const panel2DescInput = screen.getByLabelText(/Page 1 Panel 2 Visual Description/i);
    fireEvent.change(panel2DescInput, {
      target: { value: 'Sparks fly from Chrono-Blaster v2 as the gate buckles.' },
    });

    // Add Dialogue and Caption to Panel 1 and edit them manually
    fireEvent.click(screen.getByRole('button', { name: /Add Dialogue to Panel 1/i }));
    const speechTextInput = screen.getByLabelText(/Page 1 Panel 1 Speech 1 Text/i);
    fireEvent.change(speechTextInput, {
      target: { value: 'Chrono-Blaster v1 is at maximum charge!' },
    });

    const speakerNameInput = screen.getByLabelText(/Page 1 Panel 1 Speech 1 Speaker Name/i);
    fireEvent.change(speakerNameInput, {
      target: { value: 'Aria Vance' },
    });

    saved = await storage.load();
    expect(saved?.pages[0].panels[0].visualDescription).toBe(
      'Aria aims the Chrono-Blaster v1 at the iron gate.'
    );
    expect(saved?.pages[0].panels[0].textElements[0]).toMatchObject({
      kind: 'dialogue',
      speakerName: 'Aria Vance',
      text: 'Chrono-Blaster v1 is at maximum charge!',
    });

    // 3. Open Search & Replace and run both plain string and regex replacements
    fireEvent.click(screen.getByRole('button', { name: /Search & Replace/i }));

    const searchInput = screen.getByLabelText(/Search Query/i);
    const replaceInput = screen.getByLabelText(/Replace With/i);

    // Plain string search & replace: "iron gate" -> "blast door"
    fireEvent.change(searchInput, { target: { value: 'iron gate' } });
    fireEvent.change(replaceInput, { target: { value: 'blast door' } });
    fireEvent.click(screen.getByRole('button', { name: /Replace All Matches/i }));

    saved = await storage.load();
    expect(saved?.pages[0].panels[0].visualDescription).toBe(
      'Aria aims the Chrono-Blaster v1 at the blast door.'
    );

    // Regex search & replace: "Chrono-Blaster v(\d+)" -> "Pulse-Rifle Mk-$1"
    fireEvent.click(screen.getByLabelText(/Use Regex/i));
    fireEvent.change(searchInput, { target: { value: 'Chrono-Blaster v(\\d+)' } });
    fireEvent.change(replaceInput, { target: { value: 'Pulse-Rifle Mk-$1' } });
    fireEvent.click(screen.getByRole('button', { name: /Replace All Matches/i }));

    saved = await storage.load();
    expect(saved?.pages[0].panels[0].visualDescription).toBe(
      'Aria aims the Pulse-Rifle Mk-1 at the blast door.'
    );
    expect(saved?.pages[0].panels[1].visualDescription).toBe(
      'Sparks fly from Pulse-Rifle Mk-2 as the gate buckles.'
    );
    expect(saved?.pages[0].panels[0].textElements[0].text).toBe(
      'Pulse-Rifle Mk-1 is at maximum charge!'
    );

    // 4. Click "New Comic" to reset the workspace back to a blank Untitled Comic
    fireEvent.click(screen.getByLabelText(/Comic Title/i));
    fireEvent.change(screen.getByLabelText(/Comic Title/i), {
      target: { value: 'Chronicles of Rust' },
    });
    fireEvent.click(screen.getByRole('button', { name: /New Comic/i }));

    await screen.findByDisplayValue('Untitled Comic');
    saved = await storage.load();
    expect(saved?.title).toBe('Untitled Comic');
    expect(saved?.pages).toHaveLength(0);
  });
});
