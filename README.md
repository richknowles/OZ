# OZ — LAN of OZ Mission Control

Real-time network telemetry dashboard for your home lab. Built for the LAN of OZ.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Proxmox VE](https://img.shields.io/badge/Platform-Proxmox%20VE-blue.svg)

## What It Does

Live dashboard showing:
- **Gateway sparklines** — WAN + LAN throughput (real-time)
- **Bridges** — network bridge traffic
- **Containers** — LXC/VM traffic

## The Sparkline Problem

Most dashboard implementations use **canvas text rendering** for sparklines. This creates issues:

1. **DPI/resize** — character widths shift when window resizes
2. **Anchoring** — data doesn't align properly as history grows
3. **Peak decay** — complex math trying to auto-scale

### The Fix

We use **pure HTML text** instead of canvas. The waybar `network-azucar.sh` algorithm:

```javascript
// 21-level DPI blocks
const GW_BLOCKS = ['░','▁','▂','▃','▄','▅','▆','▇','█','█▁','█▂','█▃','█▄','█▅','█▆','█▇','██','██▁','██▂','██▃','███'];

// Color thresholds (RX)
// idle: muted blue → cyan → green → orange → red

// Anchor: OLDEST LEFT, NEWEST RIGHT
// IDLE dots fill LEFT until history fills
```

No canvas. No DPI math. No resize handlers. Just HTML text that works.

## Features

- **SSE streaming** — 1 sample/second, no polling
- **Fixed ring buffer** — no memory leaks
- **Waybar colors** — exact match to network-azucar.sh
- **Priority containers** — highlighted in grid

## Requirements

- Proxmox VE 7+
- Python 3.10+ (for oz-monitor backend)

## Quick Start

```bash
# On Proxmox host
git clone https://github.com/richknowles/OZ.git /opt/oz-monitor
cd /opt/oz-monitor
./start.sh
```

Open: `http://YOUR_PROXMOX_IP:7654/`

## Files

```
oz-monitor/
├── main.py          # FastAPI backend
├── static/
│   ├── app.js      # Frontend (HTML sparklines)
│   ├── index.html  # Dashboard HTML
│   └── style.css  # Glass theme CSS
```

## Acknowledgments

Built with 💜 for the LAN of OZ.

---

*"The only winning move is not to play."* — WOPR