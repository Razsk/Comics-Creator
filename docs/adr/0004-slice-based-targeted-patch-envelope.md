# Slice-based Targeted Patch Envelope for partial LLM updates

When a user selects a subset of elements (such as one Panel on a Page, or two Dialogue lines in a Panel) for LLM modification, the bespoke instruction often asks to split one element into several or merge several into one. Instead of restricting responses to a 1-to-1 ID map, the Targeted Patch Envelope records `{ scope, parentId, selectedIds, replacements[] }` and splices `replacements[]` in place of `selectedIds` inside `parentId`, while also allowing optional `proposedAssets` for newly introduced Story Bible entities.
