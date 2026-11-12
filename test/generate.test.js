'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const { DEFAULT_CONFIG, buildSlideNumbers } = require('../src/pricing');
const { generateProposalPptx } = require('../src/pptx-fill');
const { CURRENCIES, currencySymbolFor } = require('../src/currencies');
const { parseLicenses, parseDiscountFraction, parseManualSlides, parseText } = require('../src/validate');

const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

function slideFor(rows, extra = {}) {
  const discount = extra.discount || 0;
  const n = buildSlideNumbers({ rows, pricingYear: config.defaultPricingYear, nonProfit: false, specialDiscountPct: discount }, config);
  return {
    rows: n.rows.map((r) => ({ ...r, categoryDisplayLabel: r.categoryDisplayLabel || r.categoryTier })),
    combinedSubTotal: n.combinedSubTotal,
    multiYear: n.multiYear,
    includeMultiYearTerms: extra.multiYear !== false,
    includeDiscountColumn: discount > 0,
    specialNote: extra.note,
  };
}

async function build(slides, over = {}) {
  const buf = await generateProposalPptx({ companyName: 'Acme Corp', proposalDate: '2026-10-30', currencySymbol: '$', slides, ...over }, config);
  return JSZip.loadAsync(buf);
}

async function slideTexts(zip) {
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const out = [];
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    out.push([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' | '));
  }
  return out;
}

// Every opening tag has a matching close in order (XML is well-formed enough for PowerPoint).
function assertBalanced(xml, label) {
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) stack.push(name);
    else assert.equal(stack.pop(), name, `${label}: unbalanced </${name}>`);
  }
  assert.equal(stack.length, 0, `${label}: unclosed <${stack[stack.length - 1]}>`);
}

test('the file keeps no trace of the template\'s original client, author or preview picture', async () => {
  const zip = await build([slideFor([{ licenses: 100, categoryTier: 'safety' }])]);
  for (const name of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const xml = await zip.file(name).async('string');
    for (const leak of ['Nickey', 'Warehouses', 'Georgia', 'Revenue', 'Yousef']) assert.ok(!xml.includes(leak), `${name} still mentions "${leak}"`);
  }
  assert.ok(!zip.file('docProps/thumbnail.jpeg'), 'the old first-slide thumbnail must be removed');
  assert.ok(!zip.file('ppt/changesInfos/changesInfo1.xml') && !zip.file('ppt/revisionInfo.xml'), 'edit history must be removed');
  const core = await zip.file('docProps/core.xml').async('string');
  assert.match(core, /<dc:title>KnowledgeCity Acme Corp Proposal<\/dc:title>/);
  assert.match(core, /<dc:creator>KnowledgeCity<\/dc:creator>/);
});

test('every part is well-formed, covered by a content type, and every relationship resolves', async () => {
  for (const discount of [0, 0.2]) {
    const slides = [slideFor([{ licenses: 40, categoryTier: 'kmap' }], { discount }), slideFor([{ licenses: 2, categoryTier: 'studio:pro' }, { licenses: 9, categoryTier: 'all5' }], { discount, note: 'A note' })];
    const zip = await build(slides);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    const types = await zip.file('[Content_Types].xml').async('string');
    const overrides = [...types.matchAll(/<Override PartName="\/([^"]+)"/g)].map((m) => m[1]);
    const defaults = [...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase());
    for (const n of names) {
      if (/\.(xml|rels)$/.test(n)) assertBalanced(await zip.file(n).async('string'), n);
      if (n !== '[Content_Types].xml') assert.ok(overrides.includes(n) || defaults.includes(n.split('.').pop().toLowerCase()), `${n} has no content type`);
    }
    for (const o of overrides) assert.ok(zip.file(o), `content type points at missing part ${o}`);
    for (const relFile of names.filter((n) => n.endsWith('.rels'))) {
      const base = path.posix.dirname(relFile).replace(/_rels$/, '');
      const xml = await zip.file(relFile).async('string');
      for (const m of xml.matchAll(/Target="([^"]+)"/g)) {
        if (/^https?:/.test(m[1])) continue;
        const target = m[1].startsWith('/') ? m[1].slice(1) : path.posix.normalize(path.posix.join(base, m[1]));
        assert.ok(zip.file(target), `${relFile} points at missing ${target}`);
      }
    }
    const pres = await zip.file('ppt/presentation.xml').async('string');
    assert.equal((pres.match(/<p:sldId /g) || []).length, 3, 'cover + two pricing slides');
  }
});

test('a deck with many slides lists every one exactly once, with its own numbers', async () => {
  const slides = Array.from({ length: 12 }, (_, i) => slideFor([{ licenses: 100 + i, categoryTier: 'safety' }]));
  const zip = await build(slides);
  const texts = await slideTexts(zip);
  assert.equal(texts.length, 13);
  slides.forEach((s, i) => assert.ok(texts[i + 1].includes(`| ${100 + i} |`) || texts[i + 1].includes(` ${100 + i} |`), `slide ${i + 2} shows its own licenses`));
  const pres = await zip.file('ppt/presentation.xml').async('string');
  const ids = [...pres.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'slide ids are unique');
});

test('Manual: the rep\'s own multi-year percentages appear on the slide, not the shared defaults', async () => {
  const manual = parseManualSlides([{
    rows: [{ licenses: 40, categoryDisplayLabel: 'Bespoke', costPerUser1Yr: 100, afterDiscountCostPerUser: 80, subTotal: 3200, specialDiscountPct: 0.2 }],
    combinedSubTotal: 3200, multiYear: { '2yr': 2880, '3yr': 2080, '5yr': 1600 }, multiYearPct: { '2yr': 10, '3yr': 35, '5yr': 50 },
    includeMultiYearTerms: true, includeDiscountColumn: true,
  }]);
  const [, pricing] = await slideTexts(await build(manual));
  assert.match(pricing, /2-Year Term \(-10%\) = \$2,880\.00/);
  assert.match(pricing, /3-Year Term \(-35%\) = \$2,080\.00/);
  assert.match(pricing, /5-Year Term \(-50%\) = \$1,600\.00/);
});

test('text with &, <, quotes, $-patterns, emoji and control characters survives intact and stays valid', async () => {
  const label = 'Tech $& Safety $\' $` <b> & "more" 🚀 日本語';
  const note = 'Note with $& and <tags> & "quotes" ’';
  const rows = [{ licenses: 10, categoryTier: 'all5', categoryDisplayLabel: label }];
  const zip = await build([slideFor(rows, { note })], { companyName: 'Cost $& Plus <Co> \u0001\u0008 "Q" & Sons' });
  const texts = await slideTexts(zip);
  const un = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  // the two control characters are dropped, leaving the two spaces around them
  assert.ok(un(texts[0]).includes('Cost $& Plus <Co>  "Q" & Sons'), un(texts[0]));
  assert.ok(un(texts[1]).includes(label));
  assert.ok(un(texts[1]).includes(note));
  for (const n of Object.keys(zip.files).filter((x) => /\.(xml|rels)$/.test(x))) {
    const xml = await zip.file(n).async('string');
    assertBalanced(xml, n);
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), `${n} contains control characters`);
  }
});

test('every currency in the picker prints its own symbol in the file', async () => {
  for (const c of CURRENCIES) {
    const [, pricing] = await slideTexts(await build([slideFor([{ licenses: 100, categoryTier: 'safety' }])], { currencySymbol: currencySymbolFor(c.code) }));
    assert.ok(pricing.includes(`${c.symbol}60.00`), `${c.code}: ${pricing.slice(0, 160)}`);
  }
});

test('the server currency list is identical to the one the picker shows in the browser', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const list = app.match(/var CURRENCIES = (\[[\s\S]*?\n  \]);/)[1];
  const browser = new Function(`return ${list}`)();
  assert.deepEqual(browser, CURRENCIES);
});

test('the cover date handles blank and invalid dates without printing "Invalid Date"', async () => {
  for (const date of ['', 'not-a-date', undefined]) {
    const [cover] = await slideTexts(await build([slideFor([{ licenses: 5, categoryTier: 'all5' }])], { proposalDate: date }));
    assert.ok(!/Invalid|NaN|undefined/.test(cover), cover);
  }
  const [cover] = await slideTexts(await build([slideFor([{ licenses: 5, categoryTier: 'all5' }])], { proposalDate: '2028-02-29' }));
  assert.ok(cover.includes('February 29, 2028'));
});

test('input validation gives plain-language 400 errors', () => {
  const rejects = (fn, re) => assert.throws(fn, (e) => e.status === 400 && re.test(e.message));
  rejects(() => parseLicenses(0), /at least 1/);
  rejects(() => parseLicenses(-3), /at least 1/);
  rejects(() => parseLicenses('abc'), /at least 1/);
  rejects(() => parseLicenses(''), /at least 1/);
  rejects(() => parseLicenses(1e12), /can't be more than/);
  assert.equal(parseLicenses('10.9'), 10);
  rejects(() => parseDiscountFraction(100), /between 0 and 99/);
  rejects(() => parseDiscountFraction(-1), /between 0 and 99/);
  rejects(() => parseDiscountFraction('x'), /between 0 and 99/);
  assert.equal(parseDiscountFraction(''), 0);
  assert.equal(parseDiscountFraction(25), 0.25);
  rejects(() => parseText('   ', 'Company name', { required: true }), /Company name is required/);
  rejects(() => parseText('x'.repeat(201), 'Company name'), /too long/);
  rejects(() => parseManualSlides([]), /at least 1 pricing slide/);
  rejects(() => parseManualSlides([{ rows: [{ licenses: 5, categoryDisplayLabel: '', costPerUser1Yr: 1, afterDiscountCostPerUser: 1, subTotal: 5 }], combinedSubTotal: 5 }]), /required/);
});

test('a pricing table with up to 6 rows and a note stays on the slide, and the table frame matches its rows', async () => {
  const SLIDE_H = 6858000;
  for (let n = 1; n <= 6; n++) {
    const rows = Array.from({ length: n }, (_, i) => ({ licenses: 50 + i, categoryTier: ['all5', '4cat', '3cat', '2cat', '1cat', '1to2courses'][i] }));
    const zip = await build([slideFor(rows, { note: 'A note under the table' })]);
    const xml = await zip.file('ppt/slides/slide2.xml').async('string');
    const heights = [...xml.matchAll(/<a:tr h="(\d+)"/g)].map((m) => Number(m[1]));
    assert.equal(heights.length, n + 3, `${n} data rows + banner, header and total`);
    const total = heights.reduce((a, b) => a + b, 0);
    assert.equal(Number(xml.match(/y="2103259"\/><a:ext cx="\d+" cy="(\d+)"/)[1]), total, 'frame height equals the sum of its rows');
    const noteY = Number(xml.match(/name="Special Note"[\s\S]*?<a:off x="\d+" y="(\d+)"/)[1]);
    assert.ok(2103259 + total <= noteY, `${n} rows: note sits below the table`);
    assert.ok(noteY + 600000 <= SLIDE_H, `${n} rows: note stays on the slide (bottom ${noteY + 600000})`);
  }
});
