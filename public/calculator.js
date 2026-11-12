(function () {
  'use strict';

  var esc = window.KCEsc;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var catalog = null;
  var state = null;
  var lastResult = null;

  // Whole dollars, rounded from cents first so float noise (e.g. 12862.499999999998) can't turn $12,862.50 into $12,862.
  function money(x) { return '$' + Math.round(Math.round(x * 100) / 100).toLocaleString('en-US'); }
  function money2(x) { return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtPct(x) { var r = Math.round(x * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); }

  function defaultState() {
    return { headcount: catalog.defaultHeadcount, nonprofit: 0, years: 1, products: {} };
  }
  // Nothing is remembered between visits: leaving the page and coming back (or
  // refreshing) always starts from a clean calculator. Older versions saved the
  // inputs in the browser, so clear those leftovers once.
  try { ['kc_deal_desk_calc_v1', 'kc_deal_desk_calc_v2', 'kc_deal_desk_calc_v3'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* storage unavailable */ }
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); }); // back/forward cache restore

  function pState(id) {
    var p = catalog.products.filter(function (x) { return x.id === id; })[0];
    if (!state.products[id]) {
      state.products[id] = {
        include: false, override: '', content: catalog.defaultContentTier, lmsMode: 'both',
        offer: 0, multiYear: { 2: 0, 3: 0, 5: 0 }, special: 0,
        plan: p && p.plans ? p.plans[0].id : undefined, xSeats: 0, xCourses: 0, xPlay: 0,
      };
    }
    return state.products[id];
  }

  // The shared headcount as the server reads it (whole number, never negative).
  function sharedHeadcount() { return Math.max(0, Math.floor(+state.headcount || 0)); }

  // Licenses boxes that haven't been typed into follow the headcount at the top.
  function syncFollowing() {
    $$('[data-f="override"][data-follow]').forEach(function (el) { el.value = sharedHeadcount(); });
  }

  // ---------------------------------------------------------------- controls
  function renderControls() {
    $('#segYears').innerHTML = catalog.years.map(function (y) {
      return '<button type="button" data-y="' + y + '" class="' + (+state.years === y ? 'on' : '') + '">' + y + ' yr' + (y > 1 ? 's' : '') + '</button>';
    }).join('');
    $$('#segYears button').forEach(function (b) {
      b.onclick = function () { state.years = +b.getAttribute('data-y'); renderControls(); renderProducts(); sync(); };
    });
    $('#headcount').value = state.headcount;
    $('#nonprofit').value = state.nonprofit;
    $('#headcount').oninput = function (e) { state.headcount = e.target.value; syncFollowing(); sync(); };
    $('#nonprofit').oninput = function (e) { state.nonprofit = e.target.value; sync(); };
  }

  function renderProducts() {
    var years = +state.years;
    var list = $('#productList');
    list.innerHTML = catalog.products.map(function (p) {
      var st = pState(p.id);
      var isLms = p.model === 'lms_marginal';
      // Per-employee products show (and follow) the headcount until typed over; seat-based
      // products (KC Talent: people assessed) are counted separately and never follow it.
      var follows = !p.seatBased && (st.override === '' || st.override == null);
      var licenseValue = follows ? sharedHeadcount() : (st.override == null ? '' : st.override);
      var licenses =
        '<div class="field"><label>' + esc(p.seatBased ? (p.overrideLabel || '# Author seats') : '# Licenses') +
        ' <span class="muted">(' + (p.seatBased ? 'blank = ' + (p.defaultSeats != null ? p.defaultSeats : 1) : 'follows headcount') + ')</span></label>' +
        '<input type="number" min="0" step="1" data-id="' + p.id + '" data-f="override" placeholder="0"' + (follows ? ' data-follow="1"' : '') + ' value="' + esc(licenseValue) + '"></div>';
      var top;
      if (isLms) {
        top = '<div class="row">' + licenses +
          '<div class="field"><label>Scope</label><select data-id="' + p.id + '" data-f="lmsMode">' +
            catalog.lmsModes.map(function (m) { return '<option value="' + m.id + '"' + (st.lmsMode === m.id ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label>Content tier ' + (st.lmsMode === 'lms' ? '<span class="muted">(n/a)</span>' : '') + '</label>' +
            '<select data-id="' + p.id + '" data-f="content"' + (st.lmsMode === 'lms' ? ' disabled' : '') + '>' +
            catalog.contentTiers.map(function (c) { return '<option value="' + esc(c.id) + '"' + (st.content === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
          '</select></div></div>';
      } else if (p.plans) {
        top = '<div class="field" style="margin-bottom:0.8rem;"><label>Plan</label><div class="seg">' +
          p.plans.map(function (pl) {
            return '<button type="button" data-id="' + p.id + '" data-plan="' + esc(pl.id) + '" class="' + (st.plan === pl.id ? 'on' : '') + '">' +
              esc(pl.label) + ' <span style="opacity:.7">×' + pl.mult + '</span><br><span style="font-size:0.72rem;opacity:.8">' + money(pl.basePrice) + '</span></button>';
          }).join('') + '</div></div>' +
          '<div class="row">' +
            '<div class="field"><label>Extra seats <span class="muted">(+$' + p.extraSeat + '/yr)</span></label><input type="number" min="0" step="1" data-id="' + p.id + '" data-f="xSeats" value="' + (st.xSeats || 0) + '"></div>' +
            '<div class="field"><label>Extra courses <span class="muted">(one-time / yr)</span></label><input type="number" min="0" step="10" data-id="' + p.id + '" data-f="xCourses" value="' + (st.xCourses || 0) + '"></div>' +
            '<div class="field"><label>Extra playback <span class="muted">(credits)</span></label><input type="number" min="0" step="100" data-id="' + p.id + '" data-f="xPlay" value="' + (st.xPlay || 0) + '"></div>' +
          '</div>';
      } else {
        top = '<div class="row">' + licenses + '</div>';
      }
      var myValue = st.multiYear[years] != null ? st.multiYear[years] : 0;
      var myField = years > 1
        ? '<div class="dfield"><small>Multi-year <span class="muted">(' + years + '-yr)</span></small><div class="ip"><input type="number" min="0" max="100" step="1" data-id="' + p.id + '" data-f="my" value="' + esc(myValue) + '"><span class="sfx">%</span></div></div>'
        : '';
      return '<div class="prod-card ' + (st.include ? 'on' : 'off') + '">' +
        '<div class="prod-head"><div class="prod-ico" style="background:' + esc(p.color) + '">' + esc(p.short) + '</div>' +
          '<div><div class="prod-name">' + esc(p.name) + '</div><div class="prod-desc">' + esc(p.desc || '') + '</div></div>' +
          '<div class="tgl ' + (st.include ? 'on' : '') + '" data-inc="' + p.id + '"><span class="switch"></span></div></div>' +
        '<div class="prod-body"' + (st.include ? '' : ' style="display:none"') + '>' + top +
          '<div class="minilab">Discounts' + (years > 1 ? ' <span class="muted" style="text-transform:none;letter-spacing:0;">(multi-year first, then offer, compounding)</span>' : '') + '</div>' +
          '<div class="dgrid">' + myField +
            '<div class="dfield"><small>Offer <span class="muted">(1-yr %)</span></small><div class="ip"><input type="number" min="0" max="100" step="1" data-id="' + p.id + '" data-f="offer" value="' + esc(st.offer == null ? 0 : st.offer) + '"><span class="sfx">%</span></div></div>' +
            '<div class="dfield dollar"><small>Special discount</small><div class="ip"><span class="pfx">$</span><input type="number" min="0" step="100" data-id="' + p.id + '" data-f="special" value="' + esc(st.special == null ? 0 : st.special) + '"></div></div>' +
          '</div>' +
          '<div class="readout" data-readout="' + p.id + '"></div>' +
        '</div></div>';
    }).join('');
  }

  // One set of delegated listeners (the product cards are rebuilt on some changes).
  function wireProductEvents() {
    var list = $('#productList');
    list.addEventListener('input', function (e) {
      var t = e.target;
      var id = t.getAttribute('data-id');
      var f = t.getAttribute('data-f');
      if (!id || !f || t.tagName === 'SELECT') return;
      var st = pState(id);
      if (f === 'my') st.multiYear[state.years] = t.value === '' ? 0 : t.value;
      else st[f] = t.value;
      // Typing a number into a product's licenses box detaches it from the headcount.
      if (f === 'override' && t.value !== '') t.removeAttribute('data-follow');
      sync();
    });
    list.addEventListener('change', function (e) {
      var t = e.target;
      // Leaving a licenses box empty hands it back to the headcount.
      if (t.getAttribute('data-f') === 'override' && t.value === '' && !pState(t.getAttribute('data-id')).seatBased) {
        var p = catalog.products.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
        if (p && !p.seatBased) { t.setAttribute('data-follow', '1'); t.value = sharedHeadcount(); sync(); return; }
      }
      if (t.tagName !== 'SELECT') return;
      var st = pState(t.getAttribute('data-id'));
      st[t.getAttribute('data-f')] = t.value;
      if (t.getAttribute('data-f') === 'lmsMode') renderProducts();
      sync();
    });
    list.addEventListener('click', function (e) {
      var inc = e.target.closest('[data-inc]');
      if (inc) {
        var st = pState(inc.getAttribute('data-inc'));
        st.include = !st.include;
        renderProducts(); sync();
        return;
      }
      var planBtn = e.target.closest('[data-plan]');
      if (planBtn) {
        pState(planBtn.getAttribute('data-id')).plan = planBtn.getAttribute('data-plan');
        renderProducts(); sync();
      }
    });
  }

  // ----------------------------------------------------------------- results
  function readoutHtml(l) {
    if (!l.included) return '<span class="muted">Excluded from bundle</span>';
    if (l.covered <= 0) return '<span class="muted">Enter a ' + (l.model === 'studio_plan' ? 'plan' : 'headcount or licenses') + ' to price this product — currently 0</span>';
    if (l.free) return '<span class="tag free">FREE TIER</span> <span class="muted">' + l.covered.toLocaleString() + ' ' + esc(l.freeCapUnit || l.unit + 's') + ' — $0</span>';
    var discBits = [];
    if (l.effPct > 0) discBits.push('−' + fmtPct(l.effPct) + '%');
    if (l.special > 0) discBits.push('−' + money(l.special));
    var discKv = discBits.length
      ? '<div class="kv"><small>Discount' + (l.offerPct > 0 && l.myPct > 0 ? ' (' + l.myPct + '% then ' + l.offerPct + '%)' : '') + '</small><b class="disc">' + discBits.join(' ') + '</b></div>'
      : '';
    if (l.plan) {
      var margin = l.annual > 0 ? Math.round((l.annual - l.cogs) / l.annual * 100) : 0;
      return '<div class="kv"><small>Plan</small><b>' + esc(l.plan.label) + ' <span class="muted">×' + l.mult + '</span></b></div>' +
        '<div class="kv"><small>Creator seats</small><b>' + l.seats + (l.xSeats ? ' <span class="muted">(' + l.plan.seats + '+' + l.xSeats + ')</span>' : '') + '</b></div>' +
        '<div class="kv"><small>Courses / yr</small><b>' + l.coursesYr.toLocaleString() + (l.xCourses ? ' <span class="muted">(+' + l.xCourses + ')</span>' : '') + '</b></div>' +
        '<div class="kv"><small>Playback credits</small><b>' + l.playback.toLocaleString() + '</b></div>' +
        '<div class="kv"><small>COGS → ×' + l.mult + '</small><b>' + money(l.cogs) + ' → ' + money(l.cogs * l.mult) + '</b></div>' +
        (l.seatsCharge ? '<div class="kv"><small>+ Extra seats</small><b>' + money(l.seatsCharge) + '</b></div>' : '') +
        '<div class="kv"><small>Annual list</small><b>' + money(l.annualList) + '</b></div>' + discKv +
        '<div class="kv"><small>Price / yr</small><b>' + money(l.annual) + '</b></div>' +
        '<div class="kv"><small>Margin</small><b>~' + margin + '%</b></div>';
    }
    var isLms = l.model === 'lms_marginal';
    var modeLabel = isLms ? catalog.lmsModes.filter(function (m) { return m.id === l.lmsMode; })[0].label : '';
    return (isLms ? '<div class="kv"><small>Scope</small><b>' + esc(modeLabel) + '</b></div>' : '') +
      '<div class="kv"><small>Covered</small><b>' + l.covered.toLocaleString() + '</b></div>' +
      (l.flat
        ? '<div class="kv"><small>Flat fee · by band</small><b>' + money(l.annualList) + '</b></div><div class="kv"><small>eff. $/' + esc(l.unit) + '</small><b>' + money2(l.perUnit) + '</b></div>'
        : '<div class="kv"><small>$/' + esc(l.unit) + '/yr</small><b>' + money2(l.perUnit) + '</b></div><div class="kv"><small>Annual list</small><b>' + money(l.annualList) + '</b></div>') +
      (isLms && l.lmsMode === 'both' ? '<div class="kv"><small>Library / LMS</small><b>' + money(l.libAnnual) + ' / ' + money(l.lmsAnnual) + '</b></div>' : '') +
      discKv +
      '<div class="kv"><small>Price / yr</small><b>' + money(l.annual) + '</b></div>' +
      (l.custom ? '<span class="tag custom">CUSTOM · sales-led</span>' : '');
  }

  function weightCell(w, color) {
    return w > 0 ? w.toFixed(1) + '%<div class="wbar"><span style="width:' + Math.min(100, w) + '%;background:' + esc(color) + '"></span></div>' : '—';
  }

  function renderResults(res) {
    lastResult = res;
    res.lines.forEach(function (l) {
      var box = document.querySelector('[data-readout="' + l.id + '"]');
      if (box) box.innerHTML = readoutHtml(l);
    });

    $('#refBadge').textContent = res.ctx.headcount ? res.ctx.headcount.toLocaleString() + ' employees' : '';
    $('#termBadge').textContent = res.years + (res.years > 1 ? ' years' : ' year');
    $('#sumList').textContent = money(res.list);
    $('#sumAnnual').innerHTML = '<span class="strike">' + money(res.list) + '</span>' + money(res.annual);
    $('#tcvYears').textContent = '(' + res.years + (res.years > 1 ? ' yrs' : ' yr') + ')';
    $('#sumTCV').textContent = money(res.tcv);
    $('#sumBlend').textContent = money2(res.blended) + '/emp';
    $('#sumCash').textContent = money(res.annual);

    var inc = res.lines.filter(function (l) { return l.included && l.covered > 0; });
    var rows = inc.map(function (l) {
      var dot = '<span class="pdot" style="background:' + esc(l.color) + '"></span>';
      if (l.free) return '<tr><td>' + dot + esc(l.name) + '</td><td>' + l.covered.toLocaleString() + '</td><td>$0.00</td><td>$0</td><td><span class="tag free">FREE</span></td><td>$0</td><td>—</td><td>$0</td></tr>';
      var w = res.annual > 0 ? l.annual / res.annual * 100 : 0;
      var discCell = (l.effPct > 0 ? '−' + fmtPct(l.effPct) + '%' : '—') +
        (l.offerPct > 0 && l.myPct > 0 ? '<div class="muted" style="font-size:0.68rem">' + l.myPct + '%→' + l.offerPct + '%</div>' : '') +
        (l.special > 0 ? '<div class="disc" style="font-size:0.68rem">−' + money(l.special) + '</div>' : '');
      var tags = '';
      if (l.model === 'lms_marginal' && l.lmsMode !== 'both') tags += ' <span class="muted" style="font-size:0.7rem">· ' + (l.lmsMode === 'content' ? 'Content only' : 'LMS only') + '</span>';
      if (l.model === 'flat_band') tags += ' <span class="muted" style="font-size:0.7rem">· flat by size</span>';
      if (l.plan) tags += ' <span class="muted" style="font-size:0.7rem">· ' + esc(l.plan.label) + ' ×' + l.mult + ' · ' + l.seats + ' seats · ' + l.coursesYr.toLocaleString() + ' courses/yr</span>';
      if (l.custom) tags += ' <span class="tag custom">custom</span>';
      var out = '<tr><td>' + dot + esc(l.name) + tags + '</td><td>' + l.covered.toLocaleString() + '</td><td>' + money2(l.perUnit) + '</td><td>' + money(l.annualList) +
        '</td><td class="' + (l.effPct || l.special ? 'disc' : '') + '">' + discCell + '</td><td><b>' + money(l.annual) + '</b></td><td>' + weightCell(w, l.color) + '</td><td>' + money(l.tcv) + '</td></tr>';
      if (l.model === 'lms_marginal' && l.lmsMode === 'both' && l.annualList > 0) {
        var sub = function (label, color, listV, netV) {
          var sw = res.annual > 0 ? netV / res.annual * 100 : 0;
          return '<tr class="subrow"><td>↳ ' + label + '</td><td></td><td>' + money2(l.covered ? listV / l.covered : 0) + '</td><td>' + money(listV) + '</td><td>' +
            (l.effPct > 0 ? '−' + fmtPct(l.effPct) + '%' : '—') + '</td><td>' + money(netV) + '</td><td>' + weightCell(sw, color) + '</td><td>' + money(netV * res.years) + '</td></tr>';
        };
        out += sub('Content (Library)', l.color, l.libAnnual, l.libAnnualNet) + sub('LMS platform', '#93c5fd', l.lmsAnnual, l.lmsAnnualNet);
      }
      return out;
    }).join('');
    var total = inc.length
      ? '<tr class="total"><td>Bundle</td><td></td><td></td><td>' + money(res.list) + '</td><td></td><td>' + money(res.annual) + '</td><td>100%</td><td>' + money(res.tcv) + '</td></tr>'
      : '';
    $('#resBody').innerHTML = rows + total || '<tr><td colspan="8" style="text-align:center;color:var(--kc-text-muted);padding:1.1rem">No products selected</td></tr>';
    $('#tblNote').textContent = inc.length ? 'price/yr locks for all ' + res.years + (res.years > 1 ? ' years' : ' year') : '';

    $$('[data-f="override"]').forEach(function (el) {
      var p = catalog.products.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      el.placeholder = p && p.seatBased ? String(p.defaultSeats != null ? p.defaultSeats : 1) : (res.ctx.headcount || 0).toLocaleString();
    });
  }

  var token = 0;
  var timer = null;
  function compute() {
    var mine = ++token;
    fetch('/calculate-deal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
      .then(function (r) { return r.json().then(function (body) { if (!r.ok) throw new Error(body.error || r.statusText); return body; }); })
      .then(function (res) { if (mine === token) renderResults(res); })
      .catch(function (err) {
        if (mine !== token) return;
        $('#tblNote').textContent = 'Could not calculate: ' + err.message;
      });
  }
  function sync() {
    clearTimeout(timer);
    timer = setTimeout(compute, 120);
  }

  function fullRender() {
    renderControls();
    renderProducts();
    sync();
  }

  $('#btnPrint').addEventListener('click', function () { window.print(); });
  $('#btnReset').addEventListener('click', function () {
    if (confirm('Reset the calculator? All inputs go back to 0.')) { state = defaultState(); fullRender(); }
  });

  fetch('/calculator/catalog')
    .then(function (r) { return r.json(); })
    .then(function (c) {
      catalog = c;
      state = defaultState();
      wireProductEvents();
      fullRender();
    })
    .catch(function () {
      $('#productList').innerHTML = '<div class="preview-empty-hint">Could not load the product catalog. Please refresh.</div>';
    });
})();
