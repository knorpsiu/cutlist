# cutlist — Requirements

Living document: update on every decision or scope change so work can resume from here.

_Last updated: 2026-10-10_

## Goal (the goal post)

Help furniture makers optimize cuts of sheet goods (e.g. plywood). The user provides:

- **Sheet goods**: dimensions and quantity available.
- **Blade kerf**: material removed by each cut.
- **Allowable waste / edge trim**: material sacrificed at the sheet edges (e.g. to re-establish squareness).
- **Panels**: list of required panels with dimensions and quantities.

The program lays out the panels on the sheets, using as little material as possible (minimum waste).

## Approach

MVP: start from a basic web page and evolve in small increments, keeping the goal in sight.
Each iteration should be usable end-to-end.

## Iterations

### MVP-1 — basic web page ✅
- Single page served by a minimal Node server (`server.js`, no dependencies); no build step.
- Run: `npm run dev` (auto-restart on server changes) or `npm run debug` (Node inspector), then open http://localhost:3000 (`PORT` env overrides).
- Static files live in `public/`; the optimizer still runs in the browser.
- Inputs: one sheet size (length × width) + quantity, kerf, edge trim, list of panels (label, length, width, qty).
- Edge trim is applied to all four edges of each sheet.
- Panels may be rotated (no grain constraint yet).
- Guillotine-style placement (cuts go edge to edge, so layouts are executable on a table/track saw).
- Output: one diagram per sheet used, sheets used, yield %, panels that didn't fit.
- Units: unitless numbers (user picks mm or inches consistently).

### MVP-2 — multiple sheet goods ✅
- Sheet goods table: name, thickness, length, width, quantity, edge trim — one row per material (e.g. Plywood 5, Plywood 18, MDF 18).
- Edge trim is per sheet good (MDF usually needs none; plywood often does). Blade kerf stays global.
- Each panel references a sheet good via a dropdown; new panel rows default to the previous row's material.
- Panels are optimized per material, only on sheets of that material.
- Results grouped by material: sheets used / available, yield, panels placed, panels that didn't fit.
- Panels with no material are reported and skipped.
- Thickness is descriptive only (identifies the material; not used in calculations).
- Each sheet good has a colour (dropdown of 16 basic colours: Red, Orange, Yellow, Lime, Green, Light green, Teal, Cyan, Sky blue, Blue, Navy, Purple, Lavender, Pink, Maroon, Brown — no greys, which mean waste) used to fill its panels in the diagrams; label text switches light/dark for contrast. New sheet goods default to an unused colour, spread across the palette. Unknown colours from older saved projects are replaced with a default on load. The colour picker shows the colour name on its colour as background, and opens a 2-column grid of all colours, each name on its colour (current one marked ✓) (custom popover, since native dropdowns can't show colours on macOS).
- Waste and trim areas are neutral grey so they don't compete with the material colours.

### MVP-3 — save and open projects ✅
- A project stores: name, blade kerf, sheet goods (name, thickness, length, width, qty, edge trim, colour) and panels (label, length, width, qty, material).
- Storage: SQLite file via Node's built-in `node:sqlite` (no dependencies), at `data/cutlist.db` (`DB_PATH` env overrides). Persists across restarts. One row per project; contents stored as JSON.
- Project names are unique (case-insensitive).
- REST API: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`.
- UI project bar: open from list, name, Save, Save as new, New, Delete.
- Unsaved changes are flagged; switching project, New, or leaving the page asks before discarding them.
- The last opened project reopens on page load (remembered in the browser); otherwise the example project is shown.
- Panel rows can be reordered by dragging their ⠿ handle (mouse or touch); the order is saved with the project. Order is for the user's organisation only — the optimizer sorts panels itself.
- Sheet goods rows can be reordered the same way; their order drives the panel material dropdowns and the order of material groups in the results.
- Requires Node ≥ 22.13 (`node:sqlite`; the experimental warning is silenced in npm scripts).

### MVP-4 — formulas in numeric fields (current)
- All numeric fields (sheet thickness/length/width/qty/trim, kerf, panel length/width/qty) accept simple formulas, e.g. `=2400-60-60` → `2280`.
- Supported: `+ - * /`, parentheses, decimals, unary minus; the leading `=` is optional.
- The formula is replaced by its result on Enter or when leaving the field (the formula itself is not kept).
- Invalid formulas keep the text, are highlighted red with the reason in a tooltip, and block Optimize until fixed.
- Evaluated by a small hand-written parser (`public/formula.js`), never `eval`.

### Backlog (candidates for next iterations, not committed)
- Grain direction per panel (lock rotation).
- Cut sequence instructions per sheet.
- Better optimizer (more heuristics / search, prefer large reusable offcuts).
- Export/import a project as a JSON file.
- Print-friendly view.
- Imperial fractions input (e.g. 23 5/8).
- CSV import of panels.

## Decision log
| Date | Decision |
|---|---|
| 2026-10-10 | Project started. MVP approach: evolve from a basic web page. |
| 2026-10-10 | MVP-1: plain HTML/JS, no build tools; trim on all 4 edges; rotation allowed; guillotine heuristic. |
| 2026-10-10 | Serve via Node (built-in `http`, no deps) instead of opening a static file, to ease debugging. |
| 2026-10-10 | MVP-2: multiple sheet goods referenced by panels; trim per sheet good, kerf global. |
| 2026-10-10 | Per-material colour from a fixed 8-brown palette; waste shown in grey. |
| 2026-10-12 | MVP-3: projects saved server-side in SQLite (`node:sqlite`, zero deps), JSON document per project. |
| 2026-10-12 | Replaced the 8 wood-tone browns with 16 basic named colours — browns were too hard to tell apart. |
| 2026-10-12 | MVP-4: formulas in numeric fields, replaced by their result on commit (formula not stored). |
