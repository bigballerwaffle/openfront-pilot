import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { LearningStore, LEARNING_KEY } from '../src/learning.js';
const bundle = await readFile(new URL('../pilot.js', import.meta.url), 'utf8');
function page() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://openfront.io/', runScripts: 'outside-only' });
  dom.window.structuredClone = structuredClone;
  dom.window.eval(bundle);
  return { dom, window: dom.window, root: dom.window.document.querySelector('openfront-pilot').shadowRoot };
}

test('bundled spending lock persists across reloads and is independent of build settings', () => {
  const first = page(); let preferences;
  try {
    const button = first.root.querySelector('#spending');
    button.click(); assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(first.root.querySelector('#economy').checked, true);
    first.window.confirm = () => false;
    first.root.querySelector('#learn-reset').click();
    preferences = first.window.localStorage.getItem('openfront-pilot-options-v1');
    assert.equal(JSON.parse(preferences).spending, false);
  } finally { first.dom.window.close(); }
  const dom = new JSDOM('<!doctype html>', { url: 'https://openfront.io/', runScripts: 'outside-only' });
  try {
    dom.window.structuredClone = structuredClone;
    dom.window.localStorage.setItem('openfront-pilot-options-v1', preferences);
    dom.window.eval(bundle);
    const root = dom.window.document.querySelector('openfront-pilot').shadowRoot;
    assert.equal(root.querySelector('#spending').getAttribute('aria-pressed'), 'false');
    root.querySelector('.start').click();
    assert.equal(root.querySelector('#spending').getAttribute('aria-pressed'), 'false');
    root.querySelector('#spending').click();
    assert.equal(root.querySelector('#spending').getAttribute('aria-pressed'), 'true');
  } finally { dom.window.close(); }
});

test('bundled lobby retry stays armed and Stop cancels later retries', async () => {
  const { dom, window, root } = page(); let callback, now = 1000, joins = 0;
  window.Date.now = () => now;
  window.setInterval = fn => { callback = fn; return 1; };
  window.clearInterval = () => {};
  try {
    const selector = window.document.createElement('game-mode-selector');
    selector.lobbies = { games: { ffa: [{ gameID: 'test', gameConfig: { gameMode: 'Free For All' } }] } };
    selector.validateAndJoin = () => { joins++; return false; };
    window.document.body.append(selector);
    root.querySelector('.start').click(); assert.equal(joins, 1);
    await callback(); assert.equal(joins, 1);
    now += 5000; await callback(); assert.equal(joins, 2);
    root.querySelector('.stop').click();
    now += 100000; await callback(); assert.equal(joins, 2);
  } finally { dom.window.close(); }
});
test('bundled panel enables learning by default, persists settings, and ignores O while typing', () => {
  const { dom, window, root } = page();
  try {
    assert.equal(root.querySelector('#learning').checked, true);
    assert.match(root.querySelector('#learn-memory').textContent, /64 KiB/);
    root.querySelector('#learning').click();
    assert.equal(JSON.parse(window.localStorage.getItem('openfront-pilot-options-v1')).learning, false);
    const input = window.document.createElement('input'); window.document.body.append(input); input.focus();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyO', bubbles: true, composed: true }));
    assert.equal(root.querySelector('#state').textContent, 'Paused');
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyO', bubbles: true }));
    assert.equal(root.querySelector('#state').textContent, 'waiting');
  } finally { dom.window.close(); }
});
test('saved scores render in a fresh panel and reset writes a clean model', async () => {
  const dom = new JSDOM('<!doctype html>', { url: 'https://openfront.io/', runScripts: 'outside-only' });
  try {
    dom.window.structuredClone = structuredClone;
    const store = new LearningStore(dom.window.localStorage);
    await store.record({ id: 'g1', context: 'test', variant: 'baseline', win: true, ticks: 1000, commands: 5, coverage: 1 });
    dom.window.confirm = () => true; dom.window.eval(bundle);
    const root = dom.window.document.querySelector('openfront-pilot').shadowRoot;
    assert.equal(root.querySelector('#learn-count').textContent, '1');
    root.querySelector('#learn-reset').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(root.querySelector('#learn-count').textContent, '0');
    assert.equal(JSON.parse(dom.window.localStorage.getItem(LEARNING_KEY)).total, 0);
  } finally { dom.window.close(); }
});

test('Escape stops the bundled bot while typing, O cannot restart it, and Alt-Tab keeps its timer running', () => {
  const { dom, window, root } = page();
  let timers = 0;
  window.setInterval = () => { timers++; return 17; };
  window.clearInterval = () => { timers = 0; };
  try {
    window.eval(`{
      class A { constructor(targetID,troops){this.targetID=targetID;this.troops=troops;} }
      class B { constructor(unit,tile,rocketDirectionUp,amount){this.unit=unit;this.tile=tile;this.rocketDirectionUp=rocketDirectionUp;this.amount=amount;} }
      const panel=document.createElement('control-panel');
      panel.game=Object.fromEntries(['myPlayer','config','ticks','ownerID','owner','neighbors','players','units','ref','isLand','width','height'].map(k=>[k,()=>null]));
      panel.eventBus={listeners:new Map([[A,[]],[B,[]]]),emit(){}};
      document.body.append(panel);
    }`);
    root.querySelector('.start').click(); assert.equal(timers, 1);
    const input = window.document.createElement('input'); window.document.body.append(input); input.focus();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    assert.equal(root.querySelector('#state').textContent, 'stopped'); assert.equal(timers, 0);
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyO', bubbles: true }));
    assert.equal(root.querySelector('#state').textContent, 'stopped'); assert.equal(timers, 0);
    root.querySelector('.start').click(); assert.equal(timers, 1);
    window.document.body.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyO', bubbles: true }));
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyO', bubbles: true }));
    assert.equal(root.querySelector('#state').textContent, 'running');
    assert.equal(root.querySelector('.pause'), null);
    window.dispatchEvent(new window.Event('blur'));
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(root.querySelector('#state').textContent, 'running'); assert.equal(timers, 1);
    root.querySelector('.stop').click(); assert.equal(timers, 0);
  } finally { dom.window.close(); }
});

test('bundled Start waits through a delayed FFA connection and spawns; Escape disarms loading', async () => {
  for (const stopDuringLoad of [false, true]) {
    const { dom, window, root } = page(); let callback;
    window.setInterval = fn => { callback = fn; return 21; }; window.clearInterval = () => {};
    try {
      window.eval(`{
        const selector=document.createElement('game-mode-selector');
        selector.lobbies={games:{ffa:[{gameID:'ffa',numClients:1,gameConfig:{gameMode:'Free For All',maxPlayers:20}}]}};
        selector.inLobby=false; selector.validateAndJoin=function(){this.joined=true};
        document.body.append(selector);
      }`);
      root.querySelector('.start').click();
      assert.equal(window.document.querySelector('game-mode-selector').joined, true);
      await callback(); await callback();
      assert.equal(root.querySelector('#state').textContent, 'waiting');
      if (stopDuringLoad) root.querySelector('.stop').click();
      window.eval(`{
        class A { constructor(targetID,troops){this.targetID=targetID;this.troops=troops;} }
        class B { constructor(unit,tile,rocketDirectionUp,amount){this.unit=unit;this.tile=tile;this.rocketDirectionUp=rocketDirectionUp;this.amount=amount;} }
        class S { constructor(tile){this.tile=tile;} }
        const panel=document.createElement('control-panel');
        panel.game={myPlayer:()=>({hasSpawned:()=>false}),config:()=>({gameConfig:()=>({gameMode:'Free For All'})}),
          ticks:()=>1,ownerID:()=>0,owner:()=>null,neighbors:()=>[],players:()=>[],units:()=>[],
          ref:(x,y)=>y*160+x,isLand:()=>true,width:()=>160,height:()=>120,
          x:t=>t%160,y:t=>Math.floor(t/160),isValidCoord:(x,y)=>x>=0&&x<160&&y>=0&&y<120,inSpawnPhase:()=>true};
        panel.eventBus={listeners:new Map([[A,[]],[B,[]],[S,[]]]),emit(e){panel.sent=e}};
        document.body.append(panel);
      }`);
      await callback(); await callback();
      const panel = window.document.querySelector('control-panel');
      if (stopDuringLoad) assert.equal(panel.sent, undefined);
      else { assert.equal(Number.isInteger(panel.sent.tile), true); assert.match(root.querySelector('#message').textContent, /starting point/); }
    } finally { window.close(); }
  }
});

test('recent win-rate window is selectable and its preference persists', async () => {
  const dom = new JSDOM('<!doctype html>', { url: 'https://openfront.io/', runScripts: 'outside-only' });
  try {
    dom.window.structuredClone = structuredClone;
    const store = new LearningStore(dom.window.localStorage);
    for (const [id, win] of [['a', false], ['b', true]]) await store.record({ id, context: 'test', variant: 'baseline', win, ticks: 1000, commands: 5, coverage: 1 });
    dom.window.eval(bundle);
    const root = dom.window.document.querySelector('openfront-pilot').shadowRoot;
    assert.equal(root.querySelector('#win-rate').textContent, '50.0%');
    const input = root.querySelector('#win-window'); input.value = '1';
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(root.querySelector('#win-rate').textContent, '100.0%');
    assert.equal(dom.window.localStorage.getItem('openfront-pilot-win-window-v1'), '1');
    assert.match(root.querySelector('#win-detail').textContent, /1 wins \/ 1 recorded/);
  } finally { dom.window.close(); }
});
