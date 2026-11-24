// UI: wallet card (privacy toggle), metrics, terminal and the live hybrid-routing panel.
import { enableOnDevice, HybridError, type HybridResult } from '../ai/hybrid';
import { getNanoAvailability, policyFor, TASK_LABELS, type TaskKind } from '../ai/router';
import {
  budgetSimulation,
  deepAnalysis,
  detectAnomalies,
  parseNote,
  privacyAudit,
  type CloudRun,
} from '../ai/tasks';
import { addTransaction, seedDemoData, watchTransactions, type Tx } from '../data/transactions';
import { isConfigured } from '../firebase';
import { badgeHtml, esc } from './badge';
import { renderChips, type StatusState } from './status';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface RouteView {
  task: TaskKind;
  result?: HybridResult;
  error?: string;
}
interface Egress {
  time: string;
  task: string;
  bytes: number;
  payload: string;
}

export async function startApp(uid: string | null): Promise<void> {
  const status: StatusState = {
    online: navigator.onLine,
    nano: 'unsupported',
    uid,
    fromCache: true,
    pendingWrites: false,
  };
  let txs: Tx[] = [];
  let privacyMode = true; // card privacy toggle == strict on-device routing
  let busy = false;
  let lastRoute: RouteView | null = null;
  const egress: Egress[] = [];

  const out = $('term-out');
  const input = $<HTMLInputElement>('term-in');

  // ----------------------------------------------------------------- status
  const refreshNano = async () => {
    status.nano = await getNanoAvailability();
    renderChips($('chips'), status);
  };
  window.addEventListener('online', () => {
    status.online = true;
    renderChips($('chips'), status);
    renderRouting();
  });
  window.addEventListener('offline', () => {
    status.online = false;
    renderChips($('chips'), status);
    renderRouting();
  });
  await refreshNano();

  if (!isConfigured) {
    $('banner').innerHTML =
      '<div class="banner">Firebase is not configured yet. Copy <code>.env.example</code> to <code>.env</code> and fill it in (see README).</div>';
  }

  // ----------------------------------------------------------------- data
  watchTransactions(uid, (snap) => {
    txs = snap.txs;
    status.fromCache = snap.fromCache;
    status.pendingWrites = snap.pendingWrites;
    renderChips($('chips'), status);
    renderWallet();
    renderMetrics();
    renderTxs();
  });

  // ----------------------------------------------------------------- rendering
  const money = (n: number, cur = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);
  const mask = (s: string) => (privacyMode ? '••••' : s);

  function renderWallet() {
    const balance = txs.reduce((a, t) => a + t.amount, 0);
    const spend30 = txs
      .filter((t) => t.amount < 0 && Date.now() - t.ts < 30 * 86_400_000)
      .reduce((a, t) => a - t.amount, 0);
    $('wallet').innerHTML = `
      <div class="panel-head"><h2>Wallet</h2>
        <label class="switch" title="Masks sensitive values and pins private AI tasks to this device (ONLY_ON_DEVICE)">
          <input type="checkbox" id="privacy-toggle" ${privacyMode ? 'checked' : ''} />
          <span class="slider"></span><span class="switch-label">Privacy mode</span>
        </label>
      </div>
      <div class="card ${privacyMode ? 'masked' : ''}">
        <div class="card-top"><span>DG Nexus Card</span><span class="contactless">)))</span></div>
        <div class="card-number">${privacyMode ? '•••• •••• •••• ••••' : '4242 4242 4242 4242'}</div>
        <div class="card-bottom"><span>${privacyMode ? '•• / ••' : '12 / 29'}</span><span>${privacyMode ? 'HIDDEN' : 'ALEX RIVERA'}</span></div>
      </div>
      <div class="balance"><small>Available balance</small><strong>${mask(money(balance))}</strong></div>
      <div class="balance"><small>Spent, last 30 days</small><strong>${mask(money(spend30))}</strong></div>
      <p class="hint">${
        privacyMode
          ? 'Receipt parsing runs <b>ONLY_ON_DEVICE</b>. Raw text never leaves the browser.'
          : 'Receipt parsing runs <b>PREFER_ON_DEVICE</b>. It may fall back to the cloud if Nano is missing.'
      }</p>`;
    $<HTMLInputElement>('privacy-toggle').addEventListener('change', (e) => {
      privacyMode = (e.target as HTMLInputElement).checked;
      renderWallet();
      renderTxs();
      renderRouting();
    });
  }

  function renderMetrics() {
    const cats = new Map<string, number>();
    let income = 0;
    let spend = 0;
    for (const t of txs) {
      if (t.amount >= 0) income += t.amount;
      else {
        spend -= t.amount;
        cats.set(t.category, (cats.get(t.category) ?? 0) - t.amount);
      }
    }
    const rows = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = rows[0]?.[1] || 1;
    const rate = income > 0 ? Math.round(((income - spend) / income) * 100) : 0;
    $('metrics').innerHTML = `
      <div class="panel-head"><h2>Metrics</h2></div>
      <div class="kpis">
        <div><small>Income</small><strong>${mask(money(income))}</strong></div>
        <div><small>Spending</small><strong>${mask(money(spend))}</strong></div>
        <div><small>Savings rate</small><strong>${income > 0 ? mask(rate + '%') : '—'}</strong></div>
      </div>
      <div class="bars">${
        rows.length
          ? rows
              .map(
                ([c, v]) =>
                  `<div class="bar"><span>${esc(c)}</span><div><i style="width:${Math.max(4, (v / max) * 100)}%"></i></div><em>${mask(money(v))}</em></div>`,
              )
              .join('')
          : '<p class="hint">No data yet. Click “Load demo data” or use <code>/add</code>.</p>'
      }</div>`;
  }

  function renderTxs() {
    $('txs').innerHTML = `
      <div class="panel-head"><h2>Recent activity</h2><small>${txs.length} records · stored in Firestore (offline cache)</small></div>
      <div class="tx-list">${
        txs
          .slice(0, 12)
          .map(
            (t) => `<div class="tx">
              <div><b>${privacyMode ? '••••••' : esc(t.merchant)}</b><small>${privacyMode ? 'hidden' : esc(t.concept)} · ${esc(t.category)}${t.sensitivity === 'high' ? ' · 🔒 sensitive' : ''}</small></div>
              <div class="tx-right"><b class="${t.amount < 0 ? 'neg' : 'pos'}">${mask(money(t.amount, t.currency))}</b>
              <small>${t.classifiedBy === 'ON_DEVICE' ? '⚡ Nano' : t.classifiedBy === 'IN_CLOUD' ? '☁ Cloud' : 'demo'}</small></div>
            </div>`,
          )
          .join('') || '<p class="hint">Nothing here yet.</p>'
      }</div>`;
  }

  function renderRouting() {
    const rows = (['parse-note', 'privacy-audit', 'deep-analysis', 'budget-sim', 'anomalies'] as TaskKind[])
      .map((k) => {
        const p = policyFor(k, privacyMode);
        const where = p.modeName === 'ONLY_IN_CLOUD' ? '☁' : '⚡';
        return `<tr><td>${TASK_LABELS[k]}</td><td><code>${p.modeName}</code></td><td>${where}</td></tr>`;
      })
      .join('');
    const last = lastRoute;
    let lastHtml = '<p class="hint">Run a command to see the routing decision here.</p>';
    if (last?.error) {
      lastHtml = `<div class="route-card err"><b>${TASK_LABELS[last.task]}</b><p>${esc(last.error)}</p></div>`;
    } else if (last?.result) {
      const r = last.result;
      lastHtml = `<div class="route-card">
        <b>${TASK_LABELS[r.task]}</b>
        <div>${badgeHtml(r.source, r.latencyMs)}</div>
        <dl>
          <dt>Requested mode</dt><dd><code>${r.policy.modeName}</code></dd>
          <dt>Executed on</dt><dd>${r.source === 'ON_DEVICE' ? 'This device (Gemini Nano)' : `Cloud (${esc(r.cloudModel)})`}</dd>
          <dt>Bytes sent to cloud</dt><dd>${r.bytesSentToCloud}</dd>
        </dl>
        <p class="why">${esc(r.policy.reason)}</p>
        ${
          r.policy.modeName === 'PREFER_ON_DEVICE' && r.source === 'IN_CLOUD'
            ? '<p class="warn-text">Gemini Nano was not available, so the SDK fell back to the cloud.</p>'
            : ''
        }
      </div>`;
    }
    $('routing').innerHTML = `
      <div class="panel-head"><h2>Hybrid routing</h2><small>${status.online ? 'online' : 'offline'}</small></div>
      <table class="route-table"><thead><tr><th>Task</th><th>Firebase AI Logic mode</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <h3>Last decision</h3>${lastHtml}
      <h3>Cloud egress log</h3>
      <div class="egress">${
        egress.length
          ? egress
              .map(
                (e) =>
                  `<details><summary>${e.time} · ${esc(e.task)} · ${e.bytes} B</summary><pre>${esc(e.payload)}</pre></details>`,
              )
              .join('')
          : '<p class="hint">Nothing has left this device.</p>'
      }</div>`;
  }

  // ----------------------------------------------------------------- terminal
  const print = (kind: 'user' | 'out' | 'err' | 'sys', html: string) => {
    const d = document.createElement('div');
    d.className = `line ${kind}`;
    d.innerHTML = html;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  };
  const text = (s: string) => esc(s).replace(/\n/g, '<br>');

  const HELP = `Commands
/add &lt;receipt or payment note&gt;   parse + classify (private, on-device)
/audit                          privacy audit (always on-device)
/analyze                        deep performance analysis (cloud, aggregates only)
/simulate &lt;scenario&gt;            budget simulation (cloud)
/anomalies                      anomaly detection (cloud)
/seed                           load demo data
/clear                          clear terminal`;

  function noteCloud(c: CloudRun, task: string) {
    egress.unshift({
      time: new Date().toLocaleTimeString(),
      task,
      bytes: c.result.bytesSentToCloud,
      payload: c.payload,
    });
  }

  async function guarded(task: TaskKind, fn: () => Promise<void>) {
    if (busy) return print('sys', 'Still working on the previous command…');
    busy = true;
    document.body.classList.add('busy');
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof HybridError || e instanceof Error ? e.message : String(e);
      lastRoute = { task, error: msg };
      print('err', text(msg));
    } finally {
      busy = false;
      document.body.classList.remove('busy');
      renderRouting();
    }
  }

  async function exec(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    print('user', `&gt; ${esc(trimmed)}`);
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ');

    switch (cmd.toLowerCase()) {
      case '/help':
        return print('sys', `<pre>${HELP}</pre>`);
      case '/clear':
        out.innerHTML = '';
        return;
      case '/seed': {
        const n = seedDemoData(uid);
        return print('sys', `Loaded ${n} demo transactions.`);
      }
      case '/add':
        if (!arg) return print('err', 'Usage: /add Paid $23.40 at Casa Luna for lunch');
        return guarded('parse-note', async () => {
          const { tx, result } = await parseNote(arg, privacyMode);
          lastRoute = { task: 'parse-note', result };
          addTransaction(uid, { ...tx, ts: Date.now(), classifiedBy: result.source });
          print(
            'out',
            `${badgeHtml(result.source, result.latencyMs)}<br>Saved: <b>${esc(tx.merchant)}</b> · ${esc(tx.concept)} · <b>${money(tx.amount, tx.currency)}</b> · ${esc(tx.category)} · sensitivity ${tx.sensitivity}`,
          );
        });
      case '/audit':
        return guarded('privacy-audit', async () => {
          const r = await privacyAudit(txs);
          lastRoute = { task: 'privacy-audit', result: r };
          const sensitive = txs.filter((t) => t.sensitivity === 'high').length;
          print(
            'out',
            `${badgeHtml(r.source, r.latencyMs)}<br><b>Data residency:</b> ${txs.length} records stored locally/Firestore, ${sensitive} high-sensitivity (never included in cloud payloads), ${egress.reduce((a, e) => a + e.bytes, 0)} bytes sent to the cloud this session.<br>${text(r.text)}`,
          );
        });
      case '/analyze':
        return guarded('deep-analysis', async () => {
          const c = await deepAnalysis(txs);
          noteCloud(c, 'deep-analysis');
          lastRoute = { task: 'deep-analysis', result: c.result };
          print('out', `${badgeHtml(c.result.source, c.result.latencyMs)}<br>${text(c.result.text)}`);
        });
      case '/simulate':
        if (!arg) return print('err', 'Usage: /simulate cut dining by 30% and add $200/month to savings');
        return guarded('budget-sim', async () => {
          const c = await budgetSimulation(txs, arg);
          noteCloud(c, 'budget-sim');
          lastRoute = { task: 'budget-sim', result: c.result };
          print('out', `${badgeHtml(c.result.source, c.result.latencyMs)}<br>${text(c.result.text)}`);
        });
      case '/anomalies':
        return guarded('anomalies', async () => {
          const c = await detectAnomalies(txs);
          noteCloud(c, 'anomalies');
          lastRoute = { task: 'anomalies', result: c.result };
          print('out', `${badgeHtml(c.result.source, c.result.latencyMs)}<br>${text(c.result.text)}`);
        });
      default:
        return print('err', 'Unknown command. Type /help');
    }
  }

  $('term-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    void exec(v);
  });

  $('quick').innerHTML = [
    ['/add Paid $23.40 at Casa Luna for lunch', 'Parse a note'],
    ['/audit', 'Privacy audit'],
    ['/analyze', 'Deep analysis'],
    ['/anomalies', 'Anomalies'],
    ['/simulate cut dining by 30% and save $200 more per month', 'Simulate'],
  ]
    .map(([c, l]) => `<button class="btn small" data-cmd="${esc(c)}">${l}</button>`)
    .join('');
  $('quick').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b) void exec(b.dataset.cmd!);
  });

  // User gesture required by Chrome to start the Gemini Nano download.
  $('btn-enable').addEventListener('click', async () => {
    const bar = $('nano-progress');
    bar.classList.remove('hidden');
    print('sys', 'Preparing Gemini Nano via Firebase AI Logic (initializeDeviceModel)…');
    try {
      await enableOnDevice((f) => {
        (bar.firstElementChild as HTMLElement).style.width = `${Math.round(f * 100)}%`;
      });
      print('sys', 'Gemini Nano is ready. Private tasks now run on this device.');
    } catch (e) {
      print('err', `Could not enable on-device AI: ${text(e instanceof Error ? e.message : String(e))}<br>Needs Chrome 139+ on desktop with the Prompt API flag (see README).`);
    } finally {
      bar.classList.add('hidden');
      await refreshNano();
    }
  });
  $('btn-seed').addEventListener('click', () => void exec('/seed'));

  renderWallet();
  renderMetrics();
  renderTxs();
  renderRouting();
  renderChips($('chips'), status);
  print('sys', 'Welcome to DG Nexus AI (Hybrid Edition). Type /help. Tip: click “Enable on-device AI” once, then try the offline demo.');
}
