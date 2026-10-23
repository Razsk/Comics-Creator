# Tiered 12-column grid for panel sizing and layout

Rather than asking an LLM to output raw `(x, y, width, height)` bounding-box coordinates—which frequently overlap or leave gaps—each Page organizes its Panels into horizontal Tiers on a 12-column grid (`row`, `colSpan` 1–12, and `heightWeight` `sm | md | lg | xl | splash`). This guarantees valid, non-overlapping page geometry that LLMs can reliably generate, maps directly to CSS Grid in the canvas editor, and translates cleanly into natural-language spatial instructions for page-level image generation prompts.
