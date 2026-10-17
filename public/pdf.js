// PDF export: a minimal PDF writer (vector rectangles, lines and Helvetica text; no dependencies)
// and the cutlist report built on it: sheet goods table, panels table, then every cut layout.
(function (global) {
  const PAGE_W = 595.28; // A4 portrait, in points
  // Cut list rows come from the optimizer (loaded before this script in the page).
  const { cutList } = global.Cutlist || require('./optimizer.js');
  const PAGE_H = 841.89;

  // Helvetica glyph widths (1/1000 em) for ASCII 32..126; other characters use 556.
  const HELVETICA_WIDTHS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
    722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
    278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  const BOLD_FACTOR = 1.06; // Helvetica-Bold is slightly wider; close enough for layout.

  // Unicode → WinAnsiEncoding (Latin-1 plus a few typographic characters); anything else becomes "?".
  const WIN_ANSI_EXTRA = { '€': 0x80, '…': 0x85, '•': 0x95, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94 };
  function encode(str) {
    let out = '';
    for (const ch of String(str)) {
      const code = ch.codePointAt(0);
      if ((code >= 32 && code < 127) || (code >= 0xa0 && code <= 0xff)) out += ch;
      else out += String.fromCharCode(WIN_ANSI_EXTRA[ch] || 63);
    }
    return out;
  }

  function textWidth(str, size, bold) {
    let units = 0;
    for (const ch of encode(str)) {
      const code = ch.charCodeAt(0);
      units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
    }
    return (units * size / 1000) * (bold ? BOLD_FACTOR : 1);
  }

  // Shorten text with an ellipsis so it fits in maxWidth.
  function fit(str, maxWidth, size, bold) {
    str = String(str);
    if (textWidth(str, size, bold) <= maxWidth) return str;
    while (str.length && textWidth(str + '…', size, bold) > maxWidth) str = str.slice(0, -1);
    return str ? str + '…' : '';
  }

  const n = (v) => +v.toFixed(2);
  const rgb = (hex) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
  const pdfString = (str) => `(${encode(str).replace(/[\\()]/g, '\\$&')})`;

  // Drawing API uses top-left origin coordinates in points; converted to PDF's bottom-left here.
  class PdfWriter {
    constructor() {
      this.pages = [];
    }

    addPage() {
      this.ops = [];
      this.pages.push(this.ops);
    }

    rect(x, y, w, h, { fill, stroke, lineWidth = 0.5, dash } = {}) {
      const ops = ['q'];
      if (dash) ops.push(`[${dash.join(' ')}] 0 d`);
      if (fill) ops.push(`${rgb(fill)} rg`);
      if (stroke) ops.push(`${rgb(stroke)} RG ${n(lineWidth)} w`);
      ops.push(`${n(x)} ${n(PAGE_H - y - h)} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`, 'Q');
      this.ops.push(ops.join(' '));
    }

    line(x1, y1, x2, y2, { color = '#000000', lineWidth = 0.5 } = {}) {
      this.ops.push(`q ${rgb(color)} RG ${n(lineWidth)} w ${n(x1)} ${n(PAGE_H - y1)} m ${n(x2)} ${n(PAGE_H - y2)} l S Q`);
    }

    // Circle from four Bézier arcs (k = 4/3·(√2−1) makes each a close quarter circle).
    circle(cx, cy, r, { fill, stroke, lineWidth = 0.5 } = {}) {
      const k = 0.5523 * r;
      const X = (v) => n(v);
      const Y = (v) => n(PAGE_H - v);
      const ops = ['q'];
      if (fill) ops.push(`${rgb(fill)} rg`);
      if (stroke) ops.push(`${rgb(stroke)} RG ${n(lineWidth)} w`);
      ops.push(`${X(cx + r)} ${Y(cy)} m`,
        `${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`,
        `${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c`,
        `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`,
        `${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c`,
        fill && stroke ? 'b' : fill ? 'f' : 's', 'Q');
      this.ops.push(ops.join(' '));
    }

    // (x, y) is the anchor on the text baseline. With vertical: true the text is rotated 90°
    // counter-clockwise (reads bottom-to-top) and alignment applies along that direction.
    text(str, x, y, { size = 10, bold = false, color = '#000000', align = 'left', vertical = false } = {}) {
      const w = textWidth(str, size, bold);
      const shift = align === 'center' ? w / 2 : align === 'right' ? w : 0;
      const font = `/${bold ? 'F2' : 'F1'} ${n(size)} Tf ${rgb(color)} rg`;
      const position = vertical
        ? `0 1 -1 0 ${n(x)} ${n(PAGE_H - (y + shift))} Tm`
        : `${n(x - shift)} ${n(PAGE_H - y)} Td`;
      this.ops.push(`BT ${font} ${position} ${pdfString(str)} Tj ET`);
    }

    // Serialize to bytes. All content is kept as a "binary string" of char codes < 256.
    save(title) {
      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
      const offsets = [];
      const add = (id, body) => {
        offsets[id] = out.length;
        out += `${id} 0 obj\n${body}\nendobj\n`;
      };
      const pageIds = this.pages.map((_, i) => 5 + i * 2);
      add(1, '<< /Type /Catalog /Pages 2 0 R >>');
      add(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
      add(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      add(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      this.pages.forEach((ops, i) => {
        const content = ops.join('\n');
        add(pageIds[i], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
          + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
        add(pageIds[i] + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      });
      const infoId = offsets.length;
      add(infoId, `<< /Title ${pdfString(title)} /Producer (cutlist) >>`);

      const xref = out.length;
      out += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
      for (let id = 1; id < offsets.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
      out += `trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
      return bytes;
    }
  }

  // ---- Report ---------------------------------------------------------------------------

  const MARGIN = 40;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const BOTTOM = PAGE_H - MARGIN - 18; // keep clear of the footer
  const GREY = '#666666';
  const RED = '#c53030';
  const CUT = '#d1242f';
  const fmt = (v) => String(n(v));

  // input: { name, date, kerf, algorithmName, materials, panels, result, colorOf(hex) → {fill, text, stroke}, materialName(m) }
  function buildReport({ name, date, kerf, algorithmName, materials, panels, result, colorOf, materialName, showCuts = true }) {
    const pdf = new PdfWriter();
    let y;
    const newPage = () => {
      pdf.addPage();
      y = MARGIN;
    };
    const ensure = (height) => {
      if (y + height > BOTTOM) newPage();
    };
    const heading = (title) => {
      ensure(60);
      y += 18;
      pdf.text(title, MARGIN, y, { size: 14, bold: true });
      y += 8;
    };
    const swatch = (x, baseline, hex) => pdf.rect(x, baseline - 8, 9, 9, { fill: colorOf(hex).fill, stroke: '#555555' });

    // Columns: { title, width, align }. Cells: string, or { text, color } to draw a swatch before the text.
    function table(columns, rows) {
      const rowH = 16;
      const header = () => {
        let x = MARGIN;
        for (const col of columns) {
          const tx = col.align === 'right' ? x + col.width - 4 : x + 4;
          pdf.text(col.title, tx, y + 11, { size: 9, bold: true, color: GREY, align: col.align });
          x += col.width;
        }
        y += rowH;
        pdf.line(MARGIN, y, MARGIN + CONTENT_W, y, { color: '#999999' });
      };
      ensure(rowH * 2);
      header();
      rows.forEach((cells, r) => {
        if (y + rowH > BOTTOM) {
          newPage();
          header();
        }
        if (r % 2) pdf.rect(MARGIN, y, CONTENT_W, rowH, { fill: '#f3f3f3' });
        let x = MARGIN;
        cells.forEach((cell, c) => {
          const col = columns[c];
          const text = typeof cell === 'object' ? cell.text : String(cell);
          let tx = x + 4;
          let room = col.width - 8;
          if (typeof cell === 'object' && cell.color) {
            swatch(tx, y + 12, cell.color);
            tx += 13;
            room -= 13;
          }
          const shown = fit(text, room, 9);
          pdf.text(shown, col.align === 'right' ? x + col.width - 4 : tx, y + 11.5, { size: 9, align: col.align });
          x += col.width;
        });
        y += rowH;
      });
      pdf.line(MARGIN, y, MARGIN + CONTENT_W, y, { color: '#cccccc' });
    }

    const diagramScale = (m) => Math.min(CONTENT_W / m.length, 330 / m.width);
    const diagramHeight = (m) => m.width * diagramScale(m) + 22; // incl. the sheet title

    function sheetDiagram(material, sheet, index, count) {
      const { length: L, width: W, trim: t } = material;
      const scale = diagramScale(material);
      const w = L * scale;
      const h = W * scale;
      ensure(h + 26);
      y += 16;
      pdf.text(`Sheet ${index + 1} of ${count} — ${sheet.placements.length} panels${sheet.manual ? ' (arranged by hand)' : ''}`, MARGIN, y, { size: 10, bold: true });
      y += 6;
      const x0 = MARGIN;
      const y0 = y;
      pdf.rect(x0, y0, w, h, { fill: '#d9d9d9', stroke: '#555555', lineWidth: 0.8 });
      if (t > 0) {
        pdf.rect(x0 + t * scale, y0 + t * scale, (L - 2 * t) * scale, (W - 2 * t) * scale,
          { fill: '#ececec', stroke: '#bb3333', lineWidth: 0.5, dash: [3, 2] });
      }
      const c = colorOf(material.color);
      for (const p of sheet.placements) {
        const px = x0 + p.x * scale;
        const py = y0 + p.y * scale;
        const pw = p.w * scale;
        const ph = p.h * scale;
        pdf.rect(px, py, pw, ph, { fill: c.fill, stroke: c.stroke, lineWidth: 0.6 });
        // Text runs along the panel's longest edge (bottom-to-top on tall panels).
        const vertical = ph > pw;
        const along = vertical ? ph : pw;
        const across = vertical ? pw : ph;
        const dims = `${fmt(p.w)} × ${fmt(p.h)}${p.rotated ? ' (R)' : ''}`;
        const size = Math.min(9, across / 2.8, (along - 6) / (0.85 * textWidth(dims, 1)));
        if (size < 3.5) continue; // too small to label legibly
        const cx = px + pw / 2;
        const cy = py + ph / 2;
        // Offset of each line's baseline from the centre, perpendicular to the text direction.
        const line = (offset) => (vertical ? [cx + offset, cy] : [cx, cy + offset]);
        const opts = { color: c.text, align: 'center', vertical };
        pdf.text(fit(p.label, along - 4, size), ...line(-size * 0.15), { ...opts, size });
        pdf.text(fit(dims, along - 4, size * 0.85), ...line(size * 1.0), { ...opts, size: size * 0.85 });
      }
      if (showCuts) drawCuts(sheet.cuts || [], x0, y0, scale);
      y += h;
      if (sheet.parked?.length) {
        const counts = {};
        for (const p of sheet.parked) {
          const key = `${p.label} (${fmt(p.w)} × ${fmt(p.h)})`;
          counts[key] = (counts[key] || 0) + 1;
        }
        ensure(16);
        y += 13;
        pdf.text(fit(`${sheet.parked.length} panel(s) parked, not on this sheet or in its cut list: `
          + Object.entries(counts).map(([k, c]) => `${c} × ${k}`).join(', '), CONTENT_W, 9), MARGIN, y, { size: 9, color: RED });
      }
    }

    // Cut lines in saw order, numbered near the start of each line (as on screen).
    function drawCuts(cuts, x0, y0, scale) {
      const at = (x, y) => [x0 + x * scale, y0 + y * scale];
      for (const c of cuts) {
        const [x1, y1] = c.dir === 'h' ? at(c.from, c.at) : at(c.at, c.from);
        const [x2, y2] = c.dir === 'h' ? at(c.to, c.at) : at(c.at, c.to);
        pdf.line(x1, y1, x2, y2, { color: CUT, lineWidth: 0.7 });
      }
      for (const c of cuts) {
        const r = Math.min(5, (c.to - c.from) * scale / 2);
        const along = c.from + Math.min((c.to - c.from) / 2, r * 2.5 / scale);
        const [bx, by] = c.dir === 'h' ? at(along, c.at) : at(c.at, along);
        const size = r * (c.n > 9 ? 1 : 1.2);
        pdf.circle(bx, by, r, { fill: '#ffffff', stroke: CUT, lineWidth: 0.5 });
        pdf.text(String(c.n), bx, by + size * 0.35, { size, bold: true, color: CUT, align: 'center' });
      }
    }

    function cutListTable(cuts) {
      y += 8;
      table(
        [
          { title: 'Cut', width: 36 },
          { title: 'Operation', width: 72 },
          { title: 'Set at', width: 44, align: 'right' },
          { title: 'Cut from', width: 72 },
          { title: 'Gives', width: 291.28 },
        ],
        cutList(cuts, fmt).map((r) => [r.cuts, r.type, r.size, r.stock, r.gives]),
      );
    }

    newPage();

    // Title block, with the app logo drawn in vector.
    pdf.rect(MARGIN, y, 30, 24, { fill: '#5f6b7a' });
    pdf.rect(MARGIN + 2, y + 2, 15, 12, { fill: '#1e88e5' });
    pdf.rect(MARGIN + 2, y + 16, 15, 6, { fill: '#fb8c00' });
    pdf.rect(MARGIN + 19, y + 2, 9, 20, { fill: '#43a047' });
    pdf.text(fit(name, CONTENT_W - 40, 18), MARGIN + 40, y + 13, { size: 18, bold: true });
    pdf.text(fit(`cutlist · exported ${date} · blade kerf ${fmt(kerf)}${algorithmName ? ` · layout: ${algorithmName}` : ''}`, CONTENT_W - 40, 9),
      MARGIN + 40, y + 25, { size: 9, color: GREY });
    y += 34;

    heading('Sheet goods');
    table(
      [
        { title: 'Name', width: 175.28 },
        { title: 'Colour', width: 70 },
        { title: 'Thickness', width: 60, align: 'right' },
        { title: 'Length', width: 60, align: 'right' },
        { title: 'Width', width: 60, align: 'right' },
        { title: 'Qty', width: 30, align: 'right' },
        { title: 'Edge trim', width: 60, align: 'right' },
      ],
      materials.map((m) => [
        m.name || 'Unnamed',
        { text: colorOf(m.color).name, color: m.color },
        m.thickness ? fmt(m.thickness) : '',
        fmt(m.length), fmt(m.width), String(m.qty), fmt(m.trim),
      ]),
    );

    heading('Panels');
    const byId = new Map(materials.map((m) => [m.id, m]));
    table(
      [
        { title: '#', width: 25, align: 'right' },
        { title: 'Label', width: 175 },
        { title: 'Length', width: 60, align: 'right' },
        { title: 'Width', width: 60, align: 'right' },
        { title: 'Qty', width: 40, align: 'right' },
        { title: 'Material', width: 155.28 },
      ],
      panels.map((p, i) => {
        const m = byId.get(p.material);
        return [String(i + 1), p.label, fmt(p.length), fmt(p.width), String(p.qty),
          m ? { text: materialName(m), color: m.color } : '—'];
      }),
    );

    heading('Cut layouts');
    pdf.text('Panels marked (R) are rotated 90°. Dashed red line: edge trim.', MARGIN, y + 8, { size: 8.5, color: GREY });
    y += 10;
    if (showCuts) {
      pdf.text('Cut lists: "Set at" is the width cut off, measured from the top edge (rips) or left edge (crosscuts) of the stock',
        MARGIN, y + 9, { size: 8.5, color: GREY });
      pdf.text('as drawn; the kerf falls on the far side. Re-squaring the edges (edge trim) comes before cut 1.', MARGIN, y + 19, { size: 8.5, color: GREY });
      y += 20;
    }
    if (result.unassigned.length) {
      y += 14;
      pdf.text(fit(`${result.unassigned.length} panel row(s) have no material and were skipped: `
        + result.unassigned.map((p) => p.label || `${fmt(p.length)} × ${fmt(p.width)}`).join(', '), CONTENT_W, 9),
      MARGIN, y, { size: 9, color: RED });
    }
    for (const g of result.groups) {
      ensure(70 + (g.sheets.length ? diagramHeight(g.material) : 0)); // keep the heading with its first sheet
      y += 26;
      swatch(MARGIN, y, g.material.color);
      pdf.text(`${materialName(g.material)}  (${fmt(g.material.length)} × ${fmt(g.material.width)})`, MARGIN + 14, y, { size: 12, bold: true });
      y += 14;
      pdf.text(`${g.stats.sheetsUsed} / ${g.material.qty} sheets used · ${(g.stats.yield * 100).toFixed(1)}% yield · `
        + `${g.stats.partsPlaced} panels placed`, MARGIN, y, { size: 9, color: GREY });
      if (g.unplaced.length) {
        const counts = {};
        for (const p of g.unplaced) {
          const key = `${p.label} (${fmt(p.w)} × ${fmt(p.h)})`;
          counts[key] = (counts[key] || 0) + 1;
        }
        y += 13;
        pdf.text(fit(`${g.unplaced.length} panel(s) did not fit: `
          + Object.entries(counts).map(([k, c]) => `${c} × ${k}`).join(', '), CONTENT_W, 9), MARGIN, y, { size: 9, color: RED });
      }
      g.sheets.forEach((sheet, i) => {
        sheetDiagram(g.material, sheet, i, g.sheets.length);
        if (showCuts && sheet.cuts?.length) cutListTable(sheet.cuts);
      });
    }

    // Footers, now that the page count is known.
    pdf.pages.forEach((ops, i) => {
      pdf.ops = ops;
      const fy = PAGE_H - MARGIN + 6;
      pdf.line(MARGIN, fy - 10, PAGE_W - MARGIN, fy - 10, { color: '#dddddd' });
      pdf.text(fit(`cutlist · ${name}`, CONTENT_W - 80, 8), MARGIN, fy, { size: 8, color: GREY });
      pdf.text(`Page ${i + 1} of ${pdf.pages.length}`, PAGE_W - MARGIN, fy, { size: 8, color: GREY, align: 'right' });
    });

    return pdf.save(name);
  }

  global.CutlistPdf = { buildReport, PdfWriter, textWidth };
  if (typeof module !== 'undefined') module.exports = { buildReport, PdfWriter, textWidth };
})(typeof window !== 'undefined' ? window : globalThis);
