# Local-first persistence and Clipboard Bridge LLM workflow

The application runs as a local-first Next.js browser app backed by `IndexedDB` auto-save and full `.json` file export/import, with all LLM and image-generation communication handled via the Clipboard Bridge rather than server-side API keys. Users can use any frontier chat or image model subscription they already own without configuring API keys or paying per-token API costs, and all incoming JSON mutations pass through a Staged Diff review step keyed by stable element IDs before mutating canonical state.
