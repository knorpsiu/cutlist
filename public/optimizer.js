// Guillotine sheet-cutting optimizer.
// Coordinates: x runs along the sheet length, y along the sheet width.
(function (global) {
  const SORTS = {
    area: (a, b) => b.w * b.h - a.w * a.h,
    longSide: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    perimeter: (a, b) => b.w + b.h - (a.w + a.h),
  };

  // How to split the leftover of a free rectangle after placing a part in its corner.
  const SPLITS = {
    shorterLeftover: (f, w, h) => f.w - w < f.h - h,
    longerLeftover: (f, w, h) => f.w - w >= f.h - h,
    horizontal: () => true,
    vertical: () => false,
  };

  function expandPanels(panels) {
    const parts = [];
    panels.forEach((p, i) => {
      for (let n = 0; n < p.qty; n++) {
        parts.push({ id: `${i}-${n}`, label: p.label || `P${i + 1}`, w: p.length, h: p.width });
      }
    });
    return parts;
  }

  function newSheet(sheet, trim) {
    return {
      placements: [],
      free: [{ x: trim, y: trim, w: sheet.length - 2 * trim, h: sheet.width - 2 * trim }],
    };
  }

  // Best-short-side-fit over every free rect of every open sheet, both orientations.
  function findFit(sheets, part) {
    let best = null;
    sheets.forEach((s, si) => {
      s.free.forEach((f, fi) => {
        const orientations = [[part.w, part.h, false]];
        if (part.w !== part.h) orientations.push([part.h, part.w, true]);
        for (const [w, h, rotated] of orientations) {
          if (w > f.w || h > f.h) continue;
          const score = Math.min(f.w - w, f.h - h);
          if (!best || score < best.score) best = { si, fi, w, h, rotated, score };
        }
      });
    });
    return best;
  }

  function place(sheet, fit, part, kerf, splitHorizontally) {
    const f = sheet.free[fit.fi];
    const { w, h } = fit;
    sheet.placements.push({ label: part.label, x: f.x, y: f.y, w, h, rotated: fit.rotated });

    let right, bottom;
    if (splitHorizontally(f, w, h)) {
      // Full-length cut below the part, then a cross cut beside it.
      right = { x: f.x + w + kerf, y: f.y, w: f.w - w - kerf, h };
      bottom = { x: f.x, y: f.y + h + kerf, w: f.w, h: f.h - h - kerf };
    } else {
      // Full-width cut beside the part, then a cut below it.
      right = { x: f.x + w + kerf, y: f.y, w: f.w - w - kerf, h: f.h };
      bottom = { x: f.x, y: f.y + h + kerf, w, h: f.h - h - kerf };
    }
    sheet.free.splice(fit.fi, 1);
    for (const r of [right, bottom]) if (r.w > 0 && r.h > 0) sheet.free.push(r);
  }

  function run(input, sortFn, splitFn) {
    const { sheet, kerf, trim } = input;
    const parts = expandPanels(input.panels).sort(sortFn);
    const sheets = [];
    const unplaced = [];

    for (const part of parts) {
      let fit = findFit(sheets, part);
      if (!fit && sheets.length < sheet.qty) {
        sheets.push(newSheet(sheet, trim));
        fit = findFit(sheets, part);
        if (!fit) sheets.pop(); // part is larger than an empty sheet
      }
      if (fit) place(sheets[fit.si], fit, part, kerf, splitFn);
      else unplaced.push(part);
    }
    return { sheets, unplaced };
  }

  // Lower is better: unplaced parts, then sheets used, then fragmented leftover
  // (a larger biggest offcut means waste is concentrated and reusable).
  function score(result) {
    const largestOffcut = Math.max(0, ...result.sheets.flatMap((s) => s.free.map((f) => f.w * f.h)));
    return [result.unplaced.length, result.sheets.length, -largestOffcut];
  }

  function better(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  // Lay out panels on a single sheet type: { sheet, kerf, trim, panels }.
  function optimizeSheet(input) {
    let best = null;
    let bestScore = null;
    for (const sortFn of Object.values(SORTS)) {
      for (const splitFn of Object.values(SPLITS)) {
        const result = run(input, sortFn, splitFn);
        const s = score(result);
        if (!best || better(s, bestScore)) {
          best = result;
          bestScore = s;
        }
      }
    }

    const usedArea = best.sheets.reduce((sum, s) => sum + s.placements.reduce((a, p) => a + p.w * p.h, 0), 0);
    const sheetArea = input.sheet.length * input.sheet.width;
    return {
      ...best,
      stats: {
        sheetsUsed: best.sheets.length,
        partsPlaced: best.sheets.reduce((n, s) => n + s.placements.length, 0),
        yield: best.sheets.length ? usedArea / (best.sheets.length * sheetArea) : 0,
      },
    };
  }

  // Lay out panels across several sheet goods.
  // input: { kerf, materials: [{ id, name, thickness, length, width, qty, trim }],
  //          panels: [{ label, length, width, qty, material }] } — panel.material is a material id.
  // Returns one group per material that has panels, plus panels whose material is unknown.
  function optimize(input) {
    const groups = [];
    for (const material of input.materials) {
      const panels = input.panels.filter((p) => p.material === material.id);
      if (!panels.length) continue;
      const result = optimizeSheet({
        sheet: { length: material.length, width: material.width, qty: material.qty },
        kerf: input.kerf,
        trim: material.trim,
        panels,
      });
      groups.push({ material, ...result });
    }
    const ids = new Set(input.materials.map((m) => m.id));
    const unassigned = input.panels.filter((p) => !ids.has(p.material));
    return { groups, unassigned };
  }

  global.Cutlist = { optimize, optimizeSheet };
  if (typeof module !== 'undefined') module.exports = { optimize, optimizeSheet };
})(typeof window !== 'undefined' ? window : globalThis);
