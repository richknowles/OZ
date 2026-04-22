/* LAN of OZ — Mission Control live view (HTML Sparklines, Waybar Algorithm) */

const WINDOW  = 120;
const GW_HIST = 30;
const GW_BLOCKS = ['░','▁','▂','▃','▄','▅','▆','▇','█','█▁','█▂','█▃','█▄','█▅','█▆','█▇','██','██▁','██▂','██▃','███'];
const GW_MAX = 524288;
const PRIORITY = new Set(["caddy","oz","wazuh","panopticon","plexiq","dashy","technitiumdns-primary","docker","n8n","overseerr","tailscale","navidrome"]);

const $ = (id) => document.getElementById(id);

function fmtBytes(b) {
  if (b < 1024) return `${b} B/s`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB/s`;
  return `${(b/1048576).toFixed(2)} MB/s`;
}
function fmtShort(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)}K`;
  return `${(b/1048576).toFixed(1)}M`;
}

/* ── WAYBAR ALGORITHM: RX colors ─────────────────────────────────────────────── */
function gwRxColor(v) {
  if (v < 1024) return '#6272a4';
  if (v < 10240) return '#8be9fd';
  if (v < 102400) return '#50fa7b';
  if (v < 524288) return '#ffb86c';
  return '#ff5555';
}

/* ── WAYBAR ALGORITHM: TX colors ─────────────────────────────────────────────── */
function gwTxColor(v) {
  if (v < 512) return '#6272a4';
  if (v < 5120) return '#ff79c6';
  if (v < 51200) return '#bd93f9';
  if (v < 262144) return '#ffb86c';
  return '#ff5555';
}

/* ── WAYBAR ALGORITHM: Spark char ─────────────────────────────────────────────── */
function gwGetSpark(v) {
  if (v < 256) return GW_BLOCKS[0];
  const level = Math.min(20, Math.floor(v * 20 / GW_MAX));
  return GW_BLOCKS[level] || GW_BLOCKS[0];
}

/* ── STATE: bridges & containers ─────────────────────────────────────────────── */
const state = {
  total: null,
  bridges: new Map(),
  cts: new Map(),
};

/* ── Spark class for other widgets (bridges/containers keep canvas) ───── */
class Spark {
  constructor(canvas, size, downColor, upColor, opts = {}) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.size = size;
    this.rx = []; this.tx = []; this.downColor = downColor; this.upColor = upColor;
    this.glow = opts.glow ?? 0; this.fill = opts.fill ?? true;
    this.resize(); window.addEventListener("resize", () => this.resize());
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.c.width = Math.floor(r.width * dpr);
    this.c.height = Math.floor(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }
  push(rx, tx) {
    this.rx.push(rx); this.tx.push(tx);
    while (this.rx.length > this.size) this.rx.shift();
    while (this.tx.length > this.size) this.tx.shift();
    this.draw();
  }
  draw() {
    const {ctx, w, h} = this;
    ctx.clearRect(0, 0, w, h);
    const maxRx = Math.max(1024, ...this.rx);
    const maxTx = Math.max(1024, ...this.tx);
    const peak = Math.max(maxRx, maxTx);
    const mid = h / 2;
    const step = w / (this.size - 1);
    const drawSeries = (arr, color, dir) => {
      if (arr.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const y = dir === "down" ? mid + (arr[i]/peak)*(mid-2) : mid - (arr[i]/peak)*(mid-2);
        const x = (this.size - arr.length)*step + i*step;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawSeries(this.rx, "rgb(0,234,255)", "down");
    drawSeries(this.tx, "rgb(255,184,108)", "up");
  }
}

function initTotal() {
  state.total = new Spark($("total-graph"), WINDOW, "cyan", "amber", {glow: 16, fill: true});
}

function upsertBridges(bridges) {
  const row = $("bridges-row");
  for (const b of bridges) {
    let e = state.bridges.get(b.label);
    if (!e) {
      const el = document.createElement("div");
      el.className = "bridge";
      el.innerHTML = `<div class="bridge-label"><b>${b.label}</b><span>${b.iface}</span></div>
        <div class="bridge-nums"><span class="rx">⬇ 0</span><span class="tx">0 ⬆</span></div><canvas></canvas>`;
      row.appendChild(el);
      e = {
        spark: new Spark(el.querySelector("canvas"), 60, "cyan", "amber", {glow: 6, fill: true}),
        rxEl: el.querySelector(".rx"), txEl: el.querySelector(".tx"),
      };
      state.bridges.set(b.label, e);
    }
    e.spark.push(b.rx, b.tx);
    e.rxEl.textContent = `⬇ ${fmtBytes(b.rx)}`;
    e.txEl.textContent = `${fmtBytes(b.tx)} ⬆`;
  }
}

function upsertContainers(containers) {
  const grid = $("containers");
  const seen = new Set();
  for (const c of containers) {
    seen.add(c.name);
    let e = state.cts.get(c.name);
    if (!e) {
      const el = document.createElement("div");
      el.className = "ct" + (PRIORITY.has(c.name) ? " priority" : "");
      el.innerHTML = `<div class="ct-top"><span class="ct-name">${c.name}</span><span class="ct-orb"></span></div>
        <div class="ct-nums"><span class="rx">⬇ 0</span><span class="tx">0 ⬆</span></div><canvas></canvas>`;
      if (PRIORITY.has(c.name)) grid.prepend(el); else grid.appendChild(el);
      e = {
        spark: new Spark(el.querySelector("canvas"), 60, "cyan", "amber", {glow: 4, fill: true}),
        rxEl: el.querySelector(".rx"), txEl: el.querySelector(".tx"), orbEl: el.querySelector(".ct-orb"), el,
      };
      state.cts.set(c.name, e);
    }
    e.spark.push(c.rx, c.tx);
    e.rxEl.textContent = `⬇ ${fmtShort(c.rx)}`;
    e.txEl.textContent = `${fmtShort(c.tx)} ⬆`;
    const active = c.rx + c.tx;
    e.orbEl.className = "ct-orb " + (active > 50000 ? "busy" : active > 0 ? "on" : "");
    e.el.classList.toggle("hot", active > 1048576);
  }
  $("ct-count").textContent = `${containers.length} live`;
  for (const [name, entry] of state.cts) {
    if (!seen.has(name)) { entry.el.remove(); state.cts.delete(name); }
  }
}

function applyPayload(p) {
  $("total-rx").innerHTML = `${fmtBytes(p.total.rx).replace(/ (\S+)$/," <em>$1</em>")}`;
  $("total-tx").innerHTML = `${fmtBytes(p.total.tx).replace(/ (\S+)$/," <em>$1</em>")}`;
  state.total.push(p.total.rx, p.total.tx);
  upsertBridges(p.bridges);
  upsertContainers(p.containers);
}

/* ── GATEWAY: HTML sparklines (waybar algorithm) ──────────────────────────────── */
function makeGwMod() {
  return {rxHist: [], txHist: [], rxEl: null, txEl: null, el: null, n: 0};
}
const gwWan = makeGwMod();
const gwLan = makeGwMod();

function gwPaintSpark(el, hist, colorFn) {
  if (!el) return "";
  let html = "";
  const n = hist.length;
  // OLDEST on LEFT, NEWEST on RIGHT
  for (let i = 0; i < GW_HIST; i++) {
    const v = i < n ? hist[i] : 0;
    const char = gwGetSpark(v);
    const color = v > 0 ? colorFn(v) : '#6272a4';
    html += `<span style="color:${color}">${char}</span>`;
  }
  el.innerHTML = html;
}

function gwUpdateMod(mod, agent, statusId, rxSpeedId, txSpeedId) {
  const live = !!agent;
  const st = $(statusId);
  st.textContent = live ? 'LIVE' : 'OFFLINE';
  st.className = "gw-status " + (live ? "gw-live" : "gw-offline");
  if (!live) return;
  const rx = agent.rx, tx = agent.tx;
  mod.rxHist.push(rx);
  mod.txHist.push(tx);
  if (mod.rxHist.length > GW_HIST) mod.rxHist.shift();
  if (mod.txHist.length > GW_HIST) mod.txHist.shift();
  if (mod.n < GW_HIST) mod.n++;
  gwPaintSpark(mod.rxEl, mod.rxHist, gwRxColor);
  gwPaintSpark(mod.txEl, mod.txHist, gwTxColor);
  $(rxSpeedId).textContent = fmtBytes(rx);
  $(txSpeedId).textContent = fmtBytes(tx);
}

function initGateway() {
  gwWan.rxEl = $("gw-wan-rx-spark");
  gwWan.txEl = $("gw-wan-tx-spark");
  gwLan.rxEl = $("gw-lan-rx-spark");
  gwLan.txEl = $("gw-lan-tx-spark");
  gwUpdateMod(gwWan, null, 'gw-wan-status', 'gw-wan-rx-speed', 'gw-wan-tx-speed');
  gwUpdateMod(gwLan, null, 'gw-lan-status', 'gw-lan-rx-speed', 'gw-lan-tx-speed');
}

let gwCachedAgents = null;
async function gwPoll() {
  try {
    const r = await fetch('/api/latest', {cache: "no-store"});
    if (r.ok) {
      const p = await r.json();
      if (p.agents) { gwCachedAgents = p.agents; updateGateway(gwCachedAgents); }
    }
  } catch(e) { /* offline */ }
  setTimeout(gwPoll, 2000);
}

function updateGateway(agents) {
  gwUpdateMod(gwWan, agents['edgerouter-wan'], 'gw-wan-status', 'gw-wan-rx-speed', 'gw-wan-tx-speed');
  gwUpdateMod(gwLan, agents['edgerouter-lan'], 'gw-lan-status', 'gw-lan-rx-speed', 'gw-lan-tx-speed');
}

function clock() {
  $("clock").textContent = new Date().toTimeString().slice(0, 8);
}
setInterval(clock, 1000); clock();

function connect() {
  const es = new EventSource("/api/stream");
  es.onmessage = (ev) => {
    try { applyPayload(JSON.parse(ev.data)); } catch(e) { console.error(e); }
  };
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}

initTotal();
initGateway();
gwPoll();
connect();