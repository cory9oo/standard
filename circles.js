/* ============================================================
   CIRCLES

   The tables and the join_circle() function have existed since the migration.
   What was missing was any way for a person to use them: no invite to send, no
   box to paste a code into, no list of who is actually in. A group feature
   nobody can join is not a group feature.

   Only completion percentages cross the circle boundary. Journals, whys, tasks
   and prayers live in a separate table with an owner-only policy - that is
   enforced by Postgres, not by this file.
   ============================================================ */
(function () {
  'use strict';

  var BOX = 'circleBox';
  var busy = false;

  function sb() { return window.__SB; }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inviteUrl(code) {
    return location.origin + location.pathname.replace(/index\.html$/, '') + '?join=' + code;
  }
  function say(msg, bad) {
    var n = el('cxNote');
    if (!n) return;
    n.textContent = msg;
    n.className = 'cx-note' + (bad ? ' bad' : '');
  }

  /* ---------- data ---------- */
  async function load() {
    var s = sb();
    if (!s) return null;
    var mine = await s.from('circle_members').select('circle_id');
    if (mine.error) throw mine.error;
    var ids = (mine.data || []).map(function (r) { return r.circle_id; });
    if (!ids.length) return { circles: [] };

    var cs = await s.from('circles').select('id,name,join_code,owner_id').in('id', ids);
    if (cs.error) throw cs.error;

    var mem = await s.from('circle_members').select('circle_id,user_id').in('circle_id', ids);
    var uids = [];
    (mem.data || []).forEach(function (m) { if (uids.indexOf(m.user_id) < 0) uids.push(m.user_id); });
    var profs = uids.length ? await s.from('profiles').select('id,display_name,handle').in('id', uids)
                            : { data: [] };
    var nameOf = {};
    (profs.data || []).forEach(function (p) { nameOf[p.id] = p.display_name || p.handle; });

    (cs.data || []).forEach(function (c) {
      c.members = (mem.data || []).filter(function (m) { return m.circle_id === c.id; })
        .map(function (m) { return nameOf[m.user_id] || 'a member'; });
    });
    return { circles: cs.data || [] };
  }

  /* ---------- paint ---------- */
  function ensureBox() {
    if (el(BOX)) return el(BOX);
    var host = el('viewGroup');
    var list = el('groupList');
    if (!host) return null;
    var d = document.createElement('div');
    d.id = BOX;
    d.className = 'cx';
    if (list) host.insertBefore(d, list); else host.appendChild(d);
    d.addEventListener('click', onClick);
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'cxCode') { e.preventDefault(); doJoin(); }
    });
    return d;
  }

  function paint(model) {
    var d = ensureBox();
    if (!d) return;

    var cards = (model.circles || []).map(function (c) {
      var url = inviteUrl(c.join_code);
      var who = c.members.length === 1
        ? 'Just you so far.'
        : c.members.length + ' people: ' + c.members.join(', ');
      return '<div class="cx-card">' +
        '<div class="cx-top"><b>' + esc(c.name) + '</b>' +
          '<span class="cx-count">' + c.members.length + '</span></div>' +
        '<div class="cx-who">' + esc(who) + '</div>' +
        '<div class="cx-linkrow">' +
          '<input class="cx-link" readonly value="' + esc(url) + '" data-cx="sel">' +
          '<button class="cx-btn" data-cx="copy" data-url="' + esc(url) + '">Copy</button>' +
          (navigator.share ? '<button class="cx-btn" data-cx="share" data-url="' + esc(url) +
            '" data-name="' + esc(c.name) + '">Send</button>' : '') +
        '</div>' +
        '<div class="cx-hint">Anyone who opens this link and signs up joins your circle. ' +
        'They will see your daily percentage — never your journal.</div>' +
      '</div>';
    }).join('');

    if (!cards) {
      cards = '<div class="cx-card"><div class="cx-top"><b>No circle yet</b></div>' +
        '<div class="cx-who">Start one and share the link.</div>' +
        '<div class="cx-linkrow"><input class="cx-link" id="cxNew" placeholder="Name it — e.g. Fugiel family">' +
        '<button class="cx-btn" data-cx="create">Create</button></div></div>';
    }

    d.innerHTML =
      '<div class="cx-head">Your circle</div>' + cards +
      '<div class="cx-card">' +
        '<div class="cx-top"><b>Join someone else\'s</b></div>' +
        '<div class="cx-linkrow">' +
          '<input class="cx-link" id="cxCode" placeholder="Paste an invite link or code">' +
          '<button class="cx-btn" data-cx="join">Join</button>' +
        '</div>' +
      '</div>' +
      '<div id="cxNote" class="cx-note"></div>';
  }

  async function refresh() {
    try {
      var m = await load();
      if (m) paint(m);
    } catch (e) {
      var d = ensureBox();
      if (d) d.innerHTML = '<div class="cx-note bad">Could not load your circle: ' +
        esc((e && e.message) || e) + '</div>';
    }
  }

  /* ---------- actions ---------- */
  function codeFrom(text) {
    text = String(text || '').trim();
    var m = text.match(/[?&]join=([A-Za-z0-9-]+)/);
    return m ? m[1] : text;
  }

  async function doJoin(rawCode) {
    if (busy) return;
    var code = codeFrom(rawCode || (el('cxCode') ? el('cxCode').value : ''));
    if (!code) { say('Paste the invite link or the code first.', true); return; }
    busy = true;
    say('Joining…');
    try {
      var r = await sb().rpc('join_circle', { code: code });
      if (r.error) throw r.error;
      if (r.data === 'NO_SUCH_CIRCLE') { say('That code does not match any circle.', true); }
      else {
        say('You are in. Their days will show below.');
        await refresh();
        if (typeof renderGroup === 'function') renderGroup();
      }
    } catch (e) {
      say('Could not join: ' + ((e && e.message) || e), true);
    }
    busy = false;
  }

  async function doCreate() {
    var name = el('cxNew') ? el('cxNew').value.trim() : '';
    if (!name) { say('Give the circle a name first.', true); return; }
    try {
      var me = await sb().auth.getUser();
      var uid = me.data.user.id;
      var ins = await sb().from('circles').insert({ name: name, owner_id: uid }).select('id').single();
      if (ins.error) throw ins.error;
      var mem = await sb().from('circle_members').insert({ circle_id: ins.data.id, user_id: uid });
      if (mem.error) throw mem.error;
      say('Circle created.');
      refresh();
    } catch (e) {
      say('Could not create it: ' + ((e && e.message) || e), true);
    }
  }

  function copy(url, btn) {
    function done() { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { say('Select the link and copy it manually.', true); });
    } else {
      var i = btn.parentNode.querySelector('.cx-link');
      if (i) { i.select(); try { document.execCommand('copy'); done(); } catch (e) { say('Select the link and copy it manually.', true); } }
    }
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-cx]') : null;
    if (!t) return;
    var what = t.getAttribute('data-cx');
    if (what === 'sel') { t.select(); return; }
    if (what === 'copy') copy(t.getAttribute('data-url'), t);
    if (what === 'share') {
      navigator.share({
        title: 'STANDARD',
        text: 'Join my circle on STANDARD — we can see each other\'s daily percentage.',
        url: t.getAttribute('data-url')
      }).catch(function () {});
    }
    if (what === 'join') doJoin();
    if (what === 'create') doCreate();
  }

  /* ---------- wiring ---------- */
  window.refreshCircles_ = refresh;

  window.addEventListener('load', function () {
    var prev = window.renderGroup;
    window.renderGroup = function () {
      try { refresh(); } catch (e) {}
      if (typeof prev === 'function') return prev.apply(this, arguments);
    };

    /* An invite link lands here. Wait for the session, then act on it and clean
       the code out of the address bar so a refresh does not re-run it. */
    var m = location.search.match(/[?&]join=([A-Za-z0-9-]+)/);
    if (!m) return;
    var code = m[1], tries = 0;
    var t = setInterval(function () {
      tries++;
      if (sb() && typeof state !== 'undefined' && state) {
        clearInterval(t);
        if (typeof show === 'function') { try { show('group'); } catch (e) {} }
        doJoin(code);
        try { history.replaceState({}, '', location.pathname); } catch (e) {}
      } else if (tries > 60) {
        clearInterval(t);
      }
    }, 500);
  });
})();
