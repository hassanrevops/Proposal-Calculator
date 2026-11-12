(function () {
  'use strict';

  // Real slide dimensions (EMU) from both .pptx templates — every position below
  // is converted to a percentage of these, so the mockup's proportions match the
  // actual generated deck exactly, at any preview size.
  var SLIDE_W = 12192000;
  var SLIDE_H = 6858000;

  // Real per-column widths (EMU), taken directly from the two real Classic templates —
  // "with discount" (5 columns) and "no discount" (4 columns) are genuinely different
  // table layouts in KnowledgeCity's own files, not one layout with a column hidden,
  // so each needs its own real widths rather than a rescaled approximation.
  var CLASSIC_COLS_WITH_DISCOUNT_EMU = [1575622, 1820096, 1747029, 1558777, 1369951];
  var CLASSIC_COLS_NO_DISCOUNT_EMU = [1930048, 2229515, 2140012, 1678113];
  var CLASSIC_TABLE_WITH_DISCOUNT = { x: 233625, w: 8071475 };
  var CLASSIC_TABLE_NO_DISCOUNT = { x: 233624, w: 7977688 };

  function pct(v, total) {
    return (v / total * 100).toFixed(4) + '%';
  }

  function box(x, y, w, h) {
    return 'left:' + pct(x, SLIDE_W) + '; top:' + pct(y, SLIDE_H) + '; width:' + pct(w, SLIDE_W) + '; height:' + pct(h, SLIDE_H) + ';';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    var num = Number(n);
    if (!isFinite(num)) num = 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(p) {
    var num = Number(p);
    if (!isFinite(num)) num = 0;
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-').map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    if (!y || !m || !d) return '';
    var dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Column widths as percentages of the table's own width (numeric, not yet
  // stringified) — each column's share of whichever real table (with/without the
  // discount column) is in play.
  function colWidths(includeDiscountColumn) {
    var baseEmu = includeDiscountColumn ? CLASSIC_COLS_WITH_DISCOUNT_EMU : CLASSIC_COLS_NO_DISCOUNT_EMU;
    var tableW = includeDiscountColumn ? CLASSIC_TABLE_WITH_DISCOUNT.w : CLASSIC_TABLE_NO_DISCOUNT.w;
    return baseEmu.map(function (w) { return w / tableW * 100; });
  }

  function pct2(n) {
    return n.toFixed(3) + '%';
  }

  // row.specialDiscountPct is a 0-1 fraction (matching the real generator's data
  // shape), so it's scaled to a 0-100 percentage here before formatting.
  function headerPctLabel(rows) {
    var distinct = {};
    rows.forEach(function (r) { distinct[r.specialDiscountPct] = true; });
    var keys = Object.keys(distinct);
    if (keys.length === 1) return 'After Discount ' + fmtPct(Number(keys[0]) * 100) + '%';
    return 'After Discount';
  }

  function renderCoverClassic(data) {
    return (
      '<div class="ppt-slide classic cover">' +
        '<div class="ppt-el ppt-cover-title" style="' + box(1524000, 1754660, 9144000, 2735959) + '">' +
          '<div>KnowledgeCity ' + esc(data.companyName || 'Company Name') + '</div>' +
          '<div>Proposal</div>' +
        '</div>' +
        '<div class="ppt-el ppt-cover-date" style="' + box(1524000, 4721901, 9144000, 638040) + '">' + esc(fmtDate(data.proposalDate) || 'Date') + '</div>' +
        '<img class="ppt-el ppt-cover-logo-classic" style="' + box(9473349, 0, 2718651, 838524) + '" src="/img/kc-logo-cover.png?v=3" alt="">' +
      '</div>'
    );
  }

  // Exact row heights (EMU) from the real Classic template's slide2.xml — used
  // as flex-grow ratios so each row's proportion of the table's total height
  // matches the real deck exactly, instead of an HTML table's unreliable
  // percentage-height rows sized however the browser feels like.
  var ROW_H = { banner: 653012, header: 712956, data: 644756, total: 640757 };

  // The optional "special note" textbox isn't part of either template — it's
  // added by the real generator below whatever's already on the slide (the
  // table, and the Multi-Year box beside it), so its Y position has to be
  // computed the same way here as in src/pptx-fill.js for the preview to match.
  var MULTI_YEAR_BOX_BOTTOM = 2413336 + 2031325;
  var NOTE_GAP = 137160;
  var NOTE_HEIGHT = 600000;

  // Same rule as src/pptx-fill.js: rows shrink so a tall table (and its note) stays on the slide.
  var TABLE_MAX_BOTTOM = 5900000;
  var MIN_DATA_ROW_H = 330000;
  function dataRowHeightFor(rowCount) {
    var available = TABLE_MAX_BOTTOM - 2103259 - ROW_H.banner - ROW_H.header - ROW_H.total;
    return Math.max(MIN_DATA_ROW_H, Math.min(ROW_H.data, Math.floor(available / Math.max(1, rowCount))));
  }
  function tableHeightFor(rowCount) {
    return ROW_H.banner + ROW_H.header + rowCount * dataRowHeightFor(rowCount) + ROW_H.total;
  }

  function computeSpecialNoteY(rowCount, includeMultiYearTerms) {
    var tableBottom = 2103259 + tableHeightFor(rowCount);
    var multiYearBottom = includeMultiYearTerms ? MULTI_YEAR_BOX_BOTTOM : 0;
    return Math.max(tableBottom, multiYearBottom) + NOTE_GAP;
  }

  function ctCell(widthPct, html) {
    return '<div class="ppt-ct-cell" style="flex:0 0 ' + pct2(widthPct) + '; width:' + pct2(widthPct) + ';">' + html + '</div>';
  }

  function ctRow(cls, heightEmu, cellsHtml) {
    return '<div class="ppt-ct-row ' + cls + '" style="flex:' + heightEmu + ' 0 0;">' + cellsHtml + '</div>';
  }

  function renderPricingClassic(slide, data) {
    var cols = colWidths(slide.includeDiscountColumn);
    var table = slide.includeDiscountColumn ? CLASSIC_TABLE_WITH_DISCOUNT : CLASSIC_TABLE_NO_DISCOUNT;
    var symbol = data.currencySymbol || '$';
    var n = cols.length; // 4 or 5

    var bannerRow = ctRow('banner', ROW_H.banner, ctCell(100, 'Proposal for ' + esc(data.companyName || '')));

    var headerCells = ctCell(cols[0], 'Number of Licenses') + ctCell(cols[1], 'Category') + ctCell(cols[2], 'Cost/User (1-Year Term)');
    if (slide.includeDiscountColumn) headerCells += ctCell(cols[3], esc(headerPctLabel(slide.rows)));
    headerCells += ctCell(cols[n - 1], 'Sub-Total');
    var headerRow = ctRow('header', ROW_H.header, headerCells);

    var dataRows = slide.rows.map(function (row) {
      var cells = ctCell(cols[0], esc(row.licenses)) + ctCell(cols[1], esc(row.categoryDisplayLabel)) + ctCell(cols[2], symbol + fmtMoney(row.costPerUser1Yr));
      if (slide.includeDiscountColumn) cells += ctCell(cols[3], symbol + fmtMoney(row.afterDiscountCostPerUser));
      cells += ctCell(cols[n - 1], symbol + fmtMoney(row.subTotal));
      return ctRow('data', dataRowHeightFor(slide.rows.length), cells);
    }).join('');

    var labelWidth = cols[0] + cols[1];
    var amountWidth = cols.slice(2).reduce(function (a, b) { return a + b; }, 0);
    var totalRow = ctRow('total', ROW_H.total, ctCell(labelWidth, 'Total') + ctCell(amountWidth, symbol + fmtMoney(slide.combinedSubTotal)));

    var tableHeightEmu = tableHeightFor(slide.rows.length);

    var multiYearHtml = '';
    if (slide.includeMultiYearTerms) {
      multiYearHtml =
        '<div class="ppt-el ppt-classic-multiyear" style="' + box(8379165, 2413336, 3754112, 2031325) + '">' +
          '<div class="ppt-my-title">Multi-Year Agreements:</div>' +
          '<div class="ppt-my-bullet">2-Year Term (-' + fmtPct(slide.multiYearPct['2yr']) + '%) = ' + symbol + fmtMoney(slide.multiYear['2yr']) + '</div>' +
          '<div class="ppt-my-bullet">3-Year Term (-' + fmtPct(slide.multiYearPct['3yr']) + '%) = ' + symbol + fmtMoney(slide.multiYear['3yr']) + '</div>' +
          '<div class="ppt-my-bullet ppt-my-bullet-last">5-Year Term (-' + fmtPct(slide.multiYearPct['5yr']) + '%) = ' + symbol + fmtMoney(slide.multiYear['5yr']) + '</div>' +
        '</div>';
    }

    var noteHtml = '';
    if (slide.specialNote && String(slide.specialNote).trim()) {
      var noteWidth = SLIDE_W - 2 * table.x;
      var noteY = computeSpecialNoteY(slide.rows.length, slide.includeMultiYearTerms);
      noteHtml = '<div class="ppt-el ppt-special-note" style="' + box(table.x, noteY, noteWidth, NOTE_HEIGHT) + '">' + esc(slide.specialNote) + '</div>';
    }

    return (
      '<div class="ppt-slide classic pricing">' +
        '<div class="ppt-el ppt-classic-table-wrap" style="left:' + pct(table.x, SLIDE_W) + '; top:' + pct(2103259, SLIDE_H) + '; width:' + pct(table.w, SLIDE_W) + '; height:' + pct(tableHeightEmu, SLIDE_H) + ';">' +
          bannerRow + headerRow + dataRows + totalRow +
        '</div>' +
        multiYearHtml +
        noteHtml +
        '<img class="ppt-el ppt-cover-logo-classic" style="' + box(9473349, 0, 2718651, 838524) + '" src="/img/kc-logo-pricing.png?v=3" alt="">' +
      '</div>'
    );
  }

  // The live preview mirrors the Classic template exactly — it's meant to be a
  // pixel-accurate stand-in for the real deck, not a generic mockup.
  function render(container, data) {
    if (!container) return;
    var slides = Array.isArray(data.slides) ? data.slides : [];

    var html = data.notice ? '<div class="preview-notice">' + esc(data.notice) + '</div>' : '';
    html += renderCoverClassic(data);
    html += slides.map(function (slide) {
      return renderPricingClassic(slide, data);
    }).join('');

    container.innerHTML = html;
  }

  window.KCPreview = { render: render };
})();
