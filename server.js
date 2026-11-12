'use strict';

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');

const {
  DEFAULT_CONFIG,
  buildProposalNumbers,
  buildSlideNumbers,
  buildMultiCategoryProposalNumbers,
} = require('./src/pricing');
const { getConfig, saveConfig, validateConfig } = require('./src/config-store');
const {
  verifyPassword, changePassword, requireAuth, requireAuthApi,
  hasStoredPassword, loginLockedFor, recordFailedLogin, clearFailedLogins,
} = require('./src/auth');
const { productionProblems, isWritableDir, isPseudoFsDir } = require('./src/startup');
const { generateProposalPptx } = require('./src/pptx-fill');
const { proposalProductList, proposalLabel } = require('./src/products');
const { getCatalog, computeDeal } = require('./src/calculator');
const { currencySymbolFor } = require('./src/currencies');
const {
  requireObject, requireArray, parseLicenses, parseDiscountFraction, parseText, parseManualSlides,
  MAX_ROWS_PER_SLIDE, MAX_SLIDES, MAX_NOTE_LENGTH,
} = require('./src/validate');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
// Behind a load balancer / reverse proxy, trust its X-Forwarded-* headers so the
// secure-cookie check and each visitor's address are read correctly.
if (isProduction) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json());

// For load balancers and container health checks.
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.use(session({
  // Production refuses to start without SESSION_SECRET (see the check at the bottom).
  // In development a random per-run secret is used, so no secret is ever hardcoded.
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction ? 'auto' : false, // 'auto' = secure whenever the request came in over HTTPS
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// Visiting any public proposal page immediately ends an admin session — an admin
// who navigates back to the public app must log in again next time, rather than
// staying signed in indefinitely just because the session cookie is still valid.
const PUBLIC_PAGE_PATHS = ['/', '/index.html', '/manual.html', '/multi-category.html', '/calculator', '/calculator.html'];
app.use((req, res, next) => {
  if (PUBLIC_PAGE_PATHS.includes(req.path) && req.session && req.session.authenticated) {
    req.session.destroy(() => next());
  } else {
    next();
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Some browsers ask for /favicon.ico no matter what the pages declare.
app.get('/favicon.ico', (req, res) => {
  res.type('image/png').sendFile(path.join(__dirname, 'public', 'img', 'kc-icon.png'));
});

// The Products dropdown on all three proposal pages: LMS category tiers plus every
// other enabled product, straight from the admin-editable catalog.
app.get('/products', async (req, res) => {
  res.json(proposalProductList(await getConfig()));
});

// ---------------------------------------------------------------------------
// Unified pricing calculator
// ---------------------------------------------------------------------------

app.get('/calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculator.html'));
});

app.get('/calculator/catalog', async (req, res) => {
  res.json(getCatalog(await getConfig()));
});

app.post('/calculate-deal', async (req, res) => {
  try {
    res.json(computeDeal(req.body, await getConfig()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Live-preview calculation endpoints — pure math, no .pptx template involved.
// These power the real-time preview on all three proposal pages.
// ---------------------------------------------------------------------------

function multiYearPctOf(config) {
  return {
    '2yr': config.multiYearDiscounts['2yr'] * 100,
    '3yr': config.multiYearDiscounts['3yr'] * 100,
    '5yr': config.multiYearDiscounts['5yr'] * 100,
  };
}

// Validation problems carry a status and a plain-language message; anything else
// is reported as a failure to build the file.
function sendCalcError(res, err) {
  res.status(err.status || 400).json({ error: err.message });
}

function sendGenerateError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('Proposal generation failed:', err);
  return res.status(503).json({
    error: 'The proposal file could not be built. ' + err.message,
    hint: 'Real .pptx generation needs the templates/ folder\'s Template for Proposal.pptx files to be present.',
  });
}

// A file name that is safe in an HTTP header for any company name, with the real
// (possibly non-Latin) name carried in the RFC 5987 form.
function contentDispositionFor(name) {
  const base = String(name || 'proposal');
  const ascii = base.replace(/[^\x20-\x7e]/g, '_').replace(/["\\/:*?<>|]/g, '_').trim() || 'proposal';
  return `attachment; filename="${ascii}.pptx"; filename*=UTF-8''${encodeURIComponent(base)}.pptx`;
}

function sendDeck(res, companyName, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', contentDispositionFor(companyName));
  res.send(buffer);
}

function parseLineItems(value) {
  return requireArray(value, 'line item', 1, MAX_ROWS_PER_SLIDE).map((raw, i) => {
    const li = requireObject(raw, `line item ${i + 1}`);
    return {
      licenseCount: parseLicenses(li.licenseCount, `Line item ${i + 1}: number of licenses`),
      categoryTier: li.categoryTier,
      categoryDisplayLabel: parseText(li.categoryDisplayLabel, 'Display label', { max: 100 }) || undefined,
    };
  });
}

app.post('/calculate-row', async (req, res) => {
  try {
    const config = await getConfig();
    const body = requireObject(req.body);
    const numbers = buildProposalNumbers(
      {
        licenses: parseLicenses(body.licenses),
        categoryTier: body.categoryTier,
        pricingYear: config.defaultPricingYear,
        nonProfit: !!body.nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: parseDiscountFraction(body.specialDiscountPct),
      },
      config
    );
    res.json({
      categoryDisplayLabel: parseText(body.categoryDisplayLabel, 'Display label', { max: 100 }) || proposalLabel(body.categoryTier, config),
      costPerUser1Yr: numbers.costPerUser1Yr,
      afterDiscountCostPerUser: numbers.afterDiscountCostPerUser,
      subTotal: numbers.subTotal,
      multiYear: numbers.multiYear,
      multiYearPct: multiYearPctOf(config),
    });
  } catch (err) {
    sendCalcError(res, err);
  }
});

app.post('/calculate-multi-category', async (req, res) => {
  try {
    const config = await getConfig();
    const body = requireObject(req.body);
    const numbers = buildMultiCategoryProposalNumbers(
      {
        lineItems: parseLineItems(body.lineItems).map((li) => ({
          ...li,
          categoryDisplayLabel: li.categoryDisplayLabel || proposalLabel(li.categoryTier, config),
        })),
        pricingYear: config.defaultPricingYear,
        nonProfit: !!body.nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: parseDiscountFraction(body.specialDiscountPct),
      },
      config
    );
    res.json({
      rows: numbers.rows,
      grandSubTotal: numbers.grandSubTotal,
      multiYear: numbers.multiYear,
      multiYearPct: multiYearPctOf(config),
    });
  } catch (err) {
    sendCalcError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Real .pptx generation — requires the actual KnowledgeCity template files in
// templates/. Validation problems come back as 400 with a plain message; a missing
// template or a failure while building the file comes back as 503.
// ---------------------------------------------------------------------------

app.post('/generate', async (req, res) => {
  try {
    const config = await getConfig();
    const body = requireObject(req.body);
    const companyName = parseText(body.companyName, 'Company name', { required: true });
    const symbol = currencySymbolFor(body.currencyCode);

    const builtSlides = requireArray(body.slides, 'pricing slide', 1, MAX_SLIDES).map((raw, i) => {
      const slide = requireObject(raw, `slide ${i + 1}`);
      const rows = requireArray(slide.rows, `row on slide ${i + 1}`, 1, MAX_ROWS_PER_SLIDE).map((r) => {
        const row = requireObject(r, `row on slide ${i + 1}`);
        return {
          licenses: parseLicenses(row.licenses, `Slide ${i + 1}: number of licenses`),
          categoryTier: row.categoryTier,
          categoryDisplayLabel: parseText(row.categoryDisplayLabel, 'Display label', { max: 100 }) || undefined,
        };
      });
      const discount = parseDiscountFraction(slide.specialDiscountPct);
      const numbers = buildSlideNumbers(
        { rows, pricingYear: config.defaultPricingYear, nonProfit: !!slide.nonProfit, specialDiscountPct: discount },
        config
      );
      return {
        rows: numbers.rows.map((r) => ({ ...r, categoryDisplayLabel: r.categoryDisplayLabel || proposalLabel(r.categoryTier, config) })),
        combinedSubTotal: numbers.combinedSubTotal,
        multiYear: numbers.multiYear,
        includeMultiYearTerms: slide.includeMultiYearTerms !== false,
        includeDiscountColumn: discount > 0,
        specialNote: parseText(slide.specialNote, 'Special note', { max: MAX_NOTE_LENGTH }),
      };
    });

    const buffer = await generateProposalPptx(
      { companyName, proposalDate: parseText(body.proposalDate, 'Date', { max: 30 }), currencySymbol: symbol, slides: builtSlides },
      config
    );
    sendDeck(res, companyName, buffer);
  } catch (err) {
    sendGenerateError(res, err);
  }
});

app.post('/generate-multi-category', async (req, res) => {
  try {
    const config = await getConfig();
    const body = requireObject(req.body);
    const companyName = parseText(body.companyName, 'Company name', { required: true });
    const symbol = currencySymbolFor(body.currencyCode);
    const discount = parseDiscountFraction(body.specialDiscountPct);

    const numbers = buildMultiCategoryProposalNumbers(
      {
        lineItems: parseLineItems(body.lineItems),
        pricingYear: config.defaultPricingYear,
        nonProfit: !!body.nonProfit,
        priceAdjustmentPct: 0,
        specialDiscountPct: discount,
      },
      config
    );

    // A Holistic proposal is still just one pricing slide — it just has one table
    // row per line item instead of one row total — so the same generator that
    // builds the Standard Proposal's .pptx (and already clones the template's data
    // row once per entry in `rows`) handles this without any special-casing.
    // buildMultiCategoryProposalNumbers' rows use `licenseCount` and don't carry
    // specialDiscountPct, while pptx-fill's row filler and its "After Discount N%"
    // header expect the Standard path's row shape, so both are reconciled here.
    const slide = {
      rows: numbers.rows.map((r) => ({
        ...r,
        licenses: r.licenseCount,
        specialDiscountPct: discount,
        categoryDisplayLabel: r.categoryDisplayLabel || proposalLabel(r.categoryTier, config),
      })),
      combinedSubTotal: numbers.grandSubTotal,
      multiYear: numbers.multiYear,
      includeMultiYearTerms: body.includeMultiYearTerms !== false,
      includeDiscountColumn: discount > 0,
      specialNote: parseText(body.specialNote, 'Special note', { max: MAX_NOTE_LENGTH }),
    };

    const buffer = await generateProposalPptx(
      { companyName, proposalDate: parseText(body.proposalDate, 'Date', { max: 30 }), currencySymbol: symbol, slides: [slide] },
      config
    );
    sendDeck(res, companyName, buffer);
  } catch (err) {
    sendGenerateError(res, err);
  }
});

app.post('/generate-manual', async (req, res) => {
  try {
    const config = await getConfig();
    const body = requireObject(req.body);
    const companyName = parseText(body.companyName, 'Company name', { required: true });
    const symbol = currencySymbolFor(body.currencyCode);

    // Manual Proposal's numbers are exactly what's on screen (engine defaults the
    // user may have overridden) — unlike Standard/Holistic, nothing here is
    // recomputed from the pricing engine; the client's own figures are used as-is.
    const buffer = await generateProposalPptx(
      { companyName, proposalDate: parseText(body.proposalDate, 'Date', { max: 30 }), currencySymbol: symbol, slides: parseManualSlides(body.slides) },
      config
    );
    sendDeck(res, companyName, buffer);
  } catch (err) {
    sendGenerateError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  const locked = loginLockedFor(req.ip);
  if (locked > 0) {
    res.setHeader('Retry-After', Math.ceil(locked / 1000));
    return res.status(429).json({ ok: false, error: `Too many incorrect attempts. Try again in ${Math.ceil(locked / 60000)} minute(s).` });
  }
  const { password } = req.body;
  if (verifyPassword(password)) {
    clearFailedLogins(req.ip);
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  recordFailedLogin(req.ip);
  res.status(401).json({ ok: false, error: 'Incorrect password' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/password', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-password.html'));
});

app.get('/admin/calculator', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-calculator.html'));
});

app.get('/admin/config', requireAuthApi, async (req, res) => {
  res.json(await getConfig());
});

app.post('/admin/config', requireAuthApi, async (req, res) => {
  try {
    const saved = await saveConfig(req.body);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/admin/change-password', requireAuthApi, (req, res) => {
  try {
    changePassword(req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'The request could not be read.' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  if (isProduction) {
    const dataDir = process.env.DATA_DIR;
    // Check for a pseudo-filesystem path first, so nothing is ever written there.
    const dataDirIsPseudo = dataDir ? isPseudoFsDir(dataDir) : false;
    const problems = productionProblems(process.env, {
      hasStoredPassword: dataDirIsPseudo ? false : hasStoredPassword(),
      canWriteDataDir: dataDir && !dataDirIsPseudo ? isWritableDir(dataDir) : true,
      dataDirIsPseudo,
    });
    if (problems.length) {
      console.error('QuoteHub cannot start in production:\n - ' + problems.join('\n - '));
      process.exit(1);
    }
  }
  const server = app.listen(PORT, () => {
    console.log(`QuoteHub listening on port ${PORT}${isProduction ? ' (production)' : ''}`);
  });
  // `docker stop` / orchestrator shutdowns: finish in-flight requests, then exit.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}

module.exports = app;
