(function () {
  'use strict';

  // Clean stroke-based icons (24x24, currentColor) — used for sidebar nav items so
  // the UI doesn't rely on emoji glyphs.
  var ICONS = {
    document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.36.38.68.7.9.32.22.7.35 1.1.35H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.5"/><path d="M12 17.2h.01"/></svg>',
    collapseLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-6 6 6 6"/><path d="M11 6l-6 6 6 6"/></svg>',
    collapseRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/></svg>',
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11.01"/><line x1="12" y1="11" x2="12" y2="11.01"/><line x1="16" y1="11" x2="16" y2="11.01"/><line x1="8" y1="15" x2="8" y2="15.01"/><line x1="12" y1="15" x2="12" y2="15.01"/><line x1="16" y1="15" x2="16" y2="15.01"/><line x1="8" y1="19" x2="8" y2="19.01"/><line x1="12" y1="19" x2="12" y2="19.01"/><line x1="16" y1="19" x2="16" y2="19.01"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.4-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2 0 2.8 5.8 1.4 5.8 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.5-.6-3-1.6"/><path d="M12 6.5v1.3M12 16.2v1.3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
  };

  window.KCIcons = ICONS;

  // ---------------------------------------------------------------------
  // Sidebar — one definition for every page. Each page just declares
  // <aside class="sidebar" id="sidebar" data-variant="public|admin" data-nav="...">
  // and this fills it in, so a new page or link is added in exactly one place.
  // ---------------------------------------------------------------------
  var APP_NAME = 'QuoteHub';
  var NAV = {
    public: [
      { group: 'Proposal Generator', icon: 'document', children: [
        { key: 'standard', href: '/index.html', icon: 'document', label: 'Standard Proposal' },
        { key: 'holistic', href: '/multi-category.html', icon: 'layers', label: 'Holistic Calculation (Proposal)' },
        { key: 'manual', href: '/manual.html', icon: 'edit', label: 'Manual Proposal' },
      ] },
      { key: 'calculator', href: '/calculator.html', icon: 'dollar', label: 'KC Pricing Calculator' },
      { key: 'admin', href: '/admin', icon: 'settings', label: 'Admin Panel' },
    ],
    admin: [
      { key: 'admin', href: '/admin', icon: 'document', label: 'Proposal Generator' },
      { key: 'admin-calculator', href: '/admin/calculator', icon: 'dollar', label: 'KC Pricing Calculator' },
      { key: 'admin-password', href: '/admin/password', icon: 'lock', label: 'Change Password' },
      { key: 'back', href: '/index.html', icon: 'arrowLeft', label: 'Back to public app', separated: true },
    ],
  };

  function navLink(item, active) {
    var cls = (item.key === active ? 'active' : '') + (item.separated ? ' nav-separated' : '');
    return '<a href="' + item.href + '"' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '>' +
      '<span class="nav-icon" data-icon="' + item.icon + '"></span><span class="nav-label">' + item.label + '</span></a>';
  }

  function renderSidebar(el) {
    var variant = el.getAttribute('data-variant') === 'admin' ? 'admin' : 'public';
    var active = el.getAttribute('data-nav');
    var nav = NAV[variant].map(function (item) {
      if (!item.group) return navLink(item, active);
      var open = item.children.some(function (c) { return c.key === active; });
      return '<div class="nav-group' + (open ? ' open has-active' : '') + '">' +
        '<button type="button" class="nav-group-head"><span class="nav-icon" data-icon="' + item.icon + '"></span>' +
        '<span class="nav-label">' + item.group + '</span><span class="nav-chevron" data-icon="chevronDown"></span></button>' +
        '<div class="nav-sub">' + item.children.map(function (c) { return navLink(c, active); }).join('') + '</div></div>';
    }).join('');
    var bottom = variant === 'admin'
      ? ''
      : '<a class="sidebar-help-link" href="https://share.hsforms.com/2DiwtP86rQPSLpHDkiqlLDwnkjhs" target="_blank" rel="noopener"><span class="nav-icon" data-icon="help"></span><span class="nav-label">Need Help</span></a>';
    el.innerHTML =
      '<div class="sidebar-logo"><img src="/img/kc-icon.png" alt="">' +
        '<span class="logo-text"><span class="logo-name">KnowledgeCity</span><span class="logo-sub">' + APP_NAME + '</span></span></div>' +
      '<nav>' + nav + '</nav>' + bottom +
      '<button class="sidebar-collapse-btn" id="collapseBtn"><span class="nav-icon" data-icon="collapseLeft"></span><span class="nav-label">Collapse</span></button>' +
      '<div class="sidebar-watermark">Powered by KC RevOps</div>';
    el.querySelectorAll('.nav-group-head').forEach(function (head) {
      head.addEventListener('click', function () { head.parentNode.classList.toggle('open'); });
    });
  }

  // Confidentiality footer, centered at the bottom of the page content. A page opts in
  // with <main class="main" data-footer="confidential">.
  var footerHost = document.querySelector('main[data-footer="confidential"]');
  if (footerHost) {
    var footer = document.createElement('div');
    footer.className = 'app-footer';
    footer.innerHTML = '<span class="pill">Confidential — Internal Use Only · KnowledgeCity ' + APP_NAME + '</span>';
    footerHost.appendChild(footer);
  }

  var sidebarEl = document.getElementById('sidebar');
  if (sidebarEl && sidebarEl.hasAttribute('data-nav')) renderSidebar(sidebarEl);

  // ---------------------------------------------------------------------
  // Products dropdown shared by the three proposal pages: LMS category tiers
  // first, then every other product, grouped — all from the admin-editable catalog.
  // ---------------------------------------------------------------------
  var productsPromise = null;
  var productList = [];
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  window.KCProducts = {
    load: function () {
      if (!productsPromise) {
        productsPromise = fetch('/products').then(function (r) { return r.json(); }).then(function (list) { productList = list; return list; });
      }
      return productsPromise;
    },
    labelFor: function (id) {
      var m = productList.filter(function (p) { return p.id === id; })[0];
      return m ? m.label : id;
    },
    optionsHtml: function () {
      var html = '<option value="" disabled selected>Select a product</option>';
      var groups = [];
      productList.forEach(function (p) {
        var g = groups.filter(function (x) { return x.name === p.group; })[0];
        if (!g) { g = { name: p.group, items: [] }; groups.push(g); }
        g.items.push(p);
      });
      groups.forEach(function (g) {
        html += '<optgroup label="' + escHtml(g.name) + '">' + g.items.map(function (p) {
          return '<option value="' + escHtml(p.id) + '">' + escHtml(p.label) + '</option>';
        }).join('') + '</optgroup>';
      });
      return html;
    },
  };
  // Requests that never throw: a network failure or a rejected value comes back as
  // { ok: false, data: { error } } so each page can show a message instead of breaking.
  window.KCApi = {
    post: function (url, body) {
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
        })
        .catch(function () {
          return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } };
        });
    },
    // Builds the .pptx and saves it. The button is locked while it works so a double
    // click can't produce two files.
    download: function (url, body, name, button) {
      var original = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Generating…'; }
      var fileName = String(name || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').trim() || 'proposal';
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (err) {
              alert('Could not generate the proposal: ' + (err.error || 'please try again.'));
              return false;
            });
          }
          return res.blob().then(function (blob) {
            var href = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = href; a.download = fileName + '.pptx';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(href); }, 10000);
            return true;
          });
        })
        .catch(function () {
          alert('Could not reach the server. Check your connection and try again.');
          return false;
        })
        .then(function (ok) {
          if (button) { button.disabled = false; button.textContent = original; }
          return ok;
        });
    },
  };
  window.KCEsc = escHtml;

  document.querySelectorAll('[data-icon]').forEach(function (el) {
    var name = el.getAttribute('data-icon');
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });

  var sidebar = document.getElementById('sidebar');
  var collapseBtn = document.getElementById('collapseBtn');
  var collapseIcon = collapseBtn ? collapseBtn.querySelector('[data-icon]') : null;
  function syncCollapseIcon() {
    if (collapseIcon) collapseIcon.innerHTML = sidebar.classList.contains('collapsed') ? ICONS.collapseRight : ICONS.collapseLeft;
  }
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function () {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('kc-sidebar-collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
      syncCollapseIcon();
    });
    // Collapsed by default on a phone-sized screen (unless the user has chosen otherwise).
    var savedCollapse = localStorage.getItem('kc-sidebar-collapsed');
    if (savedCollapse === '1' || (savedCollapse === null && window.innerWidth < 700)) sidebar.classList.add('collapsed');
    syncCollapseIcon();
  }

  // Theme toggle — a plain text pill ("Light mode" / "Dark mode"), dark by default.
  var themeToggle = document.getElementById('themeToggle');
  function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    if (themeToggle) themeToggle.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
  }
  // Default to the system's own light/dark preference when the user hasn't
  // explicitly picked one on this device yet.
  var systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var savedTheme = localStorage.getItem('kc-theme') || (systemPrefersLight ? 'light' : 'dark');
  applyTheme(savedTheme);
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var next = isLight ? 'dark' : 'light';
      localStorage.setItem('kc-theme', next);
      applyTheme(next);
    });
  }

  // ---------------------------------------------------------------------
  // Searchable currency combo. Turns a `.currency-combo` wrapper (a text
  // input + hidden input + dropdown div) into a filterable picker. The
  // hidden input keeps the same id the rest of each page's script already
  // reads (e.g. #currencyCode), and dispatches a bubbling 'change' event on
  // selection so existing form-level recalculation listeners keep working
  // unmodified.
  // ---------------------------------------------------------------------
  var CURRENCIES = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
    { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
    { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
    { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
    { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
    { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
    { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
    { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
    { code: 'THB', symbol: '฿', name: 'Thai Baht' },
    { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  ];
  window.KC_CURRENCIES = CURRENCIES;

  function currencyLabel(c) { return c.symbol + '  ' + c.code + ' — ' + c.name; }

  function initCurrencyCombo(wrap) {
    var search = wrap.querySelector('input[type="text"]');
    var hidden = wrap.querySelector('input[type="hidden"]');
    var dropdown = wrap.querySelector('.currency-dropdown');
    var highlighted = -1;
    var filtered = CURRENCIES;

    function setValue(code) {
      var c = CURRENCIES.filter(function (x) { return x.code === code; })[0] || CURRENCIES[0];
      hidden.value = c.code;
      search.value = currencyLabel(c);
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function render() {
      if (!filtered.length) {
        dropdown.innerHTML = '<div class="currency-no-match">No currency matches.</div>';
        return;
      }
      dropdown.innerHTML = filtered.map(function (c, i) {
        return '<div class="currency-option' + (i === highlighted ? ' highlighted' : '') + '" data-code="' + c.code + '">' +
          '<span class="cc-symbol">' + c.symbol + '</span>' +
          '<span class="cc-code">' + c.code + '</span><span>' + c.name + '</span>' +
        '</div>';
      }).join('');
    }

    function filterList(term) {
      var t = term.trim().toLowerCase();
      filtered = !t ? CURRENCIES : CURRENCIES.filter(function (c) {
        return c.code.toLowerCase().indexOf(t) !== -1 || c.name.toLowerCase().indexOf(t) !== -1 || c.symbol.toLowerCase().indexOf(t) !== -1;
      });
      highlighted = filtered.length ? 0 : -1;
      render();
    }

    function open() { wrap.classList.add('open'); filterList(''); }
    function close() { wrap.classList.remove('open'); var c = CURRENCIES.filter(function (x) { return x.code === hidden.value; })[0]; if (c) search.value = currencyLabel(c); }

    search.addEventListener('focus', function () { search.select(); open(); });
    search.addEventListener('input', function () { open(); filterList(search.value); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, filtered.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) { setValue(filtered[highlighted].code); close(); search.blur(); } }
      else if (e.key === 'Escape') { close(); search.blur(); }
    });
    dropdown.addEventListener('mousedown', function (e) {
      var opt = e.target.closest('.currency-option');
      if (!opt) return;
      e.preventDefault();
      setValue(opt.getAttribute('data-code'));
      close();
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });

    if (hidden.value) setValue(hidden.value);
  }

  document.querySelectorAll('.currency-combo').forEach(initCurrencyCombo);

  // ---------------------------------------------------------------------
  // Floating calculator: draggable window, full keyboard support, and its
  // state resets whenever it's closed — reopening from the FAB always
  // starts from a clean "0", never resuming the previous calculation.
  // ---------------------------------------------------------------------
  var calcFab = document.getElementById('calcFab');
  var calcWindow = document.getElementById('calcWindow');
  if (calcFab && calcWindow) {
    var display = calcWindow.querySelector('.calc-display');
    // `expr` is the full running equation shown on screen (e.g. "24 × 5"); `value`
    // tracks just the operand currently being typed, used for the actual arithmetic.
    // Pressing "=" is what collapses `expr` down to the final answer — until then,
    // the whole expression stays visible exactly as typed.
    var state = { expr: '0', value: '0', prev: null, op: null, waitingForOperand: false };

    function opSymbol(op) { return { '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op; }
    function resetState() { state = { expr: '0', value: '0', prev: null, op: null, waitingForOperand: false }; render(); }
    function render() { display.textContent = state.expr; }

    function inputDigit(d) {
      if (state.waitingForOperand) {
        state.value = d;
        state.expr += d;
        state.waitingForOperand = false;
      } else {
        state.value = state.value === '0' ? d : state.value + d;
        state.expr = state.expr === '0' ? d : state.expr + d;
      }
      render();
    }
    function inputDecimal() {
      if (state.waitingForOperand) { state.value = '0.'; state.expr += '0.'; state.waitingForOperand = false; render(); return; }
      if (state.value.indexOf('.') === -1) { state.value += '.'; state.expr += '.'; render(); }
    }
    function backspace() {
      if (state.waitingForOperand) return;
      if (state.value.length > 1) {
        state.value = state.value.slice(0, -1);
        state.expr = state.expr.slice(0, -1);
      } else {
        state.value = '0';
        state.expr = state.expr.slice(0, -1) + '0';
      }
      render();
    }
    function compute(a, b, op) {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? NaN : a / b;
        default: return b;
      }
    }
    function formatResult(n) {
      if (!isFinite(n)) return 'Error';
      // 12 significant digits hides floating-point noise (0.1 + 0.2 -> 0.3) without the
      // precision loss a fixed decimal scale has on large results (999999 x 999999).
      return String(parseFloat(n.toPrecision(12)));
    }
    function inputOperator(nextOp) {
      // Pressing an operator right after another (no digit typed yet) just swaps
      // the pending operator instead of duplicating it in the expression.
      if (state.op != null && state.waitingForOperand) {
        state.op = nextOp;
        state.expr = state.expr.slice(0, -3) + ' ' + opSymbol(nextOp) + ' ';
        render();
        return;
      }
      var inputValue = parseFloat(state.value);
      if (state.prev == null) {
        state.prev = inputValue;
      } else {
        var result = compute(state.prev, inputValue, state.op);
        state.value = formatResult(result);
        state.prev = parseFloat(state.value);
      }
      state.waitingForOperand = true;
      state.op = nextOp;
      state.expr += ' ' + opSymbol(nextOp) + ' ';
      render();
    }
    function equals() {
      if (state.op == null || state.prev == null) return;
      var inputValue = parseFloat(state.value);
      var result = compute(state.prev, inputValue, state.op);
      state.value = formatResult(result);
      state.expr = state.value;
      state.prev = null;
      state.op = null;
      state.waitingForOperand = true;
      render();
    }
    // With a pending operator (e.g. "200 +"), % treats the typed number as a
    // percentage OF the first operand — "200 + 10 %" becomes "200 + 20" (10% of
    // 200), matching how a physical calculator's % key behaves. With no pending
    // operator, % just divides the current number by 100.
    function inputPercent() {
      var inputValue = parseFloat(state.value);
      if (isNaN(inputValue)) return;
      var result = (state.op != null && state.prev != null) ? state.prev * (inputValue / 100) : inputValue / 100;
      state.value = formatResult(result);
      var trailingNumber = state.expr.match(/-?[\d.]+$/);
      state.expr = trailingNumber ? state.expr.slice(0, -trailingNumber[0].length) + state.value : state.value;
      state.waitingForOperand = true;
      render();
    }

    calcWindow.querySelectorAll('[data-digit]').forEach(function (b) { b.addEventListener('click', function () { inputDigit(b.getAttribute('data-digit')); }); });
    calcWindow.querySelector('[data-decimal]').addEventListener('click', inputDecimal);
    calcWindow.querySelector('[data-clear]').addEventListener('click', resetState);
    calcWindow.querySelector('[data-equals]').addEventListener('click', equals);
    calcWindow.querySelector('[data-percent]').addEventListener('click', inputPercent);
    calcWindow.querySelectorAll('[data-op]').forEach(function (b) { b.addEventListener('click', function () { inputOperator(b.getAttribute('data-op')); }); });

    function openCalc() { calcWindow.classList.add('open'); }
    function closeCalc() { calcWindow.classList.remove('open'); resetState(); }

    calcFab.addEventListener('click', function () {
      if (calcWindow.classList.contains('open')) closeCalc(); else openCalc();
    });
    calcWindow.querySelector('.calc-close').addEventListener('click', closeCalc);

    // Keyboard support while the calculator is open.
    document.addEventListener('keydown', function (e) {
      if (!calcWindow.classList.contains('open')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (/^[0-9]$/.test(e.key)) { inputDigit(e.key); e.preventDefault(); }
      else if (e.key === '.') { inputDecimal(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '-') { inputOperator(e.key); e.preventDefault(); }
      else if (e.key === '*') { inputOperator('*'); e.preventDefault(); }
      else if (e.key === '/') { inputOperator('/'); e.preventDefault(); }
      else if (e.key === '%') { inputPercent(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { equals(); e.preventDefault(); }
      else if (e.key === 'Backspace') { backspace(); e.preventDefault(); }
      else if (e.key === 'Escape') { closeCalc(); e.preventDefault(); }
      else if (e.key.toLowerCase() === 'c') { resetState(); e.preventDefault(); }
    });

    // Dragging via the title bar. Position switches from the default
    // fixed right/bottom anchor to an explicit left/top once dragged.
    var titlebar = calcWindow.querySelector('.calc-titlebar');
    var dragging = false, dragOffsetX = 0, dragOffsetY = 0;
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.calc-close')) return;
      dragging = true;
      var rect = calcWindow.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      calcWindow.style.right = 'auto';
      calcWindow.style.bottom = 'auto';
      calcWindow.style.left = rect.left + 'px';
      calcWindow.style.top = rect.top + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var x = Math.max(0, Math.min(window.innerWidth - calcWindow.offsetWidth, e.clientX - dragOffsetX));
      var y = Math.max(0, Math.min(window.innerHeight - calcWindow.offsetHeight, e.clientY - dragOffsetY));
      calcWindow.style.left = x + 'px';
      calcWindow.style.top = y + 'px';
    });
    document.addEventListener('mouseup', function () { dragging = false; });

    resetState();
  }

  // ---------------------------------------------------------------------
  // Default the proposal date field to today, if present and still empty —
  // stays fully editable afterward.
  // ---------------------------------------------------------------------
  var proposalDate = document.getElementById('proposalDate');
  if (proposalDate && !proposalDate.value) {
    var now = new Date();
    var iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    proposalDate.value = iso;
  }
})();
