/** Create the panel's isolated DOM. Controls are wired up in main.js. */
export function createPanel(document) {
  const host = document.createElement('openfront-pilot');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = /* HTML */ ` <style>
      :host {
        all: initial;
        position: fixed;
        top: 82px;
        right: 14px;
        z-index: 2147483000;
        font:
          13px/1.45 system-ui,
          sans-serif;
        color: #eef3f4;
        display: block;
        width: 290px;
        max-width: calc(100vw - 28px);
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      .panel {
        background: #10191ff2;
        border: 1px solid #344951;
        border-radius: 16px;
        box-shadow: 0 12px 40px #0006;
        overflow: hidden;
        backdrop-filter: blur(12px);
      }
      header {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 14px 15px;
        border-bottom: 1px solid #2b3a42;
        cursor: move;
        touch-action: none;
      }
      .mark {
        width: 27px;
        height: 27px;
        border-radius: 8px;
        background: #8aecd1;
        color: #102721;
        display: grid;
        place-items: center;
        font-size: 17px;
        font-weight: 800;
      }
      h1 {
        font-size: 14px;
        margin: 0;
        letter-spacing: 0.2px;
      }
      .version {
        font-size: 10px;
        color: #849ba6;
      }
      .spacer {
        flex: 1;
      }
      button,
      select {
        font: inherit;
        border: 1px solid #3a4c55;
        border-radius: 8px;
        padding: 8px;
        cursor: pointer;
        color: inherit;
        background: #1c2a32;
      }
      button:hover {
        filter: brightness(1.17);
      }
      button:focus-visible,
      select:focus-visible {
        outline: 2px solid #8aecd1;
        outline-offset: 2px;
      }
      .icon {
        padding: 1px 8px;
        font-size: 19px;
      }
      .body {
        padding: 14px;
      }
      .state {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #9aabb4;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #94a3b8;
      }
      .dot.running {
        background: #8aecd1;
      }
      .dot.waiting {
        background: #ffd28b;
      }
      .message {
        color: #d6e3e8;
        min-height: 52px;
        margin: 9px 0 12px;
      }
      .body {
        max-height: calc(100vh - 165px);
        overflow-y: auto;
      }
      .controls {
        display: flex;
        gap: 8px;
      }
      .controls button {
        flex: 1;
        font-weight: 650;
      }
      .start {
        background: #8aecd1;
        color: #102721;
        border-color: #8aecd1;
      }
      .pause {
        background: #273b47;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin: 14px 0;
      }
      .stat {
        padding: 9px 7px;
        background: #19252c;
        border-radius: 8px;
      }
      .stat span {
        display: block;
        color: #91a8b3;
        font-size: 10px;
      }
      .stat strong {
        font-size: 15px;
        font-weight: 600;
      }
      .bar {
        height: 5px;
        background: #24343d;
        border-radius: 8px;
        overflow: hidden;
        margin-top: 5px;
      }
      .fill {
        height: 100%;
        width: 0;
        background: #8aecd1;
      }
      .ratio {
        display: flex;
        justify-content: space-between;
        color: #91a8b3;
        font-size: 11px;
      }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        gap: 10px;
      }
      select {
        padding: 5px 7px;
        font-size: 12px;
      }
      input {
        accent-color: #8aecd1;
      }
      label {
        cursor: pointer;
        color: #c9d8df;
      }
      details {
        border-top: 1px solid #293b45;
        margin-top: 13px;
        padding-top: 11px;
      }
      summary {
        cursor: pointer;
        color: #9eb2bd;
        font-size: 12px;
      }
      .log {
        max-height: 170px;
        overflow: auto;
        padding: 0;
        list-style: none;
        margin: 8px 0 0;
      }
      .log li {
        padding: 6px 0;
        border-bottom: 1px solid #23343d;
        font-size: 11px;
        color: #a9bec7;
        overflow-wrap: anywhere;
      }
      .learning-copy {
        font-size: 11px;
        color: #a9bec7;
        margin: 8px 0;
        overflow-wrap: anywhere;
      }
      .learning-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .learning-actions button {
        font-size: 11px;
        padding: 5px 7px;
      }
      .learning-table {
        width: 100%;
        font-size: 10px;
        border-collapse: collapse;
        margin: 9px 0;
      }
      .learning-table th,
      .learning-table td {
        text-align: left;
        padding: 4px 2px;
        border-bottom: 1px solid #293b45;
      }
      .learning-table th {
        color: #91a8b3;
      }
      .warning {
        color: #ffd28b;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        margin-top: 13px;
        color: #6f8b97;
        font-size: 10px;
      }
      .collapsed .body {
        display: none;
      }
      .collapsed header {
        border-bottom: 0;
      }
      @media (max-height: 680px) {
        :host {
          top: 14px;
        }
        .body {
          max-height: 75vh;
          overflow: auto;
        }
      }
    </style>
    <section class="panel" aria-label="OpenFront Pilot">
      <header>
        <div class="mark">P</div>
        <div>
          <h1>OpenFront Pilot</h1>
          <div class="version">LOCAL STRATEGY BOT · v0.13.0</div>
        </div>
        <div class="spacer"></div>
        <button class="icon collapse" aria-label="Collapse panel" title="Collapse">−</button>
      </header>
      <div class="body">
        <div class="state"><i class="dot"></i><span id="state">Paused</span></div>
        <p class="message" id="message" role="status">
          Press Start to join public Free For All, choose a starting point, and play. In an existing
          match, Start takes over your position.
        </p>
        <p class="learning-copy warning" id="compatibility"></p>
        <div class="controls">
          <button class="start">Start</button
          ><button class="stop" title="Stop bot and learning">Stop all</button>
        </div>
        <div class="stats">
          <div class="stat"><span>TROOPS</span><strong id="troops">—</strong></div>
          <div class="stat"><span>GOLD</span><strong id="gold">—</strong></div>
          <div class="stat"><span>LAND</span><strong id="land">—</strong></div>
        </div>
        <div class="ratio"><span>Troop capacity</span><span id="ratio">—</span></div>
        <div class="bar"><div class="fill"></div></div>
        <div class="setting">
          <label for="profile">Play style</label
          ><select id="profile">
            <option value="cautious">Cautious</option>
            <option value="balanced" selected>Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div class="setting">
          <label for="economy">Build & upgrade</label><input type="checkbox" id="economy" checked />
        </div>
        <button id="spending" type="button" aria-pressed="true">
          Bot spending: ON — click to save gold
        </button>
        <p class="learning-copy">
          OFF blocks all bot gold purchases. Only you can turn it back on. Manual purchases still
          work.
        </p>
        <p class="learning-copy" id="coach-status">
          Manual guidance is learned while the pilot and learning are on.
        </p>
        <div class="setting">
          <label for="navy">Naval expansion</label><input type="checkbox" id="navy" checked />
        </div>
        <div class="setting">
          <label for="nukes">Nuclear strategy</label><input type="checkbox" id="nukes" checked />
        </div>
        <div class="setting">
          <label for="diplomacy">Protect flanks with alliances</label
          ><input type="checkbox" id="diplomacy" checked />
        </div>
        <div class="setting">
          <label for="learning">Learn across games</label
          ><input type="checkbox" id="learning" checked />
        </div>
        <div class="setting">
          <label for="win-window">Win rate · last games</label
          ><input
            id="win-window"
            type="number"
            min="1"
            max="1000"
            value="20"
            style="width:65px"
            aria-label="Number of recent games"
          />
        </div>
        <p class="learning-copy">
          <strong id="win-rate">—</strong> · <span id="win-detail">No recorded results</span>
        </p>
        <p class="learning-copy">
          Counts completed matches recorded by learning. Up to 1,000 win/loss flags; no recordings.
        </p>
        <details class="learning-details" open>
          <summary>Learning · <span id="learn-count">0</span> games</summary>
          <p class="learning-copy" id="learn-message" role="status"></p>
          <p class="learning-copy" id="learn-current"></p>
          <p class="learning-copy" id="learn-memory"></p>
          <p class="learning-copy">
            Reward: 70% win + 20% peak map share + 10% average map share while playing. No bonus for
            simply waiting.
          </p>
          <p class="learning-copy" id="learn-reward"></p>
          <p class="learning-copy warning" id="learn-warning"></p>
          <table class="learning-table">
            <thead>
              <tr>
                <th>Current match type</th>
                <th>Wins</th>
                <th>Games</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody id="learn-rows"></tbody>
          </table>
          <div class="learning-actions">
            <button id="learn-export">Export backup</button
            ><button id="learn-import">Import backup</button
            ><button id="learn-reset">Reset learning</button>
          </div>
          <input type="file" id="learn-file" accept="application/json,.json" hidden />
        </details>
        <details>
          <summary>Decision log</summary>
          <ol class="log"></ol>
        </details>
        <div class="foot">
          <span>O: start · Esc: stop all</span><span id="commands">0 commands</span>
        </div>
      </div>
    </section>`;
  document.documentElement.append(host);
  return { host, root };
}
