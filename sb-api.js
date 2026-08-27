/* ============================================================
   STANDARD - Supabase data layer.

   Presents the exact interface the existing UI already calls
   (google.script.run.withSuccessHandler(cb).getStats(user, pin)) and
   implements it against Postgres instead of a Google Sheet, so 64KB of
   working, tested UI never learned the backend moved.

   SEALED IN A CLOSURE ON PURPOSE. This file previously declared `const key`
   at global scope while the app script declares `function key`. Two classic
   scripts cannot both declare the same global name: the browser raises a
   parse-time SyntaxError and discards the ENTIRE other script - silently,
   before any error handler exists. The app painted its static shell and
   nothing else: no sign-in, no habits, dead tabs, no message. One shared
   word. Sealing the file makes the whole class of bug impossible.

   Everything below is private. Only the explicit window.* assignments at
   the bottom are public.
   ============================================================ */
(function () {
  'use strict';


const SB_URL = 'https://ykxxiwrjuvdvwrfweceo.supabase.co';
const SB_KEY = 'sb_publishable_ZMRDhEgkKSnbuntc_y_xDA_QirkAxoC';
/* This key is meant to be public. Every table is protected by row-level
   security in the database, so possessing this key grants nothing that
   the signed-in person is not already allowed to see. */

const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let ME = null;                 // { id, handle, display_name }
const HANDLE_CACHE = {};

/* ---------- small helpers ---------- */
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayKey = () => dayKey(new Date());
const dnum = k => new Date(k + 'T12:00:00');

function pctOf(checked, ids) {
  if (!ids || !ids.length) return 0;
  let done = 0;
  ids.forEach(id => { if (checked && checked[id]) done++; });
  return Math.round(100 * done / ids.length);
}

async function uidFor(handle) {
  if (!handle) return ME.id;
  handle = String(handle).toLowerCase();
  if (ME && handle === ME.handle) return ME.id;
  if (HANDLE_CACHE[handle]) return HANDLE_CACHE[handle];
  const { data } = await sb.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!data) throw new Error('UNKNOWN_USER');
  return (HANDLE_CACHE[handle] = data.id);
}

/* Map a database habit row to the shape the UI has always received. */
const toUiHabit = h => ({ id: h.id, group: h.group_name, name: h.name, cadence: h.cadence, link: h.link || '' });

async function habitsOf(uid, includeInactive) {
  let q = sb.from('habits').select('*').eq('user_id', uid);
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q.order('sort_order').order('created_at');
  if (error) throw error;
  return data || [];
}

async function daysOf(uid) {
  const { data, error } = await sb.from('days').select('date,checked,active_set,pct,floor_pct')
    .eq('user_id', uid).order('date');
  if (error) throw error;
  return data || [];
}

/* PERIOD CLOSE: score a day against the habit list that was active THAT day.
   Editing today's list can never restate a day already closed. */
const idsForDay = (row, currentDailyIds) =>
  (row && row.active_set && row.active_set.length) ? row.active_set : currentDailyIds;

/* ============================================================
   The twelve functions the UI calls. Same names, same arguments,
   same JSON strings out.
   ============================================================ */
const API = {};

API.getState = async function (user, date) {
  const uid = await uidFor(user);
  const mine = uid === ME.id;
  const habits = await habitsOf(uid, false);
  const dailyIds = habits.filter(h => h.cadence === 'daily').map(h => h.id);

  const all = await daysOf(uid);
  const byDate = {}; all.forEach(r => { byDate[r.date] = r; });
  const row = byDate[date];

  let day = { checked: {}, rating: '', note: '', tasks: '', prayer: '' };
  if (row) day.checked = row.checked || {};
  if (mine) {
    const { data: p } = await sb.from('day_private').select('*')
      .eq('user_id', uid).eq('date', date).maybeSingle();
    if (p) { day.rating = p.rating || ''; day.note = p.why || ''; day.tasks = p.tasks || ''; day.prayer = p.prayer || ''; }
  }

  // weekly habits satisfied this week (Mon-Sun)
  const weekDone = {};
  const weekly = habits.filter(h => h.cadence === 'weekly');
  if (weekly.length) {
    const d = dnum(date), mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    all.forEach(r => {
      const rd = dnum(r.date);
      if (rd >= mon && rd <= d) weekly.forEach(h => { if (r.checked && r.checked[h.id]) weekDone[h.id] = true; });
    });
  }

  const last7 = [];
  const c = dnum(date);
  for (let j = 6; j >= 0; j--) {
    const dt = new Date(c); dt.setDate(c.getDate() - j);
    const k = dayKey(dt), r = byDate[k];
    last7.push({ date: k, dow: dt.getDay(), pct: r ? pctOf(r.checked, idsForDay(r, dailyIds)) : null });
  }

  let birth = '', needGuide = false;
  if (mine) {
    const { data: pp } = await sb.from('profile_private').select('birth_date,guide_seen').eq('id', uid).maybeSingle();
    if (pp) { birth = pp.birth_date || ''; needGuide = !pp.guide_seen; }
  }

  return JSON.stringify({
    habits: habits.map(toUiHabit), day, weekDone, last7,
    verse: 'Proverbs 27:17 - As iron sharpens iron, so one man sharpens another.',
    birth, needGuide
  });
};

API.saveDay = async function (user, date, checkedJson, rating, note, tasks, prayer) {
  const uid = ME.id;                       // you can only ever write your own day
  let checked = {}; try { checked = JSON.parse(checkedJson || '{}'); } catch (e) {}
  const habits = await habitsOf(uid, false);
  const dailyIds = habits.filter(h => h.cadence === 'daily').map(h => h.id);
  const floorIds = habits.filter(h => h.cadence === 'daily' && h.tier === 'floor').map(h => h.id);

  const { data: existing } = await sb.from('days').select('active_set')
    .eq('user_id', uid).eq('date', date).maybeSingle();

  // stamp the scoring set once; keep TODAY fresh while the day is still open
  const stamped = (existing && existing.active_set && existing.active_set.length && date !== todayKey())
    ? existing.active_set : dailyIds;

  const e1 = (await sb.from('days').upsert({
    user_id: uid, date,
    checked, active_set: stamped,
    pct: pctOf(checked, stamped),
    floor_pct: floorIds.length ? pctOf(checked, floorIds) : null
  }, { onConflict: 'user_id,date' })).error;
  if (e1) throw e1;

  const e2 = (await sb.from('day_private').upsert({
    user_id: uid, date,
    rating: rating ? Number(rating) : null,
    why: note || null, tasks: tasks || null, prayer: prayer || null
  }, { onConflict: 'user_id,date' })).error;
  if (e2) throw e2;

  return API.getState(user, date);
};

API.getStats = async function (user) {
  const uid = await uidFor(user);
  const habits = await habitsOf(uid, false);
  const dailyH = habits.filter(h => h.cadence === 'daily');
  const dailyIds = dailyH.map(h => h.id);
  const all = await daysOf(uid);

  let ratings = {};
  if (uid === ME.id) {
    const { data } = await sb.from('day_private').select('date,rating').eq('user_id', uid);
    (data || []).forEach(r => { if (r.rating) ratings[r.date] = r.rating; });
  }

  const days = all.map(r => ({ date: r.date, pct: pctOf(r.checked, idsForDay(r, dailyIds)), rating: ratings[r.date] || null }));

  const monthly = {}, yearly = {};
  days.forEach(d => {
    const m = d.date.slice(0, 7), y = d.date.slice(0, 4);
    (monthly[m] = monthly[m] || { p: [], r: [] }).p.push(d.pct);
    if (d.rating) monthly[m].r.push(d.rating);
    (yearly[y] = yearly[y] || { p: [], r: [] }).p.push(d.pct);
    if (d.rating) yearly[y].r.push(d.rating);
  });
  const avg = a => a.length ? Math.round(10 * a.reduce((s, x) => s + x, 0) / a.length) / 10 : null;
  const roll = o => Object.keys(o).sort().map(k => ({ k, pct: avg(o[k].p), rating: avg(o[k].r) }));

  // per-habit: denominator is days the habit was ACTIVE, not every logged day
  const recent = all.slice(-30);
  const perHabit = dailyH.map(h => {
    const elig = recent.filter(r => idsForDay(r, dailyIds).indexOf(h.id) >= 0);
    const hit = elig.filter(r => r.checked && r.checked[h.id]).length;
    return { name: h.name, group: h.group_name, days: elig.length, pct: elig.length ? Math.round(100 * hit / elig.length) : 0 };
  }).sort((a, b) => a.pct - b.pct);

  return JSON.stringify({ daily: days, monthly: roll(monthly), yearly: roll(yearly), perHabit, compare: [] });
};

API.getWeek = async function (user, anchor) {
  const uid = await uidFor(user);
  const habits = await habitsOf(uid, false);
  const dailyIds = habits.filter(h => h.cadence === 'daily').map(h => h.id);
  const all = await daysOf(uid);
  const byDate = {}; all.forEach(r => { byDate[r.date] = r; });
  const a = dnum(anchor), mon = new Date(a);
  mon.setDate(a.getDate() - ((a.getDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const k = dayKey(d), rec = byDate[k];
    out.push({ date: k, dow: d.getDay(), dnum: d.getDate(),
               checked: rec ? rec.checked : {},
               pct: rec ? pctOf(rec.checked, idsForDay(rec, dailyIds)) : null });
  }
  return JSON.stringify({ habits: habits.map(toUiHabit), days: out });
};

/* The accountability board. Percentages and checkmarks only - the
   journal lives in a table this query cannot reach, by database rule. */
API.getGroup = async function () {
  const { data: mine } = await sb.from('circle_members').select('circle_id').eq('user_id', ME.id);
  const cids = (mine || []).map(r => r.circle_id);
  let ids = [ME.id];
  if (cids.length) {
    const { data: mates } = await sb.from('circle_members').select('user_id').in('circle_id', cids);
    ids = Array.from(new Set((mates || []).map(r => r.user_id).concat([ME.id])));
  }
  const { data: profs } = await sb.from('profiles').select('id,handle,display_name').in('id', ids);
  const today = todayKey(), mPref = today.slice(0, 7), yPref = today.slice(0, 4);
  const out = [];
  for (const p of (profs || [])) {
    const habits = await habitsOf(p.id, false);
    const dailyIds = habits.filter(h => h.cadence === 'daily').map(h => h.id);
    const rows = await daysOf(p.id);
    const byDate = {}; rows.forEach(r => { byDate[r.date] = r; });

    const base = dnum(today), last7 = [];
    let sum = 0, n = 0;
    for (let j = 6; j >= 0; j--) {
      const d = new Date(base); d.setDate(base.getDate() - j);
      const k = dayKey(d), r = byDate[k];
      const pc = r ? pctOf(r.checked, idsForDay(r, dailyIds)) : null;
      last7.push({ date: k, dow: d.getDay(), pct: pc });
      if (pc !== null) { sum += pc; n++; }
    }
    let streak = 0, c = new Date(base);
    const todayPct = byDate[today] ? pctOf(byDate[today].checked, idsForDay(byDate[today], dailyIds)) : null;
    if (todayPct === null || todayPct < 80) c.setDate(c.getDate() - 1);
    for (;;) {
      const ck = dayKey(c), r = byDate[ck];
      if (r && pctOf(r.checked, idsForDay(r, dailyIds)) >= 80) { streak++; c.setDate(c.getDate() - 1); } else break;
    }
    let mS = 0, mN = 0, yS = 0, yN = 0;
    rows.forEach(r => {
      const p2 = pctOf(r.checked, idsForDay(r, dailyIds));
      if (r.date.slice(0, 7) === mPref) { mS += p2; mN++; }
      if (r.date.slice(0, 4) === yPref) { yS += p2; yN++; }
    });
    out.push({ user: p.handle, name: p.display_name, today: todayPct,
               week: n ? Math.round(sum / n) : null,
               month: mN ? Math.round(mS / mN) : null,
               year: yN ? Math.round(yS / yN) : null, streak, last7 });
  }
  return JSON.stringify(out);
};

API.getMemberDay = async function (viewer, pin, target, date) {
  const uid = await uidFor(target);
  const habits = await habitsOf(uid, false);
  const dailyIds = habits.filter(h => h.cadence === 'daily').map(h => h.id);
  const { data: prof } = await sb.from('profiles').select('display_name').eq('id', uid).maybeSingle();
  const { data: row } = await sb.from('days').select('checked,active_set').eq('user_id', uid).eq('date', date).maybeSingle();
  const checked = row ? (row.checked || {}) : {};
  return JSON.stringify({
    name: prof ? prof.display_name : target, date,
    habits: habits.map(h => ({ id: h.id, group: h.group_name, name: h.name, cadence: h.cadence })),
    checked, pct: pctOf(checked, idsForDay(row, dailyIds))
  });
};

API.getHabitsFull = async function (user) {
  const uid = await uidFor(user);
  const habits = await habitsOf(uid, true);
  return JSON.stringify(habits.map(h => ({
    id: h.id, group: h.group_name, name: h.name, cadence: h.cadence,
    active: h.active ? 'yes' : 'no', link: h.link || ''
  })));
};

API.updateHabits = async function (user, habitsJson) {
  const uid = ME.id;
  const list = JSON.parse(habitsJson || '[]').filter(x => x && x.name);
  const existing = await habitsOf(uid, true);
  const keepIds = new Set();

  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    const row = {
      user_id: uid, name: x.name, group_name: x.group || 'Standards',
      cadence: x.cadence === 'weekly' ? 'weekly' : 'daily',
      active: String(x.active) !== 'no', link: x.link || null, sort_order: i
    };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(x.id || ''));
    if (isUuid) {
      keepIds.add(x.id);
      const { error } = await sb.from('habits').update(row).eq('id', x.id).eq('user_id', uid);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('habits').insert(row).select('id').single();
      if (error) throw error;
      keepIds.add(data.id);
    }
  }
  // Anything removed in the editor is ARCHIVED, never deleted - a habit that
  // scored past days must keep existing or that history stops making sense.
  for (const h of existing) {
    if (!keepIds.has(h.id)) {
      await sb.from('habits').update({ active: false, archived_at: new Date().toISOString() }).eq('id', h.id).eq('user_id', uid);
    }
  }
  return API.getState(user, todayKey());
};

API.setBirth = async function (user, pin, birth) {
  const m = String(birth || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return JSON.stringify({ ok: false, err: 'Use MM/DD/YYYY.' });
  const iso = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const { error } = await sb.from('profile_private').update({ birth_date: iso }).eq('id', ME.id);
  if (error) return JSON.stringify({ ok: false, err: error.message });
  return JSON.stringify({ ok: true, birth: iso });
};

API.markGuideSeen = async function () {
  await sb.from('profile_private').update({ guide_seen: true }).eq('id', ME.id);
  return '1';
};

API.loginLink = async function () { return JSON.stringify({ ok: false }); };
API.register  = async function () { return JSON.stringify({ ok: false, err: 'Use the sign-in screen.' }); };

/* ---------- the shim: same call shape the UI has always used ---------- */
function runner(succ, fail) {
  return new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler') return f => runner(f, fail);
      if (name === 'withFailureHandler') return f => runner(succ, f);
      if (name === 'withUserObject')     return () => runner(succ, fail);
      if (typeof name !== 'string') return undefined;
      return function () {
        const args = Array.prototype.slice.call(arguments);
        const fn = API[name];
        if (!fn) { const e = new Error('UNKNOWN_FN: ' + name); fail ? fail(e) : console.error(e); return; }
        Promise.resolve()
          .then(() => fn.apply(null, args))
          .then(r => { if (succ) succ(r); })
          .catch(e => { fail ? fail(e) : console.error(name, e); });
      };
    }
  });
}
window.google = window.google || {};
window.google.script = {
  run: runner(null, null),
  host: { close() {}, setHeight() {}, setWidth() {} },
  url: { getLocation(cb) { cb({ parameter: {}, hash: location.hash }); } }
};

window.__SB = sb;
window.__API = API;
window.__setMe = p => { ME = p; };
window.__getMe = () => ME;

})();
