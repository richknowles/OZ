# OZ — LAN of OZ Mission Control

Real-time network telemetry dashboard for your home lab. Built for the LAN of OZ.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Proxmox VE](https://img.shields.io/badge/Platform-Proxmox%20VE-blue.svg)

## What It Does

Live dashboard showing:
- **Gateway sparklines** — WAN + LAN throughput (real-time)
- **Bridges** — network bridge traffic
- **Containers** — LXC/VM traffic

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
