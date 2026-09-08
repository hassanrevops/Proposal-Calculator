'use strict';

const JSZip = require('jszip');

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replaceOnce(xml, search, replacement, label) {
  const idx = xml.indexOf(search);
  if (idx === -1) {
    throw new Error(`pptx-fill: expected to find "${label}" (${search}) in the slide XML but it was not present`);
  }
  return xml.slice(0, idx) + replacement + xml.slice(idx + search.length);
}

// Each Multi-Year Agreements bullet is its own self-contained <a:p>...</a:p> paragraph
// (own bullet formatting, own <a:br>/<a:endParaRPr>), so dropping one entirely — e.g.
// when the 3-Year Term option is unchecked — just means deleting that single
// paragraph; the siblings before/after remain correctly adjacent.
function removeParagraphContaining(xml, marker, label) {
  const markerIdx = xml.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`pptx-fill: expected to find "${label}" (${marker}) in the slide XML but it was not present`);
  }
  const pStart = xml.lastIndexOf('<a:p>', markerIdx);
  const pEnd = xml.indexOf('</a:p>', markerIdx) + '</a:p>'.length;
  if (pStart === -1 || pEnd === -1) {
    throw new Error(`pptx-fill: could not locate the enclosing <a:p> for "${label}"`);
  }
  return xml.slice(0, pStart) + xml.slice(pEnd);
}

// Locates the <p:sp>...</p:sp> shape that contains the given placeholder marker
// (e.g. '<p:ph type="ctrTitle"'), so a replacement can be scoped to just that shape
// instead of risking a match somewhere else in the slide.
function extractShapeBlock(xml, phMarker, label) {
  const phIdx = xml.indexOf(phMarker);
  if (phIdx === -1) {
    throw new Error(`pptx-fill: could not find "${label}" (${phMarker}) in the slide XML`);
  }
  const start = xml.lastIndexOf('<p:sp>', phIdx);
  const end = xml.indexOf('</p:sp>', phIdx) + '</p:sp>'.length;
  if (start === -1 || end === -1) {
    throw new Error(`pptx-fill: could not locate the enclosing <p:sp> for "${label}"`);
  }
  return { start, end, block: xml.slice(start, end) };
}

// Replaces the Nth (0-indexed) <a:t>...</a:t> text run found in `xml` with `newText`,
// regardless of what text currently occupies that position — this is what lets the
// same fill logic work whether the source .pptx is a truly blank template (empty
// placeholders) or a previously-completed real proposal (leftover client data): either
// way, the Nth run in a shape is always the same semantic field.
function replaceNthText(xml, n, newText, label) {
  const re = /<a:t>([^<]*)<\/a:t>/g;
  let count = 0;
  let match;
  while ((match = re.exec(xml)) !== null) {
    if (count === n) {
      return xml.slice(0, match.index) + `<a:t>${newText}</a:t>` + xml.slice(match.index + match[0].length);
    }
    count++;
  }
  throw new Error(`pptx-fill: expected at least ${n + 1} text run(s) for "${label}", found ${count}`);
}

// Replaces every <a:t>...</a:t> run inside `xml`, in order, with `values` — extra runs
// beyond values.length are left untouched. Used to fill a table row's cells (licenses,
// category, cost/user, after-discount, sub-total) by position rather than exact text.
function replaceAllTextInOrder(xml, values) {
  let i = 0;
  return xml.replace(/<a:t>[^<]*<\/a:t>/g, function (fullMatch) {
    const v = i < values.length ? values[i] : null;
    i++;
    return v == null ? fullMatch : `<a:t>${v}</a:t>`;
  });
}

function fmtMoneyNoSign(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPercent(pct) {
  const pct100 = pct * 100;
  return Number.isInteger(pct100) ? String(pct100) : String(Math.round(pct100 * 100) / 100);
}

function fmtDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const DEFAULT_MULTI_YEAR_PCT = { '2yr': 0.20, '3yr': 0.30, '5yr': 0.40 };

// Real geometry (EMU) shared by both Classic templates — needed to place the
// optional "special note" textbox directly beneath whatever's already on the
// slide (the pricing table, and the Multi-Year Agreements box beside it),
// since neither template ships that shape and it has to be positioned by hand.
const SLIDE_W = 12192000;
const TABLE_Y = 2103259;
const ROW_H = { banner: 653012, header: 712956, data: 644756, total: 640757 };
const TABLE_X_WITH_DISCOUNT = 233625;
const TABLE_X_NO_DISCOUNT = 233624;
const MULTI_YEAR_BOX_BOTTOM = 2413336 + 2031325;
const NOTE_GAP = 137160;
const NOTE_HEIGHT = 600000;

function computeSpecialNoteY(rowCount, includeMultiYearTerms) {
  const tableBottom = TABLE_Y + ROW_H.banner + ROW_H.header + rowCount * ROW_H.data + ROW_H.total;
  const multiYearBottom = includeMultiYearTerms ? MULTI_YEAR_BOX_BOTTOM : 0;
  return Math.max(tableBottom, multiYearBottom) + NOTE_GAP;
}

// A bold plain-text box, styled to match the table's own bold text (black,
// "Aptos Narrow") rather than a generic default, so it reads as part of the
// same deck rather than a bolted-on annotation.
function buildSpecialNoteShape(text, { x, y, width, height }) {
  return (
    '<p:sp><p:nvSpPr><p:cNvPr id="9001" name="Special Note"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' +
    `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="1800" b="1"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Aptos Narrow"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r></a:p>` +
    '</p:txBody></p:sp>'
  );
}

/**
 * Fills the cover slide (slide1.xml): title, date. The logo picture is already baked
 * into the template and is never touched.
 *
 * The title shape holds two paragraphs — "KnowledgeCity" + " " + {company name}, then
 * "Proposal" on its own line — so the company name is always the 3rd text run (index 2)
 * in that shape. Filling by position (not by searching for exact placeholder text) means
 * this works whether the template shape currently holds blank placeholders or leftover
 * text from a previously-completed real proposal.
 */
function fillSlide1(xml, { companyName, proposalDate }) {
  const titleShape = extractShapeBlock(xml, '<p:ph type="ctrTitle"', 'cover title shape');
  const filledTitle = replaceNthText(titleShape.block, 2, escapeXml(companyName), 'cover title company name run');
  xml = xml.slice(0, titleShape.start) + filledTitle + xml.slice(titleShape.end);

  const dateShape = extractShapeBlock(xml, '<p:ph type="subTitle"', 'cover date shape');
  const filledDate = replaceNthText(dateShape.block, 0, escapeXml(fmtDate(proposalDate)), 'cover date run');
  xml = xml.slice(0, dateShape.start) + filledDate + xml.slice(dateShape.end);

  return xml;
}

// Fills the "Proposal for {company}" banner. The real template splits this across two
// runs — "Proposal for " (with a trailing space) and the company name — so the fill
// only needs to touch the second run, leaving "Proposal for " itself untouched.
function fillBanner(xml, companyName) {
  const twoRunRe = /(<a:t>Proposal for <\/a:t><\/a:r><a:r>[\s\S]*?<a:t>)([\s\S]*?)(<\/a:t>)/;
  if (twoRunRe.test(xml)) {
    return xml.replace(twoRunRe, (m, pre, _old, post) => pre + escapeXml(companyName) + post);
  }
  // Fallback for a template that keeps it as a single combined run.
  const singleRunMatch = xml.match(/<a:t>Proposal for [^<]*<\/a:t>/);
  if (!singleRunMatch) {
    throw new Error('pptx-fill: could not find the "Proposal for" banner in slide2.xml');
  }
  return replaceOnce(xml, singleRunMatch[0], `<a:t>Proposal for ${escapeXml(companyName)}</a:t>`, 'table banner (single-run fallback)');
}

/**
 * Fills the pricing slide (slide2.xml): banner company name, table row(s), the
 * After Discount column header, and the Multi-Year Agreements bullets. The template
 * ships with exactly one data row; when a slide has more than one row, that row's
 * XML is cloned once per extra row before the per-cell text substitutions run.
 */
function fillSlide2(xml, { companyName, rows, combinedSubTotal, multiYear, multiYearPct = DEFAULT_MULTI_YEAR_PCT, currencySymbol, includeMultiYearTerms = true, includeDiscountColumn = true, specialNote }) {
  xml = fillBanner(xml, companyName);

  // After Discount header: only present at all in the "with discount" template —
  // shows the shared discount % across every row on this slide.
  if (includeDiscountColumn && rows.length && rows[0].specialDiscountPct != null) {
    const pctLabel = fmtPercent(rows[0].specialDiscountPct);
    xml = xml.replace(/<a:t>After Discount[^<]*<\/a:t>/, `<a:t>After Discount ${pctLabel}%</a:t>`);
  }

  const dataRowMatch = xml.match(/<a:tr h="644756">[\s\S]*?<\/a:tr>/);
  if (!dataRowMatch) {
    throw new Error('pptx-fill: could not locate the template data row (h="644756") in slide2.xml');
  }
  const dataRowXml = dataRowMatch[0];

  const filledRows = rows.map((row) => {
    const values = includeDiscountColumn ? [
      escapeXml(row.licenses),
      escapeXml(row.categoryDisplayLabel),
      `${currencySymbol}${fmtMoneyNoSign(row.costPerUser1Yr)}`,
      `${currencySymbol}${fmtMoneyNoSign(row.afterDiscountCostPerUser)}`,
      `${currencySymbol}${fmtMoneyNoSign(row.subTotal)}`,
    ] : [
      escapeXml(row.licenses),
      escapeXml(row.categoryDisplayLabel),
      `${currencySymbol}${fmtMoneyNoSign(row.costPerUser1Yr)}`,
      `${currencySymbol}${fmtMoneyNoSign(row.subTotal)}`,
    ];
    return replaceAllTextInOrder(dataRowXml, values);
  }).join('');

  xml = xml.replace(dataRowXml, filledRows);

  // Total row — the template pads this cell's text with dozens of leading spaces
  // (a manual-positioning holdover from however it was originally typed), even
  // though the paragraph is already center-aligned (algn="ctr"). Those spaces
  // still consume their own width, and on the narrower no-discount table's merged
  // cell they push the text wide enough to wrap the amount onto its own line — so
  // they're dropped entirely and centering is left to algn="ctr" alone.
  const totalRowMatch = xml.match(/<a:tr h="640757">[\s\S]*?<\/a:tr>/);
  if (!totalRowMatch) {
    throw new Error('pptx-fill: could not locate the template total row (h="640757") in slide2.xml');
  }
  const filledTotalRow = totalRowMatch[0].replace(
    /<a:t>[^<]*<\/a:t>(?![\s\S]*<a:t>)/,
    () => `<a:t>${currencySymbol}${fmtMoneyNoSign(combinedSubTotal)}</a:t>`
  );
  xml = xml.replace(totalRowMatch[0], filledTotalRow);

  if (includeMultiYearTerms) {
    xml = xml.replace(/<a:t>2-Year Term[^<]*<\/a:t>/, `<a:t>2-Year Term (-${fmtPercent(multiYearPct['2yr'])}%) = ${currencySymbol}${fmtMoneyNoSign(multiYear['2yr'])}</a:t>`);
    xml = xml.replace(/<a:t>3-Year Term[^<]*<\/a:t>/, `<a:t>3-Year Term (-${fmtPercent(multiYearPct['3yr'])}%) = ${currencySymbol}${fmtMoneyNoSign(multiYear['3yr'])}</a:t>`);
    xml = xml.replace(/<a:t>5-Year Term[^<]*<\/a:t>/, `<a:t>5-Year Term (-${fmtPercent(multiYearPct['5yr'])}%) = ${currencySymbol}${fmtMoneyNoSign(multiYear['5yr'])}</a:t>`);
  } else {
    xml = removeParagraphContaining(xml, '2-Year Term', '2-year bullet paragraph');
    xml = removeParagraphContaining(xml, '3-Year Term', '3-year bullet paragraph');
    xml = removeParagraphContaining(xml, '5-Year Term', '5-year bullet paragraph');
  }

  if (specialNote && String(specialNote).trim()) {
    const tableX = includeDiscountColumn ? TABLE_X_WITH_DISCOUNT : TABLE_X_NO_DISCOUNT;
    const noteWidth = SLIDE_W - 2 * tableX;
    const noteY = computeSpecialNoteY(rows.length, includeMultiYearTerms);
    const shape = buildSpecialNoteShape(String(specialNote).trim(), { x: tableX, y: noteY, width: noteWidth, height: NOTE_HEIGHT });
    xml = xml.replace('</p:spTree>', shape + '</p:spTree>');
  }

  return xml;
}

async function loadTemplate(templatePath) {
  const fs = require('fs');
  let buf;
  try {
    buf = fs.readFileSync(templatePath);
  } catch (err) {
    throw new Error(
      `pptx-fill: template file not found at ${templatePath}. The real KnowledgeCity .pptx template ` +
      `needs to be placed in the templates/ folder before proposals can be generated.`
    );
  }
  return JSZip.loadAsync(buf);
}

/**
 * Generates a Standard Proposal .pptx: one cover slide plus one pricing slide per
 * entry in `slides`, each built from that slide's own rows/discount/multi-year settings.
 *
 * The pricing slide comes from one of two real templates, chosen by whether the
 * slide's discount column applies — KnowledgeCity ships a distinct "no discount"
 * table layout (four columns instead of five, different column widths) rather than
 * just hiding a column on the five-column layout, so the two are genuinely different
 * source files, not one file with a column toggled off.
 *
 * The template package only ships one pricing slide part (slide2.xml). When `slides`
 * has more than one entry, every extra entry is added as a brand-new slide part
 * (slide3.xml, slide4.xml, ...) cloned from slide2's own XML/rels, and registered in
 * presentation.xml's slide list, its relationships file, and [Content_Types].xml —
 * without that registration, PowerPoint never knows the extra parts exist.
 */
async function generateProposalPptx({ companyName, proposalDate, currencySymbol, slides }, config) {
  const path = require('path');
  const includeDiscountColumn = slides[0].includeDiscountColumn;
  const templateName = includeDiscountColumn ? 'Template for Proposal.pptx' : 'Template for Proposal - No Discount.pptx';
  const templatePath = path.join(__dirname, '..', 'templates', templateName);
  const zip = await loadTemplate(templatePath);

  const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
  zip.file('ppt/slides/slide1.xml', fillSlide1(slide1, { companyName, proposalDate }));

  const slide2Template = await zip.file('ppt/slides/slide2.xml').async('string');
  const slide2Rels = await zip.file('ppt/slides/_rels/slide2.xml.rels').async('string');

  // Every slide in one deck shares a single template file, so its table's column
  // count is physically fixed by `includeDiscountColumn` (chosen once, from
  // slides[0]) — a later slide with a different discount setting still has to fill
  // that same column structure, not the one its own data would otherwise pick.
  function buildPricingSlideXml(slideData) {
    return fillSlide2(slide2Template, {
      companyName,
      rows: slideData.rows,
      combinedSubTotal: slideData.combinedSubTotal,
      multiYear: slideData.multiYear,
      multiYearPct: config.multiYearDiscounts,
      currencySymbol,
      includeMultiYearTerms: slideData.includeMultiYearTerms,
      includeDiscountColumn,
      specialNote: slideData.specialNote,
    });
  }

  zip.file('ppt/slides/slide2.xml', buildPricingSlideXml(slides[0]));

  if (slides.length > 1) {
    const presentationXml = await zip.file('ppt/presentation.xml').async('string');
    const presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const contentTypesXml = await zip.file('[Content_Types].xml').async('string');

    let maxRelId = 0;
    const relIdRe = /Id="rId(\d+)"/g;
    let m;
    while ((m = relIdRe.exec(presRelsXml)) !== null) maxRelId = Math.max(maxRelId, Number(m[1]));

    let maxSldId = 0;
    const sldIdRe = /<p:sldId id="(\d+)"/g;
    while ((m = sldIdRe.exec(presentationXml)) !== null) maxSldId = Math.max(maxSldId, Number(m[1]));

    let newSldIdEntries = '';
    let newRelEntries = '';
    let newContentTypeEntries = '';

    for (let i = 1; i < slides.length; i++) {
      const slideNum = i + 2; // slide1 = cover, slide2 = first pricing slide, slide3+ = extras
      const rId = `rId${++maxRelId}`;
      const sldId = ++maxSldId;
      const partName = `ppt/slides/slide${slideNum}.xml`;

      zip.file(partName, buildPricingSlideXml(slides[i]));
      zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, slide2Rels);

      newSldIdEntries += `<p:sldId id="${sldId}" r:id="${rId}"/>`;
      newRelEntries += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNum}.xml"/>`;
      newContentTypeEntries += `<Override PartName="/${partName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    }

    zip.file('ppt/presentation.xml', presentationXml.replace('</p:sldIdLst>', newSldIdEntries + '</p:sldIdLst>'));
    zip.file('ppt/_rels/presentation.xml.rels', presRelsXml.replace('</Relationships>', newRelEntries + '</Relationships>'));
    zip.file('[Content_Types].xml', contentTypesXml.replace('</Types>', newContentTypeEntries + '</Types>'));
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = {
  escapeXml,
  replaceOnce,
  removeParagraphContaining,
  extractShapeBlock,
  replaceNthText,
  replaceAllTextInOrder,
  fmtMoneyNoSign,
  fmtPercent,
  fmtDate,
  fillSlide1,
  fillBanner,
  fillSlide2,
  generateProposalPptx,
  DEFAULT_MULTI_YEAR_PCT,
};
