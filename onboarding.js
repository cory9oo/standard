/* ============================================================
   FIRST RUN

   Nobody writes a good standard on a blank page, and nobody writes an
   achievable one without seeing the bill. So the first thing a new person does
   here is edit a real list with a running time total under it, then name the
   two or three things they will not miss on the worst day, then put the app on
   their phone - because a tracker you have to remember to open is a tracker
   you stop opening.

   Everything here is examples. Not a copy of somebody else's life.
   ============================================================ */
(function () {
  'use strict';

  var OB = null;

  function fmt(m) {
    m = Math.max(0, Math.round(m));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function platform() {
    var ua = navigator.userAgent || '';
    var iOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return {
      iOS: iOS,
      android: /Android/.test(ua),
      standalone: window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
    };
  }

  /* ---------- step 1 ---------- */
  function stepWelcome() {
    return '' +
      '<div class="ob-kicker">First run</div>' +
      '<h2 class="ob-h">A standard you can actually hit.</h2>' +
      '<p class="ob-p">Most habit lists fail on arithmetic, not on character. They commit more hours ' +
      'than the day has, and the percentage at the top ends up measuring the clock.</p>' +
      '<p class="ob-p">So this one shows you what your list costs while you write it, and asks you to ' +
      'name a floor — the two or three things you keep even on the worst day you will have this year.</p>' +
      '<p class="ob-p ob-dim">Three screens. Under two minutes.</p>' +
      '<div class="ob-actions"><button class="ob-go" data-ob="next">Start</button></div>';
  }

  /* ---------- step 2 ---------- */
  function stepList() {
    var rows = OB.items.map(function (h, i) {
      return '<label class="ob-row' + (h.on ? '' : ' off') + '">' +
        '<input type="checkbox" data-ob="on" data-i="' + i + '"' + (h.on ? ' checked' : '') + '>' +
        '<input class="ob-name" type="text" data-ob="name" data-i="' + i + '" value="' + esc(h.name) + '">' +
        '<span class="ob-min"><input type="number" min="0" max="600" step="5" data-ob="min" data-i="' + i +
          '" value="' + (h.minutes || 0) + '">min</span>' +
        (h.cadence === 'weekly' ? '<span class="ob-tag">weekly</span>' : '') +
      '</label>';
    }).join('');

    return '' +
      '<div class="ob-kicker">Step 1 of 3 &nbsp;·&nbsp; Your list</div>' +
      '<h2 class="ob-h">Edit these. Delete what is not yours.</h2>' +
      '<p class="ob-p">Examples to get you moving — rename them, switch them off, change what they cost. ' +
      'You can add your own later in the editor.</p>' +
      '<div class="ob-list">' + rows + '</div>' +
      '<div id="obBudget" class="ob-budget"></div>' +
      '<div class="ob-actions">' +
        '<button class="ob-back" data-ob="back">Back</button>' +
        '<button class="ob-go" data-ob="next">Next</button>' +
      '</div>';
  }

  /* ---------- step 3 ---------- */
  function stepFloor() {
    var rows = OB.items.map(function (h, i) {
      if (!h.on || h.cadence === 'weekly') return '';
      return '<label class="ob-row' + (h.tier === 'floor' ? ' picked' : '') + '">' +
        '<input type="checkbox" data-ob="floor" data-i="' + i + '"' + (h.tier === 'floor' ? ' checked' : '') + '>' +
        '<span class="ob-name-static">' + esc(h.name) + '</span>' +
        '<span class="ob-tag">' + (h.minutes ? fmt(h.minutes) : 'free') + '</span>' +
      '</label>';
    }).join('');

    return '' +
      '<div class="ob-kicker">Step 2 of 3 &nbsp;·&nbsp; Your floor</div>' +
      '<h2 class="ob-h">What do you keep on the worst day?</h2>' +
      '<p class="ob-p">Pick two or three. Not the important ones — the ones you would still do while ' +
      'something was going badly wrong. Your streak runs on these. Your grade runs on the whole list, ' +
      'so a bad day costs you the grade without costing you the streak.</p>' +
      '<div class="ob-list">' + rows + '</div>' +
      '<div id="obFloorNote" class="ob-budget"></div>' +
      '<div class="ob-actions">' +
        '<button class="ob-back" data-ob="back">Back</button>' +
        '<button class="ob-go" data-ob="next">Next</button>' +
      '</div>';
  }

  /* ---------- step 4 ---------- */
  function stepInstall() {
    var p = platform();
    var how;
    if (p.standalone) {
      how = '<p class="ob-p">Already installed. Reminders can reach you.</p>';
    } else if (p.iOS) {
      how = '<p class="ob-p">Tap <b>Share</b> at the bottom of Safari, then <b>Add to Home Screen</b>.</p>' +
            '<p class="ob-p ob-dim">On an iPhone this is the only way notifications can be delivered. ' +
            'A bookmark will not do it.</p>';
    } else if (window.__installPrompt) {
      how = '<p class="ob-p">One tap and it lives on your home screen like any other app.</p>' +
            '<div class="ob-actions" style="margin:14px 0 0"><button class="ob-go" data-ob="install">Install</button></div>';
    } else {
      how = '<p class="ob-p">Open your browser menu and choose <b>Install app</b> or ' +
            '<b>Add to Home screen</b>.</p>';
    }
    return '' +
      '<div class="ob-kicker">Step 3 of 3 &nbsp;·&nbsp; On your phone</div>' +
      '<h2 class="ob-h">Put it where you will see it.</h2>' +
      how +
      '<div class="ob-actions">' +
        '<button class="ob-back" data-ob="back">Back</button>' +
        '<button class="ob-go" data-ob="finish">' + (OB.preview ? 'Close preview' : 'Save my list') + '</button>' +
      '</div>';
  }

  var STEPS = [stepWelcome, stepList, stepFloor, stepInstall];

  /* ---------- live totals ---------- */
  function paintBudget() {
    var b = el('obBudget');
    if (b) {
      var on = OB.items.filter(function (h) { return h.on; });
      var daily = on.filter(function (h) { return h.cadence !== 'weekly'; });
      var mins = daily.reduce(function (s, h) { return s + (parseInt(h.minutes, 10) || 0); }, 0);
      var free = daily.filter(function (h) { return !parseInt(h.minutes, 10); }).length;
      var verdict = mins > 180 ? 'That is more than a working day has room for.'
                  : mins > 120 ? 'Getting heavy. Every minute has to come from somewhere.'
                  : 'This fits inside a real day.';
      b.className = 'ob-budget ' + (mins > 180 ? 'over' : mins > 120 ? 'watch' : 'ok');
      b.innerHTML = '<b>' + fmt(mins) + '</b> every day · ' + daily.length + ' items' +
        (free ? ' · ' + free + ' cost nothing' : '') + '<br><span class="ob-dim">' + verdict + '</span>';
    }
    var f = el('obFloorNote');
    if (f) {
      var n = OB.items.filter(function (h) { return h.on && h.tier === 'floor'; }).length;
      f.className = 'ob-budget ' + (n === 0 ? 'watch' : n > 3 ? 'watch' : 'ok');
      f.innerHTML = n === 0 ? 'Nothing chosen yet — pick at least one.'
        : n > 3 ? n + ' chosen. A floor of more than three stops being a floor.'
        : n + ' chosen. Good.';
    }
  }

  function paint() {
    el('obBody').innerHTML = STEPS[OB.step]();
    el('obOv').scrollTop = 0;
    paintBudget();
  }

  /* ---------- events ---------- */
  function onInput(e) {
    var t = e.target, i = t.getAttribute('data-i'), what = t.getAttribute('data-ob');
    if (i == null || !what) return;
    i = parseInt(i, 10);
    if (what === 'name')  OB.items[i].name = t.value;
    if (what === 'min')   OB.items[i].minutes = Math.max(0, parseInt(t.value, 10) || 0);
    if (what === 'on')  { OB.items[i].on = t.checked; t.parentNode.classList.toggle('off', !t.checked); }
    if (what === 'floor') {
      OB.items[i].tier = t.checked ? 'floor' : 'standard';
      t.parentNode.classList.toggle('picked', t.checked);
    }
    paintBudget();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-ob]') : null;
    if (!t || t.tagName === 'INPUT') return;
    var what = t.getAttribute('data-ob');
    if (what === 'next') { OB.step = Math.min(STEPS.length - 1, OB.step + 1); paint(); }
    if (what === 'back') { OB.step = Math.max(0, OB.step - 1); paint(); }
    if (what === 'install') {
      var p = window.__installPrompt;
      if (p) { p.prompt(); window.__installPrompt = null; t.textContent = 'Opening…'; }
    }
    if (what === 'finish') finish();
  }

  function finish() {
    var chosen = OB.items.filter(function (h) { return h.on && h.name.trim(); });
    if (OB.preview || !chosen.length) { close(); return; }
    var list = chosen.map(function (h) {
      return { id: '', name: h.name.trim(), group: h.group, cadence: h.cadence,
               active: 'yes', link: '', tier: h.tier === 'floor' ? 'floor' : 'standard',
               minutes: Math.max(0, parseInt(h.minutes, 10) || 0) };
    });
    var btn = document.querySelector('[data-ob="finish"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      google.script.run
        .withSuccessHandler(function (res) {
          try { state = JSON.parse(res); render(); applyLayout(); } catch (e) {}
          close();
        })
        .withFailureHandler(function (err) {
          if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
          var b = el('obBudget') || el('obFloorNote');
          if (b) { b.className = 'ob-budget over'; b.textContent = 'Could not save: ' + ((err && err.message) || err); }
        })
        .updateHabits(USER, JSON.stringify(list), typeof PIN === 'undefined' ? '' : PIN);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
    }
  }

  function close() {
    var ov = el('obOv');
    if (ov) ov.remove();
    document.documentElement.classList.remove('ob-open');
    OB = null;
  }

  /* ---------- open ---------- */
  window.openOnboarding_ = function (opts) {
    opts = opts || {};
    var seed = (typeof STARTER !== 'undefined' && STARTER.length) ? STARTER : [];
    OB = {
      step: 0,
      preview: !!opts.preview,
      items: seed.map(function (x) {
        return { name: x.name, group: x.group, cadence: x.cadence,
                 minutes: x.minutes || 0, tier: x.tier || 'standard', on: true };
      })
    };
    if (el('obOv')) el('obOv').remove();
    var ov = document.createElement('div');
    ov.id = 'obOv';
    ov.innerHTML = '<div class="ob-card"><div id="obBody"></div></div>';
    document.body.appendChild(ov);
    document.documentElement.classList.add('ob-open');
    ov.addEventListener('input', onInput);
    ov.addEventListener('change', onInput);
    ov.addEventListener('click', onClick);
    paint();
  };

  /* A new account gets the guided run instead of the one-button card. The old
     empty state stays as the fallback if anything here fails to load. */
  window.addEventListener('load', function () {
    var prev = window.emptyState_;
    window.emptyState_ = function () {
      try {
        if (typeof state !== 'undefined' && state && (!state.habits || !state.habits.length)) {
          window.openOnboarding_();
          return;
        }
      } catch (e) {}
      if (typeof prev === 'function') prev();
    };
  });

  /* ?firstrun=1 opens the flow in preview - it walks and edits exactly like the
     real thing but saves nothing. Lets the first run be reviewed, and shown to
     someone before they sign up, without inventing a throwaway account. */
  window.addEventListener('load', function () {
    if (/[?&]firstrun=/.test(location.search)) {
      setTimeout(function () { window.openOnboarding_({ preview: true }); }, 400);
    }
  });

  /* Android and desktop Chrome hand us a real install prompt - keep it so the
     install step can be one tap instead of a menu instruction. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__installPrompt = e;
  });
})();
