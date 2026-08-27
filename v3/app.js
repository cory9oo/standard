/* ============================================================
   STANDARD — the instrument.

   One sealed closure. Nothing reaches global scope except the small
   ST namespace, because two files declaring the same global word once
   killed this entire application silently.
   ============================================================ */
(function () {
  'use strict';

  var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
  var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table sits behind RLS */

  var sb = (window.__MOCK_SB) || window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.ST = { sb: sb };

  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var GORDER = ['Morning', 'Afternoon', 'Night', 'Standards', 'Weekly'];
  var GRADE = [[100, 'A+', 5], [90, 'A', 4], [80, 'B', 3], [70, 'C', 2], [60, 'D', 1], [0, 'F', 0]];

  var S = {
    me: null, priv0: null, habits: [], days: [], byDate: {},
    date: null, priv: null, edit: false, view: 'Today',
    calYM: null, removed: []
  };

  /* ================= helpers ================= */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dk(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dnum(k) { return new Date(k + 'T12:00:00'); }
  function today() { return dk(new Date()); }
  function shift(k, n) { var d = dnum(k); d.setDate(d.getDate() + n); return dk(d); }
  function fmt(m) {
    m = Math.max(0, Math.round(m || 0));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }
  function grade(p) { if (p == null) return ['—', null]; for (var i = 0; i < GRADE.length; i++) if (p >= GRADE[i][0]) return [GRADE[i][1], GRADE[i][2]]; return ['F', 0]; }
  function gcol(p) { var g = grade(p); return g[1] == null ? 'var(--line2)' : 'var(--g' + g[1] + ')'; }
  /* The clock lives in the name. Show the standard, not the schedule. */
  function label(n) {
    return String(n || '').replace(/^\s*\d{1,2}:\d{2}\s*(?:[-–]\s*\d{1,2}:\d{2})?\s*(?:am|pm)?\s*/i, '')
      .replace(/\s+/g, ' ').trim() || n;
  }
  function startMin(n) {
    var m = String(n || '').match(/^\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = +m[1]; if (h < 5) h += 12;               /* 4:00 in this list means afternoon */
    return h * 60 + (+m[2]);
  }
  function toast(t) {
    var b = el('toast'); b.textContent = t; b.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { b.classList.remove('on'); }, 1400);
  }
  function skin(s) {
    if (s) { document.documentElement.setAttribute('data-skin', s); try { localStorage.setItem('st_skin', s); } catch (e) {} }
    try { return localStorage.getItem('st_skin') || 'obsidian'; } catch (e) { return 'obsidian'; }
  }

  /* ================= model ================= */
  function daily()   { return S.habits.filter(function (h) { return h.cadence !== 'weekly'; }); }
  function floorSet(){ return daily().filter(function (h) { return h.tier === 'floor'; }); }
  function ckOf(k)   { var r = S.byDate[k]; return (r && r.checked) || {}; }
  function pctOf(ck, ids) {
    if (!ids.length) return 0;
    var n = 0; ids.forEach(function (i) { if (ck && ck[i]) n++; });
    return Math.round(n / ids.length * 100);
  }
  /* A weekly standard is satisfied if it was checked any day Mon-Sun of that week. */
  function weekDone(hid, k) {
    var d = dnum(k), mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    for (var i = 0; i < 7; i++) {
      var c = new Date(mon); c.setDate(mon.getDate() + i);
      if (c > d) break;
      if (ckOf(dk(c))[hid]) return true;
    }
    return false;
  }
  /* SCOPED lives under a reserved key in the day's own check map, so it needed
     no migration. Every reader counts habit ids, never keys, so it is invisible
     to scoring. */
  function scopeOf(k) { var c = ckOf(k); return c.__scope || null; }

  function stateOf(r) {
    if (!r) return 'none';
    if (r.checked && r.checked.__scope) return 'scoped';
    if (r.pct >= 90) return 'clean';
    if (r.date === today()) return 'open';     /* a running day is never a breach */
    if (r.floor_pct != null && r.floor_pct < 100) return 'breach';
    return 'held';
  }
  function rolling(n, upto) {
    var end = upto || today();
    var xs = S.days.filter(function (r) { return r.pct != null && r.date < end; }).slice(-n);
    if (!xs.length) return null;
    return Math.round(xs.reduce(function (a, r) { return a + r.pct; }, 0) / xs.length);
  }

  /* ================= data ================= */
  async function load() {
    var ses = await sb.auth.getSession();
    if (!ses.data.session) return false;
    var uid = ses.data.session.user.id;

    var p = await sb.from('profiles').select('id,display_name,handle').eq('id', uid).maybeSingle();
    S.me = p.data || { id: uid, display_name: '' };
    var pp = await sb.from('profile_private').select('birth_date').eq('id', uid).maybeSingle();
    S.priv0 = pp.data || {};

    var h = await sb.from('habits').select('id,name,group_name,cadence,tier,minutes,link,sort_order')
      .eq('user_id', uid).eq('active', true).order('sort_order');
    if (h.error) throw h.error;
    S.habits = (h.data || []).map(function (x) {
      return { id: x.id, name: x.name, group: x.group_name || 'Standards', cadence: x.cadence,
               tier: x.tier === 'floor' ? 'floor' : 'standard', minutes: x.minutes || 0, link: x.link || '' };
    });

    var d = await sb.from('days').select('date,checked,active_set,pct,floor_pct').eq('user_id', uid).order('date');
    if (d.error) throw d.error;
    S.days = d.data || [];
    S.byDate = {}; S.days.forEach(function (r) { S.byDate[r.date] = r; });

    S.date = today();
    S.calYM = [new Date().getFullYear(), new Date().getMonth()];
    await loadPriv();
    return true;
  }
  async function loadPriv() {
    var r = await sb.from('day_private').select('rating,why,tasks,prayer')
      .eq('user_id', S.me.id).eq('date', S.date).maybeSingle();
    S.priv = r.data || { rating: null, why: '', tasks: '', prayer: '' };
  }
  function row(k) {
    if (!S.byDate[k]) {
      S.byDate[k] = { date: k, checked: {}, pct: 0, floor_pct: null };
      S.days.push(S.byDate[k]);
      S.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    }
    return S.byDate[k];
  }

  var sT; function queueSave() { clearTimeout(sT); sT = setTimeout(saveDay, 420); }
  async function saveDay() {
    var r = row(S.date);
    var ids = daily().map(function (h) { return h.id; });
    var fids = floorSet().map(function (h) { return h.id; });
    r.pct = pctOf(r.checked, ids);
    r.floor_pct = fids.length ? pctOf(r.checked, fids) : null;
    var res = await sb.from('days').upsert({
      user_id: S.me.id, date: S.date, checked: r.checked, active_set: ids,
      pct: r.pct, floor_pct: r.floor_pct
    }, { onConflict: 'user_id,date' });
    if (res.error) { toast('offline'); setTimeout(saveDay, 3000); return; }
    toast('saved');
  }
  var pT; function queuePriv() {
    clearTimeout(pT);
    pT = setTimeout(async function () {
      var r = await sb.from('day_private').upsert({
        user_id: S.me.id, date: S.date, rating: S.priv.rating,
        why: S.priv.why, tasks: S.priv.tasks, prayer: S.priv.prayer
      }, { onConflict: 'user_id,date' });
      toast(r.error ? 'offline' : 'saved');
    }, 800);
  }
  var hT; function queueHabits() { clearTimeout(hT); hT = setTimeout(saveHabits, 700); }
  async function saveHabits() {
    for (var i = 0; i < S.habits.length; i++) {
      var h = S.habits[i];
      if (!String(h.name || '').trim()) continue;
      var r = { name: h.name, group_name: h.group, cadence: h.cadence, tier: h.tier,
                minutes: h.minutes, link: h.link || null, sort_order: i, active: true };
      if (h.id) { await sb.from('habits').update(r).eq('id', h.id); }
      else {
        r.user_id = S.me.id;
        var ins = await sb.from('habits').insert(r).select('id').single();
        if (!ins.error && ins.data) h.id = ins.data.id;
      }
    }
    /* Removing archives. A standard that scored past days must keep existing
       or that history stops making sense. */
    for (var j = 0; j < S.removed.length; j++) {
      await sb.from('habits').update({ active: false, archived_at: new Date().toISOString() }).eq('id', S.removed[j]);
    }
    S.removed = [];
    toast('saved');
  }

  /* ================= TODAY ================= */
  function paintRail() {
    var out = '', t = today();
    for (var i = 6; i >= 0; i--) {
      var k = shift(t, -i), d = dnum(k), r = S.byDate[k];
      var col = (r && r.pct != null && (k !== t || r.pct)) ? gcol(r.pct) : 'var(--line2)';
      out += '<button data-day="' + k + '"' + (k === S.date ? ' class="sel"' : '') + '>' +
        '<div class="wd">' + WD[d.getDay()] + '</div><div class="dd">' + d.getDate() + '</div>' +
        '<div class="pip" style="background:' + col + '"></div></button>';
    }
    el('rail').innerHTML = out;
  }

  function paintHero() {
    var ck = ckOf(S.date);
    var ds = daily(), ids = ds.map(function (h) { return h.id; });
    var pct = pctOf(ck, ids), g = grade(pct), col = gcol(pct);
    var C = 2 * Math.PI * 43;

    el('ring').innerHTML =
      '<svg viewBox="0 0 100 100"><circle class="tr" cx="50" cy="50" r="43" stroke-width="7"/>' +
      '<circle class="fg" cx="50" cy="50" r="43" stroke-width="7" stroke="' + col + '" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(1) + '"/></svg>' +
      '<div class="mid"><div class="gr" style="color:' + col + '">' + g[0] + '</div><div class="pc">' + pct + '%</div></div>';

    var left = 0, tot = 0;
    ds.forEach(function (h) { tot += h.minutes; if (!ck[h.id]) left += h.minutes; });
    var fl = floorSet(), fd = fl.filter(function (h) { return ck[h.id]; }).length;
    var r7 = rolling(7), r30 = rolling(30);

    el('facts').innerHTML =
      '<div class="fact"><div class="k">Remaining ' + (S.date === today() ? 'today' : 'that day') + '</div>' +
      '<div class="v">' + fmt(left) + '<small>of ' + fmt(tot) + '</small></div></div>' +
      '<div class="fact"><div class="k">Floor · 7-day</div><div class="v">' + fd + '/' + fl.length +
      '<small>' + (r7 == null ? '—' : r7 + '%') + ' &nbsp;·&nbsp; 30d ' + (r30 == null ? '—' : r30 + '%') + '</small></div></div>';

    var rd = el('ready');
    if (S.date !== today()) { rd.style.display = 'none'; }
    else {
      var y = S.byDate[shift(today(), -1)], ys = stateOf(y), sc = scopeOf(S.date);
      var txt;
      if (sc) txt = '<b>Scoped.</b> ' + esc(sc) + ' — hold the floor and the day still counts.';
      else if (ys === 'breach') txt = '<b>Floor only.</b> The floor broke yesterday. ' + fmt(fl.reduce(function (a, h) { return a + h.minutes; }, 0)) + ' to put it back.';
      else if (r7 != null && r7 < 40) txt = '<b>Floor only.</b> Seven-day mean is ' + r7 + '%. Rebuild from the floor.';
      else if (r7 != null && r7 >= 80) txt = '<b>Full standard.</b> Seven-day mean ' + r7 + '%. You are carrying it.';
      else txt = '<b>Full standard today.</b>' + (r7 == null ? '' : ' Seven-day mean ' + r7 + '%.');
      rd.style.display = '';
      rd.innerHTML = '<span class="dot"></span><span>' + txt + '</span>';
    }
  }

  function nextId() {
    if (S.date !== today()) return null;
    var now = new Date().getHours() * 60 + new Date().getMinutes();
    var best = null, bd = 1e9, ck = ckOf(S.date);
    daily().forEach(function (h) {
      var s = startMin(h.name);
      if (s == null || ck[h.id]) return;
      var d = s - now;
      if (d >= -60 && d < bd) { bd = d; best = h.id; }
    });
    return best;
  }

  function rowHTML(h, on, nx) {
    var at = h.cadence === 'weekly' ? '' : (h.minutes ? h.minutes + 'm' : '—');
    return '<button class="row' + (on ? ' on' : '') + (h.tier === 'floor' ? ' fl' : '') + (h.id === nx ? ' next' : '') +
      '" data-h="' + h.id + '"><span class="tick"></span><span class="nm">' + esc(label(h.name)) + '</span>' +
      (h.link ? '<span class="lk" data-link="' + esc(h.link) + '"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7L11.5 5"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19"/></svg></span>' : '') +
      (h.cadence === 'weekly' ? '<span class="wk">WK</span>' : '') +
      '<span class="at">' + at + '</span></button>';
  }
  function secHTML(t, c, hot) {
    return '<div class="sec"><span class="t' + (hot ? ' hot' : '') + '">' + esc(t) + '</span><span class="ln"></span><span class="c">' + c + '</span></div>';
  }

  function paintList() {
    if (S.edit) return paintEdit();
    var ck = ckOf(S.date), nx = nextId(), out = '';

    var fl = floorSet();
    if (fl.length) {
      var fd = fl.filter(function (h) { return ck[h.id]; }).length;
      var fm = fl.reduce(function (a, h) { return a + h.minutes; }, 0);
      out += secHTML('Floor', fd + ' / ' + fl.length + ' · ' + fmt(fm), true) +
        '<div class="card">' + fl.map(function (h) { return rowHTML(h, !!ck[h.id], nx); }).join('') + '</div>';
    }

    var rest = S.habits.filter(function (h) { return h.tier !== 'floor'; });
    var groups = {};
    rest.forEach(function (h) { (groups[h.group] = groups[h.group] || []).push(h); });
    GORDER.concat(Object.keys(groups).filter(function (g) { return GORDER.indexOf(g) < 0; }))
      .forEach(function (g) {
        var list = groups[g]; if (!list || !list.length) return;
        var done = list.filter(function (h) {
          return h.cadence === 'weekly' ? weekDone(h.id, S.date) : ck[h.id];
        }).length;
        out += secHTML(g, done + ' / ' + list.length) + '<div class="card">' +
          list.map(function (h) {
            return rowHTML(h, h.cadence === 'weekly' ? weekDone(h.id, S.date) : !!ck[h.id], nx);
          }).join('') + '</div>';
      });

    var sc = scopeOf(S.date);
    out += '<button class="big' + (sc ? '' : ' hot') + '" data-a="sheet">' +
      (sc ? 'Scoped · ' + esc(sc) : 'Close the day') + '<span class="ar">&rarr;</span></button>';
    el('lists').innerHTML = out;
  }

  /* ================= EDIT ================= */
  function paintEdit() {
    var mins = daily().reduce(function (a, h) { return a + h.minutes; }, 0);
    var out = '<div class="ebar"><span>' + S.habits.length + ' standards</span><span class="sp"></span>' +
      '<span class="big' + (mins > 180 ? ' over' : '') + '">' + fmt(mins) + '</span><span>a day</span>' +
      '<span class="sp"></span><span>' + floorSet().length + ' floor</span></div><div class="card">' +
      S.habits.map(function (h, i) {
        return '<div class="er" data-i="' + i + '">' +
          '<div class="l1">' +
            '<button class="fbtn' + (h.tier === 'floor' ? ' on' : '') + '" data-a="floor" title="Floor">F</button>' +
            '<input class="nm" data-a="name" value="' + esc(h.name) + '">' +
          '</div>' +
          '<div class="l2">' +
            '<select data-a="group">' + GORDER.map(function (g) {
              return '<option' + (h.group === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select>' +
            '<select data-a="cad"><option value="daily"' + (h.cadence !== 'weekly' ? ' selected' : '') + '>daily</option>' +
            '<option value="weekly"' + (h.cadence === 'weekly' ? ' selected' : '') + '>weekly</option></select>' +
            '<input class="mi" data-a="min" type="number" min="0" max="600" step="5" value="' + (h.minutes || 0) + '">' +
            '<span class="sp"></span>' +
            '<button class="ic" data-a="up">&uarr;</button><button class="ic" data-a="down">&darr;</button>' +
            '<button class="ic x" data-a="del">&times;</button>' +
          '</div>' +
          '<div class="l2"><input class="lk" data-a="link" placeholder="motivation link (optional)" value="' + esc(h.link) + '"></div>' +
        '</div>';
      }).join('') + '</div><button class="add" data-a="add">+ Add a standard</button>';
    el('lists').innerHTML = out;
  }

  /* ================= LEDGER ================= */
  function paintLedger() {
    var r7 = rolling(7), r30 = rolling(30);
    var clean = S.days.filter(function (r) { return stateOf(r) === 'clean'; }).length;
    var br = S.days.filter(function (r) { return stateOf(r) === 'breach'; }).length;
    el('kpis').innerHTML =
      kpi(r7 == null ? '—' : r7 + '%', '7 day', gcol(r7)) + kpi(r30 == null ? '—' : r30 + '%', '30 day', gcol(r30)) +
      kpi(clean, 'clean', 'var(--ink)') + kpi(br, 'breach', br ? 'var(--g0)' : 'var(--ink)');

    paintCal(); paintChart(); paintPerHabit(); paintCostAdh();

    el('lCount').textContent = S.days.length + ' days';
    el('rows').innerHTML = S.days.slice().reverse().map(function (r) {
      var d = dnum(r.date), st = stateOf(r);
      return '<div class="post"><span class="d">' + WD[d.getDay()].slice(0, 1) + ' ' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
        '<span class="st">' + st.toUpperCase() + '</span>' +
        '<span class="bar"><i style="width:' + (r.pct || 0) + '%;background:' + gcol(r.pct) + '"></i></span>' +
        '<span class="v">' + (r.pct == null ? '—' : r.pct + '%') + '</span>' +
        '<span class="g" style="color:' + gcol(r.pct) + '">' + grade(r.pct)[0] + '</span></div>';
    }).join('') || '<div class="msg" style="padding:20px 14px">Nothing logged yet.</div>';

    var cut = shift(today(), -30), agg = {};
    S.habits.forEach(function (h) { if (h.cadence !== 'weekly') agg[h.group] = agg[h.group] || { a: 0, b: 0 }; });
    S.days.filter(function (r) { return r.date >= cut; }).forEach(function (r) {
      var set = (r.active_set && r.active_set.length) ? r.active_set : daily().map(function (h) { return h.id; });
      S.habits.forEach(function (h) {
        if (h.cadence === 'weekly' || set.indexOf(h.id) < 0) return;
        agg[h.group].b++; if (r.checked && r.checked[h.id]) agg[h.group].a++;
      });
    });
    el('domain').innerHTML = Object.keys(agg).map(function (g) {
      var x = agg[g], p = x.b ? Math.round(x.a / x.b * 100) : null;
      return '<div class="hb"><span class="n">' + esc(g) + '</span><span class="m"></span>' +
        '<span class="bar"><i style="width:' + (p || 0) + '%;background:' + gcol(p) + '"></i></span>' +
        '<span class="p" style="color:' + gcol(p) + '">' + (p == null ? '—' : p + '%') + '</span></div>';
    }).join('');

    paintLife();
  }
  function kpi(v, k, c) { return '<div class="kpi"><div class="v" style="color:' + c + '">' + v + '</div><div class="k">' + k + '</div></div>'; }

  function paintCal() {
    var y = S.calYM[0], m = S.calYM[1];
    el('mLabel').textContent = MO[m] + ' ' + y;
    el('calnav').innerHTML = '<button data-a="pm">&lsaquo;</button><span class="sp"></span><button data-a="nm">&rsaquo;</button>';
    var first = new Date(y, m, 1), pad = first.getDay(), n = new Date(y, m + 1, 0).getDate();
    var out = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (d) { return '<div class="hd">' + d + '</div>'; }).join('');
    for (var i = 0; i < pad; i++) out += '<div class="cel pad"></div>';
    for (var d2 = 1; d2 <= n; d2++) {
      var k = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d2).padStart(2, '0');
      var r = S.byDate[k], p = r ? r.pct : null;
      out += '<div class="cel' + (p != null ? ' on' : '') + (k === today() ? ' today' : '') + '"' +
        (p != null ? ' style="background:' + gcol(p) + '"' : '') + '>' + d2 + '</div>';
    }
    el('cal').innerHTML = out;
  }

  function paintChart() {
    var xs = S.days.filter(function (r) { return r.pct != null; }).slice(-45);
    var W = 320, H = 130, P = 6;
    if (xs.length < 2) { el('chart').innerHTML = ''; return; }
    var step = (W - P * 2) / (xs.length - 1);
    var pts = xs.map(function (r, i) { return [P + i * step, H - P - (r.pct / 100) * (H - P * 2)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - P) + ' L' + P + ' ' + (H - P) + ' Z';
    var g80 = H - P - .8 * (H - P * 2);
    el('chart').innerHTML =
      '<line class="ax" x1="0" y1="' + g80.toFixed(1) + '" x2="' + W + '" y2="' + g80.toFixed(1) + '" stroke-dasharray="3 4"/>' +
      '<path class="ar" d="' + area + '"/><path class="ln" d="' + line + '"/>' +
      '<circle class="dt" cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="3"/>';
  }

  function habitStats() {
    var cut = shift(today(), -30);
    var rs = S.days.filter(function (r) { return r.date >= cut && r.date !== today(); });
    return S.habits.filter(function (h) { return h.cadence !== 'weekly'; }).map(function (h) {
      var a = 0, b = 0;
      rs.forEach(function (r) {
        var set = (r.active_set && r.active_set.length) ? r.active_set : null;
        if (set && set.indexOf(h.id) < 0) return;
        b++; if (r.checked && r.checked[h.id]) a++;
      });
      return { h: h, p: b ? Math.round(a / b * 100) : null, n: b };
    });
  }
  function paintPerHabit() {
    var xs = habitStats().filter(function (x) { return x.p != null; })
      .sort(function (a, b) { return a.p - b.p; });
    el('perHabit').innerHTML = xs.map(function (x) {
      return '<div class="hb"><span class="n">' + esc(label(x.h.name)) + '</span>' +
        '<span class="m">' + (x.h.minutes ? x.h.minutes + 'm' : '—') + '</span>' +
        '<span class="bar"><i style="width:' + x.p + '%;background:' + gcol(x.p) + '"></i></span>' +
        '<span class="p" style="color:' + gcol(x.p) + '">' + x.p + '%</span></div>';
    }).join('') || '<div class="msg" style="padding:18px 14px">Not enough logged days yet.</div>';
  }
  function paintCostAdh() {
    var xs = habitStats().filter(function (x) { return x.p != null; });
    if (!xs.length) { el('costAdh').innerHTML = '<div class="msg" style="padding:18px 14px">Not enough yet.</div>'; return; }
    function band(f) {
      var g = xs.filter(f);
      if (!g.length) return null;
      return Math.round(g.reduce(function (a, x) { return a + x.p; }, 0) / g.length);
    }
    var free = band(function (x) { return x.h.minutes <= 5; });
    var cost = band(function (x) { return x.h.minutes > 5; });
    var nf = xs.filter(function (x) { return x.h.minutes <= 5; }).length;
    var nc = xs.length - nf;
    el('costAdh').innerHTML =
      bandRow('Costs 5 minutes or less', nf, free) + bandRow('Costs more than 5 minutes', nc, cost) +
      '<div class="hb"><span class="n" style="color:var(--ink3);font-size:12.5px;white-space:normal">' +
      (free != null && cost != null && free > cost
        ? 'Same man, same days. The only thing that moved was the price on the clock.'
        : 'Not enough separation yet to say anything.') + '</span></div>';
  }
  function bandRow(t, n, p) {
    return '<div class="hb"><span class="n">' + t + '</span><span class="m">' + n + '</span>' +
      '<span class="bar"><i style="width:' + (p || 0) + '%;background:' + gcol(p) + '"></i></span>' +
      '<span class="p" style="color:' + gcol(p) + '">' + (p == null ? '—' : p + '%') + '</span></div>';
  }

  function paintLife() {
    var bd = S.priv0 && S.priv0.birth_date;
    if (!bd) { el('life').innerHTML = ''; el('lifeC').textContent = 'add your birthday in settings'; return; }
    var born = new Date(bd + 'T12:00:00'), now = new Date();
    var wks = Math.floor((now - born) / 6048e5), total = 90 * 52;
    el('lifeC').textContent = wks.toLocaleString() + ' weeks lived · ' + (total - wks).toLocaleString() + ' left of 90';
    var out = '';
    for (var i = 0; i < total; i++) out += '<i class="' + (i < wks ? 'past' : '') + '"></i>';
    el('life').innerHTML = out;
  }

  /* ================= CIRCLE ================= */
  async function paintCircle() {
    var box = el('circle');
    try {
      var mine = await sb.from('circle_members').select('circle_id').eq('user_id', S.me.id);
      var ids = (mine.data || []).map(function (r) { return r.circle_id; });
      if (!ids.length) { box.innerHTML = '<div class="msg">No circle yet.</div>'; return; }
      var cs = await sb.from('circles').select('id,name,join_code').in('id', ids);
      var mem = await sb.from('circle_members').select('circle_id,user_id').in('circle_id', ids);
      var uids = []; (mem.data || []).forEach(function (m) { if (uids.indexOf(m.user_id) < 0) uids.push(m.user_id); });
      var pr = await sb.from('profiles').select('id,display_name,handle').in('id', uids);
      var nm = {}; (pr.data || []).forEach(function (p) { nm[p.id] = p.display_name || p.handle; });

      var od = await sb.from('days').select('user_id,date,pct').in('user_id', uids).gte('date', shift(today(), -13));
      var by = {}; (od.data || []).forEach(function (r) { (by[r.user_id] = by[r.user_id] || []).push(r); });

      var c0 = (cs.data || [])[0] || {};
      var url = location.origin + location.pathname.replace(/index\.html$/, '') + '?join=' + c0.join_code;

      box.innerHTML = secHTML(c0.name || 'Circle', uids.length + ' people', true) + '<div class="card">' +
        uids.map(function (u) {
          var me = u === S.me.id, rs = by[u] || [];
          var t = rs.filter(function (r) { return r.date === today(); })[0];
          var p = me ? pctOf(ckOf(today()), daily().map(function (h) { return h.id; })) : (t ? t.pct : null);
          var past = rs.filter(function (r) { return r.date !== today() && r.pct != null; });
          var avg = past.length ? Math.round(past.reduce(function (a, r) { return a + r.pct; }, 0) / past.length) : null;
          var spark = '';
          for (var i = 6; i >= 0; i--) {
            var k = shift(today(), -i), rr = rs.filter(function (r) { return r.date === k; })[0];
            var v = rr ? rr.pct : null;
            spark += '<i style="height:' + (v == null ? 2 : Math.max(2, v / 100 * 22)) + 'px;background:' +
                     (v == null ? 'var(--line2)' : gcol(v)) + '"></i>';
          }
          var nme = nm[u] || 'member';
          return '<div class="mem"><span class="av">' + esc(nme.slice(0, 1).toUpperCase()) + '</span>' +
            '<span class="nm"><b>' + esc(nme) + (me ? ' · you' : '') + '</b>' +
            '<span>7-day ' + (avg == null ? '—' : avg + '%') + '</span></span>' +
            '<span class="sp">' + spark + '</span>' +
            '<span class="pc" style="color:' + gcol(p) + '">' + (p == null ? '—' : p + '%') + '</span></div>';
        }).join('') + '</div>' +
        '<div class="field"><input readonly value="' + esc(url) + '" data-a="sel">' +
        '<button data-a="copy" data-url="' + esc(url) + '">Copy</button>' +
        (navigator.share ? '<button data-a="share" data-url="' + esc(url) + '">Send</button>' : '') + '</div>' +
        '<div class="field"><input id="code" placeholder="Paste an invite link or code"><button data-a="join">Join</button></div>' +
        '<div class="note" id="cnote"></div>' +
        '<div class="note"><b>They see your daily percentage and nothing else.</b> Your journal, your why, your tasks and your prayers ' +
        'live in a separate table behind an owner-only rule. That is enforced by the database, not by this app.</div>';
    } catch (e) {
      box.innerHTML = '<div class="msg">Could not load your circle: ' + esc(e.message || e) + '</div>';
    }
  }

  /* ================= SHEETS ================= */
  function closeSheet() { el('sheet').classList.remove('on'); }
  function openDay() {
    var p = S.priv || {}, r = '';
    for (var i = 1; i <= 10; i++) r += '<button data-rate="' + i + '"' + (String(p.rating) === String(i) ? ' class="on"' : '') + '>' + i + '</button>';
    var sc = scopeOf(S.date);
    el('sheetBody').innerHTML =
      '<div class="top"><span class="brand">Close the day</span><span class="sp"></span>' +
      '<button class="ib" data-a="x">&times;</button></div>' +
      secHTML('How was it', 'private to you') + '<div class="rate">' + r + '</div>' +
      '<textarea data-j="why" placeholder="Why was it that number?">' + esc(p.why) + '</textarea>' +
      '<textarea data-j="tasks" placeholder="Tasks completed">' + esc(p.tasks) + '</textarea>' +
      '<textarea data-j="prayer" placeholder="Prayer journal">' + esc(p.prayer) + '</textarea>' +
      secHTML('Scope the day', 'a decision, not a miss') +
      '<div class="note" style="margin:0 0 10px">A day where reality won and you chose to hold the floor is a decision. ' +
      'The record should show a decision.</div>' +
      '<div class="scope"><button data-scope="" class="' + (sc ? '' : 'on') + '">Full standard</button>' +
      '<button data-scope="ask" class="' + (sc ? 'on' : '') + '">Scoped to floor</button></div>' +
      (sc ? '<textarea data-scopewhy placeholder="What happened?">' + esc(sc === '1' ? '' : sc) + '</textarea>' : '') +
      '<button class="big" data-a="x">Done<span class="ar">&times;</span></button>';
    el('sheet').classList.add('on');
  }
  function openSettings() {
    var sk = skin();
    el('sheetBody').innerHTML =
      '<div class="top"><span class="brand">Settings</span><span class="sp"></span>' +
      '<button class="ib" data-a="x">&times;</button></div>' +
      secHTML('Theme', 'three') +
      '<div class="skins">' + ['obsidian', 'gold', 'paper'].map(function (s) {
        return '<button data-skin="' + s + '"' + (sk === s ? ' class="on"' : '') + '>' + s + '</button>'; }).join('') + '</div>' +
      secHTML('You', '') +
      '<div class="field"><input id="pName" placeholder="Display name" value="' + esc(S.me.display_name || '') + '">' +
      '<button data-a="saveName">Save</button></div>' +
      '<div class="field"><input id="pBirth" placeholder="Birthday MM/DD/YYYY" value="' + esc(fmtBirth(S.priv0.birth_date)) + '">' +
      '<button data-a="saveBirth">Save</button></div>' +
      '<div class="note">Your birthday only ever draws the life grid. It is in the private table with your journal.</div>' +
      secHTML('Your data', '') +
      '<button class="big" data-a="export">Export everything<span class="ar">&darr;</span></button>' +
      '<button class="big" data-a="install">Add to home screen<span class="ar">&plus;</span></button>' +
      '<button class="big" data-a="signout">Sign out<span class="ar">&rarr;</span></button>' +
      '<div class="note" id="snote"></div>';
    el('sheet').classList.add('on');
  }
  function fmtBirth(iso) {
    if (!iso) return '';
    var p = String(iso).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '/' + p[0] : '';
  }

  function exportAll() {
    var lines = ['date,pct,floor_pct,state,scope'];
    S.days.forEach(function (r) {
      lines.push([r.date, r.pct == null ? '' : r.pct, r.floor_pct == null ? '' : r.floor_pct,
                  stateOf(r), JSON.stringify(scopeOf(r.date) || '')].join(','));
    });
    lines.push(''); lines.push('standard,group,cadence,tier,minutes');
    S.habits.forEach(function (h) {
      lines.push([JSON.stringify(h.name), h.group, h.cadence, h.tier, h.minutes].join(','));
    });
    var b = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'standard-' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= events ================= */
  document.addEventListener('click', function (ev) {
    var t = ev.target;

    var nb = t.closest('nav button'); if (nb) return show(nb.getAttribute('data-v'));
    if (t.closest('#bEdit')) { S.edit = !S.edit; el('bEdit').classList.toggle('on', S.edit);
                               document.body.classList.toggle('editing', S.edit);
                               paintList(); if (!S.edit) { paintHero(); paintRail(); queueHabits(); } return; }
    if (t.closest('#bSet')) return openSettings();

    var day = t.closest('[data-day]');
    if (day) { S.date = day.getAttribute('data-day'); loadPriv().then(function () { paintRail(); paintHero(); paintList(); }); return; }

    var lk = t.closest('[data-link]');
    if (lk) { ev.stopPropagation(); window.open(lk.getAttribute('data-link'), '_blank', 'noopener'); return; }

    var r = t.closest('.row');
    if (r && r.getAttribute('data-h')) {
      var id = r.getAttribute('data-h'), rr = row(S.date);
      rr.checked = rr.checked || {};
      var h = S.habits.filter(function (x) { return x.id === id; })[0];
      if (h && h.cadence === 'weekly' && weekDone(id, S.date) && !rr.checked[id]) toast('checked earlier this week');
      rr.checked[id] = !rr.checked[id];
      paintHero(); paintList(); paintRail(); queueSave();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
      return;
    }

    var rt = t.closest('[data-rate]');
    if (rt) { S.priv.rating = rt.getAttribute('data-rate'); openDay(); queuePriv(); return; }

    var sc = t.closest('[data-scope]');
    if (sc) {
      var v = sc.getAttribute('data-scope');
      var rr2 = row(S.date); rr2.checked = rr2.checked || {};
      if (v) rr2.checked.__scope = rr2.checked.__scope || 'reality won';
      else delete rr2.checked.__scope;
      openDay(); paintList(); paintHero(); queueSave(); return;
    }

    var sk = t.closest('[data-skin]');
    if (sk) { skin(sk.getAttribute('data-skin')); openSettings(); return; }

    var a = t.closest('[data-a]'); if (!a) return;
    var what = a.getAttribute('data-a');
    var ce = a.closest('.er'), ei = ce ? +ce.getAttribute('data-i') : -1;

    if (what === 'x')      return closeSheet();
    if (what === 'sheet')  return openDay();
    if (what === 'pm')     { S.calYM[1]--; if (S.calYM[1] < 0) { S.calYM[1] = 11; S.calYM[0]--; } return paintCal(); }
    if (what === 'nm')     { S.calYM[1]++; if (S.calYM[1] > 11) { S.calYM[1] = 0; S.calYM[0]++; } return paintCal(); }
    if (what === 'export') return exportAll();
    if (what === 'install'){ var p = window.__ip; if (p) { p.prompt(); window.__ip = null; }
                             else el('snote').textContent = 'On iPhone: tap Share, then Add to Home Screen. Notifications cannot reach a bookmark.'; return; }
    if (what === 'signout'){ sb.auth.signOut().then(function () { location.reload(); }); return; }
    if (what === 'saveName') {
      S.me.display_name = el('pName').value;
      sb.from('profiles').update({ display_name: S.me.display_name }).eq('id', S.me.id).then(function () { toast('saved'); });
      return;
    }
    if (what === 'saveBirth') {
      var m = el('pBirth').value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) { el('snote').textContent = 'Use MM/DD/YYYY.'; return; }
      var iso = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
      S.priv0.birth_date = iso;
      sb.from('profile_private').update({ birth_date: iso }).eq('id', S.me.id).then(function () { toast('saved'); paintLife(); });
      return;
    }
    if (what === 'add')   { S.habits.push({ id: '', name: '', group: 'Standards', cadence: 'daily', tier: 'standard', minutes: 0, link: '' }); return paintList(); }
    if (what === 'floor') { S.habits[ei].tier = S.habits[ei].tier === 'floor' ? 'standard' : 'floor'; paintList(); return queueHabits(); }
    if (what === 'del')   { if (S.habits[ei].id) S.removed.push(S.habits[ei].id); S.habits.splice(ei, 1); paintList(); return queueHabits(); }
    if (what === 'up' || what === 'down') {
      var j = ei + (what === 'up' ? -1 : 1);
      if (j < 0 || j >= S.habits.length) return;
      var tmp = S.habits[ei]; S.habits[ei] = S.habits[j]; S.habits[j] = tmp;
      paintList(); return queueHabits();
    }
    if (what === 'sel')  return a.select();
    if (what === 'copy') {
      navigator.clipboard.writeText(a.getAttribute('data-url')).then(function () {
        var o = a.textContent; a.textContent = 'Copied'; setTimeout(function () { a.textContent = o; }, 1400);
      }, function () {}); return;
    }
    if (what === 'share') { navigator.share({ title: 'STANDARD', url: a.getAttribute('data-url') }).catch(function () {}); return; }
    if (what === 'join')  return doJoin(el('code') ? el('code').value : '');
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.hasAttribute && t.hasAttribute('data-scopewhy')) {
      var rr = row(S.date); rr.checked = rr.checked || {};
      rr.checked.__scope = t.value || 'reality won';
      queueSave(); return;
    }
    var j = t.getAttribute && t.getAttribute('data-j');
    if (j) { S.priv[j] = t.value; queuePriv(); return; }
    var a = t.getAttribute && t.getAttribute('data-a'), e = t.closest && t.closest('.er');
    if (!a || !e) return;
    var i = +e.getAttribute('data-i');
    if (a === 'name')  S.habits[i].name = t.value;
    if (a === 'link')  S.habits[i].link = t.value;
    if (a === 'min')   S.habits[i].minutes = Math.max(0, parseInt(t.value, 10) || 0);
    if (a === 'group') S.habits[i].group = t.value;
    if (a === 'cad')   S.habits[i].cadence = t.value;
    var mins = daily().reduce(function (x, h) { return x + h.minutes; }, 0);
    var b = document.querySelector('.ebar .big');
    if (b) { b.textContent = fmt(mins); b.className = 'big' + (mins > 180 ? ' over' : ''); }
    queueHabits();
  });

  async function doJoin(raw) {
    var m = String(raw || '').trim().match(/[?&]join=([A-Za-z0-9-]+)/);
    var code = m ? m[1] : String(raw || '').trim();
    var n = el('cnote');
    if (!code) { if (n) n.textContent = 'Paste the invite link or code first.'; return; }
    try {
      var r = await sb.rpc('join_circle', { code: code });
      if (r.error) throw r.error;
      await paintCircle();
      var n2 = el('cnote'); if (n2) n2.textContent = 'You are in.';
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (n) n.textContent = /NO_SUCH_CIRCLE/.test(msg) ? 'That code does not match any circle.' : 'Could not join: ' + msg;
    }
  }

  function show(v) {
    S.view = v;
    ['Today', 'Ledger', 'Circle'].forEach(function (n) { el('v' + n).classList.toggle('on', n === v); });
    [].forEach.call(document.querySelectorAll('nav button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === v);
    });
    el('bEdit').style.display = v === 'Today' ? '' : 'none';
    if (v === 'Ledger') paintLedger();
    if (v === 'Circle') paintCircle();
    window.scrollTo(0, 0);
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__ip = e; });

  /* ================= boot ================= */
  (async function () {
    skin(skin());
    try {
      if (!await load()) { signIn(); return; }
      paintRail(); paintHero(); paintList();
      if (!S.habits.length) firstRun();
      var j = location.search.match(/[?&]join=([A-Za-z0-9-]+)/);
      if (j) { show('Circle'); setTimeout(function () { doJoin(j[1]); }, 500);
               try { history.replaceState({}, '', location.pathname); } catch (e) {} }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (r) { r.update(); }).catch(function () {});
      }
    } catch (e) {
      el('root').insertAdjacentHTML('beforeend', '<div class="msg">' + esc(e.message || e) + '</div>');
    }
  })();

  /* ---------- sign in, in this app ---------- */
  function signIn() {
    document.querySelector('nav').style.display = 'none';
    el('root').innerHTML =
      '<div class="top"><span class="brand">Standard</span></div>' +
      '<div style="padding:52px 0 26px"><div style="font-family:Geist Mono,monospace;font-size:11px;' +
      'letter-spacing:.2em;text-transform:uppercase;color:var(--ink3)">A ledger of the self</div>' +
      '<div style="font-size:27px;line-height:1.2;letter-spacing:-.03em;margin-top:10px">What you committed to.<br>What you actually did.</div></div>' +
      '<div class="field"><input id="em" type="email" placeholder="email" autocomplete="email"></div>' +
      '<div class="field"><input id="pw" type="password" placeholder="password" autocomplete="current-password"></div>' +
      '<button class="big hot" data-auth="in" style="margin-top:14px">Sign in<span class="ar">&rarr;</span></button>' +
      '<button class="big" data-auth="up">Create an account<span class="ar">&plus;</span></button>' +
      '<div class="note" id="anote"></div>';
    document.addEventListener('click', async function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-auth]');
      if (!b) return;
      var mode = b.getAttribute('data-auth');
      var email = (el('em') || {}).value, pass = (el('pw') || {}).value;
      var n = el('anote');
      if (!email || !pass) { n.textContent = 'Email and password, please.'; return; }
      n.textContent = 'Working...';
      var r = mode === 'in' ? await sb.auth.signInWithPassword({ email: email, password: pass })
                            : await sb.auth.signUp({ email: email, password: pass });
      if (r.error) { n.textContent = r.error.message; return; }
      location.reload();
    });
  }

  /* ---------- first run ---------- */
  var STARTER = [
    ['Morning', 'Up at your set time', 0], ['Morning', 'Move your body', 30],
    ['Morning', 'Ten minutes of quiet, prayer or reading', 10], ['Afternoon', 'Hit your protein target', 0],
    ['Afternoon', 'Drink your water', 0], ['Night', "Write tomorrow's list", 10],
    ['Night', 'Read ten pages', 15], ['Standards', 'No phone in bed', 0],
    ['Standards', 'Nothing to eat three hours before sleep', 0], ['Standards', 'Speak to one new person', 5],
    ['Weekly', 'One long walk or run', 45]
  ];
  function firstRun() {
    el('sheetBody').innerHTML =
      '<div class="top"><span class="brand">First run</span></div>' +
      '<div style="font-size:24px;line-height:1.25;letter-spacing:-.03em;margin:22px 0 12px">A standard you can actually hit.</div>' +
      '<div class="note" style="margin:0 0 6px">Most lists fail on arithmetic, not character - they commit more hours than the day has. ' +
      'So this one prices every item and shows you the bill while you write it.</div>' +
      secHTML('Start with these', '1h 55m a day') +
      '<div class="card">' + STARTER.map(function (s) {
        return '<div class="row"><span class="nm">' + esc(s[1]) + '</span><span class="at">' + (s[2] || '—') + '</span></div>';
      }).join('') + '</div>' +
      '<button class="big hot" data-a="useStarter" style="margin-top:16px">Use these, then edit<span class="ar">&rarr;</span></button>' +
      '<button class="big" data-a="x">I will write my own<span class="ar">&times;</span></button>';
    el('sheet').classList.add('on');
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-a="useStarter"]');
      if (!b) return;
      S.habits = STARTER.map(function (s) {
        return { id: '', name: s[1], group: s[0], cadence: s[0] === 'Weekly' ? 'weekly' : 'daily',
                 tier: 'standard', minutes: s[2], link: '' };
      });
      saveHabits().then(function () { paintList(); paintHero(); });
      closeSheet();
    });
  }
})();
