/* Automated helper setup: guided install, live detection, and auto-play once protection is active. */
(() => {
  'use strict';
  const ZIP = '/downloads/streambox-playback-protection.zip';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let movy = null, play = null, running = false, pending = null, ui = null;

  function detectBrowser(ua = navigator.userAgent) {
    ua = String(ua || '');
    const mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
    const edge = /Edg(e|A|iOS)?\//.test(ua);
    const opera = /OPR\//.test(ua);
    const chrome = /Chrome\//.test(ua) && !edge && !opera;
    const firefox = /Firefox|FxiOS/.test(ua);
    const safari = /Safari\//.test(ua) && !chrome && !edge && !opera && !firefox;
    const name = edge ? 'Edge' : opera ? 'Opera' : chrome ? 'Chrome' : firefox ? 'Firefox' : safari ? 'Safari' : 'This browser';
    const chromium = chrome || edge || opera;
    return {
      name, mobile,
      supported: chromium && !mobile,
      extensionsUrl: edge ? 'edge://extensions' : 'chrome://extensions',
    };
  }

  function build() {
    if (ui) return ui;
    const el = document.createElement('div');
    el.className = 'modal movy-setup';
    el.hidden = true;
    el.innerHTML = `
      <div class="modal-card movy-setup-card">
        <button class="icon-btn modal-close" data-ms="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="modal-body movy-setup-body">
          <h2 style="font-size:24px;margin-bottom:6px">Set up movie playback — automatically</h2>
          <p id="msStatus" class="movy-setup-status" role="status">Follow the three steps. StreamBox watches for the helper and takes over by itself.</p>
          <ol class="movy-setup-steps">
            <li id="msStep1"><b>Download and extract.</b>
              <div class="movy-setup-actions"><a class="btn btn-red" href="${ZIP}" download>Download helper (v1.1)</a></div>
              Extract the ZIP to a folder you can find again.</li>
            <li id="msStep2"><b>Open the extensions page and enable Developer mode.</b>
              <div class="movy-setup-actions">
                <button class="btn btn-more" data-ms="openext">Open extensions page</button>
                <button class="btn btn-more" data-ms="copy">Copy address</button>
              </div>
              <code class="movy-setup-url" id="msExtUrl"></code><br>
              If nothing opens, paste the address into a new tab. Then switch <b>Developer mode</b> on.</li>
            <li id="msStep3"><b>Load unpacked.</b> Click <b>Load unpacked</b> and select the extracted folder that contains <b>manifest.json</b>.</li>
            <li id="msStep4"><b>Wait — StreamBox is watching.</b>
              <div class="movy-setup-wait" id="msWait"><span class="spinner"></span><span>Checking every couple of seconds. No reload needed; if nothing happens after installing, reload StreamBox once.</span></div>
              <p id="msAuto" class="movy-setup-note" hidden></p>
            </li>
          </ol>
          <p class="movy-setup-note" id="msEnv"></p>
        </div>
      </div>`;
    document.body.appendChild(el);
    const byId = id => document.getElementById(id);
    ui = {
      el,
      status: byId('msStatus'),
      env: byId('msEnv'),
      extUrl: byId('msExtUrl'),
      auto: byId('msAuto'),
      wait: byId('msWait'),
      steps: ['msStep1', 'msStep2', 'msStep3', 'msStep4'].map(byId),
    };
    el.addEventListener('click', e => {
      const btn = e.target?.closest?.('[data-ms]');
      if (e.target === el) { close(); return; }
      if (!btn) return;
      if (btn.dataset.ms === 'close') close();
      else if (btn.dataset.ms === 'copy') {
        navigator.clipboard?.writeText(detectBrowser().extensionsUrl)
          .then(() => { if (ui?.status) ui.status.textContent = 'Address copied — paste it into a new tab.'; })
          .catch(() => { if (ui?.status) ui.status.textContent = 'Copy failed — type the address by hand.'; });
      } else if (btn.dataset.ms === 'openext') {
        const info = detectBrowser();
        try { window.open(info.extensionsUrl, '_blank'); } catch { /* browsers block this */ }
        if (ui?.status) ui.status.textContent = 'If nothing opened, browsers block this — use “Copy address” instead.';
      }
    });
    return ui;
  }
  function done(index) {
    const li = ui?.steps?.[index];
    if (li) li.classList.add('done');
  }
  function resetSteps() {
    ui.steps?.forEach(li => li?.classList.remove('done'));
  }
  function activated() {
    running = false;
    done(0); done(1); done(2); done(3);
    if (ui?.status) { ui.status.textContent = 'Playback protection active ✓'; ui.status.classList.add('movy-setup-active'); }
    if (ui?.wait) ui.wait.hidden = true;
    const target = pending && play ? {
      ...pending.record,
      season: Number.isInteger(pending.season) ? pending.season : 1,
      episode: Number.isInteger(pending.episode) ? pending.episode : 1,
    } : null;
    pending = null;
    if (target) setTimeout(() => { if (ui && !ui.el.hidden) { close(); play(target); } }, 900);
    else setTimeout(close, 1800);
  }
  async function watch() {
    if (running) return;
    running = true;
    while (running) {
      let ok = false;
      try { ok = movy ? await movy.checkProtection() : false; } catch { ok = false; }
      if (!running) return;
      if (ok) { activated(); return; }
      await sleep(2200);
    }
  }
  function open(nextPending = null) {
    build();
    pending = nextPending && nextPending.record ? nextPending : null;
    const info = detectBrowser();
    if (ui.env) ui.env.textContent = info.supported
      ? `Detected ${info.name} on a computer — everything below is supported.`
      : `Detected ${info.name}${info.mobile ? ' (mobile)' : ''}. The helper installs in desktop Chrome or Edge; this device can browse Movy but protected playback needs a supported desktop browser.`;
    if (ui.extUrl) ui.extUrl.textContent = info.extensionsUrl;
    if (ui.status) { ui.status.classList.remove('movy-setup-active'); ui.status.textContent = 'Follow the three steps. StreamBox watches for the helper and takes over by itself.'; }
    resetSteps();
    if (ui.wait) ui.wait.hidden = false;
    if (ui.auto) {
      ui.auto.hidden = !pending;
      ui.auto.textContent = pending ? `When protection activates, StreamBox plays “${String(pending.record.name || '').slice(0, 80)}” automatically.` : '';
    }
    ui.el.hidden = false;
    document.body.style.overflow = 'hidden';
    watch();
  }
  function close() {
    running = false;
    pending = null;
    if (!ui) return;
    ui.el.hidden = true;
    if (!document.querySelector('.player:not([hidden])')) document.body.style.overflow = '';
  }
  window.StreamBoxMovySetup = {
    open, close, detectBrowser,
    configure(deps) { movy = deps?.movy || movy; play = deps?.play || play; },
  };
})();
