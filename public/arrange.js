// Manual rearrangement of the panels on one sheet. The layout is handled as a cut tree (see
// Cutlist.layoutTree) packed toward the top-left corner with one kerf between neighbours, so any
// arrangement stays cuttable edge to edge. Moving a panel = taking its leaf out of the tree and
// inserting it somewhere else; the other panels re-pack around it.
(function (global) {
  const EPS = 1e-6;

  // Merge nodes that stack the same way as their parent and unwrap single-child nodes.
  function normalize(node) {
    if (!node || node.i !== undefined) return node;
    const children = node.children.map(normalize).filter(Boolean)
      .flatMap((c) => (c.stack === node.stack ? c.children : [c]));
    if (!children.length) return null;
    return children.length === 1 ? children[0] : { stack: node.stack, children };
  }

  function without(node, i) {
    if (node.i !== undefined) return node.i === i ? null : node;
    return { stack: node.stack, children: node.children.map((c) => without(c, i)).filter(Boolean) };
  }

  // Every tree with `leaf` inserted once: before or after any node, along x or y. Inserting along
  // the parent's own direction makes it a sibling (after normalizing); across it, a new sub-stack.
  function insertions(node, leaf) {
    const out = [];
    for (const stack of ['x', 'y']) out.push({ stack, children: [leaf, node] }, { stack, children: [node, leaf] });
    if (node.children) {
      node.children.forEach((child, k) => {
        for (const v of insertions(child, leaf)) {
          out.push({ stack: node.stack, children: node.children.map((c, j) => (j === k ? v : c)) });
        }
      });
    }
    return out;
  }

  // Lay the tree out from (x, y): children one after another along the stack direction with a
  // kerf between them, aligned to the top/left. Fills out[i] and returns the occupied size.
  function pack(node, x, y, placements, kerf, out) {
    if (node.i !== undefined) {
      const p = placements[node.i];
      out[node.i] = { ...p, x, y };
      return { w: p.w, h: p.h };
    }
    const alongX = node.stack === 'x';
    let offset = 0;
    let across = 0;
    for (const child of node.children) {
      const size = pack(child, alongX ? x + offset : x, alongX ? y : y + offset, placements, kerf, out);
      offset += (alongX ? size.w : size.h) + kerf;
      across = Math.max(across, alongX ? size.h : size.w);
    }
    const along = offset - kerf;
    return alongX ? { w: along, h: across } : { w: across, h: along };
  }

  // Best arrangement with panel i moved so its top-left corner is as close as possible to
  // target {x, y}, among arrangements that fit on the trimmed sheet. It only counts as valid if
  // the panel lands near the target (within half its longer side), or if the target spot itself
  // is free (inside the trim, clear of the other panels): packing then pulls the panel to the
  // nearest slot. Dropping a panel over others or off the sheet must not move it elsewhere.
  // Returns { placements, valid } — placements in the same order as the input (null if none fit).
  function move({ placements, tree, i, target, material, kerf }) {
    const t = material.trim;
    const maxW = material.length - 2 * t + EPS;
    const maxH = material.width - 2 * t + EPS;
    const reach = Math.max(placements[i].w, placements[i].h) / 2;
    const rest = normalize(without(tree, i));
    const trees = rest ? insertions(rest, { i }) : [{ i }];
    let best = null;
    for (const candidate of trees) {
      const out = [];
      const size = pack(normalize(candidate), t, t, placements, kerf, out);
      if (size.w > maxW || size.h > maxH) continue;
      const distance = Math.hypot(out[i].x - target.x, out[i].y - target.y);
      // Prefer moving the others as little as possible when positions are otherwise equal.
      let shift = 0;
      out.forEach((p, j) => { if (j !== i) shift += Math.hypot(p.x - placements[j].x, p.y - placements[j].y); });
      const score = distance + 0.05 * shift / Math.max(1, placements.length - 1);
      if (!best || score < best.score) best = { score, distance, placements: out };
    }
    return { placements: best ? best.placements : null, valid: !!best && (best.distance <= reach || isFree(placements, i, target, material)) };
  }

  // Whether panel i placed with its top-left at target would sit on bare sheet.
  function isFree(placements, i, target, material) {
    const { w, h } = placements[i];
    const t = material.trim;
    const { x, y } = target;
    if (x < t - EPS || y < t - EPS || x + w > material.length - t + EPS || y + h > material.width - t + EPS) return false;
    return placements.every((q, j) => j === i || x >= q.x + q.w || q.x >= x + w || y >= q.y + q.h || q.y >= y + h);
  }

  global.Arrange = { move, pack, normalize };
  if (typeof module !== 'undefined') module.exports = { move, pack, normalize };
})(typeof window !== 'undefined' ? window : globalThis);
