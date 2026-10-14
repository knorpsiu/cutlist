// Sheet-cutting optimizer. All layouts are guillotine (every cut runs edge to edge).
// Coordinates: x runs along the sheet length, y along the sheet width.
//
// Algorithms:
// - 'rip':        rip the sheet into full-length strips, crosscut strips into columns, then rip
//                 columns into stacked panels (3 stages) — straight, repeatable table/track saw cuts.
// - 'crosscut':   the same with the sheet turned 90°: full-width sections first, then rip them.
// - 'guillotine': free guillotine bin-packing (mixes cut directions); often fewest sheets.
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

  // ---- Strip layouts (rip first) ---------------------------------------------------------
  // The sheet's usable area is cut into strips running its full length. Each panel placed in a
  // strip starts a column (crosscut); narrower panels can stack below it in that column (rip).

  // Orientation policies: which panel side runs across the strip (sets strip thickness).
  const ORIENTS = {
    shortAcross: (p) => (p.w >= p.h ? [p.w, p.h, false] : [p.h, p.w, true]),
    longAcross: (p) => (p.w >= p.h ? [p.h, p.w, true] : [p.w, p.h, false]),
  };

  function runStrips(input, orient) {
    const { sheet, kerf, trim } = input;
    const L = sheet.length - 2 * trim;
    const W = sheet.width - 2 * trim;
    const parts = expandPanels(input.panels)
      .map((part) => {
        const [w, h, rotated] = orient(part);
        return { ...part, ow: w, oh: h, orotated: rotated };
      })
      .sort((a, b) => b.oh - a.oh || b.ow - a.ow);
    const sheets = []; // { placements, strips: [{ y, h, x, columns: [{ x, w, nextY, bottom }] }], nextY }
    const unplaced = [];
    const orientations = (part) => {
      const list = [[part.ow, part.oh, part.orotated]];
      if (part.w !== part.h) list.push([part.oh, part.ow, !part.orotated]);
      return list;
    };

    function tryPlace(part) {
      let best = null;
      const consider = (score, apply) => {
        if (!best || score < best.score) best = { score, apply };
      };
      for (const s of sheets) {
        for (const strip of s.strips) {
          for (const [w, h, rotated] of orientations(part)) {
            // Stack below an existing column (one more rip, no new crosscut).
            for (const col of strip.columns) {
              if (w <= col.w && col.nextY + h <= col.bottom) {
                consider((col.w - w) * h, () => {
                  s.placements.push({ label: part.label, x: col.x, y: col.nextY, w, h, rotated });
                  col.nextY += h + kerf;
                });
              }
            }
            // New column at the end of the strip.
            if (strip.x + w <= trim + L && h <= strip.h) {
              consider((strip.h - h) * w + 1e-6, () => {
                s.placements.push({ label: part.label, x: strip.x, y: strip.y, w, h, rotated });
                strip.columns.push({ x: strip.x, w, nextY: strip.y + h + kerf, bottom: strip.y + strip.h });
                strip.x += w + kerf;
              });
            }
          }
        }
      }
      if (best) {
        best.apply();
        return true;
      }
      // New strip, on the first sheet with room for it (preferred orientation first).
      for (const s of sheets) {
        for (const [w, h, rotated] of orientations(part)) {
          if (w <= L && s.nextY + h <= trim + W) {
            const strip = { y: s.nextY, h, x: trim, columns: [] };
            s.strips.push(strip);
            s.nextY += h + kerf;
            s.placements.push({ label: part.label, x: trim, y: strip.y, w, h, rotated });
            strip.columns.push({ x: trim, w, nextY: strip.y + h + kerf, bottom: strip.y + h });
            strip.x += w + kerf;
            return true;
          }
        }
      }
      return false;
    }

    for (const part of parts) {
      if (tryPlace(part)) continue;
      if (sheets.length < sheet.qty) {
        sheets.push({ placements: [], strips: [], nextY: trim });
        if (tryPlace(part)) continue;
        sheets.pop(); // part is larger than an empty sheet
      }
      unplaced.push(part);
    }

    // Offcuts (for scoring): the end of each strip and the area below the last strip.
    for (const s of sheets) {
      s.free = s.strips.map((st) => ({ x: st.x, y: st.y, w: trim + L - st.x, h: st.h })).filter((f) => f.w > 0);
      if (s.nextY < trim + W) s.free.push({ x: trim, y: s.nextY, w: L, h: trim + W - s.nextY });
      delete s.strips;
      delete s.nextY;
    }
    return { sheets, unplaced };
  }

  // Crosscut first = rip first on the sheet turned 90°, then turned back.
  function transpose(result) {
    const flip = (r) => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w });
    for (const s of result.sheets) {
      s.placements = s.placements.map((p) => ({ ...flip(p), rotated: !p.rotated }));
      s.free = s.free.map(flip);
    }
    return result;
  }

  function candidates(input) {
    const algorithm = input.algorithm || 'rip';
    if (algorithm === 'guillotine') {
      return Object.values(SORTS).flatMap((sortFn) => Object.values(SPLITS).map((splitFn) => () => run(input, sortFn, splitFn)));
    }
    if (algorithm === 'crosscut') {
      const turned = { ...input, sheet: { ...input.sheet, length: input.sheet.width, width: input.sheet.length } };
      return Object.values(ORIENTS).map((orient) => () => transpose(runStrips(turned, orient)));
    }
    return Object.values(ORIENTS).map((orient) => () => runStrips(input, orient));
  }

  // ---- Cut sequence ------------------------------------------------------------------------
  // Recovered from the finished layout, so it works for every algorithm: inside the trimmed
  // sheet, take every edge-to-edge cut in one direction (a stage), then recurse into each piece
  // with the other direction. Cuts are numbered in saw order: a stage's cuts, then each piece's.
  // dir 'h' = rip (line along the sheet length, y = at), 'v' = crosscut (x = at).

  const EPS = 1e-6;

  // Edge-to-edge cuts across region r in one direction; kerf intervals [lo, hi] along the axis.
  function stageCuts(r, parts, dir, kerf) {
    const [pos, size, rLo, rHi] = dir === 'h' ? ['y', 'h', r.y, r.y + r.h] : ['x', 'w', r.x, r.x + r.w];
    const edges = [];
    for (const p of parts) {
      const start = p[pos], end = p[pos] + p[size];
      // Kerf just past the panel's far edge, or just before its near edge (clipped to the region).
      if (end < rHi - EPS) edges.push({ lo: end, hi: Math.min(rHi, end + kerf) });
      if (start > rLo + EPS) edges.push({ lo: Math.max(rLo, start - kerf), hi: start });
    }
    edges.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const cuts = [];
    for (const c of edges) {
      if (parts.some((q) => q[pos] < c.hi - EPS && q[pos] + q[size] > c.lo + EPS)) continue; // through a panel
      const last = cuts[cuts.length - 1];
      if (last && c.lo <= last.hi + EPS) continue; // same cut seen from the other panel
      cuts.push(c);
    }
    return cuts;
  }

  function cutSequence(placements, sheet, trim, kerf, firstDir) {
    const cuts = [];
    function split(r, parts, dir) {
      let stage = stageCuts(r, parts, dir, kerf);
      if (!stage.length) {
        dir = dir === 'h' ? 'v' : 'h';
        stage = stageCuts(r, parts, dir, kerf);
      }
      if (!stage.length) return; // a single panel filling the region
      const [pos, size] = dir === 'h' ? ['y', 'h'] : ['x', 'w'];
      const [from, to] = dir === 'h' ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
      for (const c of stage) cuts.push({ dir, at: (c.lo + c.hi) / 2, from, to });
      // Pieces between the cuts; offcuts (no panels) need no further cuts.
      const bounds = [r[pos], ...stage.flatMap((c) => [c.lo, c.hi]), r[pos] + r[size]];
      for (let i = 0; i < bounds.length; i += 2) {
        const piece = { ...r, [pos]: bounds[i], [size]: bounds[i + 1] - bounds[i] };
        const inside = parts.filter((p) => p[pos] >= piece[pos] - EPS && p[pos] + p[size] <= piece[pos] + piece[size] + EPS);
        if (inside.length) split(piece, inside, dir === 'h' ? 'v' : 'h');
      }
    }
    split({ x: trim, y: trim, w: sheet.length - 2 * trim, h: sheet.width - 2 * trim }, placements, firstDir);
    return cuts.map((c, i) => ({ n: i + 1, ...c }));
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

  // Lay out panels on a single sheet type: { sheet, kerf, trim, panels, algorithm }.
  function optimizeSheet(input) {
    let best = null;
    let bestScore = null;
    for (const attempt of candidates(input)) {
      const result = attempt();
      const s = score(result);
      if (!best || better(s, bestScore)) {
        best = result;
        bestScore = s;
      }
    }

    // Strip layouts start with full-length rips, except crosscut first (full-width cuts).
    const firstDir = input.algorithm === 'crosscut' ? 'v' : 'h';
    for (const s of best.sheets) s.cuts = cutSequence(s.placements, input.sheet, input.trim, input.kerf, firstDir);

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
  // input: { kerf, algorithm, materials: [{ id, name, thickness, length, width, qty, trim }],
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
        algorithm: input.algorithm,
      });
      groups.push({ material, ...result });
    }
    const ids = new Set(input.materials.map((m) => m.id));
    const unassigned = input.panels.filter((p) => !ids.has(p.material));
    return { groups, unassigned };
  }

  const ALGORITHMS = {
    rip: 'Rip first (full-length strips)',
    crosscut: 'Crosscut first (full-width strips)',
    guillotine: 'Best fit (mixed cuts)',
  };

  global.Cutlist = { optimize, optimizeSheet, ALGORITHMS };
  if (typeof module !== 'undefined') module.exports = { optimize, optimizeSheet, ALGORITHMS };
})(typeof window !== 'undefined' ? window : globalThis);
