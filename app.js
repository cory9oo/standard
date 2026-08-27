
/* Identity comes from the signed-in session, not from a link parameter.
   auth.js sets window.USER before it calls __BOOT(). */
/* The version on screen is read back from the server, never typed by hand.
   A number a human has to remember to update is wrong exactly when it matters:
   it read '2026-08-27.1' for an hour while the server was serving a build that
   contained neither of the fixes we were testing. */
var BUILD = 'checking…';
(function () {
  function stamp(txt) {
    BUILD = txt;
    var bt = document.getElementById('buildTag');
    if (bt) bt.textContent = txt;
  }
  try {
    fetch('./index.html', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      var lm = r.headers.get('last-modified');
      if (!lm) { stamp('live'); return; }
      var d = new Date(lm);
      stamp(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
            d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    }).catch(function () { stamp('offline copy'); });
  } catch (e) { stamp('live'); }
})();
var USER = window.USER || '';
var JOIN = false;
var BASE_URL = location.origin + location.pathname;
var K = '';
var PIN = K;   // personal-link token auto-unlocks; falls back to a stored PIN
if (!PIN) { try { PIN = localStorage.getItem('ht_pin_' + USER) || ''; } catch (e) {} }
var state = {habits: [], day: {checked: {}, rating: '', note: '', tasks: '', prayer: ''}, weekDone: {}, last7: []};
var charts = {}, statsCache = null, calYM = null, calViewMode = 'm', editCache = null, lastPct = -1, curView = 'today';
var WDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var WSHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var GROUPS_ORDER = ['Morning','Afternoon','Night','Standards','Weekly'];

function key(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
var TODAY = key(new Date());
var selDate = TODAY;

/* Letter-grade colors: F red, D orange, C yellow, B light green, A green, A+ bright green */
function band(p){
  if (p === null || p === undefined) return [null, null];
  if (p >= 100) return ['#00E676', '#00311a'];
  if (p >= 90)  return ['#3FA05A', '#fff'];
  if (p >= 80)  return ['#7FBF5A', '#12300f'];
  if (p >= 70)  return ['#E6C84A', '#3a3005'];
  if (p >= 60)  return ['#E08B3C', '#3a2305'];
  return ['#E05252', '#fff'];
}

function setHeaderDate(){
  var d = new Date(selDate + 'T12:00:00');
  document.getElementById('dateLabel').textContent = WDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  document.getElementById('backToday').style.display = selDate === TODAY ? 'none' : '';
  document.getElementById('progLabel').textContent = selDate === TODAY ? 'Completion today' : 'Completion - ' + WSHORT[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
}

function ring(p){
  var arc = document.getElementById('ringArc');
  var c = band(p);
  arc.setAttribute('stroke', c[0]);
  arc.setAttribute('stroke-dashoffset', String(201 - 201 * p / 100));
  document.getElementById('ringPct').textContent = p + '%';
  if (p !== lastPct && p === 100) { var w = document.getElementById('ringWrap'); w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop'); }
  lastPct = p;
}

function renderStrip(){
  var html = '';
  (state.last7 || []).forEach(function(d){
    var c = band(d.pct);
    var style = d.pct === null ? '' : 'style="background:' + c[0] + ';color:' + c[1] + ';border-color:transparent"';
    var parts = d.date.split('-');
    var mdY = Number(parts[1]) + '/' + Number(parts[2]) + '/' + parts[0].slice(2);
    html += '<div class="dot' + (d.date === selDate ? ' sel' : '') + '" onclick="loadDay(\'' + d.date + '\')"><div class="c" ' + style + '>' +
            (d.pct === null ? '&middot;' : d.pct) + '</div><div class="w">' + WSHORT[d.dow] + '<br>' + mdY + '</div></div>';
  });
  document.getElementById('strip').innerHTML = html;
}

function render(){
  setHeaderDate();
  var groups = {};
  state.habits.forEach(function(h){ (groups[h.group] = groups[h.group] || []).push(h); });
  var html = '';
  GROUPS_ORDER.concat(Object.keys(groups).filter(function(g){ return GROUPS_ORDER.indexOf(g) < 0; })).forEach(function(g){
    if (!groups[g]) return;
    var done = groups[g].filter(function(h){ return h.cadence === 'weekly' ? (state.weekDone[h.id] || state.day.checked[h.id]) : state.day.checked[h.id]; }).length;
    html += '<div class="group"><b>' + g + '</b><span>' + done + '/' + groups[g].length + '</span></div>';
    groups[g].forEach(function(h){
      var isDone = h.cadence === 'weekly' ? (state.weekDone[h.id] || state.day.checked[h.id]) : state.day.checked[h.id];
      var missCls = (!isDone && h.cadence !== 'weekly') ? ' miss' : '';
      html += '<div class="item' + (isDone ? ' done' : '') + missCls + '" onclick="toggle(\'' + h.id + '\')">' +
              '<div class="box">' + (isDone ? '&#10003;' : '') + '</div><div class="name">' + h.name + '</div>' +
              (h.cadence === 'weekly' ? '<div class="pill">WEEKLY</div>' : '') +
              (h.link ? '<a class="why" href="' + h.link + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#128279;</a>' : '') +
              '</div>';
    });
  });
  document.getElementById('list').innerHTML = html;
  var daily = state.habits.filter(function(h){ return h.cadence === 'daily'; });
  var done = daily.filter(function(h){ return state.day.checked[h.id]; }).length;
  var p = Math.round(100 * done / Math.max(daily.length, 1));
  ring(p);
  document.getElementById('ringCt').textContent = done + '/' + daily.length;
  var el = document.getElementById('pct'), c = band(p);
  el.textContent = done + '/' + daily.length + ' - ' + p + '%';
  el.style.background = c[0]; el.style.color = c[1];
  var missChip = document.getElementById('missChip');
  var missed = daily.length - done;
  if (missed > 0) { missChip.style.display = ''; missChip.textContent = 'Missed ' + missed; }
  else missChip.style.display = 'none';
  renderStrip();
  var rr = '';
  for (var i = 1; i <= 10; i++) rr += '<button class="rbtn' + (Number(state.day.rating) === i ? ' on' : '') + '" onclick="setR(' + i + ')">' + i + '</button>';
  document.getElementById('ratingRow').innerHTML = rr;
  /* never repaint a textarea the user is typing in - it would reset text + cursor */
  var noteEl = document.getElementById('note'), tasksEl = document.getElementById('tasks'), prayerEl = document.getElementById('prayer');
  if (document.activeElement !== noteEl) noteEl.value = state.day.note || '';
  if (document.activeElement !== tasksEl) tasksEl.value = state.day.tasks || '';
  if (document.activeElement !== prayerEl) prayerEl.value = state.day.prayer || '';
  autoGrow_(noteEl); autoGrow_(tasksEl); autoGrow_(prayerEl);
}

/* ===== instant auto-save engine =====
   Every tap saves: optimistic UI + local cache sync immediately, server write debounced 350ms,
   and a hard flush before any view change / day change / app background. No Save button. */
var dirty = false, saving = false, t = null;
function autoGrow_(el){
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight + 2, 260) + 'px';   // grows with the text, never shrinks below default
}
function markDirty(){
  /* textareas are the source of truth on every keystroke - state tracks them instantly,
     so a re-render (tapping a habit / rating mid-typing) can never wipe typed text */
  var n = document.getElementById('note'), tk = document.getElementById('tasks'), pr = document.getElementById('prayer');
  if (n) { state.day.note = n.value; autoGrow_(n); }
  if (tk) { state.day.tasks = tk.value; autoGrow_(tk); }
  if (pr) { state.day.prayer = pr.value; autoGrow_(pr); }
  dirty = true; setSaveState('...'); clearTimeout(t); t = setTimeout(flushSave, 800);
}
function setSaveState(txt){ var el = document.getElementById('saveState'); if (el) el.textContent = txt; }
function loadDay(date){
  flushSave(function(){
    selDate = date;
    google.script.run.withSuccessHandler(function(res){ state = JSON.parse(res); render(); show('today'); }).getState(USER, selDate, PIN);
  });
}
function deskRefresh_(){   // one-screen mode: calendar + charts track every input
  if (isDesktop() && statsCache) {
    renderCalRoot(statsCache);
    clearTimeout(window._chT); window._chT = setTimeout(function(){ renderCharts(statsCache); }, 900);
  }
}
function toggle(id){
  state.day.checked[id] = !state.day.checked[id];
  dirty = true; syncLocal(); render();
  deskRefresh_();
  clearTimeout(t); t = setTimeout(flushSave, 350);
}
function setR(n){ state.day.rating = n; dirty = true; syncLocal(); render(); deskRefresh_(); clearTimeout(t); t = setTimeout(flushSave, 350); }
function syncLocal(){
  var daily = state.habits.filter(function(h){ return h.cadence === 'daily'; });
  var done = daily.filter(function(h){ return state.day.checked[h.id]; }).length;
  var p = Math.round(100 * done / Math.max(daily.length, 1));
  (state.last7 || []).forEach(function(d){ if (d.date === selDate) d.pct = p; });
  if (statsCache) {   // calendar + trends reflect the tap instantly
    var hit = null;
    statsCache.daily.forEach(function(d){ if (d.date === selDate) hit = d; });
    if (hit) { hit.pct = p; if (state.day.rating) hit.rating = Number(state.day.rating); }
    else { statsCache.daily.push({ date: selDate, pct: p, rating: Number(state.day.rating) || null });
           statsCache.daily.sort(function(a, b){ return a.date < b.date ? -1 : 1; }); }
  }
}
function flushSave(cb){
  cb = cb || function(){};
  if (!dirty) return cb();
  if (saving) { setTimeout(function(){ flushSave(cb); }, 250); return; }
  dirty = false; saving = true;
  state.day.note = document.getElementById('note').value;
  state.day.tasks = document.getElementById('tasks').value;
  state.day.prayer = document.getElementById('prayer').value;
  setSaveState('saving...');
  var payloadDate = selDate;
  google.script.run.withSuccessHandler(function(res){
    saving = false;
    if (payloadDate === selDate && !dirty) { state = JSON.parse(res); render(); }
    setSaveState('saved ✓');
    cb();
  }).withFailureHandler(function(){
    saving = false; dirty = true; setSaveState('offline - will retry');
    setTimeout(function(){ flushSave(); }, 2500);
    cb();
  }).saveDay(USER, payloadDate, JSON.stringify(state.day.checked), state.day.rating, state.day.note, state.day.tasks, state.day.prayer, PIN);
}
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') { flushSave(); flushHabits(); } });

function isDesktop(){ return window.innerWidth >= 1100; }
/* Desktop reparenting: move blocks into 3 purpose columns (ACT | TRACK | TRAJECTORY),
   remember where each came from, and restore the phone DOM exactly on resize down. */
var deskMoved = [];
function moveTo_(col, id){
  var n = document.getElementById(id);
  if (!n) return;
  deskMoved.push({ n: n, p: n.parentNode, s: n.nextSibling });
  col.appendChild(n);
}
function buildDesk_(){
  if (document.getElementById('colA')) return;
  var main = document.getElementById('main');
  ['colA','colB','colC'].forEach(function(id){
    var c = document.createElement('div'); c.id = id; main.appendChild(c);
  });
  var A = document.getElementById('colA'), B = document.getElementById('colB'), C = document.getElementById('colC');
  moveTo_(A, 'strip');                 // last-7 jump strip lives with the action column
  moveTo_(A, 'viewToday');             // ACT: checklist + rating/why/tasks
  ['grpScore','sbRow1','sbRow2','viewCal','grpHabits','cardHabits','viewGroup']
    .forEach(function(id){ moveTo_(B, id); });   // TRACK: standing, calendar, weak spots, accountability
  ['grpComp','cardComp','cardCompM','cardCompY','grpRate','cardRate','cardRateM','viewLife']
    .forEach(function(id){ moveTo_(C, id); });   // TRAJECTORY: completion + rating over time, then LIFE fills the column
}
function tearDesk_(){
  for (var i = deskMoved.length - 1; i >= 0; i--) {
    var m = deskMoved[i]; m.p.insertBefore(m.n, m.s);
  }
  deskMoved = [];
  ['colA','colB','colC'].forEach(function(id){
    var c = document.getElementById(id); if (c) c.remove();
  });
}
function applyLayout(){
  var wasDesktop = document.body.classList.contains('desktop');
  var desk = isDesktop();
  document.body.classList.toggle('desktop', desk);
  if (desk) {
    document.body.classList.remove('editing');
    buildDesk_();
    withStats(function(s){ renderCalRoot(s); renderCharts(s); renderLife(); });
    renderGroup();
  } else if (wasDesktop) {
    document.body.classList.remove('editing');
    tearDesk_();
    show(curView === 'edit' ? 'today' : curView);
  }
}
window.addEventListener('resize', function(){ clearTimeout(window._rzT); window._rzT = setTimeout(applyLayout, 250); });

function show(which){
  if (which !== 'today') flushSave();
  if (which !== 'edit' && curView === 'edit') flushHabits();
  if (isDesktop()) {   // one-screen mode: only the editor toggles; everything else is always on screen
    if (which === 'edit') {
      var editing = document.body.classList.toggle('editing');
      document.getElementById('tabEdit').className = 'gear' + (editing ? ' on' : '');
      if (editing) loadEditor();
      else { curView = 'today'; withStats(function(s){ renderCalRoot(s); renderCharts(s); }); render(); }
      return;
    }
    curView = which;
    // Everything is already on screen in one-view mode, so take them to it
    // rather than doing nothing - a button that does nothing reads as broken.
    var target = which === 'progress' ? 'viewCal' : which === 'group' ? 'viewGroup' : 'viewToday';
    var el = document.getElementById(target);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ['Today','Prog','Group'].forEach(function(n){
      var t = document.getElementById('tab' + n); if (t) t.className = 'tab';
    });
    var on = document.getElementById('tab' + (which === 'today' ? 'Today' : which === 'group' ? 'Group' : 'Prog'));
    if (on) on.className = 'tab on';
    return;
  }
  curView = which;
  ['Today','Prog','Group'].forEach(function(n){ document.getElementById('tab' + n).className = 'tab'; });
  document.getElementById('tabEdit').className = 'gear';
  var prog = which === 'progress';
  document.getElementById('viewToday').style.display = which === 'today' ? '' : 'none';
  document.getElementById('viewCal').style.display = prog ? '' : 'none';
  document.getElementById('viewStats').style.display = prog ? '' : 'none';
  document.getElementById('viewLife').style.display = prog ? '' : 'none';
  document.getElementById('viewGroup').style.display = which === 'group' ? '' : 'none';
  document.getElementById('viewEdit').style.display = which === 'edit' ? '' : 'none';
  if (which === 'edit') document.getElementById('tabEdit').className = 'gear on';
  else document.getElementById('tab' + (which === 'today' ? 'Today' : which === 'group' ? 'Group' : 'Prog')).className = 'tab on';
  if (which === 'today') render();
  else if (prog) withStats(function(st){ renderCalRoot(st); renderCharts(st); renderLife(); });
  else if (which === 'group') renderGroup();
  else if (which === 'edit') { var w=document.getElementById('whoAmI'); if(w) w.textContent=(window.__ME_NAME||'')+' - @'+(window.USER||''); loadEditor(); }
}
function withStats(fn){
  if (statsCache) return fn(statsCache);
  google.script.run.withSuccessHandler(function(res){ statsCache = JSON.parse(res); fn(statsCache); }).getStats(USER, PIN);
}
function dayMap(s){ var m = {}; s.daily.forEach(function(d){ m[d.date] = d; }); return m; }
function streaks(s){
  var best = 0, run = 0, prev = null;
  s.daily.forEach(function(d){
    var dt = new Date(d.date + 'T12:00:00');
    var contiguous = prev && (dt - prev) === 86400000;
    run = (d.pct >= 80) ? (contiguous ? run + 1 : 1) : 0;
    if (run > best) best = run;
    prev = dt;
  });
  var m = dayMap(s), c = new Date(), cur = 0;
  while (true) {
    var k = key(c);
    var d = m[k];
    if (d && d.pct >= 80) { cur++; c.setDate(c.getDate() - 1); }
    else if (k === TODAY) { c.setDate(c.getDate() - 1); }
    else break;
  }
  return [cur, best];
}

/* ==== Calendar (Month / Year) ==== */
function calMode(mode){
  calViewMode = mode;
  document.getElementById('segM').className = mode === 'm' ? 'on' : '';
  document.getElementById('segY').className = mode === 'y' ? 'on' : '';
  withStats(renderCalRoot);
}
function renderCalRoot(s){
  if (!calYM) { var n2 = new Date(); calYM = [n2.getFullYear(), n2.getMonth()]; }
  if (calViewMode === 'm') { document.getElementById('calGrid').style.display = ''; document.getElementById('yearBox').style.display = 'none';
    document.getElementById('calHint').textContent = 'Tap a day to open it - view and edit that day\'s checklist.'; renderMonth(s); }
  else { document.getElementById('calGrid').style.display = 'none'; document.getElementById('yearBox').style.display = '';
    document.getElementById('calHint').textContent = 'All twelve months - tap a month to zoom in.'; renderYear(s); }
}
function renderMonth(s){
  document.getElementById('calTitle').textContent = MONTHS[calYM[1]] + ' ' + calYM[0];
  var m = dayMap(s);
  var first = new Date(calYM[0], calYM[1], 1);
  var nDays = new Date(calYM[0], calYM[1] + 1, 0).getDate();
  var html = '';
  WSHORT.forEach(function(w){ html += '<div class="dow">' + w + '</div>'; });
  for (var b = 0; b < first.getDay(); b++) html += '<div></div>';
  for (var d = 1; d <= nDays; d++) {
    var k = calYM[0] + '-' + String(calYM[1] + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var rec = m[k];
    var today = k === TODAY ? ' today' : '';
    var click = ' onclick="loadDay(\'' + k + '\')"';
    if (rec) {
      var c = band(rec.pct);
      html += '<div class="cell' + today + '"' + click + ' style="background:' + c[0] + ';color:' + c[1] + ';border-color:transparent"><div>' + d + '</div><div class="p">' + rec.pct + '%</div></div>';
    } else html += '<div class="cell' + today + '"' + click + '><div>' + d + '</div></div>';
  }
  document.getElementById('calGrid').innerHTML = html;
}
function renderYear(s){
  var y = calYM[0];
  document.getElementById('calTitle').textContent = String(y);
  var m = dayMap(s);
  var html = '';
  for (var mo = 0; mo < 12; mo++) {
    var first = new Date(y, mo, 1);
    var nDays = new Date(y, mo + 1, 0).getDate();
    var mg = '';
    for (var b = 0; b < first.getDay(); b++) mg += '<div class="md" style="background:transparent"></div>';
    for (var d = 1; d <= nDays; d++) {
      var k = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var rec = m[k];
      if (rec) { var c = band(rec.pct); mg += '<div class="md" style="background:' + c[0] + '"></div>'; }
      else mg += '<div class="md">' + d + '</div>';
    }
    html += '<div class="mini" onclick="zoomMonth(' + mo + ')"><h4>' + MONTHS[mo].slice(0, 3) + '</h4><div class="miniGrid">' + mg + '</div></div>';
  }
  document.getElementById('yearBox').innerHTML = html;
}
function zoomMonth(mo){ calYM[1] = mo; calMode('m'); }
function calMove(dir){
  if (calViewMode === 'm') {
    calYM[1] += dir;
    if (calYM[1] < 0) { calYM[1] = 11; calYM[0]--; }
    if (calYM[1] > 11) { calYM[1] = 0; calYM[0]++; }
  } else calYM[0] += dir;
  withStats(renderCalRoot);
}

/* ==== Trends ==== */
function line(id, labels, data, color, max, opts){
  if (typeof Chart === 'undefined') return;
  opts = opts || {};
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type: 'line',
    data: { labels: labels, datasets: [{ data: data, borderColor: color, borderWidth: 2,
      pointRadius: opts.pointRadius || 2, pointHoverRadius: (opts.pointRadius || 2) + 3,
      pointBackgroundColor: color, tension: .25, spanGaps: true, clip: false }] },
    options: { plugins: { legend: { display: false } }, animation: false,
      onClick: opts.onClick || null,
      /* clip:false + top padding: a 10/10 or 100% point draws fully into the padding
         instead of being cut off, while the axis still reads a clean 0..max */
      layout: { padding: { top: 10 } },
      scales: { y: { min: opts.yMin !== undefined ? opts.yMin : 0, max: max,
                     grid: { color: '#27292b' },
                     ticks: { color: '#93a098' } },
                x: { grid: { display: false }, ticks: { color: '#93a098', maxTicksLimit: opts.maxTicks || 12 } } } }
  });
}

/* Month-scoped day charts (rating + completion): a point per day, tap a point -> open that day.
   NOTE: y-axis headroom + top padding keep 10/10 and 100% points from clipping at the top. */
function monthDays(ym, m, field){
  var nDays = new Date(ym[0], ym[1] + 1, 0).getDate();
  var labels = [], data = [], dates = [];
  for (var d = 1; d <= nDays; d++) {
    var k = ym[0] + '-' + String(ym[1] + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    labels.push(d); dates.push(k);
    data.push(m[k] && m[k][field] !== null && m[k][field] !== undefined ? m[k][field] : null);
  }
  return { labels: labels, data: data, dates: dates };
}
var ratingYM = null, compYM = null;
function ratingMove(dir){ ratingYM = bumpYM(ratingYM, dir); withStats(renderRatingMonth); }
function compMove(dir){ compYM = bumpYM(compYM, dir); withStats(renderCompMonth); }
function bumpYM(ym, dir){
  ym[1] += dir;
  if (ym[1] < 0) { ym[1] = 11; ym[0]--; }
  if (ym[1] > 11) { ym[1] = 0; ym[0]++; }
  return ym;
}
function renderRatingMonth(s){
  if (!ratingYM) { var n = new Date(); ratingYM = [n.getFullYear(), n.getMonth()]; }
  document.getElementById('ratingTitle').textContent = MONTHS[ratingYM[1]] + ' ' + ratingYM[0];
  var md = monthDays(ratingYM, dayMap(s), 'rating');
  line('cRating', md.labels, md.data, '#3FA05A', 10, {
    pointRadius: 5, maxTicks: 16,
    onClick: function(evt, els){ if (els && els.length) loadDay(md.dates[els[0].index]); }
  });
}
function renderCompMonth(s){
  if (!compYM) { var n = new Date(); compYM = [n.getFullYear(), n.getMonth()]; }
  document.getElementById('compTitle').textContent = MONTHS[compYM[1]] + ' ' + compYM[0];
  var md = monthDays(compYM, dayMap(s), 'pct');
  line('cDaily', md.labels, md.data, '#4f8f63', 100, {
    pointRadius: 5, maxTicks: 16,
    onClick: function(evt, els){ if (els && els.length) loadDay(md.dates[els[0].index]); }
  });
}
function fullYearMonthly(s, field){
  var y = new Date().getFullYear();
  var by = {}; s.monthly.forEach(function(mm){ by[mm.k] = mm; });
  var labels = [], data = [];
  for (var mo = 1; mo <= 12; mo++) {
    var k = y + '-' + String(mo).padStart(2, '0');
    labels.push(MONTHS[mo - 1].slice(0, 3));
    data.push(by[k] ? by[k][field] : null);
  }
  return { labels: labels, data: data };
}
function renderCharts(s){
  var st = streaks(s);
  document.getElementById('stCur').textContent = st[0] + 'd';
  document.getElementById('stBest').textContent = st[1] + 'd';
  var last60 = s.daily.slice(-60), last30 = s.daily.slice(-30);
  var a30 = last30.length ? Math.round(last30.reduce(function(x, d){ return x + d.pct; }, 0) / last30.length) : 0;
  var el30 = document.getElementById('s30'), c30 = band(a30);
  el30.textContent = a30 + '%'; el30.style.color = c30[0];
  var yr = s.yearly[s.yearly.length - 1];
  document.getElementById('sYr').textContent = yr ? yr.pct + '%' : '-';
  var rts = s.daily.filter(function(d){ return d.rating; });
  document.getElementById('sRate').textContent = rts.length ?
    (Math.round(10 * rts.reduce(function(x, d){ return x + d.rating; }, 0) / rts.length) / 10) : '-';
  renderCompMonth(s);
  var fm = fullYearMonthly(s, 'pct');
  line('cMonthly', fm.labels, fm.data, '#4f8f63', 100);
  var yt = '';
  s.yearly.forEach(function(yy){
    var c = band(yy.pct);
    yt += '<div class="stat"><div class="v" style="color:' + c[0] + '">' + yy.pct + '%</div><div class="l">' + yy.k + (yy.rating ? ' - RATING ' + yy.rating : '') + '</div></div>';
  });
  document.getElementById('yearlyTiles').innerHTML = yt || '<div class="sub">No data yet</div>';
  renderRatingMonth(s);
  var fr = fullYearMonthly(s, 'rating');
  line('cRatingM', fr.labels, fr.data, '#3FA05A', 10);
  var hb = '';
  (s.perHabit || []).slice(0, 8).forEach(function(h){
    var c = band(h.pct);
    hb += '<div class="hbar"><div class="n">' + h.name + '</div>' +
          '<div class="track"><div class="fill" style="width:' + h.pct + '%;background:' + c[0] + '"></div></div>' +
          '<div class="v">' + h.pct + '%</div></div>';
  });
  document.getElementById('habitBars').innerHTML = hb || '<div class="sub">Log a few days first.</div>';
}

/* ==== Manage / edit habits (front-end editable, SlowBooks principle) ====
   Auto-saves exactly like the day view: every keystroke/change debounced, structural
   changes (add/delete/toggle/category/cadence) saved fast, flush on leaving the tab. */
var hDirty = false, hSaving = false, hT = null;
function setEditSaveState(txt){ var el = document.getElementById('editSaveState'); if (el) el.textContent = txt; }
function habitsDirty(fast){
  hDirty = true; setEditSaveState('...');
  clearTimeout(hT); hT = setTimeout(flushHabits, fast ? 350 : 900);
}
function flushHabits(cb){
  cb = cb || function(){};
  if (!hDirty) return cb();
  if (hSaving) { setTimeout(function(){ flushHabits(cb); }, 250); return; }
  hDirty = false; hSaving = true;
  setEditSaveState('saving...');
  google.script.run.withSuccessHandler(function(res){
    hSaving = false;
    state = JSON.parse(res); statsCache = null;   // day + calendar re-pull against the new list
    if (curView === 'today') render();
    setEditSaveState('saved ✓');
    cb();
  }).withFailureHandler(function(){
    hSaving = false; hDirty = true; setEditSaveState('offline - will retry');
    setTimeout(function(){ flushHabits(); }, 2500);
    cb();
  }).updateHabits(USER, JSON.stringify(editCache), PIN);
}
function loadEditor(){
  google.script.run.withSuccessHandler(function(res){ editCache = JSON.parse(res); renderEditor(); }).getHabitsFull(USER, PIN);
}
function renderEditor(){
  var html = '';
  editCache.forEach(function(h, i){
    html += '<div class="mrow">' +
      '<div class="r1"><input type="text" value="' + String(h.name).replace(/"/g, '&quot;') + '" oninput="editCache[' + i + '].name=this.value;habitsDirty()"></div>' +
      '<div class="r2">' +
        '<select onchange="editCache[' + i + '].group=this.value;habitsDirty(true)">' +
          GROUPS_ORDER.map(function(g){ return '<option' + (h.group === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') +
        '</select>' +
        '<select onchange="editCache[' + i + '].cadence=this.value;habitsDirty(true)">' +
          '<option value="daily"' + (h.cadence !== 'weekly' ? ' selected' : '') + '>daily</option>' +
          '<option value="weekly"' + (h.cadence === 'weekly' ? ' selected' : '') + '>weekly</option>' +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" style="width:auto"' + (h.active !== 'no' ? ' checked' : '') + ' onchange="editCache[' + i + '].active=this.checked?\'yes\':\'no\';budgetTick_(editCache);habitsDirty(true)">on</label>' +
        '<label class="minbox" title="minutes this costs on a normal day">'          + '<input type="number" min="0" max="600" step="5" value="' + (h.minutes || 0) + '" oninput="editCache[' + i + '].minutes=Math.max(0,parseInt(this.value,10)||0);budgetTick_(editCache);habitsDirty()">min</label>' +
        '<label class="floorbox" title="FLOOR: the part that is never missed, on any day"><input type="checkbox"' + (h.tier === 'floor' ? ' checked' : '') + ' onchange="editCache[' + i + '].tier=this.checked?&quot;floor&quot;:&quot;standard&quot;;budgetTick_(editCache);habitsDirty(true)">floor</label>' +
        '<button class="del" style="border-color:var(--line);color:var(--ink2);margin-left:auto" onclick="moveHabit(' + i + ',-1)">&#9650;</button>' +
        '<button class="del" style="border-color:var(--line);color:var(--ink2);margin-left:0" onclick="moveHabit(' + i + ',1)">&#9660;</button>' +
        '<button class="del" style="margin-left:0" onclick="editCache.splice(' + i + ',1);renderEditor();habitsDirty(true)">delete</button>' +
      '</div>' +
      '<div class="r1" style="margin:7px 0 0"><input type="text" placeholder="motivation link (optional)" value="' + String(h.link || '').replace(/"/g, '&quot;') + '" oninput="editCache[' + i + '].link=this.value;habitsDirty()"></div>' +
      '</div>';
  });
  document.getElementById('editList').innerHTML =
    (window.budgetBar_ ? window.budgetBar_(editCache) : '') + html;
}
function moveHabit(i, dir){
  var j = i + dir;
  if (j < 0 || j >= editCache.length) return;
  var t = editCache[i]; editCache[i] = editCache[j]; editCache[j] = t;
  renderEditor();
  habitsDirty(true);   // order is saved exactly as listed - Day view follows it
}
function addHabit(){
  editCache.push({ id: '', group: 'Standards', name: '', cadence: 'daily', active: 'yes', link: '', tier: 'standard', minutes: 0 });
  renderEditor();
  habitsDirty(true);
}

/* ===== group view ===== */
function renderGroup(){
  var el = document.getElementById('groupList');
  if (!el) return;
  el.innerHTML = '<div class="card sub">loading group...</div>';
  google.script.run.withSuccessHandler(function(res){
    var g = JSON.parse(res);
    var html = '';
    g.sort(function(a, b){ return (b.week || 0) - (a.week || 0); }).forEach(function(m){
      var tb = band(m.today), wb = band(m.week);
      var pills = '';
      m.last7.forEach(function(d){
        var c = d.pct === null ? null : band(d.pct);
        pills += '<div class="dot"><div class="c" style="' + (c ? 'background:' + c[0] + ';color:' + c[1] + ';border-color:transparent' : '') + '">' +
                 (d.pct === null ? '&middot;' : d.pct) + '</div><div class="w">' + WSHORT[d.dow] + '</div></div>';
      });
      var mb = band(m.month), yb = band(m.year);
      html += '<div class="card" style="margin:10px 16px;cursor:pointer" onclick="openMember(\'' + m.user + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<b style="font-size:15px">' + m.name + '</b>' +
          '<span style="display:flex;gap:6px;align-items:center"><span class="pill" style="font-weight:800">' + m.streak + 'd streak</span>' +
          '<span class="pill" style="color:var(--accent);border-color:var(--accent)">view &#8250;</span></span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:8px">' +
          '<div class="stat" style="padding:7px 4px"><div class="v" style="font-size:15px;color:' + (m.today === null ? 'var(--ink2)' : tb[0]) + '">' + (m.today === null ? '-' : m.today + '%') + '</div><div class="l">TODAY</div></div>' +
          '<div class="stat" style="padding:7px 4px"><div class="v" style="font-size:15px;color:' + (m.week === null ? 'var(--ink2)' : wb[0]) + '">' + (m.week === null ? '-' : m.week + '%') + '</div><div class="l">7-DAY</div></div>' +
          '<div class="stat" style="padding:7px 4px"><div class="v" style="font-size:15px;color:' + (m.month === null ? 'var(--ink2)' : mb[0]) + '">' + (m.month === null ? '-' : m.month + '%') + '</div><div class="l">MONTH</div></div>' +
          '<div class="stat" style="padding:7px 4px"><div class="v" style="font-size:15px;color:' + (m.year === null ? 'var(--ink2)' : yb[0]) + '">' + (m.year === null ? '-' : m.year + '%') + '</div><div class="l">YEAR</div></div>' +
        '</div>' +
        '<div class="strip" style="padding:0">' + pills + '</div>' +
      '</div>';
    });
    el.innerHTML = html || '<div class="card sub">No members yet - share your join link.</div>';
  }).withFailureHandler(function(){ el.innerHTML = '<div class="card sub">offline - try again</div>'; })
    .getGroup(USER, PIN);
}

/* ===== Life Visualized: every day of a 100-year life, birthday-anchored ===== */
var BIRTH = new Date(2001, 2, 18);   // default; replaced by each user's own birthday from the server
function setBirth_(iso){
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) BIRTH = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var el = document.getElementById('lifeBirth');
  if (el && document.activeElement !== el) {
    el.value = ('0' + (BIRTH.getMonth() + 1)).slice(-2) + '/' + ('0' + BIRTH.getDate()).slice(-2) + '/' + BIRTH.getFullYear();
  }
}
function birthChanged_(){
  var el = document.getElementById('lifeBirth'), st = document.getElementById('lifeBirthState');
  var v = el.value;
  var m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) { st.textContent = 'use MM/DD/YYYY'; return; }
  var iso = m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  setBirth_(iso); renderLife();                                    // chart redraws instantly
  st.textContent = 'saving...';
  google.script.run.withSuccessHandler(function(res){
    var r = JSON.parse(res);
    st.textContent = r.ok ? 'saved \u2713' : r.err;
  }).withFailureHandler(function(){ st.textContent = 'offline - will keep local until next save'; })
    .setBirth(USER, PIN, iso);
}
function renderLife(){
  var cv = document.getElementById('lifeCanvas');
  if (!cv || !cv.parentNode.clientWidth) return;
  var full = cv.parentNode.clientWidth - 28;
  var rows = 100, cols = 366, axisL = 30, axisT = 15, axisR = 38;
  var cssW = full - axisL - axisR;
  var cw = cssW / cols;
  var ch = Math.max(cw, 4.4);
  var cssH = axisT + rows * ch + 4;
  var dpr = window.devicePixelRatio || 1;
  cv.style.width = full + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(full * dpr); cv.height = Math.round(cssH * dpr);
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var gradeBy = {};
  if (statsCache) statsCache.daily.forEach(function(d){ gradeBy[d.date] = d.pct; });
  var today = new Date(); today.setHours(12, 0, 0, 0);
  var msDay = 86400000, tx = -1, ty = -1;
  for (var y = 0; y < rows; y++) {
    var rowStart = new Date(BIRTH); rowStart.setFullYear(BIRTH.getFullYear() + y);
    var rowEnd = new Date(BIRTH); rowEnd.setFullYear(BIRTH.getFullYear() + y + 1);
    var nDays = Math.round((rowEnd - rowStart) / msDay);
    for (var d = 0; d < nDays; d++) {
      var date = new Date(rowStart.getTime() + d * msDay);
      var x = axisL + d * cw, yy = axisT + y * ch;
      var color;
      if (Math.abs(date - today) < msDay / 2) { color = '#ffffff'; tx = x; ty = yy; }
      else if (date < today) {
        var k = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
        var p = gradeBy[k];
        color = (p === undefined) ? '#4a262b' : band(p)[0];   // spent day = dim red; tracked day = its grade
      } else color = '#18191b';                               // the days still ahead
      g.fillStyle = color;
      g.fillRect(x, yy, Math.max(cw - 0.3, 0.5), ch - 0.9);
    }
  }
  if (tx >= 0) {                                              // make today unmissable
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(tx + cw / 2, ty + ch / 2, Math.max(ch, 4), 0, 7); g.stroke();
  }
  g.fillStyle = '#93a098'; g.font = '9px sans-serif';
  g.textAlign = 'right';
  for (var a = 0; a <= 90; a += 10) g.fillText(a + 'y', axisL - 4, axisT + a * ch + ch);   // AGE in years
  g.textAlign = 'left';
  for (var a2 = 0; a2 <= 100; a2 += 10) {                                                  // calendar YEAR on the right
    var yr2 = BIRTH.getFullYear() + a2;
    g.fillText(yr2, axisL + cssW + 5, axisT + Math.min(a2, 99) * ch + ch);
  }
  var allN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var allL = [31,28,31,30,31,30,31,31,30,31,30,31];
  var bm0 = BIRTH.getMonth(), off = 0;                                                     // X anchored on each user's birth month
  for (var mi = 0; mi < 12; mi++) {
    var idx2 = (bm0 + mi) % 12;
    g.fillText(allN[idx2], axisL + off * cw, 10);
    off += allL[idx2];
  }
  var lived = Math.floor((today - BIRTH) / msDay);
  var end100 = new Date(BIRTH); end100.setFullYear(BIRTH.getFullYear() + 100);
  var total = Math.round((end100 - BIRTH) / msDay);
  document.getElementById('lifeLived').textContent = lived.toLocaleString();
  document.getElementById('lifeLeft').textContent = (total - lived).toLocaleString();
  var pl = Math.round(10000 * lived / total) / 100;
  document.getElementById('lifePctL').textContent = pl + '%';
  document.getElementById('lifePctR').textContent = (Math.round((100 - pl) * 100) / 100) + '%';
}
document.addEventListener('visibilitychange', function(){   // day rolls over while app stays open
  if (document.visibilityState === 'visible') renderLife();
});

/* ===== member inspector: their list + checkmarks, read-only, no private fields ===== */
function openMember(u){ memberDay_(u, todayKeyJs_()); }
function todayKeyJs_(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function memberDay_(u, date){
  var ov = document.getElementById('memberOv'), bx = document.getElementById('memberBox');
  ov.style.display = '';
  bx.innerHTML = '<div class="card sub">loading...</div>';
  google.script.run.withSuccessHandler(function(res){
    var m = JSON.parse(res);
    var groups = {};
    m.habits.forEach(function(h){ (groups[h.group] = groups[h.group] || []).push(h); });
    var parts = date.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 4px">' +
      '<div><b style="font-size:17px">' + m.name + '</b><div class="sub">' + WDAYS[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate() + ' &middot; ' + m.pct + '% complete</div></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="calBtn" onclick="memberShift_(\'' + m.name + '\',\'' + u + '\',\'' + date + '\',-1)">&#8249;</button>' +
        '<button class="calBtn" onclick="memberShift_(\'' + m.name + '\',\'' + u + '\',\'' + date + '\',1)">&#8250;</button>' +
        '<button class="calBtn" onclick="document.getElementById(\'memberOv\').style.display=\'none\'">&#10005;</button>' +
      '</div></div>';
    GROUPS_ORDER.concat(Object.keys(groups).filter(function(g){ return GROUPS_ORDER.indexOf(g) < 0; })).forEach(function(g){
      if (!groups[g]) return;
      var done = groups[g].filter(function(h){ return m.checked[h.id]; }).length;
      html += '<div class="group"><b>' + g + '</b><span>' + done + '/' + groups[g].length + '</span></div>';
      groups[g].forEach(function(h){
        var on = !!m.checked[h.id];
        html += '<div class="item' + (on ? ' done' : '') + '" style="pointer-events:none">' +
          '<div class="box">' + (on ? '&#10003;' : '') + '</div><div class="name">' + h.name + '</div>' +
          (h.cadence === 'weekly' ? '<span class="pill">WEEKLY</span>' : '') + '</div>';
      });
    });
    bx.innerHTML = html;
  }).withFailureHandler(function(){ bx.innerHTML = '<div class="card sub">could not load - try again</div>'; })
    .getMemberDay(USER, PIN, u, date);
}
function memberShift_(name, u, date, dir){
  var p = date.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + dir);
  memberDay_(u, d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2));
}

/* ===== one-time guide so new members instantly know how to drive ===== */
function maybeGuide_(){
  if (state.needGuide) document.getElementById('guideOv').style.display = '';
}
function openGuide_(){ document.getElementById('guideOv').style.display = ''; }
function closeGuide_(){
  document.getElementById('guideOv').style.display = 'none';
  if (state.needGuide) {
    state.needGuide = false;
    google.script.run.markGuideSeen(USER, PIN);   // remembered server-side: never auto-shows again, any device
  }
}

/* ===== auth gates + boot ===== */
function pinSubmit(){
  PIN = document.getElementById('pinIn').value;
  try { localStorage.setItem('ht_pin_' + USER, PIN); } catch (e) {}
  document.getElementById('pinErr').textContent = 'checking...';
  google.script.run.withSuccessHandler(function(res){
    var r = JSON.parse(res);
    if (r.ok) { location.href = r.url; }   // land on your tokenized link - never asks again
    else { document.getElementById('pinErr').textContent = 'Wrong PIN - try again.'; document.getElementById('pinIn').value = ''; }
  }).withFailureHandler(function(){ boot(); })
    .loginLink(USER, PIN);
}
function joinSubmit(){
  var n = document.getElementById('jName').value, d = document.getElementById('jDisplay').value,
      p = document.getElementById('jPin').value, em = document.getElementById('jEmail').value,
      bd = document.getElementById('jBirth').value;
  var err = document.getElementById('jErr');
  if (!document.getElementById('jPriv').checked) { err.textContent = 'Please confirm the privacy note.'; return; }
  err.textContent = 'creating your tracker (about 10 seconds)...';
  google.script.run.withSuccessHandler(function(res){
    var r = JSON.parse(res);
    if (!r.ok) { err.textContent = r.err; return; }
    try { localStorage.setItem('ht_pin_' + r.user, p); } catch (e) {}
    err.style.color = 'var(--gA)';
    err.innerHTML = '<b>Account created.</b> Opening YOUR tracker now - when it loads, ADD THAT PAGE to your home screen. That page is your personal key; this signup page is not.';
    setTimeout(function(){ location.href = r.url; }, 2200);
  }).withFailureHandler(function(){ err.style.color = '#e08b8b'; err.textContent = 'Connection problem - try again.'; })
    .register(n, d, p, em, bd);
}
function loginGo(){
  var err = document.getElementById('lErr');
  err.textContent = 'opening...';
  google.script.run.withSuccessHandler(function(res){
    var r = JSON.parse(res);
    if (!r.ok) { err.textContent = r.err; return; }
    location.href = r.url;
  }).withFailureHandler(function(){ err.textContent = 'Connection problem - try again.'; })
    .loginLink(document.getElementById('lName').value, document.getElementById('lPin').value);
}
function showError(msg, where){
  var b = document.getElementById('errBar');
  if (!b) { console.error(where, msg); return; }
  b.innerHTML = '<b>Something broke' + (where ? ' in ' + where : '') + '.</b><br>' +
                String(msg).slice(0, 300) + '<br><span style="opacity:.7">Tap to dismiss.</span>';
  b.style.display = '';
  console.error(where, msg);
}
window.addEventListener('error', function(e){ showError(e.message + ' (' + (e.filename||'').split('/').pop() + ':' + e.lineno + ')', 'the page'); });
window.addEventListener('unhandledrejection', function(e){ showError((e.reason && e.reason.message) || e.reason, 'a background task'); });

function boot(){
  var pg = document.getElementById('pinGate'); if (pg) pg.style.display = 'none';
  google.script.run.withSuccessHandler(function(res){
    try { state = JSON.parse(res); } catch (e) { showError('Bad response from the server.', 'loading your day'); return; }
    // Each step is isolated: one failing step must never leave the app half-drawn
    // with dead buttons, which is exactly what used to happen.
    try { setBirth_(state.birth); } catch (e) { showError(e.message, 'your birthday'); }
    try { render(); }              catch (e) { showError(e.message, 'the day view'); }
    try { applyLayout(); }         catch (e) { showError(e.message, 'the layout'); }
    try { maybeGuide_(); }         catch (e) {}
    try { emptyState_(); }         catch (e) {}
  }).withFailureHandler(function(e){
    showError((e && e.message) || e, 'loading your day');
    try { applyLayout(); } catch (e2) {}   // still give them a working screen
  }).getState(USER, selDate, PIN);
}

/* Nobody should ever land on a blank tracker. If there are no habits yet,
   offer a starting point - examples to edit, not a blank page and not a copy
   of somebody else's life. */
var STARTER = [
  {group:'Morning',   name:'Wake at your set time',            cadence:'daily', minutes:0, tier:'standard'},
  {group:'Morning',   name:'Move your body - 30 minutes',      cadence:'daily', minutes:30, tier:'standard'},
  {group:'Morning',   name:'10 minutes of quiet, prayer or reading', cadence:'daily', minutes:10, tier:'floor'},
  {group:'Afternoon', name:'Hit your protein target',          cadence:'daily', minutes:0, tier:'standard'},
  {group:'Afternoon', name:'Drink your water',                 cadence:'daily', minutes:0, tier:'standard'},
  {group:'Night',     name:'Write tomorrow\'s list',            cadence:'daily', minutes:10, tier:'floor'},
  {group:'Night',     name:'Read 10 pages',                    cadence:'daily', minutes:15, tier:'standard'},
  {group:'Standards', name:'No phone in bed',                  cadence:'daily', minutes:0, tier:'floor'},
  {group:'Standards', name:'Nothing to eat 3 hours before sleep', cadence:'daily', minutes:0, tier:'standard'},
  {group:'Standards', name:'Speak to one new person',          cadence:'daily', minutes:5, tier:'standard'},
  {group:'Weekly',    name:'One long walk or run',             cadence:'weekly', minutes:45, tier:'standard'}
];
function emptyState_(){
  var box = document.getElementById('list');
  if (!box || !state || (state.habits && state.habits.length)) return;
  box.innerHTML =
    '<div class="card" style="text-align:left">' +
      '<h1 style="font-size:19px;margin-bottom:6px">Let\'s set your standard.</h1>' +
      '<div class="sub" style="margin-bottom:14px;line-height:1.6">These are examples to get you moving - ' +
      'rename them, delete them, add your own. <b style="color:var(--ink)">Keep it short.</b> ' +
      'A list you can actually finish beats a list that looks impressive.</div>' +
      '<div id="starterList" style="font-size:14px;line-height:1.9;color:var(--ink2);margin-bottom:16px"></div>' +
      '<button class="save" style="position:static;width:100%" onclick="useStarter_()">Start with these 11</button>' +
      '<div class="sub" style="text-align:center;margin-top:10px">or tap <b style="color:var(--ink)">&#9998;</b> to build your own</div>' +
    '</div>';
  var s = '';
  STARTER.forEach(function(x){ s += '<div>&#183; ' + x.name + (x.cadence === 'weekly' ? ' <span class="pill">WEEKLY</span>' : '') + '</div>'; });
  document.getElementById('starterList').innerHTML = s;
}
function useStarter_(){
  var list = STARTER.map(function(x, i){ return { id:'', name:x.name, group:x.group, cadence:x.cadence, active:'yes', link:'', tier:x.tier||'standard', minutes:x.minutes||0 }; });
  google.script.run
    .withSuccessHandler(function(res){ state = JSON.parse(res); render(); applyLayout(); })
    .withFailureHandler(function(e){ showError((e && e.message) || e, 'saving your starter list'); })
    .updateHabits(USER, JSON.stringify(list), PIN);
}
/* Nothing renders until we know who is looking. */
window.__BOOT = function () {
  var bt = document.getElementById('buildTag'); if (bt) bt.textContent = BUILD;
  USER = window.USER;
  try { boot(); } catch (e) { showError(e.message, 'starting up'); }
  setTimeout(selfCheck_, 5000);
};

/* SELF-CHECK.
   An app that fails silently is an app nobody can report a bug on. If five
   seconds after sign-in there is still nothing on screen, ask the database
   the same questions a developer would, and print the answers where the
   person using it can read them. */
async function selfCheck_(){
  var box = document.getElementById('list');
  var painted = box && box.innerHTML.trim().length > 40;
  if (painted) return;
  var sb = window.__SB, out = [];
  function row(k, v){ out.push('<div><b style="color:var(--ink)">' + k + ':</b> ' + v + '</div>'); }
  try {
    var ses = await sb.auth.getSession();
    var u = ses.data.session && ses.data.session.user;
    row('Signed in', u ? 'yes' : 'NO');
    row('Account', u ? u.email : '-');
    var me = window.__getMe && window.__getMe();
    row('Profile loaded', me ? ('yes, @' + me.handle) : 'NO - this is the problem');
    var hr = await sb.from('habits').select('id,active', { count: 'exact' });
    row('Habits your account can read', hr.error ? ('ERROR - ' + hr.error.message) : (hr.data || []).length);
    var dr = await sb.from('days').select('date');
    row('Days readable', dr.error ? ('ERROR - ' + dr.error.message) : (dr.data || []).length);
    var cm = await sb.from('circle_members').select('circle_id');
    row('Circle membership', cm.error ? ('ERROR - ' + cm.error.message) : (cm.data || []).length);
    row('Handle the app is asking for', String(USER || '(empty)'));
    row('state.habits', (window.state && state.habits) ? state.habits.length : 'never set');
    row('Build running', BUILD);
  } catch (e) { row('Self-check crashed', e.message); }
  var b = document.getElementById('errBar');
  if (b) {
    b.innerHTML = '<b>The app loaded but has nothing to show. Here is what it found:</b>' +
      '<div style="margin-top:8px;line-height:1.7;font-size:12.5px">' + out.join('') + '</div>' +
      '<div style="opacity:.7;margin-top:8px">Send this to Claude. Tap to dismiss.</div>';
    b.style.display = '';
  }
}
