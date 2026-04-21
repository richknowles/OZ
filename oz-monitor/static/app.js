/* LAN of OZ — Mission Control live view */

const WINDOW = 120;        // seconds of history
const PRIORITY = new Set([
  "caddy", "oz", "wazuh", "panopticon", "plexiq",
  "dashy", "technitiumdns-primary", "docker",
  "n8n", "overseerr", "tailscale", "navidrome",
]);

const $ = (id) => document.getElementById(id);

function fmtBytes(b) {
  if (b < 1024) return `${b} B/s`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB/s`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(2)} MB/s`;
  return `${(b / 1073741824).toFixed(2)} GB/s`;
}
function fmtShort(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}K`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)}M`;
  return `${(b / 1073741824).toFixed(2)}G`;
}

/* Sparkline renderer — mirrored up/down */
class Spark {
  constructor(canvas, size, downColor, upColor, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.size = size;
    this.rx = [];
    this.tx = [];
    this.downColor = downColor;
    this.upColor = upColor;
    this.glow = opts.glow ?? 0;
    this.fill = opts.fill ?? true;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.c.getBoundingClientRect();
    this.c.width = Math.floor(r.width * dpr);
    this.c.height = Math.floor(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width;
    this.h = r.height;
  }
  push(rx, tx) {
    this.rx.push(rx); this.tx.push(tx);
    while (this.rx.length > this.size) this.rx.shift();
    while (this.tx.length > this.size) this.tx.shift();
    this.draw();
  }
  seed(rx, tx) { this.rx = rx.slice(-this.size); this.tx = tx.slice(-this.size); this.draw(); }
  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    const maxRx = Math.max(1024, ...this.rx);
    const maxTx = Math.max(1024, ...this.tx);
    const peak = Math.max(maxRx, maxTx);
    const mid = h / 2;

    // Midline
    ctx.strokeStyle = "rgba(120,140,200,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(w, mid + 0.5);
    ctx.stroke();

    const step = w / (this.size - 1);

    const drawSeries = (arr, color, dir) => {
      if (arr.length < 2) return;
      if (this.glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = this.glow;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const norm = Math.min(1, arr[i] / peak);
        const amp = norm * (mid - 2);
        const x = (this.size - arr.length) * step + i * step;
        const y = dir === "down" ? mid + amp : mid - amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (this.fill) {
        ctx.shadowBlur = 0;
        const grad = ctx.createLinearGradient(0, mid, 0, dir === "down" ? h : 0);
        grad.addColorStop(0, color.replace(")", ", 0.28)").replace("rgb", "rgba"));
        grad.addColorStop(1, color.replace(")", ", 0)").replace("rgb", "rgba"));
        ctx.fillStyle = grad;
        ctx.lineTo((this.size - 1) * step, mid);
        ctx.lineTo(0, mid);
        ctx.closePath();
        ctx.fill();
      }
    };

    drawSeries(this.rx, "rgb(0, 234, 255)", "down");
    drawSeries(this.tx, "rgb(255, 184, 108)", "up");
    ctx.shadowBlur = 0;
  }
}

/* State */
const state = {
  total: null,
  bridges: new Map(),   // label -> {el, spark, rxEl, txEl}
  cts: new Map(),       // name -> {el, spark, rxEl, txEl, orbEl}
};

function initTotal() {
  state.total = new Spark($("total-graph"), WINDOW, "cyan", "amber", { glow: 16, fill: true });
}

function upsertBridges(bridges) {
  const row = $("bridges-row");
  for (const b of bridges) {
    let entry = state.bridges.get(b.label);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "bridge";
      el.innerHTML = `
        <div class="bridge-label"><b>${b.label}</b><span>${b.iface}</span></div>
        <div class="bridge-nums"><span class="rx">⬇ 0</span><span class="tx">0 ⬆</span></div>
        <canvas></canvas>`;
      row.appendChild(el);
      entry = {
        el,
        spark: new Spark(el.querySelector("canvas"), 60, "cyan", "amber", { glow: 6, fill: true }),
        rxEl: el.querySelector(".rx"),
        txEl: el.querySelector(".tx"),
      };
      state.bridges.set(b.label, entry);
    }
    entry.spark.push(b.rx, b.tx);
    entry.rxEl.textContent = `⬇ ${fmtBytes(b.rx)}`;
    entry.txEl.textContent = `${fmtBytes(b.tx)} ⬆`;
  }
}

function upsertContainers(containers) {
  const grid = $("containers");
  const seen = new Set();
  for (const c of containers) {
    seen.add(c.name);
    let entry = state.cts.get(c.name);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "ct" + (PRIORITY.has(c.name) ? " priority" : "");
      el.innerHTML = `
        <div class="ct-top">
          <span class="ct-name">${c.name}</span>
          <span class="ct-orb"></span>
        </div>
        <div class="ct-nums"><span class="rx">⬇ 0</span><span class="tx">0 ⬆</span></div>
        <canvas></canvas>`;
      // Insert priority ones at top
      if (PRIORITY.has(c.name)) grid.prepend(el); else grid.appendChild(el);
      entry = {
        el,
        spark: new Spark(el.querySelector("canvas"), 60, "cyan", "amber", { glow: 4, fill: true }),
        rxEl: el.querySelector(".rx"),
        txEl: el.querySelector(".tx"),
        orbEl: el.querySelector(".ct-orb"),
      };
      state.cts.set(c.name, entry);
    }
    entry.spark.push(c.rx, c.tx);
    entry.rxEl.textContent = `⬇ ${fmtShort(c.rx)}`;
    entry.txEl.textContent = `${fmtShort(c.tx)} ⬆`;

    const active = c.rx + c.tx;
    entry.orbEl.className = "ct-orb " + (active > 50000 ? "busy" : active > 0 ? "on" : "");
    entry.el.classList.toggle("hot", active > 1048576); // 1 MB/s
  }
  $("ct-count").textContent = `${containers.length} live`;

  // Remove vanished containers
  for (const [name, entry] of state.cts) {
    if (!seen.has(name)) { entry.el.remove(); state.cts.delete(name); }
  }
}

function applyPayload(p) {
  $("total-rx").innerHTML = `${fmtBytes(p.total.rx).replace(/ (\S+)$/, " <em>$1</em>")}`;
  $("total-tx").innerHTML = `${fmtBytes(p.total.tx).replace(/ (\S+)$/, " <em>$1</em>")}`;
  state.total.push(p.total.rx, p.total.tx);
  upsertBridges(p.bridges);
  upsertContainers(p.containers);
}

function clock() {
  const d = new Date();
  $("clock").textContent = d.toTimeString().slice(0, 8);
}
setInterval(clock, 1000); clock();

function connect() {
  const es = new EventSource("/api/stream");
  es.onmessage = (ev) => {
    try { applyPayload(JSON.parse(ev.data)); } catch (e) { console.error(e); }
  };
  es.onerror = () => { es.close(); setTimeout(connect, 2000); };
}

initTotal();
connect();
