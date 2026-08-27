/* ============================================================
   THE TIME BUDGET

   A habit list is a time budget. The reason a list fails is usually
   arithmetic, not character: it commits more minutes than the day has,
   and the percentage at the top ends up measuring the clock.

   So the editor shows the bill while you are writing it, not after a
   month of missing it.
   ============================================================ */
(function () {
  'use strict';

  var WATCH = 120;   // minutes: past this, a list starts competing with the work
  var OVER  = 180;   // minutes: past this, the day has to give something up

  function fmt(m) {
    m = Math.max(0, Math.round(m));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }

  function tally(list) {
    var t = { items: 0, daily: 0, dailyMin: 0, weekly: 0, weeklyMin: 0,
              floor: 0, floorMin: 0, free: 0 };
    (list || []).forEach(function (h) {
      if (!h || !h.name || h.active === 'no') return;
      var m = parseInt(h.minutes, 10);
      if (!isFinite(m) || m < 0) m = 0;
      t.items++;
      if (h.cadence === 'weekly') { t.weekly++; t.weeklyMin += m; }
      else {
        t.daily++; t.dailyMin += m;
        if (h.tier === 'floor') { t.floor++; t.floorMin += m; }
      }
      if (!m) t.free++;
    });
    return t;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  window.budgetTally_ = tally;

  window.budgetBar_ = function (list) {
    var t = tally(list);
    var level = t.dailyMin > OVER ? 'over' : (t.dailyMin > WATCH ? 'watch' : 'ok');
    var verdict =
      level === 'over'  ? 'That is more routine than a working day has room for. A list this size gets scored by the clock, not by you.' :
      level === 'watch' ? 'Getting heavy. Every minute here is a minute the day has to find somewhere.' :
                          'This fits inside a real day.';

    var pct = Math.min(100, Math.round((t.dailyMin / OVER) * 100));
    var colour = level === 'over' ? '#e8654b' : (level === 'watch' ? '#e8b84b' : '#54d18c');

    var lines = [];
    lines.push(t.daily + ' daily' + (t.weekly ? ' · ' + t.weekly + ' weekly' : ''));
    if (t.free) lines.push(t.free + ' cost no time');
    lines.push(t.floor
      ? 'FLOOR: ' + t.floor + (t.floorMin ? ' · ' + fmt(t.floorMin) : '') + ' — never missed, on any day'
      : 'No FLOOR set — tick <b>floor</b> on the two or three you will not miss even on the worst day');

    return '<div id="budgetBar" class="' + level + '">' +
        '<div class="brow"><span class="bnum">' + esc(fmt(t.dailyMin)) + '</span>' +
        '<span class="bsub" style="margin:0">committed every day' +
        (t.weeklyMin ? ' · ' + esc(fmt(t.weeklyMin)) + ' weekly' : '') + '</span></div>' +
        '<div class="bmeter"><div class="bfill" style="width:' + pct + '%;background:' + colour + '"></div></div>' +
        '<div class="bsub">' + lines.join('<br>') + '</div>' +
        '<div class="bsub" style="opacity:.75">' + verdict + '</div>' +
      '</div>';
  };

  /* Repaint just the bar - typing a minute value must not rebuild the whole
     list underneath the cursor. */
  window.budgetTick_ = function (list) {
    var el = document.getElementById('budgetBar');
    if (!el) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = window.budgetBar_(list);
    el.parentNode.replaceChild(tmp.firstChild, el);
  };
})();
