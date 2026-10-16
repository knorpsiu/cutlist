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

### MVP-4 — formulas in numeric fields ✅
- All numeric fields (sheet thickness/length/width/qty/trim, kerf, panel length/width/qty) accept simple formulas, e.g. `=2400-60-60` → `2280`.
- Supported: `+ - * /`, parentheses, decimals, unary minus; the leading `=` is optional.
- The formula is replaced by its result on Enter or when leaving the field (the formula itself is not kept).
- Invalid formulas keep the text, are highlighted red with the reason in a tooltip, and block Optimize until fixed.
- Evaluated by a small hand-written parser (`public/formula.js`), never `eval`.

### MVP-5 — PDF export ✅
- "Export PDF" button downloads `<project name>.pdf` directly (no print dialog), from the current form state (saved or not).
- Contents (A4 portrait): title block with logo, project name, export date and kerf; sheet goods table (name, colour, thickness, length, width, qty, edge trim); panels table (#, label, length, width, qty, material); then the cut layouts per material (stats, panels that didn't fit, one diagram per sheet).
- Tables continue across pages with repeated headers; a material heading is kept on the same page as its first sheet; footer with project name and "Page n of N".
- Diagrams are vector (crisp when zoomed). Rotated panels marked "(R)". Panel dimensions are always shown in full (text shrinks to fit); only labels are shortened with "…".
- Generated by a small hand-written PDF writer (`public/pdf.js`, Helvetica, WinAnsi encoding — Latin accents, ×, —, € supported; other characters print as "?"). No dependencies.
- Same validation as Optimize (invalid formulas, missing panels, sheet too small for trim) blocks the export.
- Logo (the favicon) shown next to the page title.

Diagram labels (screen and PDF):
- Label + dimensions run along the panel's longest edge; on panels taller than wide the text is rotated 90° (reads bottom-to-top).
- Dimensions always shown in full (font shrinks to fit); labels shortened with "…" so text never spills onto neighbouring panels. Panels too small to read get no text.

### MVP-6 — measuring tool in the diagrams ✅
- On-screen cut diagrams only (not the PDF).
- Snap targets: every panel corner, the sheet's outer corners and the edge-trim corners. Hovering within ~10 px of one shows a red snap ring; the cursor is a crosshair.
- Clicking a corner starts a measurement: a dotted line from that corner follows the mouse; its end snaps to nearby corners (exact corner-to-corner values), otherwise follows the mouse freely.
- Label next to the cursor: straight-line distance plus horizontal/vertical components, e.g. `947.26 (Δx 560, Δy 764)`; flips to stay inside the sheet.
- Only one active measurement: the next click anywhere (or Escape) clears it. A click away from a corner does not start one.
- Holding Shift constrains the line to horizontal or vertical (whichever direction the mouse is further along); releasing it returns to free measuring. Takes effect immediately on key press/release. With Shift, a nearby corner still snaps: the line ends level with that corner, and a faint red guide links the corner to the line's end.

### MVP-7 — layout algorithms ✅
- "Layout" dropdown next to Optimize, saved with the project; changing it re-runs Optimize when results are shown. The PDF header names the layout used.
- **Rip first (full-length strips)** — default. Saw-friendly 3-stage layout: rip the sheet into strips running its full length, crosscut strips into columns, rip columns into stacked panels. Every cut is straight through, panels in a strip share a fence setting, and misalignment can't propagate across the sheet.
- **Crosscut first (full-width strips)** — same, rotated 90°: full-width sections first (easier to handle when breaking down sheets with a track saw), then rip.
- **Best fit (mixed cuts)** — the original free guillotine packing: may use fewer sheets, but mixes cut directions and needs more setups.
- Projects saved before this feature open with Rip first.

### MVP-8 — cut lines and cut list ✅
- Every diagram shows its cuts as red lines, numbered in saw order (screen and PDF). A "Show cuts" checkbox next to Export PDF hides them (remembered per browser, also applies to the PDF).
- Order: one stage of edge-to-edge cuts across the piece (e.g. all rips of the sheet), then each resulting piece in turn with the other direction. Rip first starts with rips, crosscut first with crosscuts.
- Cuts start inside the edge trim: re-squaring the sheet is not numbered (the trim is already shown dashed).
- The sequence is recovered from the finished layout, so it works for all three layouts.
- Cut list per sheet under each diagram (screen and PDF): Cut | Operation | Set at | Cut from | Gives. "Set at" is the width cut off, measured from the top (rips) or left (crosscuts) edge of the stock as drawn, kerf on the far side. "Gives" names the panel, or the strip/piece and its panel count, plus what remains after a stage's last cut.
- Consecutive identical cuts are grouped ("3–5, Crosscut ×3, 764"): within one stage, or the same cut on identical stock (twin strips, "rest … each"). Hidden together with the cut lines by "Show cuts".

### MVP-9 — manual arrangement (current)
- Drag a panel to another place on the same sheet. The other panels re-pack around it: the sheet is kept as a cut tree (strips → pieces → panels) packed toward the top-left with one kerf between neighbours, so every arrangement stays cuttable edge to edge.
- While dragging, a ghost follows the pointer and a dashed outline shows where the panel will land. The panel goes to the nearest slot where everything still fits; if that slot is more than half the panel's longer side away from the pointer, or the pointer is off the sheet, the ghost turns dark grey and dropping snaps back. Escape cancels.
- A press without moving is still a click (measuring tool). Dragging is disabled while a measurement is active.
- A valid drop updates the cut lines and cut list and labels the sheet "arranged by hand" (also in the PDF).
- The arrangement is saved with the project, along with a key of the inputs it was made from (kerf, layout, sheet sizes/qty/trim, panels). Opening the project shows it again if the inputs are unchanged. Optimize (or changing the layout type) discards it. Export PDF uses what is on screen if it still matches the form.
- Not in this step: rotating a panel while dragging, moving panels between sheets.

### Backlog (candidates for next iterations, not committed)
- Grain direction per panel (lock rotation) — deprioritized by the user (2026-10-14).
- Cut list: group equal fence settings across non-consecutive cuts (reorders the sequence).
- Better optimizer (more heuristics / search, prefer large reusable offcuts).
- Automated tests (`node --test`) for the optimizer, cut sequence and arrangement.
- Manual arrangement: rotate a panel while dragging (R key); move panels between sheets.
- Export/import a project as a JSON file.
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
| 2026-10-14 | MVP-5: PDF export generated client-side by a hand-written minimal PDF writer (vector, zero deps) rather than a library or the print dialog. |
| 2026-10-14 | Diagram text follows the panel's longest edge and is fitted to the panel (fixes labels overlapping neighbours). |
| 2026-10-14 | MVP-6: measuring tool with corner snapping on the diagrams; label shows distance + Δx/Δy. Grain direction deprioritized. |
| 2026-10-14 | Shift while measuring = orthogonal (horizontal/vertical) line, still snapping to corners along the axis. |
| 2026-10-14 | MVP-7: selectable layout algorithms; strip-based (3-stage) Rip first is the default because cuts must suit a track saw and table saw. |
| 2026-10-14 | MVP-8: numbered cut lines derived from the finished layout (stage of full cuts, then recurse with the other direction); trim cuts not numbered; show/hide is a per-browser preference, not project data. |
| 2026-10-14 | Cut list per sheet: fence setting = width cut off from the near (top/left) edge, kerf on the far side; only consecutive cuts are grouped so the numbering on the diagram stays valid. |
| 2026-10-16 | MVP-9: manual arrangement by drag-and-drop within a sheet; re-pack in saw order (cut tree) rather than swap or free placement; invalid drop snaps back; saved arrangement shown on open only while the inputs are unchanged. |
