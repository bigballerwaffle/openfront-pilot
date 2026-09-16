import { AutoRequeue, consumeRequeue } from './requeue.js';
import { LobbyStarter } from './setup.js';
import { GameAdapter } from './adapter.js';
import { PilotController } from './controller.js';
import { DEFAULTS } from './strategy.js';
import { LearningStore, LIMITS } from './learning.js';
import { MatchLearning } from './match-learning.js';

const KEY = 'openfront-pilot-options-v1';
if (!document.querySelector('openfront-pilot')) boot();

function boot() {
  const host = document.createElement('openfront-pilot');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{all:initial;position:fixed;top:82px;right:14px;z-index:2147483000;font:13px/1.45 system-ui,sans-serif;color:#eef3f4;display:block;width:290px;max-width:calc(100vw - 28px);color-scheme:dark}
      *{box-sizing:border-box} .panel{background:#10191ff2;border:1px solid #344951;border-radius:16px;box-shadow:0 12px 40px #0006;overflow:hidden;backdrop-filter:blur(12px)}
      header{display:flex;align-items:center;gap:9px;padding:14px 15px;border-bottom:1px solid #2b3a42;cursor:move;touch-action:none}
      .mark{width:27px;height:27px;border-radius:8px;background:#8aecd1;color:#102721;display:grid;place-items:center;font-size:17px;font-weight:800}
      h1{font-size:14px;margin:0;letter-spacing:.2px} .version{font-size:10px;color:#849ba6} .spacer{flex:1}
      button,select{font:inherit;border:1px solid #3a4c55;border-radius:8px;padding:8px;cursor:pointer;color:inherit;background:#1c2a32}button:hover{filter:brightness(1.17)}button:focus-visible,select:focus-visible{outline:2px solid #8aecd1;outline-offset:2px}
      .icon{padding:1px 8px;font-size:19px} .body{padding:14px} .state{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9aabb4;display:flex;align-items:center;gap:7px}
      .dot{width:7px;height:7px;border-radius:50%;background:#94a3b8}.dot.running{background:#8aecd1}.dot.waiting{background:#ffd28b}
      .message{color:#d6e3e8;min-height:52px;margin:9px 0 12px}.body{max-height:calc(100vh - 165px);overflow-y:auto} .controls{display:flex;gap:8px}.controls button{flex:1;font-weight:650}.start{background:#8aecd1;color:#102721;border-color:#8aecd1}.pause{background:#273b47}
      .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0}.stat{padding:9px 7px;background:#19252c;border-radius:8px}.stat span{display:block;color:#91a8b3;font-size:10px}.stat strong{font-size:15px;font-weight:600}
      .bar{height:5px;background:#24343d;border-radius:8px;overflow:hidden;margin-top:5px}.fill{height:100%;width:0;background:#8aecd1}.ratio{display:flex;justify-content:space-between;color:#91a8b3;font-size:11px}
      .setting{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:10px} select{padding:5px 7px;font-size:12px}input{accent-color:#8aecd1}label{cursor:pointer;color:#c9d8df}
      details{border-top:1px solid #293b45;margin-top:13px;padding-top:11px}summary{cursor:pointer;color:#9eb2bd;font-size:12px}.log{max-height:170px;overflow:auto;padding:0;list-style:none;margin:8px 0 0}.log li{padding:6px 0;border-bottom:1px solid #23343d;font-size:11px;color:#a9bec7;overflow-wrap:anywhere}
      .learning-copy{font-size:11px;color:#a9bec7;margin:8px 0;overflow-wrap:anywhere}.learning-actions{display:flex;flex-wrap:wrap;gap:5px}.learning-actions button{font-size:11px;padding:5px 7px}.learning-table{width:100%;font-size:10px;border-collapse:collapse;margin:9px 0}.learning-table th,.learning-table td{text-align:left;padding:4px 2px;border-bottom:1px solid #293b45}.learning-table th{color:#91a8b3}.warning{color:#ffd28b}
      .foot{display:flex;justify-content:space-between;margin-top:13px;color:#6f8b97;font-size:10px}.collapsed .body{display:none}.collapsed header{border-bottom:0}
      @media(max-height:680px){:host{top:14px}.body{max-height:75vh;overflow:auto}}
    </style>
    <section class="panel" aria-label="OpenFront Pilot">
      <header><div class="mark">P</div><div><h1>OpenFront Pilot</h1><div class="version">LOCAL STRATEGY BOT · v0.10.0</div></div><div class="spacer"></div><button class="icon collapse" aria-label="Collapse panel" title="Collapse">−</button></header>
      <div class="body">
        <div class="state"><i class="dot"></i><span id="state">Paused</span></div>
        <p class="message" id="message" role="status">Press Start to join public Free For All, choose a starting point, and play. In an existing match, Start takes over your position.</p>
        <p class="learning-copy warning" id="compatibility"></p>
        <div class="controls"><button class="start">Start</button><button class="stop" title="Stop bot and learning">Stop all</button></div>
        <div class="stats"><div class="stat"><span>TROOPS</span><strong id="troops">—</strong></div><div class="stat"><span>GOLD</span><strong id="gold">—</strong></div><div class="stat"><span>LAND</span><strong id="land">—</strong></div></div>
        <div class="ratio"><span>Troop capacity</span><span id="ratio">—</span></div><div class="bar"><div class="fill"></div></div>
        <div class="setting"><label for="profile">Play style</label><select id="profile"><option value="cautious">Cautious</option><option value="balanced" selected>Balanced</option><option value="aggressive">Aggressive</option></select></div>
        <div class="setting"><label for="economy">Build & upgrade</label><input type="checkbox" id="economy" checked></div>
        <div class="setting"><label for="navy">Naval expansion</label><input type="checkbox" id="navy" checked></div>
        <div class="setting"><label for="nukes">Nuclear strategy</label><input type="checkbox" id="nukes" checked></div>
        <div class="setting"><label for="diplomacy">Protect flanks with alliances</label><input type="checkbox" id="diplomacy" checked></div>
        <div class="setting"><label for="learning">Learn across games</label><input type="checkbox" id="learning" checked></div>
        <div class="setting"><label for="win-window">Win rate · last games</label><input id="win-window" type="number" min="1" max="1000" value="20" style="width:65px" aria-label="Number of recent games"></div>
        <p class="learning-copy"><strong id="win-rate">—</strong> · <span id="win-detail">No recorded results</span></p>
        <p class="learning-copy">Counts completed matches recorded by learning. Up to 1,000 win/loss flags; no recordings.</p>
        <details class="learning-details" open><summary>Learning · <span id="learn-count">0</span> games</summary>
          <p class="learning-copy" id="learn-message" role="status"></p>
          <p class="learning-copy" id="learn-current"></p>
          <p class="learning-copy" id="learn-memory"></p>
          <p class="learning-copy">Reward: 70% win + 20% peak map share + 10% average map share while playing. No bonus for simply waiting.</p>
          <p class="learning-copy" id="learn-reward"></p>
          <p class="learning-copy warning" id="learn-warning"></p>
          <table class="learning-table"><thead><tr><th>Current match type</th><th>Wins</th><th>Games</th><th>Score</th></tr></thead><tbody id="learn-rows"></tbody></table>
          <div class="learning-actions"><button id="learn-export">Export backup</button><button id="learn-import">Import backup</button><button id="learn-reset">Reset learning</button></div>
          <input type="file" id="learn-file" accept="application/json,.json" hidden>
        </details>
        <details><summary>Decision log</summary><ol class="log"></ol></details>
        <div class="foot"><span>O: start · Esc: stop all</span><span id="commands">0 commands</span></div>
      </div>
    </section>`;
  document.documentElement.append(host);
  const $ = s => root.querySelector(s);
  const format = n => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  let options = { ...DEFAULTS };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (['cautious', 'balanced', 'aggressive'].includes(saved.profile)) options.profile = saved.profile;
    for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy']) if (typeof saved[k] === 'boolean') options[k] = saved[k];
  } catch { /* Defaults work even if storage is unavailable. */ }
  let storage = null;
  try { storage = localStorage; } catch { /* Show memory-only mode in the panel. */ }
  const learningStore = new LearningStore(storage, navigator.locks);
  let winWindow = 20;
  try { const saved = Number(storage?.getItem('openfront-pilot-win-window-v1')); if (saved >= 1 && saved <= 1000) winWindow = Math.floor(saved); } catch {}
  $('#win-window').value = winWindow;
  function renderWinRate() {
    const rate = learningStore.winRate(winWindow);
    $('#win-rate').textContent = rate.percent === null ? '—' : rate.percent.toFixed(1) + '%';
    $('#win-detail').textContent = `${rate.wins} wins / ${rate.games} recorded games`;
  }
  $('#win-window').addEventListener('change', () => {
    winWindow = learningStore.winRate($('#win-window').value).requested;
    $('#win-window').value = winWindow;
    try { storage?.setItem('openfront-pilot-win-window-v1', String(winWindow)); } catch {}
    renderWinRate();
  });
  const learning = new MatchLearning(learningStore, info => {
    renderWinRate();
    $('#learn-count').textContent = info.total;
    $('#learn-message').textContent = info.message;
    $('#learn-current').textContent = info.variant ? 'Match trial: ' + info.variant : 'Seven strategy variants; no game recordings.';
    $('#learn-memory').textContent = `${info.wins} wins learned · ${(info.bytes / 1024).toFixed(1)} / 64 KiB · ${info.contexts} match types`;
    const recent = info.recent[0];
    $('#learn-reward').textContent = recent ? `Last match score: ${(recent.reward * 100).toFixed(1)}/100${recent.territory ? ` · peak ${(recent.territory.peakShare * 100).toFixed(1)}% · average ${(recent.territory.averageShare * 100).toFixed(1)}% land` : ' · no territory data'}` : '';
    $('#learn-warning').textContent = info.warning;
    $('#learn-rows').replaceChildren();
    for (const row of info.rows) {
      const tr = document.createElement('tr');
      for (const value of [row.name, row.wins, row.games, row.weight ? (100 * row.reward / row.weight).toFixed(1) : '—']) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      $('#learn-rows').append(tr);
    }
  });
  const controller = new PilotController(new GameAdapter(document), update => {
    $('#state').textContent = update.status;
    $('.dot').className = 'dot ' + update.status;
    if (update.message) $('#message').textContent = update.message;
    if (update.snapshot) {
      const s = update.snapshot;
      $('#compatibility').textContent = controller.options.diplomacy && !controller.adapter.bridge.supports('alliance')
        ? 'Alliance automation is unavailable in this game client. Handle requests manually.' : '';
      $('#troops').textContent = format(s.troops); $('#gold').textContent = format(s.gold); $('#land').textContent = format(s.tiles);
      $('#ratio').textContent = Math.round(100 * s.troops / s.cap) + '%';
      $('.fill').style.width = Math.min(100, 100 * s.troops / s.cap) + '%';
    }
    if (update.commands != null) $('#commands').textContent = update.commands + ' commands';
    if (update.log || update.status === 'paused') {
      const li = document.createElement('li');
      li.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + update.message;
      $('.log').prepend(li);
      while ($('.log').children.length > 50) $('.log').lastElementChild.remove();
    }
  }, options, learning);
  let timer = null, stopGeneration = 0;
  const starter = new LobbyStarter(controller.adapter, update => {
    $('#state').textContent = update.status;
    $('#message').textContent = update.message;
  }, () => { controller.start({ explicit: true }); return controller.running; });
  const requeue = new AutoRequeue(controller.adapter, sessionStorage, async () => {
    learning.inspect();
    await learning.finish(null, 'Leaving after elimination before a team result.');
  }, path => { location.assign(path); });
  const tick = async () => {
    try {
      if (starter.active) starter.step();
      else if (controller.running && await requeue.step(() => controller.running && !controller.stopped)) return;
      else await controller.step();
    } catch (error) { $('#state').textContent = 'waiting'; $('#message').textContent = error.message + ' Retrying connection checks.'; }
  };
  learning.notify();
  $('#profile').value = options.profile;
  for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy']) $('#' + k).checked = options[k];
  const save = event => {
    if (!['profile', 'economy', 'navy', 'nukes', 'learning', 'diplomacy'].includes(event.target.id)) return;
    controller.options.profile = $('#profile').value;
    for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy']) controller.options[k] = $('#' + k).checked;
    learning.invalidate('Settings changed during this match.');
    if (!controller.options.learning) learning.notify('Learning is off. The original strategy is used; saved scores are retained.');
    try { localStorage.setItem(KEY, JSON.stringify(controller.options)); } catch { /* Optional preferences. */ }
  };
  root.addEventListener('change', save);
  $('#learn-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([learningStore.export()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'openfront-pilot-learning.json';
    root.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#learn-import').addEventListener('click', () => $('#learn-file').click());
  $('#learn-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    const generation = stopGeneration, accept = () => generation === stopGeneration;
    try {
      if (!file) return;
      if (file.size > LIMITS.bytes) throw new Error('Backup exceeds 64 KiB.');
      const raw = await file.text();
      if (!accept()) return;
      await learningStore.import(raw, accept);
      if (!accept()) return;
      learning.invalidate('A learning backup was imported during this match.');
      learning.notify('Backup imported. Updated scores apply to your next match.');
    } catch (error) { if (accept()) learning.notify('Import failed: ' + error.message); }
    finally { event.target.value = ''; }
  });
  $('#learn-reset').addEventListener('click', async () => {
    const generation = stopGeneration, accept = () => generation === stopGeneration;
    if (!confirm('Reset the bot’s learned strategy scores? Export a backup first if you want to keep them.')) return;
    if (!accept()) return;
    learning.invalidate('Learning was reset during this match.');
    await learningStore.reset(accept);
    if (accept()) learning.notify('Learning reset. Your next match starts with the original balance.');
  });
  const start = (explicit = false) => {
    try {
      if (controller.stopped && !explicit) return;
      if (explicit) controller.stopped = false;
      if (!controller.adapter.connect() || controller.adapter.game.gameOver?.()) {
        // The user clicked Start: arm one public FFA entry, not an endless queue.
        controller.stopped = false;
        starter.start(); starter.step();
      } else { starter.stop(); controller.start({ explicit }); }
      if ((controller.running || starter.active) && timer === null) timer = setInterval(tick, 500);
    } catch (e) {
      if (!controller.running) starter.start();
      if (timer === null) timer = setInterval(tick, 500);
      $('#state').textContent = 'waiting'; $('#message').textContent = e.message + ' Retrying connection checks.';
    }
  };
  function stopEverything(message) {
    stopGeneration++;
    requeue.stop();
    starter.stop();
    clearInterval(timer); timer = null;
    controller.emergencyStop(message);
  }
  $('.start').addEventListener('click', () => start(true));
  $('.stop').addEventListener('click', () => stopEverything());
  $('.collapse').addEventListener('click', () => {
    const collapsed = $('.panel').classList.toggle('collapsed');
    $('.collapse').textContent = collapsed ? '+' : '−';
    $('.collapse').setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
  });
  // Keep panel interactions from being interpreted as clicks on the game map.
  for (const event of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel', 'contextmenu', 'keydown']) {
    host.addEventListener(event, e => e.stopPropagation());
  }
  let toggleKeyHeld = false;
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      toggleKeyHeld = false;
      if (!controller.stopped) stopEverything();
      return;
    }
    if (e.code !== 'KeyO' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.composedPath().some(el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
    // Consume both halves of the shortcut: OpenFront also handles keyup.
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || toggleKeyHeld) return;
    toggleKeyHeld = true;
    if (!controller.running && !starter.active) start();
  }, true);
  document.addEventListener('keyup', e => {
    if (e.code === 'Escape' && controller.stopped) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.code !== 'KeyO' || !toggleKeyHeld) return;
    toggleKeyHeld = false;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  // Keep running in the background. Reset only the keyboard repeat latch.
  addEventListener('blur', () => { toggleKeyHeld = false; });
  // Drag within the viewport; does not alter game camera position.
  let drag = null;
  $('header').addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = host.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top };
    $('header').setPointerCapture(e.pointerId);
  });
  $('header').addEventListener('pointermove', e => {
    if (!drag) return;
    host.style.right = 'auto';
    host.style.left = Math.max(0, Math.min(innerWidth - host.offsetWidth, e.clientX - drag.x)) + 'px';
    host.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - drag.y)) + 'px';
  });
  $('header').addEventListener('pointerup', () => { drag = null; });
  $('header').addEventListener('pointercancel', () => { drag = null; });
  addEventListener('pagehide', () => {
    if (requeue.navigating) { clearInterval(timer); controller.emergencyStop('Loading the next match.'); }
    else stopEverything('Page closed. All bot activity stopped.');
  });
  if (consumeRequeue(sessionStorage)) {
    const generation = stopGeneration;
    setTimeout(() => { if (generation === stopGeneration && !controller.stopped) start(true); }, 0);
  }
}
