/* AI Radar — каталог AI-сайтів на публічному API freeserp.ai (index=sites, category=ai).
   Без збірки й залежностей: один файл, маршрутизація через hash. */
(function () {
  'use strict';

  // ---------- Налаштування ----------
  // Пряма адреса API. Зараз браузери її блокують: сервер freeserp.ai віддає
  // заголовок Access-Control-Allow-Origin двічі («*, *»). Тому запити йдуть через
  // посередника (api/freeserp.js на Vercel), а пряма адреса лишається запасною —
  // спрацює сама, щойно помилку на боці API виправлять.
  var API_DIRECT = 'https://freeserp.ai/api.php';
  // Повна адреса посередника — для копій сайту поза Vercel (GitHub Pages, локальний запуск).
  var API_PROXY = '';
  var ENDPOINTS = (function () {
    var list = [];
    if (/\.vercel\.app$/.test(location.hostname)) list.push(new URL('api/freeserp', location.origin + '/').toString());
    if (API_PROXY) list.push(API_PROXY);
    list.push(API_DIRECT);
    return list.filter(function (v, i, a) { return a.indexOf(v) === i; });
  })();
  var endpointIdx = 0; // який із ENDPOINTS спрацював останнім
  var PAGE_SIZE = 24;
  var NEW_SIZE = 48;
  var MAX_WINDOW = 10000; // обмеження API: from + size <= 10000
  var MAX_COMPARE = 4;
  var STORE_KEY = 'airadar.compare.v1';

  var FALLBACK_CATS = [
    'AI Agents & Autonomous', 'Code & Dev Tools', 'AI Infrastructure & API', 'AI Automation & Workflows',
    'LLM & Prompt Tools', 'AI Search & Answers', 'AI Website Builder', 'No-code / App Builder',
    'Image Generation', 'Video Generation', 'Voice & Text-to-Speech', 'Data & Analytics',
    'Research & Science', 'Design & UI', 'Chatbot & Assistant', 'E-commerce', 'Directory / Aggregator',
    'Marketing & Ads', 'Sales & CRM', 'Lead Gen & Outreach', 'Finance & Trading', 'Healthcare & Medical',
    'Education & Tutoring', 'Other AI'
  ];
  var TLDS = ['ai', 'com', 'io', 'app', 'dev', 'co', 'org', 'net', 'tech', 'xyz'];
  var SORTS = {
    dr: { sort: 'dr', order: 'desc' },
    rel: { sort: 'relevance', order: 'desc' },
    'new': { sort: 'went_live', order: 'desc' },
    az: { sort: 'domain', order: 'asc' }
  };
  var SOURCE_LABELS = { not_ai: 'без ознак AI-конструктора', ai_likely: 'ймовірно зібрано за допомогою AI' };

  // Іконки лічильників (inline SVG, 24×24, колір успадковується)
  var SVG_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  var STAT_ICONS = {
    spark: SVG_OPEN + '<path d="M11 3.5 12.9 9a2 2 0 0 0 1.2 1.2l5.4 1.8-5.4 1.9a2 2 0 0 0-1.2 1.2L11 20.5l-1.9-5.4a2 2 0 0 0-1.2-1.2L2.5 12l5.4-1.8A2 2 0 0 0 9.1 9z"/><path d="M19 3v4M17 5h4"/></svg>',
    layers: SVG_OPEN + '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
    trend: SVG_OPEN + '<path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/></svg>',
    globe: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>'
  };

  // ---------- Дрібні утиліти ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nf = new Intl.NumberFormat('uk-UA');
  var df = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
  var dfLong = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(s, long) {
    var d = parseDate(s);
    return d ? (long ? dfLong : df).format(d).replace(/\s*р\.$/, '') : '—';
  }
  function isoDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' Б';
    if (n < 1048576) return (n / 1024).toFixed(1).replace('.', ',') + ' КБ';
    return (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }
  function safeUrl(site) {
    var u = site.url || ('https://' + site.domain);
    return /^https?:\/\//i.test(u) ? u : 'https://' + site.domain;
  }
  function hue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }
  function siteName(site) {
    var t = (site.title || '').trim();
    return t || site.domain;
  }
  function drClass(dr) {
    if (dr == null) return 'dr--na';
    return dr >= 60 ? 'dr--high' : dr >= 30 ? 'dr--mid' : 'dr--low';
  }
  function cleanDomain(s) {
    return String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '');
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------- API ----------
  var cache = new Map();

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', function () { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); });
    });
  }

  /** GET до API з кешем у памʼяті та повторами при 502/мережевих збоях. */
  async function api(params, signal) {
    var qs = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === '' || v == null || v === false) return;
      qs.append(k, v === true ? '1' : v);
    });
    var key = qs.toString();
    if (cache.has(key)) return cache.get(key);

    var lastErr;
    // Перебираємо адреси, починаючи з тієї, що спрацювала минулого разу.
    for (var n = 0; n < ENDPOINTS.length; n++) {
      var idx = (endpointIdx + n) % ENDPOINTS.length;
      var url = ENDPOINTS[idx] + '?' + key;
      for (var attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(500 * Math.pow(2, attempt), signal);
        try {
          var res = await fetch(url, { signal: signal });
          if (res.status === 502 || res.status === 503 || res.status === 429) { lastErr = new Error('Сервіс тимчасово недоступний (' + res.status + ')'); continue; }
          var data = await res.json();
          if (!res.ok || data.ok === false) throw new Error(data.detail || data.error || ('Помилка ' + res.status));
          endpointIdx = idx;
          cache.set(key, data);
          return data;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          lastErr = e instanceof TypeError
            ? new Error('Браузер не зміг отримати дані з API (мережа або блокування CORS)')
            : e;
          break; // мережа/CORS або помилка у відповіді — пробуємо наступну адресу
        }
      }
    }
    throw lastErr || new Error('Невідома помилка');
  }

  function baseParams(strict) {
    var p = { index: 'sites', category: 'ai' };
    if (strict) p.ai_startups = 1;
    return p;
  }

  // ---------- Порівняння (localStorage) ----------
  var compare = [];
  try { compare = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; } catch (e) { compare = []; }
  if (!Array.isArray(compare)) compare = [];

  function saveCompare() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(compare)); } catch (e) { /* приватний режим — працюємо в памʼяті */ }
    var c = $('cmpCount');
    c.textContent = compare.length;
    c.hidden = !compare.length;
    $('burgerDot').hidden = !compare.length;
  }
  function inCompare(domain) { return compare.some(function (s) { return s.domain === domain; }); }
  function addCompare(site) {
    if (inCompare(site.domain)) return true;
    if (compare.length >= MAX_COMPARE) { toast('У порівнянні вже ' + MAX_COMPARE + ' сайти — приберіть один'); return false; }
    compare.push(site);
    saveCompare();
    return true;
  }
  function removeCompare(domain) {
    compare = compare.filter(function (s) { return s.domain !== domain; });
    saveCompare();
  }
  function toggleCompare(site) {
    if (inCompare(site.domain)) { removeCompare(site.domain); toast('Прибрано з порівняння'); }
    else if (addCompare(site)) toast('Додано до порівняння');
    syncCompareButtons();
  }
  function syncCompareButtons() {
    document.querySelectorAll('[data-cmp]').forEach(function (b) {
      var on = inCompare(b.getAttribute('data-cmp'));
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? '✓ У порівнянні' : 'Порівняти';
    });
  }

  // ---------- Маршрутизація ----------
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var i = h.indexOf('?');
    var view = (i === -1 ? h : h.slice(0, i)) || 'catalog';
    var q = new URLSearchParams(i === -1 ? '' : h.slice(i + 1));
    if (['catalog', 'new', 'compare', 'about'].indexOf(view) === -1) view = 'catalog';
    return { view: view, q: q };
  }
  function buildHash(view, obj) {
    var q = new URLSearchParams();
    Object.keys(obj).forEach(function (k) { if (obj[k] !== '' && obj[k] != null) q.set(k, obj[k]); });
    var s = q.toString();
    return '#/' + view + (s ? '?' + s : '');
  }
  function navigate(view, obj, replace) {
    var h = buildHash(view, obj);
    if (h === location.hash) { route(); return; }
    if (replace) { history.replaceState(null, '', h); route(); }
    else location.hash = h;
  }

  var known = new Map(); // domain -> site, щоб відкривати картку без повторного запиту
  function remember(list) { list.forEach(function (s) { known.set(s.domain, s); }); }

  // ---------- Картка сайту ----------
  function cardHtml(site) {
    var name = siteName(site);
    var cats = (site.ai_categories || []).slice(0, 3).map(function (c) {
      return '<li><a href="' + esc(buildHash('catalog', { cat: c })) + '">' + esc(c) + '</a></li>';
    }).join('');
    return '<article class="card">' +
      '<header class="card__head">' +
        '<div class="ava" style="--h:' + hue(site.domain) + '" aria-hidden="true">' + esc(site.domain.charAt(0).toUpperCase()) + '</div>' +
        '<div class="card__id"><h3><button type="button" class="link" data-open="' + esc(site.domain) + '">' + esc(name) + '</button></h3>' +
        '<a class="card__domain" href="' + esc(safeUrl(site)) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(site.domain) + ' ↗</a></div>' +
        '<span class="dr ' + drClass(site.dr) + '" title="Domain Rating, 0–100">DR ' + (site.dr == null ? '—' : esc(site.dr)) + '</span>' +
      '</header>' +
      '<p class="card__sum">' + esc(site.ai_summary || 'Опису поки немає.') + '</p>' +
      (cats ? '<ul class="tags">' + cats + '</ul>' : '') +
      '<footer class="card__foot"><span class="muted" title="Дата, коли сайт уперше підтверджено живим">додано ' + esc(fmtDate(site.went_live)) + '</span>' +
        '<button type="button" class="btn btn--small" data-cmp="' + esc(site.domain) + '" aria-pressed="' + inCompare(site.domain) + '">' +
        (inCompare(site.domain) ? '✓ У порівнянні' : 'Порівняти') + '</button></footer>' +
    '</article>';
  }
  function skeletons(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div class="card card--skel" aria-hidden="true"><div></div><div></div><div></div></div>';
    return s;
  }
  function errorHtml(err, retryId) {
    return '<div class="empty"><h3>Не вдалося завантажити дані</h3><p>' + esc(err && err.message || err) +
      '</p><button type="button" class="btn" id="' + retryId + '">Спробувати ще раз</button></div>';
  }

  // ---------- Каталог ----------
  var catCounts = null; // [{key,count}] зі stats
  var catalogCtl = null;

  function readCatalogState(q) {
    var query = (q.get('q') || '').trim();
    var sort = q.get('sort');
    if (!SORTS[sort]) sort = query ? 'rel' : 'dr';
    var days = q.get('days');
    if (['7', '30', '90', '365'].indexOf(days) === -1) days = '';
    return {
      q: query,
      cat: q.get('cat') || '',
      dr: Math.max(0, Math.min(90, parseInt(q.get('dr'), 10) || 0)),
      days: days,
      tld: (q.get('tld') || '').replace(/[^a-z0-9-]/gi, '').toLowerCase(),
      strict: q.get('strict') !== '0',
      sort: sort,
      sortExplicit: !!q.get('sort'),
      page: Math.max(1, parseInt(q.get('p'), 10) || 1)
    };
  }
  function catalogHashObj(st) {
    return {
      q: st.q, cat: st.cat, dr: st.dr || '', days: st.days, tld: st.tld,
      strict: st.strict ? '' : '0',
      sort: st.sortExplicit ? st.sort : '',
      p: st.page > 1 ? st.page : ''
    };
  }
  function updateCatalog(patch, replace) {
    var st = readCatalogState(parseHash().q);
    Object.assign(st, patch);
    if (!('page' in patch)) st.page = 1;
    navigate('catalog', catalogHashObj(st), replace);
  }

  function renderCats(st) {
    var list = catCounts || FALLBACK_CATS.map(function (k) { return { key: k }; });
    var html = '<li><button type="button" data-cat="" aria-pressed="' + (!st.cat) + '">Усі ніші</button></li>';
    var seen = false;
    list.forEach(function (c) {
      if (c.key === st.cat) seen = true;
      html += '<li><button type="button" data-cat="' + esc(c.key) + '" aria-pressed="' + (c.key === st.cat) + '">' +
        '<span>' + esc(c.key) + '</span>' + (c.count != null ? '<small>' + nf.format(c.count) + '</small>' : '') + '</button></li>';
    });
    if (st.cat && !seen) html += '<li><button type="button" data-cat="' + esc(st.cat) + '" aria-pressed="true"><span>' + esc(st.cat) + '</span></button></li>';
    $('cats').innerHTML = html;
  }

  function syncCatalogControls(st) {
    if (document.activeElement !== $('fq')) $('fq').value = st.q;
    $('fSort').value = st.sort;
    $('fDr').value = st.dr;
    $('fDrOut').textContent = st.dr;
    $('fDays').value = st.days;
    var tldSel = $('fTld');
    if (st.tld && !Array.prototype.some.call(tldSel.options, function (o) { return o.value === st.tld; })) {
      tldSel.add(new Option('.' + st.tld, st.tld));
    }
    tldSel.value = st.tld;
    $('fStrict').checked = st.strict;
    renderCats(st);
    var n = (st.cat ? 1 : 0) + (st.dr ? 1 : 0) + (st.days ? 1 : 0) + (st.tld ? 1 : 0) + (st.strict ? 0 : 1);
    document.querySelectorAll('.js-fcount').forEach(function (b) { b.textContent = n; b.hidden = !n; });
  }

  async function renderCatalog(q) {
    var st = readCatalogState(q);
    syncCatalogControls(st);

    if (catalogCtl) catalogCtl.abort();
    catalogCtl = new AbortController();
    var grid = $('grid'), info = $('resultInfo'), pager = $('pager');
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = skeletons(9);
    pager.innerHTML = '';
    info.textContent = 'Завантаження…';

    var p = baseParams(st.strict);
    p.q = st.q;
    p.ai_categories = st.cat;
    p.dr_min = st.dr || '';
    p.tld = st.tld;
    if (st.days) p.from_date = isoDaysAgo(+st.days);
    p.sort = SORTS[st.sort].sort;
    p.order = SORTS[st.sort].order;
    p.size = PAGE_SIZE;
    p.from = (st.page - 1) * PAGE_SIZE;
    if (p.from + p.size > MAX_WINDOW) p.from = MAX_WINDOW - PAGE_SIZE;

    try {
      var data = await api(p, catalogCtl.signal);
      var items = data.results || [];
      remember(items);
      grid.removeAttribute('aria-busy');
      if (!items.length) {
        info.textContent = 'Нічого не знайдено';
        $('filtersApply').textContent = 'Нічого не знайдено';
        grid.innerHTML = '<div class="empty"><h3>За цими умовами сайтів немає</h3><p>Спробуйте простіший запит англійською, зменште мінімальний DR або зніміть частину фільтрів.</p>' +
          '<button type="button" class="btn" id="emptyReset">Скинути фільтри</button></div>';
        $('emptyReset').onclick = function () { navigate('catalog', {}); };
        return;
      }
      var total = data.total || items.length;
      var first = p.from + 1, last = p.from + items.length;
      info.innerHTML = '<strong>' + nf.format(total) + '</strong> ' + plural(total, 'сайт', 'сайти', 'сайтів') +
        (st.q ? ' за запитом «' + esc(st.q) + '»' : '') + ' · показано ' + nf.format(first) + '–' + nf.format(last);
      grid.innerHTML = items.map(cardHtml).join('');
      renderPager(st.page, Math.ceil(Math.min(total, MAX_WINDOW) / PAGE_SIZE));
      $('filtersApply').textContent = 'Показати ' + nf.format(total) + ' ' + plural(total, 'сайт', 'сайти', 'сайтів');
    } catch (e) {
      if (e.name === 'AbortError') return;
      grid.removeAttribute('aria-busy');
      info.textContent = '';
      grid.innerHTML = errorHtml(e, 'catRetry');
      $('catRetry').onclick = function () { renderCatalog(parseHash().q); };
    }
  }

  function renderPager(page, pages) {
    var el = $('pager');
    if (pages <= 1) { el.innerHTML = ''; return; }
    var nums = [1];
    for (var i = page - 2; i <= page + 2; i++) if (i > 1 && i < pages) nums.push(i);
    nums.push(pages);
    var html = '<button type="button" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Попередня сторінка">←<span class="hide-m">&nbsp;Назад</span></button>';
    var prev = 0;
    nums.forEach(function (n) {
      if (n - prev > 1) html += '<span aria-hidden="true">…</span>';
      html += '<button type="button" data-page="' + n + '"' + (n === page ? ' aria-current="page"' : '') + '>' + nf.format(n) + '</button>';
      prev = n;
    });
    html += '<button type="button" data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Наступна сторінка"><span class="hide-m">Далі&nbsp;</span>→</button>';
    el.innerHTML = html;
  }

  async function loadStats() {
    try {
      var s = await api({ stats: 1 });
      var aiAll = (s.by_category || []).filter(function (c) { return c.key === 'ai'; })[0];
      var rows = [];
      if (s.ai_startups && s.ai_startups.total != null) rows.push([s.ai_startups.total, 'AI-продуктів у каталозі', 'spark']);
      if (aiAll) rows.push([aiAll.count, 'сайтів у ніші AI', 'layers']);
      if (s.new && s.new.last_7d != null) rows.push([s.new.last_7d, 'нових сайтів в індексі за 7 днів', 'trend']);
      if (s.totals && s.totals.real_sites != null) rows.push([s.totals.real_sites, 'живих сайтів в індексі загалом', 'globe']);
      $('stats').innerHTML = rows.map(function (r) {
        return '<div class="stat stat--' + r[2] + '"><span class="stat__ico" aria-hidden="true">' + STAT_ICONS[r[2]] + '</span>' +
          '<dt>' + esc(r[1]) + '</dt><dd>' + nf.format(r[0]) + '</dd></div>';
      }).join('');
      if (Array.isArray(s.top_ai_categories) && s.top_ai_categories.length) {
        catCounts = s.top_ai_categories.filter(function (c) { return c && c.key; });
        if (parseHash().view === 'catalog') renderCats(readCatalogState(parseHash().q));
      }
    } catch (e) { /* статистика необовʼязкова: каталог працює і без неї */ }
  }

  // ---------- Новинки ----------
  var newCtl = null, newState = { days: '', from: 0, items: [], total: 0 };

  async function renderNew(q, append) {
    var days = q.get('days');
    if (['7', '30', '90'].indexOf(days) === -1) days = '';
    document.querySelectorAll('#newPeriod button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-days') === days);
    });
    if (!append) newState = { days: days, from: 0, items: [], total: 0 };

    if (newCtl) newCtl.abort();
    newCtl = new AbortController();
    var list = $('newList'), info = $('newInfo'), more = $('newMore');
    more.hidden = true;
    if (!append) { list.innerHTML = '<div class="grid">' + skeletons(6) + '</div>'; info.textContent = 'Завантаження…'; }
    else { more.hidden = false; more.disabled = true; more.textContent = 'Завантаження…'; }

    var p = baseParams(true);
    if (days) p.from_date = isoDaysAgo(+days);
    p.sort = 'went_live'; p.order = 'desc';
    p.size = NEW_SIZE; p.from = newState.from;

    try {
      var data = await api(p, newCtl.signal);
      var items = data.results || [];
      remember(items);
      newState.items = newState.items.concat(items);
      newState.total = data.total || newState.items.length;
      newState.from += items.length;

      if (!newState.items.length) {
        info.textContent = '';
        list.innerHTML = '<div class="empty"><h3>За цей період нових AI-сайтів немає</h3><p>Індекс поповнюється хвилями. Оберіть довший період або «Останні додані».</p></div>';
        return;
      }
      info.textContent = (days ? 'За ' + days + ' ' + plural(+days, 'день', 'дні', 'днів') + ': ' : 'Усього в каталозі: ') +
        nf.format(newState.total) + ' ' + plural(newState.total, 'сайт', 'сайти', 'сайтів') + '. Показано ' + nf.format(newState.items.length) + '.';

      var groups = [], idx = {};
      newState.items.forEach(function (s) {
        var k = (s.went_live || '').slice(0, 10) || 'невідомо';
        if (!(k in idx)) { idx[k] = groups.length; groups.push({ day: k, items: [] }); }
        groups[idx[k]].items.push(s);
      });
      list.innerHTML = groups.map(function (g) {
        return '<section class="day"><h2>' + esc(g.day === 'невідомо' ? 'Дата невідома' : fmtDate(g.day, true)) +
          ' <small>' + g.items.length + '</small></h2><div class="grid">' + g.items.map(cardHtml).join('') + '</div></section>';
      }).join('');

      var canMore = items.length === NEW_SIZE && newState.from < Math.min(newState.total, MAX_WINDOW - NEW_SIZE);
      more.hidden = !canMore; more.disabled = false; more.textContent = 'Показати ще';
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (append) { more.disabled = false; more.textContent = 'Показати ще'; toast('Не вдалося завантажити: ' + e.message); return; }
      info.textContent = '';
      list.innerHTML = errorHtml(e, 'newRetry');
      $('newRetry').onclick = function () { renderNew(parseHash().q); };
    }
  }

  // ---------- Порівняння ----------
  async function lookupDomain(domain) {
    if (known.has(domain)) return known.get(domain);
    var data = await api({ index: 'sites', q: domain, all: 1, size: 5 });
    var hit = (data.results || []).filter(function (r) { return r.domain === domain; })[0];
    if (hit) known.set(domain, hit);
    return hit || null;
  }

  async function renderCompare(q) {
    var shared = (q.get('d') || '').split(',').map(cleanDomain).filter(Boolean).slice(0, MAX_COMPARE);
    if (shared.length) {
      // Посилання, яким поділилися: підтягуємо сайти й замінюємо поточний список.
      $('cmpBody').innerHTML = '<p class="muted">Завантаження сайтів із посилання…</p>';
      var found = await Promise.all(shared.map(function (d) { return lookupDomain(d).catch(function () { return null; }); }));
      var ok = found.filter(Boolean);
      if (ok.length) { compare = ok; saveCompare(); }
      if (ok.length < shared.length) toast('Не всі домени з посилання знайдено в індексі');
      history.replaceState(null, '', '#/compare');
    }
    drawCompare();
  }

  function drawCompare() {
    var body = $('cmpBody');
    if (!compare.length) {
      body.innerHTML = '<div class="empty"><h3>Список порівняння порожній</h3><p>Додайте сайти з каталогу або введіть домен вище.</p>' +
        '<a class="btn btn--primary" href="#/catalog">Перейти до каталогу</a></div>';
      return;
    }
    var maxDr = Math.max.apply(null, compare.map(function (s) { return s.dr == null ? -1 : s.dr; }));
    function row(label, fn, cls) {
      return '<tr><th scope="row">' + label + '</th>' + compare.map(function (s) {
        return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + fn(s) + '</td>';
      }).join('') + '</tr>';
    }
    var head = '<tr><td></td>' + compare.map(function (s) {
      return '<th scope="col"><div class="cmp__head"><div class="ava" style="--h:' + hue(s.domain) + '" aria-hidden="true">' + esc(s.domain.charAt(0).toUpperCase()) + '</div>' +
        '<div><a href="' + esc(safeUrl(s)) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.domain) + ' ↗</a>' +
        '<button type="button" class="link link--muted" data-rm="' + esc(s.domain) + '">Прибрати</button></div></div></th>';
    }).join('') + '</tr>';

    body.innerHTML =
      '<div class="cmp__actions"><button type="button" class="btn" id="cmpShare">Скопіювати посилання на порівняння</button>' +
      '<button type="button" class="btn btn--ghost" id="cmpClear">Очистити</button></div>' +
      '<div class="tablewrap"><table class="cmp"><thead>' + head + '</thead><tbody>' +
      row('Назва', function (s) { return esc(siteName(s)); }) +
      row('DR', function (s) {
        return '<span class="dr ' + drClass(s.dr) + '">' + (s.dr == null ? '—' : esc(s.dr)) + '</span>' +
          (compare.length > 1 && s.dr != null && s.dr === maxDr ? ' <span class="best">найвищий</span>' : '');
      }) +
      row('Ніші', function (s) {
        return (s.ai_categories || []).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join(' ') || '—';
      }) +
      row('Опис', function (s) { return esc(s.ai_summary || '—'); }, 'cmp__sum') +
      row('В індексі з', function (s) { return esc(fmtDate(s.went_live)); }) +
      row('Домен помічено', function (s) { return esc(fmtDate(s.first_seen)); }) +
      row('Доменна зона', function (s) { return s.tld ? '.' + esc(s.tld) : '—'; }) +
      row('Технологія', function (s) { return esc(SOURCE_LABELS[s.ai_source] || s.ai_source || '—'); }) +
      row('Вебсервер', function (s) { return esc(s.webserver || '—'); }) +
      row('Обсяг тексту', function (s) { return esc(fmtBytes(s.content_length)); }) +
      row('HTTP-статус', function (s) { return esc(s.http_status == null ? '—' : s.http_status); }) +
      '</tbody></table></div>';

    $('cmpShare').onclick = function () {
      var link = location.href.split('#')[0] + '#/compare?d=' + compare.map(function (s) { return encodeURIComponent(s.domain); }).join(',');
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(
        function () { toast('Посилання скопійовано'); },
        function () { window.prompt('Скопіюйте посилання:', link); }
      );
    };
    $('cmpClear').onclick = function () { compare = []; saveCompare(); drawCompare(); };
  }

  // ---------- Детальна картка ----------
  function openDetail(domain) {
    var s = known.get(domain) || compare.filter(function (c) { return c.domain === domain; })[0];
    if (!s) return;
    var dlg = $('detail');
    function row(k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
    dlg.innerHTML =
      '<form method="dialog"><button class="dialog__close" aria-label="Закрити">×</button></form>' +
      '<div class="dialog__head"><div class="ava ava--lg" style="--h:' + hue(s.domain) + '" aria-hidden="true">' + esc(s.domain.charAt(0).toUpperCase()) + '</div>' +
      '<div><h2 id="detailTitle">' + esc(siteName(s)) + '</h2><p class="muted">' + esc(s.domain) + '</p></div></div>' +
      '<p>' + esc(s.ai_summary || 'Опису поки немає.') + '</p>' +
      ((s.ai_categories || []).length ? '<ul class="tags">' + s.ai_categories.map(function (c) {
        return '<li><a href="' + esc(buildHash('catalog', { cat: c })) + '" data-close>' + esc(c) + '</a></li>';
      }).join('') + '</ul>' : '') +
      '<dl class="facts">' +
        row('DR', '<span class="dr ' + drClass(s.dr) + '">' + (s.dr == null ? '—' : esc(s.dr)) + '</span>') +
        row('В індексі з', esc(fmtDate(s.went_live))) +
        row('Домен помічено', esc(fmtDate(s.first_seen))) +
        row('Остання перевірка', esc(fmtDate(s.fetched_at))) +
        row('Технологія', esc(SOURCE_LABELS[s.ai_source] || s.ai_source || '—')) +
        row('Вебсервер', esc(s.webserver || '—')) +
        row('HTTP-статус', esc(s.http_status == null ? '—' : s.http_status)) +
        row('Обсяг тексту', esc(fmtBytes(s.content_length))) +
      '</dl>' +
      '<div class="dialog__actions"><a class="btn btn--primary" href="' + esc(safeUrl(s)) + '" target="_blank" rel="noopener noreferrer nofollow">Відкрити сайт ↗</a>' +
      '<button type="button" class="btn" data-cmp="' + esc(s.domain) + '" aria-pressed="' + inCompare(s.domain) + '">' + (inCompare(s.domain) ? '✓ У порівнянні' : 'Порівняти') + '</button></div>';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // ---------- Роутер ----------
  // ---------- Мобільне меню та шторка фільтрів ----------
  var mqSheet = window.matchMedia('(max-width: 900px)');
  function setNav(open) {
    document.querySelector('.top').classList.toggle('nav-open', open);
    $('navToggle').setAttribute('aria-expanded', open);
  }
  function setSheet(open) {
    var box = $('filtersBox');
    if (open) box.open = true;
    box.classList.toggle('is-open', open);
    $('backdrop').hidden = !open;
    document.body.classList.toggle('no-scroll', open);
    if (open) $('filtersClose').focus(); else if (mqSheet.matches && document.activeElement !== document.body) $('filtersOpen').focus();
  }
  function sheetIsOpen() { return $('filtersBox').classList.contains('is-open'); }

  function route() {
    var r = parseHash();
    setNav(false);
    if (r.view !== 'catalog' && sheetIsOpen()) setSheet(false);
    ['catalog', 'new', 'compare', 'about'].forEach(function (v) { $('view-' + v).hidden = v !== r.view; });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === r.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var titles = { catalog: 'Каталог', 'new': 'Новинки', compare: 'Порівняння', about: 'Про проєкт' };
    document.title = r.view === 'catalog' ? 'AI Radar — каталог і пошук AI-сайтів' : titles[r.view] + ' — AI Radar';
    // свій опис для кожного розділу (для пошуковиків, що виконують JavaScript)
    var descs = {
      catalog: 'Каталог AI-сервісів на живих даних FreeSerp: пошук за описом, фільтри за нішею, авторитетом домену й датою, новинки та порівняння сайтів поруч.',
      'new': 'Нові AI-сайти в індексі FreeSerp: стрічка за датою появи, за останні 7, 30 і 90 днів.',
      compare: 'Порівняння AI-сайтів поруч: авторитет домену, ніші, опис, дати, технологія — до чотирьох сайтів у таблиці.',
      about: 'Про AI Radar: мета, аудиторія, сторінки, структура сайту та обмеження даних FreeSerp.'
    };
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', descs[r.view]);
    if (r.view === 'catalog') renderCatalog(r.q);
    else if (r.view === 'new') renderNew(r.q);
    else if (r.view === 'compare') renderCompare(r.q);
  }

  // ---------- Події ----------
  function init() {
    TLDS.forEach(function (t) { $('fTld').add(new Option('.' + t, t)); });
    saveCompare();

    var deb;
    // Пошук живе в панелі фільтрів: шукаємо під час набору (із затримкою) і одразу по Enter
    $('fq').addEventListener('input', function () {
      clearTimeout(deb);
      var v = this.value;
      deb = setTimeout(function () { updateCatalog({ q: v.trim() }, true); }, 400);
    });
    $('searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(deb);
      updateCatalog({ q: $('fq').value.trim() });
    });
    $('fSort').addEventListener('change', function () { updateCatalog({ sort: this.value, sortExplicit: true }); });
    $('fDr').addEventListener('input', function () { $('fDrOut').textContent = this.value; });
    $('fDr').addEventListener('change', function () { updateCatalog({ dr: +this.value }); });
    $('fDays').addEventListener('change', function () { updateCatalog({ days: this.value }); });
    $('fTld').addEventListener('change', function () { updateCatalog({ tld: this.value }); });
    $('fStrict').addEventListener('change', function () { updateCatalog({ strict: this.checked }); });
    $('resetBtn').addEventListener('click', function () { $('fq').value = ''; navigate('catalog', {}); });

    $('cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (b) updateCatalog({ cat: b.getAttribute('data-cat') });
    });
    $('pager').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      updateCatalog({ page: +b.getAttribute('data-page') });
      $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('newPeriod').addEventListener('click', function (e) {
      var b = e.target.closest('[data-days]');
      if (b) navigate('new', { days: b.getAttribute('data-days') });
    });
    $('newMore').addEventListener('click', function () { renderNew(parseHash().q, true); });

    $('cmpForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var d = cleanDomain($('cmpDomain').value), msg = $('cmpMsg');
      if (!d || d.indexOf('.') === -1) { msg.textContent = 'Введіть домен, наприклад example.ai'; return; }
      if (inCompare(d)) { msg.textContent = 'Цей сайт уже в порівнянні.'; return; }
      msg.textContent = 'Шукаємо ' + d + '…';
      try {
        var site = await lookupDomain(d);
        if (!site) { msg.textContent = 'Домен ' + d + ' не знайдено в індексі FreeSerp.'; return; }
        if (addCompare(site)) { msg.textContent = ''; $('cmpDomain').value = ''; drawCompare(); }
        else msg.textContent = 'Список заповнений: максимум ' + MAX_COMPARE + ' сайти.';
      } catch (err) { msg.textContent = 'Помилка: ' + err.message; }
    });

    // Делегування: кнопки на картках, у діалозі та в таблиці порівняння
    document.addEventListener('click', function (e) {
      var t = e.target;
      var cmp = t.closest('[data-cmp]');
      if (cmp) {
        var d = cmp.getAttribute('data-cmp');
        var site = known.get(d) || compare.filter(function (c) { return c.domain === d; })[0];
        if (site) toggleCompare(site);
        if (parseHash().view === 'compare') drawCompare();
        return;
      }
      var open = t.closest('[data-open]');
      if (open) { openDetail(open.getAttribute('data-open')); return; }
      var rm = t.closest('[data-rm]');
      if (rm) { removeCompare(rm.getAttribute('data-rm')); drawCompare(); return; }
      if (t.closest('[data-close]')) $('detail').close();
    });
    $('detail').addEventListener('click', function (e) { if (e.target === this) this.close(); });

    $('navToggle').addEventListener('click', function (e) {
      e.stopPropagation();
      setNav(!document.querySelector('.top').classList.contains('nav-open'));
    });
    $('siteNav').addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.top')) setNav(false); });
    $('filtersOpen').addEventListener('click', function () { setSheet(true); });
    $('filtersClose').addEventListener('click', function () { setSheet(false); });
    $('filtersApply').addEventListener('click', function () {
      setSheet(false);
      document.querySelector('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('backdrop').addEventListener('click', function () { setSheet(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (sheetIsOpen()) setSheet(false);
      setNav(false);
    });
    // на мобільному фільтри завжди «розгорнуті» всередині шторки; на десктопі шторка не потрібна
    $('filtersBox').addEventListener('toggle', function () { if (mqSheet.matches && !this.open) this.open = true; });
    (mqSheet.addEventListener ? mqSheet.addEventListener.bind(mqSheet, 'change') : mqSheet.addListener.bind(mqSheet))(function () {
      if (!mqSheet.matches && sheetIsOpen()) setSheet(false);
      if (mqSheet.matches) $('filtersBox').open = true;
    });

    window.addEventListener('hashchange', route);
    route();
    loadStats();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
