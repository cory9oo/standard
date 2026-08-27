
/* ---- PWA runtime: install, offline, push. None of this was possible on Apps Script. ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function(){ navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function(reg){
      // Adopt a new version the moment it is ready, and reload once so the
      // running page is never older than the code on the server.
      reg.update();   // check for a new version; it activates on the next load
    }).catch(function(){});
    // Reload once when a new worker takes over - and never more than once per
    // session. Without the stored guard this ping-pongs: reload installs a
    // worker, the worker takes over, controllerchange fires, reload again.
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      try {
        if (sessionStorage.getItem('ht_swreload')) return;
        sessionStorage.setItem('ht_swreload', '1');
      } catch (e) { return; }
      location.reload();
    }); });
}

/* iOS gives no beforeinstallprompt - the Share > Add to Home Screen path is manual,
   so tell first-time Safari visitors once, then never again. */
(function(){
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  try { if (localStorage.getItem('ht_a2hs')) return; } catch(e){}
  window.addEventListener('load', function(){
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));'
      + 'z-index:99;background:var(--card2);border:1px solid var(--line);border-radius:14px;padding:14px 16px;'
      + 'font-size:14px;color:var(--ink);box-shadow:0 10px 30px rgba(0,0,0,.5)';
    b.innerHTML = (iOS
      ? 'Install STANDARD: tap <b>Share</b>, then <b>Add to Home Screen</b>. Notifications only work once installed.'
      : 'Install STANDARD from your browser menu to get daily reminders.')
      + '<span id="a2hsX" style="float:right;color:var(--ink2);padding-left:14px">Dismiss</span>';
    document.body.appendChild(b);
    document.getElementById('a2hsX').onclick = function(){
      try { localStorage.setItem('ht_a2hs','1'); } catch(e){}
      b.remove();
    };
  });
})();

/* iOS can evict a backgrounded web app from memory; reopening is a cold load, not a resume.
   Remember where he was so it comes back to the same place. */
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'hidden') {
    try { sessionStorage.setItem('ht_view', JSON.stringify({ v: curView, d: selDate })); } catch(e){}
  }
});
