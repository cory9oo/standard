/* ============================================================
   STANDARD — one instrument.

   Achromatic interface, chromatic data: the only colour anywhere is a
   status. Three destinations. One list that edits itself in place rather
   than sending you to a separate editor.
   ============================================================ */
(function () {
  'use strict';

  var SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
  var SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';   /* public by design — every table sits behind RLS */

  var sb = (window.__MOCK_SB) || window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.__SB4 = sb;

  var WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var S = { me: null, habits: [], days: [], byDate: {}, date: null, priv: null, edit: false };

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
  /* A habit name carries its own clock prefix. The list shows the standard,
     not the schedule — the order already says when. Thirty rows that each wrap
     to four lines is not a list, it is an essay. */
  function label(name) {
    return String(name || '')
      .replace(/^\s*\d{1,2}:\d{2}\s*(?:[-–]\s*\d{1,2}:\d{2})?\s*(?:am|pm)?\s*/i, '')
      .replace(/\s+/g, ' ').trim() || name;
  }
  function gradeOf(p) {
    if (p == null) return '—';
    if (p >= 100) return 'A+'; if (p >= 90) return 'A'; if (p >= 80) return 'B';
    if (p >= 70) return 'C';  if (p >= 60) return 'D'; return 'F';
  }
  function tone(p) { return p == null ? '' : p >= 80 ? 'ok' : p >= 60 ? 'mid' : 'off'; }

  function stateOf(row) {
    if (!row) return 'none';
    if (row.pct >= 90) return 'clean';
    if (row.date && row.date === S.date) return 'open';   /* a running day is not a breach */
    if (row.floor_pct != null && row.floor_pct < 100) return 'breach';
    return 'held';
  }

  function daily()    { return S.habits.filter(function (h) { return h.cadence !== 'weekly'; }); }
  function floorSet() { return daily().filter(function (h) { return h.tier === 'floor'; }); }
  function pctOf(ck, ids) {
    if (!ids.length) return 0;
    var n = 0; ids.forEach(function (i) { if (ck && ck[i]) n++; });
    return Math.round(n / ids.length * 100);
  }
  function rolling(n) {
    var xs = S.days.filter(function (r) { return r.pct != null && r.date !== S.date; }).slice(-n);
    if (!xs.length) return null;
    return Math.round(xs.reduce(function (a, r) { return a + r.pct; }, 0) / xs.length);
  }
  function toast(t) {
    var b = el('toast'); b.textContent = t; b.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { b.classList.remove('on'); }, 1300);
  }

  async function loadAll() {
    var ses = await sb.auth.getSession();
    if (!ses.data.session) return false;
    var uid = ses.data.session.user.id;

    var p = await sb.from('profiles').select('id,display_name,handle').eq('id', uid).maybeSingle();
    S.me = p.data || { id: uid, display_name: '' };

    var h = await sb.from('habits').select('id,name,group_name,cadence,tier,minutes,sort_order')
      .eq('user_id', uid).eq('active', true).order('sort_order');
    if (h.error) throw h.error;
    S.habits = (h.data || []).map(function (x) {
      return { id: x.id, name: x.name, group: x.group_name || 'Standards', cadence: x.cadence,
               tier: x.tier === 'floor' ? 'floor' : 'standard', minutes: x.minutes || 0 };
    });

    var d = await sb.from('days').select('date,checked,active_set,pct,floor_pct').eq('user_id', uid).order('date');
    if (d.error) throw d.error;
    S.days = d.data || [];
    S.byDate = {}; S.days.forEach(function (r) { S.byDate[r.date] = r; });

    S.date = dayKey(new Date());
    var pv = await sb.from('day_private').select('rating,why,tasks,prayer')
      .eq('user_id', uid).eq('date', S.date).maybeSingle();
    S.priv = pv.data || { rating: null, why: '', tasks: '', prayer: '' };
    return true;
  }

  function todayRow() {
    if (!S.byDate[S.date]) S.byDate[S.date] = { date: S.date, checked: {}, pct: 0, floor_pct: null };
    return S.byDate[S.date];
  }

  var saveT;
  function queueSave() { clearTimeout(saveT); saveT = setTimeout(saveDay, 450); }
  async function saveDay() {
    var row = todayRow();
    var ids = daily().map(function (h) { return h.id; });
    var fids = floorSet().map(function (h) { return h.id; });
    row.pct = pctOf(row.checked, ids);
    row.floor_pct = fids.length ? pctOf(row.checked, fids) : null;
    if (S.days.indexOf(row) < 0) { S.days.push(row); S.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
    var r = await sb.from('days').upsert({
      user_id: S.me.id, date: S.date, checked: row.checked, active_set: ids,
      pct: row.pct, floor_pct: row.floor_pct
    }, { onConflict: 'user_id,date' });
    if (r.error) { toast('offline'); setTimeout(saveDay, 3000); return; }
    toast('saved');
  }

  var privT;
  function queuePriv() {
    clearTimeout(privT);
    privT = setTimeout(async function () {
      var r = await sb.from('day_private').upsert({
        user_id: S.me.id, date: S.date, rating: S.priv.rating,
        why: S.priv.why, tasks: S.priv.tasks, prayer: S.priv.prayer
      }, { onConflict: 'user_id,date' });
      toast(r.error ? 'offline' : 'saved');
    }, 800);
  }

  var habT;
  function queueHabits() { clearTimeout(habT); habT = setTimeout(saveHabits, 700); }
  async function saveHabits() {
    for (var i = 0; i < S.habits.length; i++) {
      var h = S.habits[i];
      if (!String(h.name || '').trim()) continue;
      var row = { name: h.name, group_name: h.group, cadence: h.cadence,
                  tier: h.tier, minutes: h.minutes, sort_order: i, active: true };
      if (h.id) { await sb.from('habits').update(row).eq('id', h.id); }
      else {
        row.user_id = S.me.id;
        var ins = await sb.from('habits').insert(row).select('id').single();
        if (!ins.error && ins.data) h.id = ins.data.id;
      }
    }
    /* Removing a standard archives it. A habit that scored past days must keep
       existing or that history stops making sense. */
    for (var j = 0; j < (S.removed || []).length; j++) {
      await sb.from('habits').update({ active: false, archived_at: new Date().toISOString() })
        .eq('id', S.removed[j]);
    }
    S.removed = [];
    toast('saved');
  }

  function paintHead() {
    var row = todayRow(), ck = row.checked || {};
    var ds = daily(), ids = ds.map(function (h) { return h.id; });
    var pct = pctOf(ck, ids);
    var left = 0, done = 0;
    ds.forEach(function (h) { if (ck[h.id]) done += h.minutes; else left += h.minutes; });

    el('cost').textContent = fmt(left);
    el('score').textContent = pct + '%';
    el('scoreK').innerHTML = gradeOf(pct) + ' &nbsp;·&nbsp; ' +
      ids.filter(function (i) { return ck[i]; }).length + ' of ' + ids.length;

    var out = '', c = new Date();
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(c); dt.setDate(c.getDate() - i);
      var k = dayKey(dt), r = S.byDate[k];
      var v = (k === S.date) ? pct : (r ? r.pct : null);
      var cls = (k === S.date) ? 'now' : (v == null ? 'nil' : tone(v));
      var hgt = v == null ? 3 : Math.max(3, Math.round(v / 100 * 34));
      out += '<i class="' + cls + '" style="height:' + hgt + 'px"></i>';
    }
    el('spark').innerHTML = out;

    var r7 = rolling(7), r30 = rolling(30);
    el('trendStat').innerHTML =
      '7-day <b>' + (r7 == null ? '—' : r7 + '%') + '</b> &nbsp; 30-day <b>' + (r30 == null ? '—' : r30 + '%') + '</b>';
  }

  function rowRead(h, on) {
    return '<button class="r' + (on ? ' on' : '') + (h.tier === 'floor' ? ' fl' : '') + '" data-h="' + h.id + '">' +
      '<span class="box"></span><span class="t">' + esc(label(h.name)) + '</span>' +
      '<span class="mn">' + (h.minutes ? h.minutes : '—') + '</span></button>';
  }
  function rowEdit(h, i) {
    return '<div class="e" data-i="' + i + '">' +
      '<button class="fbtn' + (h.tier === 'floor' ? ' on' : '') + '" data-a="floor" title="floor">F</button>' +
      '<input class="en" data-a="name" value="' + esc(h.name) + '">' +
      '<input class="em" data-a="min" type="number" min="0" max="600" step="5" value="' + (h.minutes || 0) + '">' +
      '<button class="ic" data-a="up">&uarr;</button>' +
      '<button class="ic" data-a="down">&darr;</button>' +
      '<button class="ic x" data-a="del">&times;</button>' +
    '</div>';
  }

  function paintList() {
    var row = todayRow(), ck = row.checked || {};
    if (S.edit) {
      var mins = daily().reduce(function (a, h) { return a + h.minutes; }, 0);
      el('lists').innerHTML =
        '<div class="ebar"><span>' + S.habits.length + ' standards</span>' +
        '<span class="' + (mins > 180 ? 'w' : '') + '">' + fmt(mins) + ' a day</span>' +
        '<span>' + floorSet().length + ' floor</span></div>' +
        S.habits.map(rowEdit).join('') +
        '<button class="add" data-a="add">+ Add a standard</button>';
      return;
    }
    var fl = floorSet();
    var rest = S.habits.filter(function (h) { return h.tier !== 'floor'; });
    var fd = fl.filter(function (h) { return ck[h.id]; }).length;
    var rd = rest.filter(function (h) { return ck[h.id]; }).length;
    el('lists').innerHTML =
      (fl.length ? '<div class="sec f">Floor<span class="n">' + fd + ' / ' + fl.length + '</span></div>' +
        fl.map(function (h) { return rowRead(h, !!ck[h.id]); }).join('') : '') +
      '<div class="sec">Standard<span class="n">' + rd + ' / ' + rest.length + '</span></div>' +
      rest.map(function (h) { return rowRead(h, !!ck[h.id]); }).join('') +
      '<button class="close" data-a="sheet">Close the day<span>&rarr;</span></button>';
  }

  function paintLedger() {
    var r7 = rolling(7), r30 = rolling(30);
    var clean = S.days.filter(function (r) { return stateOf(r) === 'clean'; }).length;
    var br = S.days.filter(function (r) { return stateOf(r) === 'breach'; }).length;
    el('kpi').innerHTML =
      k(r7 == null ? '—' : r7 + '%', '7d mean') + k(r30 == null ? '—' : r30 + '%', '30d mean') +
      k(clean, 'clean') + k(br, 'breach');

    el('rows').innerHTML = S.days.slice().reverse().map(function (r) {
      var st = stateOf(r), dt = dnum(r.date);
      return '<div class="p"><span class="d">' + WD[dt.getDay()] + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span>' +
        '<span class="s">' + st.toUpperCase() + '</span>' +
        '<span class="track"><i style="width:' + (r.pct || 0) + '%" class="' + tone(r.pct) + '"></i></span>' +
        '<span class="v">' + (r.pct == null ? '—' : r.pct + '%') + '</span>' +
        '<span class="g">' + gradeOf(r.pct) + '</span></div>';
    }).join('') || '<div class="msg">Nothing logged yet.</div>';

    var cut = new Date(); cut.setDate(cut.getDate() - 30);
    var recent = S.days.filter(function (r) { return dnum(r.date) >= cut; });
    var agg = {};
    S.habits.forEach(function (h) { if (h.cadence !== 'weekly') agg[h.group] = agg[h.group] || { a: 0, b: 0 }; });
    recent.forEach(function (r) {
      var set = (r.active_set && r.active_set.length) ? r.active_set : daily().map(function (h) { return h.id; });
      S.habits.forEach(function (h) {
        if (h.cadence === 'weekly' || set.indexOf(h.id) < 0) return;
        agg[h.group].b++; if (r.checked && r.checked[h.id]) agg[h.group].a++;
      });
    });
    el('domain').innerHTML = Object.keys(agg).map(function (g) {
      var x = agg[g], p = x.b ? Math.round(x.a / x.b * 100) : null;
      return '<div class="p"><span class="d" style="width:96px">' + esc(g) + '</span>' +
        '<span class="track"><i style="width:' + (p || 0) + '%" class="' + tone(p) + '"></i></span>' +
        '<span class="v">' + (p == null ? '—' : p + '%') + '</span></div>';
    }).join('');
  }
  function k(v, l) { return '<div><div class="v">' + v + '</div><div class="k">' + l + '</div></div>'; }

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

      /* Circle-mates' percentages are readable by design — that is the circle.
         Their journals are not, and cannot be, from anywhere. */
      var since = new Date(); since.setDate(since.getDate() - 7);
      var od = await sb.from('days').select('user_id,date,pct').in('user_id', uids).gte('date', dayKey(since));
      var by = {};
      (od.data || []).forEach(function (r) { (by[r.user_id] = by[r.user_id] || []).push(r); });

      var url = location.origin + location.pathname.replace(/index\.html$/, '') + '?join=' + ((cs.data || [])[0] || {}).join_code;

      box.innerHTML =
        '<div class="sec">' + esc(((cs.data || [])[0] || {}).name || 'Circle') + '<span class="n">' + uids.length + '</span></div>' +
        uids.map(function (u) {
          var me = u === S.me.id, rs = by[u] || [];
          var t = rs.filter(function (r) { return r.date === S.date; })[0];
          var p = me ? pctOf(todayRow().checked, daily().map(function (h) { return h.id; })) : (t ? t.pct : null);
          var past = rs.filter(function (r) { return r.date !== S.date && r.pct != null; });
          var avg = past.length ? Math.round(past.reduce(function (a, r) { return a + r.pct; }, 0) / past.length) : null;
          return '<div class="mem"><span class="nm">' + esc(nm[u] || 'member') + (me ? ' <span class="you">you</span>' : '') +
                 '</span><span class="sub7">7d ' + (avg == null ? '—' : avg + '%') + '</span>' +
                 '<span class="pc ' + tone(p) + '">' + (p == null ? '—' : p + '%') + '</span></div>';
        }).join('') +
        '<div class="inv"><input readonly value="' + esc(url) + '" data-a="sel">' +
        '<button data-a="copy" data-url="' + esc(url) + '">Copy</button>' +
        (navigator.share ? '<button data-a="share" data-url="' + esc(url) + '">Send</button>' : '') + '</div>' +
        '<div class="inv" style="margin-top:10px"><input id="code" placeholder="Paste an invite link or code">' +
        '<button data-a="join">Join</button></div>' +
        '<div id="cnote" class="seal"></div>' +
        '<div class="seal">They see your daily percentage. They never see your journal, your why, your tasks or your prayers. ' +
        'That is enforced by the database, not by this app.</div>';
    } catch (e) {
      box.innerHTML = '<div class="msg">Could not load your circle: ' + esc(e.message || e) + '</div>';
    }
  }

  function sheet(open) {
    var s = el('sheet');
    if (!open) { s.classList.remove('on'); return; }
    var p = S.priv || {}, r = '';
    for (var i = 1; i <= 10; i++) r += '<button data-rate="' + i + '"' + (String(p.rating) === String(i) ? ' class="on"' : '') + '>' + i + '</button>';
    el('sheetBody').innerHTML =
      '<div class="sec">Rate the day<span class="n">private</span></div><div class="rate">' + r + '</div>' +
      '<textarea data-j="why" placeholder="Why was it that number?">' + esc(p.why) + '</textarea>' +
      '<textarea data-j="tasks" placeholder="Tasks completed">' + esc(p.tasks) + '</textarea>' +
      '<textarea data-j="prayer" placeholder="Prayer journal">' + esc(p.prayer) + '</textarea>' +
      '<button class="close" data-a="closeSheet">Done<span>&times;</span></button>';
    s.classList.add('on');
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;

    var nb = t.closest('nav button');
    if (nb) return show(nb.getAttribute('data-v'));

    if (t.closest('#editBtn')) {
      S.edit = !S.edit;
      el('editBtn').classList.toggle('on', S.edit);
      paintList();
      if (!S.edit) { paintHead(); queueHabits(); }
      return;
    }

    var r = t.closest('.r');
    if (r) {
      var id = r.getAttribute('data-h'), row = todayRow();
      row.checked = row.checked || {};
      row.checked[id] = !row.checked[id];
      paintHead(); paintList(); queueSave();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
      return;
    }

    var rt = t.closest('[data-rate]');
    if (rt) { S.priv.rating = rt.getAttribute('data-rate'); sheet(true); queuePriv(); return; }

    var a = t.closest('[data-a]');
    if (!a) return;
    var what = a.getAttribute('data-a');
    var ce = a.closest('.e');
    var ei = ce ? +ce.getAttribute('data-i') : -1;

    if (what === 'sheet')      return sheet(true);
    if (what === 'closeSheet') return sheet(false);
    if (what === 'add')   { S.habits.push({ id: '', name: '', group: 'Standards', cadence: 'daily', tier: 'standard', minutes: 0 }); paintList(); return; }
    if (what === 'floor') { S.habits[ei].tier = S.habits[ei].tier === 'floor' ? 'standard' : 'floor'; paintList(); queueHabits(); return; }
    if (what === 'del')   { S.removed = S.removed || []; if (S.habits[ei].id) S.removed.push(S.habits[ei].id); S.habits.splice(ei, 1); paintList(); queueHabits(); return; }
    if (what === 'up' || what === 'down') {
      var j = ei + (what === 'up' ? -1 : 1);
      if (j < 0 || j >= S.habits.length) return;
      var tmp = S.habits[ei]; S.habits[ei] = S.habits[j]; S.habits[j] = tmp;
      paintList(); queueHabits(); return;
    }
    if (what === 'sel')  { a.select(); return; }
    if (what === 'copy') {
      navigator.clipboard.writeText(a.getAttribute('data-url')).then(function () {
        var o = a.textContent; a.textContent = 'Copied'; setTimeout(function () { a.textContent = o; }, 1400);
      }, function () {}); return;
    }
    if (what === 'share') { navigator.share({ title: 'STANDARD', url: a.getAttribute('data-url') }).catch(function () {}); return; }
    if (what === 'join')  { doJoin(el('code') ? el('code').value : ''); return; }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    var j = t.getAttribute && t.getAttribute('data-j');
    if (j) { S.priv[j] = t.value; queuePriv(); return; }
    var a = t.getAttribute && t.getAttribute('data-a');
    var e = t.closest && t.closest('.e');
    if (!a || !e) return;
    var i = +e.getAttribute('data-i');
    if (a === 'name') S.habits[i].name = t.value;
    if (a === 'min')  S.habits[i].minutes = Math.max(0, parseInt(t.value, 10) || 0);
    var mins = daily().reduce(function (x, h) { return x + h.minutes; }, 0);
    var bar = document.querySelector('.ebar span:nth-child(2)');
    if (bar) { bar.textContent = fmt(mins) + ' a day'; bar.className = mins > 180 ? 'w' : ''; }
    queueHabits();
  });

  async function doJoin(raw) {
    var m = String(raw || '').trim().match(/[?&]join=([A-Za-z0-9-]+)/);
    var code = m ? m[1] : String(raw || '').trim();
    var note = el('cnote');
    if (!code) { if (note) note.textContent = 'Paste the invite link or code first.'; return; }
    try {
      var r = await sb.rpc('join_circle', { code: code });
      if (r.error) throw r.error;
      await paintCircle();
      var n = el('cnote'); if (n) n.textContent = 'You are in.';
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (note) note.textContent = /NO_SUCH_CIRCLE/.test(msg)
        ? 'That code does not match any circle.' : 'Could not join: ' + msg;
    }
  }

  function show(v) {
    ['Today', 'Ledger', 'Circle'].forEach(function (n) { el('v' + n).classList.toggle('on', n === v); });
    [].forEach.call(document.querySelectorAll('nav button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === v);
    });
    el('editBtn').style.display = v === 'Today' ? '' : 'none';
    if (v === 'Ledger') paintLedger();
    if (v === 'Circle') paintCircle();
    window.scrollTo(0, 0);
  }

  (async function () {
    try {
      if (!await loadAll()) {
        document.querySelector('.wrap').innerHTML =
          '<div class="msg" style="padding-top:80px">Not signed in. <a href="../" style="color:var(--ink)">Sign in</a>, then come back — same account, same data.</div>';
        return;
      }
      el('dt').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
      paintHead(); paintList();
      var j = location.search.match(/[?&]join=([A-Za-z0-9-]+)/);
      if (j) { show('Circle'); setTimeout(function () { doJoin(j[1]); }, 500);
               try { history.replaceState({}, '', location.pathname); } catch (e) {} }
    } catch (e) {
      document.querySelector('.wrap').insertAdjacentHTML('beforeend', '<div class="msg">' + esc(e.message || e) + '</div>');
    }
  })();
})();
