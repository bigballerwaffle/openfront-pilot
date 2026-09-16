import { createPanel } from './panel.js';
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
  const { host, root } = createPanel(document);
  const $ = (s) => root.querySelector(s);
  const format = (n) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  let options = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (['cautious', 'balanced', 'aggressive'].includes(saved.profile))
      options.profile = saved.profile;
    for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy'])
      if (typeof saved[k] === 'boolean') options[k] = saved[k];
  } catch {
    /* Defaults work even if storage is unavailable. */
  }
  let storage = null;
  try {
    storage = localStorage;
  } catch {
    /* Show memory-only mode in the panel. */
  }
  const learningStore = new LearningStore(storage, navigator.locks);
  let winWindow = 20;
  try {
    const saved = Number(storage?.getItem('openfront-pilot-win-window-v1'));
    if (saved >= 1 && saved <= 1000) winWindow = Math.floor(saved);
  } catch {}
  $('#win-window').value = winWindow;
  function renderWinRate() {
    const rate = learningStore.winRate(winWindow);
    $('#win-rate').textContent = rate.percent === null ? '—' : rate.percent.toFixed(1) + '%';
    $('#win-detail').textContent = `${rate.wins} wins / ${rate.games} recorded games`;
  }
  $('#win-window').addEventListener('change', () => {
    winWindow = learningStore.winRate($('#win-window').value).requested;
    $('#win-window').value = winWindow;
    try {
      storage?.setItem('openfront-pilot-win-window-v1', String(winWindow));
    } catch {}
    renderWinRate();
  });
  const learning = new MatchLearning(learningStore, (info) => {
    renderWinRate();
    $('#learn-count').textContent = info.total;
    $('#learn-message').textContent = info.message;
    $('#learn-current').textContent = info.variant
      ? 'Match trial: ' + info.variant
      : 'Seven strategy variants; no game recordings.';
    $('#learn-memory').textContent =
      `${info.wins} wins learned · ${(info.bytes / 1024).toFixed(1)} / 64 KiB · ${info.contexts} match types`;
    const recent = info.recent[0];
    $('#learn-reward').textContent = recent
      ? `Last match score: ${(recent.reward * 100).toFixed(1)}/100${recent.territory ? ` · peak ${(recent.territory.peakShare * 100).toFixed(1)}% · average ${(recent.territory.averageShare * 100).toFixed(1)}% land` : ' · no territory data'}`
      : '';
    $('#learn-warning').textContent = info.warning;
    $('#learn-rows').replaceChildren();
    for (const row of info.rows) {
      const tr = document.createElement('tr');
      for (const value of [
        row.name,
        row.wins,
        row.games,
        row.weight ? ((100 * row.reward) / row.weight).toFixed(1) : '—',
      ]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      $('#learn-rows').append(tr);
    }
  });
  const controller = new PilotController(
    new GameAdapter(document),
    (update) => {
      $('#state').textContent = update.status;
      $('.dot').className = 'dot ' + update.status;
      if (update.message) $('#message').textContent = update.message;
      if (update.snapshot) {
        const s = update.snapshot;
        $('#compatibility').textContent =
          controller.options.diplomacy && !controller.adapter.bridge.supports('alliance')
            ? 'Alliance automation is unavailable in this game client. Handle requests manually.'
            : '';
        $('#troops').textContent = format(s.troops);
        $('#gold').textContent = format(s.gold);
        $('#land').textContent = format(s.tiles);
        $('#ratio').textContent = Math.round((100 * s.troops) / s.cap) + '%';
        $('.fill').style.width = Math.min(100, (100 * s.troops) / s.cap) + '%';
      }
      if (update.commands != null) $('#commands').textContent = update.commands + ' commands';
      if (update.log || update.status === 'paused') {
        const li = document.createElement('li');
        li.textContent =
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) +
          ' · ' +
          update.message;
        $('.log').prepend(li);
        while ($('.log').children.length > 50) $('.log').lastElementChild.remove();
      }
    },
    options,
    learning,
  );
  let timer = null,
    stopGeneration = 0;
  const starter = new LobbyStarter(
    controller.adapter,
    (update) => {
      $('#state').textContent = update.status;
      $('#message').textContent = update.message;
    },
    () => {
      controller.start({ explicit: true });
      return controller.running;
    },
    () => requeue.recover(() => starter.active && !controller.stopped),
  );
  const requeue = new AutoRequeue(
    controller.adapter,
    sessionStorage,
    async () => {
      learning.inspect();
      await learning.finish(null, 'Leaving after elimination before a team result.');
    },
    (path) => {
      location.assign(path);
    },
  );
  const tick = async () => {
    try {
      if (starter.active) await starter.step();
      else if (
        controller.running &&
        (await requeue.step(() => controller.running && !controller.stopped))
      )
        return;
      else await controller.step();
    } catch (error) {
      $('#state').textContent = 'waiting';
      $('#message').textContent = error.message + ' Retrying connection checks.';
    }
  };
  learning.notify();
  $('#profile').value = options.profile;
  for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy'])
    $('#' + k).checked = options[k];
  const save = (event) => {
    if (!['profile', 'economy', 'navy', 'nukes', 'learning', 'diplomacy'].includes(event.target.id))
      return;
    controller.options.profile = $('#profile').value;
    for (const k of ['economy', 'navy', 'nukes', 'learning', 'diplomacy'])
      controller.options[k] = $('#' + k).checked;
    learning.invalidate('Settings changed during this match.');
    if (!controller.options.learning)
      learning.notify('Learning is off. The original strategy is used; saved scores are retained.');
    try {
      localStorage.setItem(KEY, JSON.stringify(controller.options));
    } catch {
      /* Optional preferences. */
    }
  };
  root.addEventListener('change', save);
  $('#learn-export').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([learningStore.export()], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openfront-pilot-learning.json';
    root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#learn-import').addEventListener('click', () => $('#learn-file').click());
  $('#learn-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    const generation = stopGeneration,
      accept = () => generation === stopGeneration;
    try {
      if (!file) return;
      if (file.size > LIMITS.bytes) throw new Error('Backup exceeds 64 KiB.');
      const raw = await file.text();
      if (!accept()) return;
      await learningStore.import(raw, accept);
      if (!accept()) return;
      learning.invalidate('A learning backup was imported during this match.');
      learning.notify('Backup imported. Updated scores apply to your next match.');
    } catch (error) {
      if (accept()) learning.notify('Import failed: ' + error.message);
    } finally {
      event.target.value = '';
    }
  });
  $('#learn-reset').addEventListener('click', async () => {
    const generation = stopGeneration,
      accept = () => generation === stopGeneration;
    if (
      !confirm(
        'Reset the bot’s learned strategy scores? Export a backup first if you want to keep them.',
      )
    )
      return;
    if (!accept()) return;
    learning.invalidate('Learning was reset during this match.');
    await learningStore.reset(accept);
    if (accept())
      learning.notify('Learning reset. Your next match starts with the original balance.');
  });
  const start = (explicit = false) => {
    try {
      if (controller.stopped && !explicit) return;
      if (explicit) controller.stopped = false;
      if (!controller.adapter.connect() || controller.adapter.game.gameOver?.()) {
        // The user clicked Start: arm one public FFA entry, not an endless queue.
        controller.stopped = false;
        starter.start();
        starter.step();
      } else {
        starter.stop();
        controller.start({ explicit });
      }
      if ((controller.running || starter.active) && timer === null) timer = setInterval(tick, 500);
    } catch (e) {
      if (!controller.running) starter.start();
      if (timer === null) timer = setInterval(tick, 500);
      $('#state').textContent = 'waiting';
      $('#message').textContent = e.message + ' Retrying connection checks.';
    }
  };
  function stopEverything(message) {
    stopGeneration++;
    requeue.stop();
    starter.stop();
    clearInterval(timer);
    timer = null;
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
  for (const event of [
    'click',
    'dblclick',
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'wheel',
    'contextmenu',
    'keydown',
  ]) {
    host.addEventListener(event, (e) => e.stopPropagation());
  }
  let toggleKeyHeld = false;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleKeyHeld = false;
        if (!controller.stopped) stopEverything();
        return;
      }
      if (e.code !== 'KeyO' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (
        e
          .composedPath()
          .some(
            (el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable,
          )
      )
        return;
      // Consume both halves of the shortcut: OpenFront also handles keyup.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || toggleKeyHeld) return;
      toggleKeyHeld = true;
      if (!controller.running && !starter.active) start();
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.code === 'Escape' && controller.stopped) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.code !== 'KeyO' || !toggleKeyHeld) return;
      toggleKeyHeld = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  // Keep running in the background. Reset only the keyboard repeat latch.
  addEventListener('blur', () => {
    toggleKeyHeld = false;
  });
  // Drag within the viewport; does not alter game camera position.
  let drag = null;
  $('header').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = host.getBoundingClientRect();
    drag = { x: e.clientX - r.left, y: e.clientY - r.top };
    $('header').setPointerCapture(e.pointerId);
  });
  $('header').addEventListener('pointermove', (e) => {
    if (!drag) return;
    host.style.right = 'auto';
    host.style.left =
      Math.max(0, Math.min(innerWidth - host.offsetWidth, e.clientX - drag.x)) + 'px';
    host.style.top = Math.max(0, Math.min(innerHeight - 60, e.clientY - drag.y)) + 'px';
  });
  $('header').addEventListener('pointerup', () => {
    drag = null;
  });
  $('header').addEventListener('pointercancel', () => {
    drag = null;
  });
  addEventListener('pagehide', () => {
    if (requeue.navigating) {
      clearInterval(timer);
      controller.emergencyStop('Loading the next match.');
    } else stopEverything('Page closed. All bot activity stopped.');
  });
  if (consumeRequeue(sessionStorage)) {
    const generation = stopGeneration;
    setTimeout(() => {
      if (generation === stopGeneration && !controller.stopped) start(true);
    }, 0);
  }
}
