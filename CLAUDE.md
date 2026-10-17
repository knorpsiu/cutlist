# CLAUDE.md

Guidance for resuming work on **cutlist**, a web app that helps furniture makers optimize cuts of sheet goods.

**Start here:** read `REQUIREMENTS.md`. It holds the goal, what each MVP iteration delivered, the backlog and the decision log. Keep it updated with every feature or decision.

## Run

```sh
npm run dev     # node --watch: restarts on server.js/db.js changes; http://localhost:3000
npm run debug   # same, plus Node inspector
npm start       # plain run
```

- `PORT` and `DB_PATH` env vars override the defaults (3000, `data/cutlist.db`).
- Files in `public/` are served with `no-store`, so a browser reload picks up front-end changes without a restart.
- Requires Node ≥ 22.13 (built-in `node:sqlite`; its ExperimentalWarning is silenced in the npm scripts).

## Architecture

Zero dependencies: no npm packages, no build step, no framework. Plain HTML/JS in the browser, Node built-ins on the server.

| File | Role |
|---|---|
| `server.js` | `node:http` server: static files from `public/` + JSON API `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id` |
| `db.js` | SQLite storage (`node:sqlite`). One row per project; contents (kerf, materials, panels) stored as a JSON document. Names unique, case-insensitive |
| `public/index.html` | The whole UI: inline CSS and an inline script (forms, colour picker, drag-and-drop reordering, projects bar, results SVG rendering) |
| `public/optimizer.js` | Layout algorithms, per material, each trying several variants and keeping the best: `rip` (3-stage strips: rip → crosscut → rip; default), `crosscut` (same on the transposed sheet), `guillotine` (free packing). `optimize({kerf, algorithm, materials, panels})`; names in `Cutlist.ALGORITHMS`. Each sheet also gets `cuts` (`{n, dir: 'h'=rip/'v'=crosscut, at, from, to}`, in saw order), recovered from the placements by `cutSequence`, with `stock`/`size`/`piece`/`rest` per cut. `cutList(cuts, fmt)` turns them into grouped text rows, shared by the page and the PDF |
| `public/arrange.js` | Manual arrangement: `Arrange.move()` takes a panel out of the sheet's cut tree (`Cutlist.layoutTree`), tries every insertion point, packs each to the top-left with kerf gaps and returns the nearest arrangement that fits (valid if near the target or the target spot is free). Rotation is done by the page, passing placements with the dragged panel's w/h swapped |
| `public/formula.js` | Hand-written arithmetic parser for numeric fields (`=2400-60-60`). Never use `eval` |
| `public/pdf.js` | Minimal PDF writer (vector shapes, Helvetica/WinAnsi text) + `buildReport()` for the PDF export |
| `public/favicon.svg` | App icon, also shown next to the page title |

- Browser modules are plain scripts that attach a global (`Cutlist`, `Arrange`, `Formula`, `CutlistPdf`) **and** `module.exports`, so Node can `require()` them for testing.
- Data model: material `{id, name, thickness, length, width, qty, trim, color}`; panel `{label, length, width, qty, material}`, where `material` is a material id. Coordinates in layouts: x along the sheet length, y along its width.
- Units are unitless; the user picks mm or inches and stays consistent.

## Conventions

- **MVP approach:** small, usable increments. Don't front-load features; put ideas in the `REQUIREMENTS.md` backlog.
- **Stay dependency-free** unless the user agrees otherwise.
- **After each tested feature:** update `REQUIREMENTS.md` (iteration notes + decision log), then commit locally. No remote exists, so don't push.
- Match the existing style: 2-space indent, single quotes, short comments explaining *why*.

## Testing

There is no test suite yet. Verify changes like this:

- **Pure modules:** `node -e` scripts that `require('./public/optimizer.js')` etc. and check results, e.g. no overlapping panels, kerf gaps respected, everything inside the edge trim.
- **API:** start a server on a spare port with a throwaway `DB_PATH`, then exercise it with `curl`.
- **UI:** drive headless Chrome via the DevTools protocol from a Node script, using Node's global `WebSocket` and `Input.dispatchMouseEvent` / `Input.insertText` for real clicks and typing. Capture screenshots with `Page.captureScreenshot` and read them back to check.
- **PDF:** render pages to PNG with a small Swift/PDFKit script and inspect them.
- Always use a throwaway `DB_PATH` for tests so the user's `data/cutlist.db` is never touched.

## Gotchas

- **Element ids vs function names:** in the page, ids such as `saveProject`, `newProject` and `deleteProject` are shadowed by functions of the same name. In test scripts, use `document.getElementById(...)` rather than the global.
- **Colour picker:** a custom popover (native `<select>` can't show colours on macOS) backed by a hidden `<select class="color">` that holds the value. The toggle-close logic uses `pointerdown` state, because light dismiss closes the popover before the button's click fires.
- **Numeric inputs:** these are `type="text"` with class `num`, so formulas can be typed. Read them through `num()`/`int()`, never `parseFloat`.
- **Colours:** materials store the palette's hex `fill` value. Unknown colours, e.g. from the old wood-tone palette, are replaced with a default on load.
- **Measuring tool:** each sheet `<svg>` carries `data-corners` (snap points), `data-length`, `data-width` and `data-trim` (Shift mode snaps to the trim lines), and `data-cut-points` (cut-line junctions, snapped to only while cuts are shown). The overlay is a `<g class="measure">` added lazily, with `pointer-events: none`. Overlay sizes are in screen pixels converted through `getScreenCTM()`. The label box is sized with `getComputedTextLength()`, because canvas measurement doesn't match the SVG text exactly.
- **Cut lines:** drawn inside `<g class="cuts">` with `pointer-events: none` (so the measuring tool still works) and hidden with the `hide-cuts` class on `#results`, not by re-rendering. A cut's `at` is the centre of its kerf, which is clipped to the piece, so piece edges can't be recovered exactly from `at` (tests allow one kerf of tolerance).
- **Manual arrangement state:** the page keeps `current = { result, inputs, key, manual }`. Drags edit `current.result` in place (`sheet.manual = true`). `projectData()` saves `layout` only when `current.manual`; `fillForm` restores it via `Cutlist.restore()` only if `inputsKey()` of the form matches. Parked panels live in `sheet.parked` (no x/y; drawn in a strip under the sheet inside the same `<svg>`, `rect.panel[data-parked]`) and are saved with the layout; a drag out of the strip appends the panel past the placements (`arranging.parked`). The diagram's drawing is inside `<g class="layout">`, so a drag redraws only that and keeps the `<svg>` (and the measuring overlay).
- **Headless tests and dirty state:** navigating away with unsaved changes opens a `beforeunload` prompt that blocks a headless run. Save first, or set `dirty = false` in the page.
- **PDF text:** WinAnsi only. Characters outside Latin-1 (plus €, –, —, …, quotes, •) print as "?".
- Background dev servers started from a Claude session stop after 2 hours. The user usually runs `npm run dev` in their own terminal.
