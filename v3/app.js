/* ============================================================
   STANDARD v3 — the instrument.

   Three screens. No counter that resets to zero. Every day carries a state,
   not a boolean, because a day where reality won and the floor was held is a
   decision and must not be recorded as a failure.
   ============================================================ */
(function () {
  'use strict';

  var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
  var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table is behind RLS */

  var sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.__SB3 = sb;

  var GROUPS = ['Morning', 'Afternoon', 'Night', 'Standards', 'Weekly'];
  var WSHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  var S = { me: null, habits: [], days: [], byDate: {}, date: null, priv: null, dirty: false };

  /* ---------- helpers ---------- */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dnum(k) { return new Date(k + 'T12:00:00'); }
  function fmt(m) {
    m = Math.max(0, Math.round(m || 0));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }
  /* Same thresholds the old app used, so a number never changes meaning. */
  function gradeOf(p) {
    if (p == null) return ['—', 'none'];
    if (p >= 100) return ['A+', 'good'];
    if (p >= 90)  return ['A',  'good'];
    if (p >= 80)  return ['B',  'good'];
    if (p >= 70)  return ['C',  'warn'];
    if (p >= 60)  return ['D',  'warn'];
    return ['F', 'bad'];
  }
  function bandColor(p) {
    if (p == null) return 'var(--hairline)';
    if (p >= 80) return 'var(--good)';
    if (p >= 60) return 'var(--warn)';
    return 'var(--bad)';
  }

  /* ---------- the four states ----------
     Derived, not stored, until a SCOPED reason has somewhere to live. */
  function stateOf(row) {
    if (!row) return 'none';
    if (row.scoped) return 'scoped';
    if (row.floor_pct != null && row.floor_pct < 100) return 'breach';
    if (row.pct >= 90) return 'clean';
    return 'held';
  }

  function daily()  { return S.habits.filter(function (h) { return h.cadence !== 'weekly'; }); }
  function floorIds() {
    return daily().filter(function (h) { return h.tier === 'floor'; }).map(function (h) { return h.id; });
  }
  function pctOf(checked, ids) {
    if (!ids.length) return 0;
    var n = 0;
    ids.forEach(function (id) { if (checked && checked[id]) n++; });
    return Math.round(n / ids.length * 100);
  }
  function rolling(n) {
    var xs = S.days.filter(function (r) { return r.pct != null; }).slice(-n);
    if (!xs.length) return null;
    return Math.round(xs.reduce(function (a, r) { return a + r.pct; }, 0) / xs.length);
  }
  function breaches(n) {
    var cut = new Date(); cut.setDate(cut.getDate() - n);
    return S.days.filter(function (r) { return dnum(r.date) >= cut && stateOf(r) === 'breach'; }).length;
  }

  function toast(t) {
    var b = el('save'); b.textContent = t; b.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { b.classList.remove('on'); }, 1400);
  }

  /* ---------- data ---------- */
  async function loadAll() {
    var ses = await sb.auth.getSession();
    if (!ses.data.session) { signedOut(); return false; }
    var uid = ses.data.session.user.id;

    var p = await sb.from('profiles').select('id,display_name,handle').eq('id', uid).maybeSingle();
    S.me = p.data || { id: uid, display_name: 'You' };

    var h = await sb.from('habits').select('id,name,group_name,cadence,tier,minutes,sort_order')
      .eq('user_id', uid).eq('active', true).order('sort_order');
    if (h.error) throw h.error;
    S.habits = (h.data || []).map(function (x) {
      return { id: x.id, name: x.name, group: x.group_name || 'Standards', cadence: x.cadence,
               tier: x.tier === 'floor' ? 'floor' : 'standard', minutes: x.minutes || 0 };
    });

    var d = await sb.from('days').select('date,checked,active_set,pct,floor_pct')
      .eq('user_id', uid).order('date');
    if (d.error) throw d.error;
    S.days = d.data || [];
    S.byDate = {};
    S.days.forEach(function (r) { S.byDate[r.date] = r; });

    S.date = dayKey(new Date());
    await loadPriv();
    return true;
  }

  async function loadPriv() {
    var r = await sb.from('day_private').select('rating,why,tasks,prayer')
      .eq('user_id', S.me.id).eq('date', S.date).maybeSingle();
    S.priv = r.data || { rating: null, why: '', tasks: '', prayer: '' };
  }

  function todayRow() {
    return S.byDate[S.date] || { date: S.date, checked: {}, active_set: null, pct: 0, floor_pct: null };
  }

  var saveT = null;
  function queueSave() {
    S.dirty = true;
    clearTimeout(saveT);
    saveT = setTimeout(saveDay, 500);
  }

  async function saveDay() {
    if (!S.dirty) return;
    S.dirty = false;
    var row = todayRow();
    var ids = daily().map(function (h) { return h.id; });
    var fids = floorIds();
    row.pct = pctOf(row.checked, ids);
    row.floor_pct = fids.length ? pctOf(row.checked, fids) : null;
    row.active_set = ids;                       /* period close: stamp the list as it was today */
    S.byDate[S.date] = row;
    if (S.days.indexOf(row) < 0) { S.days.push(row); S.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }

    var { error } = await sb.from('days').upsert({
      user_id: S.me.id, date: S.date, checked: row.checked, active_set: ids,
      pct: row.pct, floor_pct: row.floor_pct
    }, { onConflict: 'user_id,date' });
    if (error) { toast('offline'); S.dirty = true; setTimeout(saveDay, 3000); return; }
    toast('saved');
    paintHead();
  }

  var privT = null;
  function queuePriv() {
    clearTimeout(privT);
    privT = setTimeout(async function () {
      var { error } = await sb.from('day_private').upsert({
        user_id: S.me.id, date: S.date, rating: S.priv.rating,
        why: S.priv.why, tasks: S.priv.tasks, prayer: S.priv.prayer
      }, { onConflict: 'user_id,date' });
      toast(error ? 'offline' : 'saved');
    }, 900);
  }

  /* ---------- readiness ---------- */
  function readiness() {
    var r7 = rolling(7);
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yRow = S.byDate[dayKey(y)];
    var yState = stateOf(yRow);
    var fMin = daily().filter(function (h) { return h.tier === 'floor'; })
                      .reduce(function (a, h) { return a + h.minutes; }, 0);

    if (yState === 'breach') {
      return ['<b>Floor only.</b> The floor was breached yesterday — hold the seal before anything else. ' +
              fmt(fMin) + ' of floor on the board.', 'floor'];
    }
    if (r7 != null && r7 < 40) {
      return ['<b>Floor only.</b> Seven-day mean is ' + r7 + '%. Rebuild from the floor — ' +
              fmt(fMin) + ' — and let the rest follow.', 'floor'];
    }
    if (r7 != null && r7 >= 80) {
      return ['<b>Full standard.</b> Seven-day mean ' + r7 + '%. You are carrying it — keep the floor untouched.', 'plus'];
    }
    return ['<b>Full standard today.</b>' + (r7 != null ? ' Seven-day mean ' + r7 + '%.' : ''), 'std'];
  }

  /* ---------- paint: TODAY ---------- */
  function paintHead() {
    var row = todayRow();
    var ids = daily().map(function (h) { return h.id; });
    var pct = pctOf(row.checked, ids);
    var g = gradeOf(pct);
    var box = el('gradeBox');
    box.className = 'grade ' + g[1];
    box.innerHTML = '<div class="g">' + g[0] + '</div><div class="p">' + pct + '% · ' +
      Object.keys(row.checked || {}).filter(function (k) { return row.checked[k]; }).length + '/' + ids.length + '</div>';

    var rd = readiness();
    el('ready').innerHTML = rd[0];

    var left = 0, done = 0;
    daily().forEach(function (h) {
      if (row.checked && row.checked[h.id]) done += h.minutes; else left += h.minutes;
    });
    var total = left + done;
    el('budget').innerHTML =
      '<div class="row"><span><b>' + fmt(left) + '</b> left</span><span>' + fmt(done) + ' of ' + fmt(total) + ' done</span></div>' +
      '<div class="track"><i style="width:' + (total ? Math.round(done / total * 100) : 0) + '%"></i></div>';

    /* 7-day strip */
    var out = '', c = new Date();
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(c); dt.setDate(c.getDate() - i);
      var k = dayKey(dt), r = S.byDate[k];
      var st = (k === S.date) ? stateOf({ pct: pct, floor_pct: r ? r.floor_pct : null }) : stateOf(r);
      if (k === S.date && !pct && !(r && r.pct)) st = 'none';
      var v = (k === S.date) ? pct : (r ? r.pct : null);
      out += '<div class="cell' + (k === S.date ? ' today' : '') + '">' +
             '<div class="mark ' + st + '">' + (v == null ? '·' : v) + '</div>' +
             '<div class="d">' + WSHORT[dt.getDay()] + '</div></div>';
    }
    el('strip').innerHTML = out;
  }

  function rowHtml(h, on) {
    return '<button class="kc' + (on ? ' on' : '') + (h.tier === 'floor' ? ' fl' : '') + '" data-h="' + h.id + '">' +
      '<span class="cap"></span>' +
      '<span class="txt">' + esc(h.name) + '</span>' +
      (h.cadence === 'weekly' ? '<span class="tag">WK</span>' : '') +
      '<span class="min">' + (h.minutes ? fmt(h.minutes) : '—') + '</span>' +
    '</button>';
  }

  function paintList() {
    var row = todayRow(), ck = row.checked || {};
    var fl = daily().filter(function (h) { return h.tier === 'floor'; });
    var fDone = fl.filter(function (h) { return ck[h.id]; }).length;

    el('floorSec').innerHTML = fl.length
      ? '<div class="sec floor"><span class="t">The floor</span><span class="c">' + fDone + '/' + fl.length +
        ' · never missed</span></div><div class="rule strong"></div>' +
        fl.map(function (h) { return rowHtml(h, !!ck[h.id]); }).join('')
      : '';

    var rest = S.habits.filter(function (h) { return h.tier !== 'floor'; });
    var groups = {};
    rest.forEach(function (h) { (groups[h.group] = groups[h.group] || []).push(h); });
    var order = GROUPS.concat(Object.keys(groups).filter(function (g) { return GROUPS.indexOf(g) < 0; }));
    var out = '';
    order.forEach(function (g) {
      var list = groups[g];
      if (!list || !list.length) return;
      var d = list.filter(function (h) { return ck[h.id]; }).length;
      out += '<div class="sec"><span class="t">' + esc(g) + '</span><span class="c">' + d + '/' + list.length + '</span></div>' +
             '<div class="rule"></div>' + list.map(function (h) { return rowHtml(h, !!ck[h.id]); }).join('');
    });
    el('stdSec').innerHTML = out;
  }

  function paintJournal() {
    var p = S.priv || {};
    var rate = '';
    for (var i = 1; i <= 10; i++) {
      rate += '<button data-r="' + i + '"' + (String(p.rating) === String(i) ? ' class="on"' : '') + '>' + i + '</button>';
    }
    el('jrn').innerHTML =
      '<div class="lbl" style="display:block;margin:14px 0 6px">Rate the day</div><div class="rate">' + rate + '</div>' +
      '<textarea data-j="why" placeholder="Why was it that number?">' + esc(p.why) + '</textarea>' +
      '<textarea data-j="tasks" placeholder="Tasks completed today">' + esc(p.tasks) + '</textarea>' +
      '<textarea data-j="prayer" placeholder="Prayer journal">' + esc(p.prayer) + '</textarea>';
  }

  /* ---------- paint: LEDGER ---------- */
  function paintLedger() {
    var r7 = rolling(7), r30 = rolling(30);
    var clean = S.days.filter(function (r) { return stateOf(r) === 'clean'; }).length;
    el('lStats').innerHTML =
      stat(r7 == null ? '—' : r7 + '%', '7-day mean') +
      stat(r30 == null ? '—' : r30 + '%', '30-day mean') +
      stat(clean, 'clean days') +
      stat(breaches(90), 'breaches / 90d');

    el('lCount').textContent = S.days.length + ' days on the record';
    var rows = S.days.slice().reverse().map(function (r) {
      var st = stateOf(r), g = gradeOf(r.pct);
      var dt = dnum(r.date);
      return '<div class="post">' +
        '<span class="dt">' + WSHORT[dt.getDay()] + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span>' +
        '<span class="st ' + st + '">' + st.toUpperCase() + '</span>' +
        '<span class="bar"><i style="width:' + (r.pct || 0) + '%;background:' + bandColor(r.pct) + '"></i></span>' +
        '<span class="pc">' + (r.pct == null ? '—' : r.pct + '%') + '</span>' +
        '<span class="gr" style="color:' + bandColor(r.pct) + '">' + g[0] + '</span>' +
      '</div>';
    }).join('');
    el('lRows').innerHTML = rows || '<div class="msg">No days logged yet.</div>';

    /* by group, last 30 days */
    var cut = new Date(); cut.setDate(cut.getDate() - 30);
    var recent = S.days.filter(function (r) { return dnum(r.date) >= cut; });
    var agg = {};
    S.habits.forEach(function (h) {
      if (h.cadence === 'weekly') return;
      agg[h.group] = agg[h.group] || { hit: 0, poss: 0 };
    });
    recent.forEach(function (r) {
      var set = (r.active_set && r.active_set.length) ? r.active_set : daily().map(function (h) { return h.id; });
      S.habits.forEach(function (h) {
        if (h.cadence === 'weekly' || set.indexOf(h.id) < 0) return;
        agg[h.group].poss++;
        if (r.checked && r.checked[h.id]) agg[h.group].hit++;
      });
    });
    el('lDomain').innerHTML = Object.keys(agg).map(function (g) {
      var a = agg[g], p = a.poss ? Math.round(a.hit / a.poss * 100) : null;
      return '<div class="post"><span class="dt" style="width:110px">' + esc(g) + '</span>' +
        '<span class="bar"><i style="width:' + (p || 0) + '%;background:' + bandColor(p) + '"></i></span>' +
        '<span class="pc">' + (p == null ? '—' : p + '%') + '</span></div>';
    }).join('') || '<div class="msg">Nothing in the last 30 days.</div>';
  }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }

  /* ---------- paint: CIRCLE ---------- */
  async function paintCircle() {
    var box = el('cBody');
    try {
      var mine = await sb.from('circle_members').select('circle_id').eq('user_id', S.me.id);
      var ids = (mine.data || []).map(function (r) { return r.circle_id; });
      if (!ids.length) { box.innerHTML = '<div class="msg">You are not in a circle yet.</div>'; return; }
      var cs = await sb.from('circles').select('id,name,join_code').in('id', ids);
      var mem = await sb.from('circle_members').select('circle_id,user_id').in('circle_id', ids);
      var uids = []; (mem.data || []).forEach(function (m) { if (uids.indexOf(m.user_id) < 0) uids.push(m.user_id); });
      var pr = await sb.from('profiles').select('id,display_name,handle').in('id', uids);
      var nameOf = {}; (pr.data || []).forEach(function (p) { nameOf[p.id] = p.display_name || p.handle; });

      var base = location.origin + location.pathname.replace(/index\.html$/, '');
      box.innerHTML = (cs.data || []).map(function (c) {
        var url = base + '?join=' + c.join_code;
        var who = (mem.data || []).filter(function (m) { return m.circle_id === c.id; })
          .map(function (m) { return nameOf[m.user_id] || 'a member'; });
        return '<div class="card"><b>' + esc(c.name) + '</b>' +
          '<div class="sub">' + (who.length === 1 ? 'Just you so far.' : who.length + ': ' + esc(who.join(', '))) + '</div>' +
          '<div class="linkrow"><input class="inp" readonly value="' + esc(url) + '" data-c="sel">' +
          '<button class="btn" data-c="copy" data-url="' + esc(url) + '">Copy</button>' +
          (navigator.share ? '<button class="btn ghost" data-c="share" data-url="' + esc(url) + '">Send</button>' : '') +
          '</div></div>';
      }).join('') +
      '<div class="card"><b>Join another</b>' +
        '<div class="linkrow"><input class="inp" id="cCode" placeholder="Paste an invite link or code">' +
        '<button class="btn" data-c="join">Join</button></div>' +
        '<div id="cNote" class="sub" style="margin-top:9px"></div></div>' +
      '<div class="seal">They see your daily percentage. They never see your journal, your why, your tasks or your prayers. ' +
      'That is enforced by the database, not by this app.</div>';
    } catch (e) {
      box.innerHTML = '<div class="msg bad">Could not load your circle: ' + esc(e.message || e) + '</div>';
    }
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var nb = e.target.closest('nav button');
    if (nb) { show(nb.getAttribute('data-v')); return; }

    var kc = e.target.closest('.kc');
    if (kc) {
      var id = kc.getAttribute('data-h');
      var row = todayRow();
      row.checked = row.checked || {};
      row.checked[id] = !row.checked[id];
      S.byDate[S.date] = row;
      kc.classList.toggle('on', !!row.checked[id]);
      paintHead(); paintList();
      queueSave();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
      return;
    }

    var r = e.target.closest('[data-r]');
    if (r) {
      S.priv.rating = r.getAttribute('data-r');
      paintJournal(); queuePriv(); return;
    }

    var c = e.target.closest('[data-c]');
    if (c) circleAction(c);
  });

  document.addEventListener('input', function (e) {
    var j = e.target.getAttribute && e.target.getAttribute('data-j');
    if (j) { S.priv[j] = e.target.value; queuePriv(); }
  });

  function circleAction(t) {
    var what = t.getAttribute('data-c');
    if (what === 'sel') { t.select(); return; }
    if (what === 'copy') {
      navigator.clipboard.writeText(t.getAttribute('data-url')).then(function () {
        var o = t.textContent; t.textContent = 'Copied';
        setTimeout(function () { t.textContent = o; }, 1400);
      }, function () {});
    }
    if (what === 'share') {
      navigator.share({ title: 'STANDARD', text: 'Join my circle on STANDARD.', url: t.getAttribute('data-url') })
        .catch(function () {});
    }
    if (what === 'join') doJoin(el('cCode') ? el('cCode').value : '');
  }

  async function doJoin(raw) {
    var m = String(raw || '').trim().match(/[?&]join=([A-Za-z0-9-]+)/);
    var code = m ? m[1] : String(raw || '').trim();
    var note = el('cNote');
    if (!code) { if (note) note.textContent = 'Paste the invite link or code first.'; return; }
    if (note) note.textContent = 'Joining…';
    try {
      var r = await sb.rpc('join_circle', { code: code });
      if (r.error) throw r.error;
      await paintCircle();
      var n2 = el('cNote'); if (n2) n2.textContent = 'You are in.';
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (note) note.textContent = /NO_SUCH_CIRCLE/.test(msg)
        ? 'That code does not match any circle. Check it and try again.'
        : 'Could not join: ' + msg;
    }
  }

  function show(v) {
    ['Today', 'Ledger', 'Circle'].forEach(function (name) {
      el('v' + name).classList.toggle('on', name === v);
    });
    [].forEach.call(document.querySelectorAll('nav button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === v);
    });
    if (v === 'Ledger') paintLedger();
    if (v === 'Circle') paintCircle();
    window.scrollTo(0, 0);
  }

  function signedOut() {
    document.querySelector('.wrap').innerHTML =
      '<div class="msg" style="padding-top:60px">Not signed in.<br><br>' +
      '<a href="../" style="color:var(--accent)">Sign in on the main app</a>, then come back here — ' +
      'this is the same account and the same data.</div>';
  }

  /* ---------- boot ---------- */
  (async function boot() {
    try {
      var ok = await loadAll();
      if (!ok) return;
      el('who').textContent = (S.me.display_name || '').split(' ')[0] || '';
      el('stamp').textContent = new Date().toLocaleDateString(undefined,
        { weekday: 'short', month: 'short', day: 'numeric' });
      paintHead(); paintList(); paintJournal();

      var j = location.search.match(/[?&]join=([A-Za-z0-9-]+)/);
      if (j) { show('Circle'); setTimeout(function () { doJoin(j[1]); }, 600);
               try { history.replaceState({}, '', location.pathname); } catch (e) {} }
    } catch (e) {
      document.querySelector('.wrap').insertAdjacentHTML('beforeend',
        '<div class="msg bad">' + esc((e && e.message) || e) + '</div>');
    }
  })();
})();
