/* ============================================================
   STANDARD - sign in.
   Replaces the 4-digit PIN. A PIN in a shared link was never an
   account; this is. Nothing in the app renders until we know who
   is looking, because every privacy rule downstream depends on it.
   ============================================================ */
(function () {
  const sb = window.__SB;

  const ov = document.createElement('div');
  ov.id = 'authOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--bg,#0e0e0f);' +
    'display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto';
  ov.innerHTML = `
    <div style="width:100%;max-width:380px">
      <div style="text-align:center;margin-bottom:26px">
        <div style="font-size:30px;letter-spacing:.14em;font-weight:700;color:var(--ink,#e9eae8)">STANDARD</div>
        <div style="color:var(--ink2,#9a9f9b);font-size:13px;margin-top:6px">Checked is done. Unchecked is not.</div>
      </div>
      <div style="background:var(--card,#17181a);border:1px solid var(--line,#2e3033);border-radius:16px;padding:20px">
        <div id="auName" style="display:none">
          <label style="font-size:12px;color:var(--ink2,#9a9f9b)">Your name</label>
          <input id="auDisplay" type="text" autocomplete="name" placeholder="Cory"
            style="width:100%;margin:6px 0 14px;padding:13px;border-radius:10px;border:1px solid var(--line,#2e3033);background:var(--card2,#1e2022);color:var(--ink,#e9eae8);font-size:16px">
        </div>
        <label style="font-size:12px;color:var(--ink2,#9a9f9b)">Email</label>
        <input id="auEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"
          style="width:100%;margin:6px 0 14px;padding:13px;border-radius:10px;border:1px solid var(--line,#2e3033);background:var(--card2,#1e2022);color:var(--ink,#e9eae8);font-size:16px">
        <label style="font-size:12px;color:var(--ink2,#9a9f9b)">Password</label>
        <input id="auPass" type="password" autocomplete="current-password" placeholder="8+ characters"
          style="width:100%;margin:6px 0 16px;padding:13px;border-radius:10px;border:1px solid var(--line,#2e3033);background:var(--card2,#1e2022);color:var(--ink,#e9eae8);font-size:16px">
        <button id="auGo" style="width:100%;padding:14px;border:0;border-radius:10px;background:var(--gA,#3FA05A);color:#06210f;font-weight:800;font-size:16px">Sign in</button>
        <div id="auErr" style="color:#e08b8b;font-size:13px;margin-top:12px;min-height:18px"></div>
        <div style="text-align:center;margin-top:6px">
          <span id="auSwap" style="color:var(--gA,#3FA05A);font-size:13px;cursor:pointer">New here? Create an account</span>
        </div>
      </div>
      <div style="color:var(--ink2,#9a9f9b);font-size:12px;text-align:center;margin-top:18px;line-height:1.6">
        Your circle sees your habits, checkmarks and percentages.<br>
        Your journal, ratings and tasks are yours alone -<br>enforced by the database, not by a promise.
      </div>
    </div>`;

  let mode = 'in';
  const $ = id => ov.querySelector('#' + id);

  function setMode(m) {
    mode = m;
    $('auName').style.display = m === 'up' ? '' : 'none';
    $('auGo').textContent = m === 'up' ? 'Create my tracker' : 'Sign in';
    $('auSwap').textContent = m === 'up' ? 'Already have an account? Sign in' : 'New here? Create an account';
    $('auPass').setAttribute('autocomplete', m === 'up' ? 'new-password' : 'current-password');
    $('auErr').textContent = '';
  }

  async function go() {
    const email = $('auEmail').value.trim();
    const pass = $('auPass').value;
    const name = $('auDisplay').value.trim();
    if (!email || !pass) { $('auErr').textContent = 'Email and password are both required.'; return; }
    if (mode === 'up' && !name) { $('auErr').textContent = 'What should the group call you?'; return; }
    $('auGo').disabled = true; $('auGo').textContent = 'Working...'; $('auErr').textContent = '';
    try {
      const res = mode === 'up'
        ? await sb.auth.signUp({ email, password: pass, options: { data: { display_name: name } } })
        : await sb.auth.signInWithPassword({ email, password: pass });
      if (res.error) throw res.error;
      if (!res.data.session) throw new Error('No session was created. Try signing in.');
      await start();
    } catch (e) {
      $('auErr').textContent = e.message || String(e);
      $('auGo').disabled = false;
      setMode(mode);
    }
  }

  async function start() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    let prof = null;
    // the signup trigger writes the profile; give it a beat on a cold start
    for (let i = 0; i < 6 && !prof; i++) {
      const { data } = await sb.from('profiles').select('id,handle,display_name').eq('id', user.id).maybeSingle();
      prof = data;
      if (!prof) await new Promise(r => setTimeout(r, 500));
    }
    if (!prof) { $('auErr').textContent = 'Account created but profile not ready. Reload in a moment.'; $('auGo').disabled = false; return; }
    window.__setMe(prof);
    window.USER = prof.handle;
    window.__ME_NAME = prof.display_name;
    ov.remove();
    if (window.__BOOT) window.__BOOT();
  }

  window.__signOut = async function () { await sb.auth.signOut(); location.reload(); };

  document.addEventListener('DOMContentLoaded', async () => {
    document.body.appendChild(ov);
    setMode('in');
    $('auGo').onclick = go;
    $('auSwap').onclick = () => setMode(mode === 'up' ? 'in' : 'up');
    ov.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const { data: { session } } = await sb.auth.getSession();
    if (session) await start();          // already signed in - go straight in
  });
})();
