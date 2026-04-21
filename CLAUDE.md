# LOO — LAN of OZ · Claude Instructions

## Git Identity — MANDATORY
Before making ANY commit, run:
```bash
git config user.name "Rich Knowles"
git config user.email "rich@itwerks.net"
```
Every commit must show **Rich Knowles <rich@itwerks.net>**. No Co-Authored-By. No Claude attribution.

## What This Is
LOO is the monorepo for all LAN of OZ custom dashboards, monitoring services, and infrastructure tooling.
Built by Oz for Captain — the Empire's mission control center.

## Aesthetic & Philosophy
- Deep space: near-black background (#04040a), cyan ingress (#00eaff), amber egress (#ffb86c)
- Unicode block characters for sparklines (azucar-fantastico style)
- Canvas-based high-fidelity graphs for the main monitor
- Everything live — no page refresh, ever
- Priority services always surface to the top

## Structure
```
LOO/
├── oz-monitor/          # FastAPI telemetry service on Proxmox host (root@10.0.0.15)
│   ├── main.py          # FastAPI + SSE, reads /proc/net/dev for all veth interfaces
│   ├── oz-monitor.service  # systemd unit, port 7654
│   └── static/
│       ├── index.html   # LAN of OZ mission control centerpiece
│       ├── style.css
│       ├── app.js       # Canvas sparklines, SSE client, hot-state detection
│       └── azucar.html  # Waybar azucar-fantastico widget replica (embed in Dashy)
└── dashy/
    └── conf.yml         # Full LAN of OZ Dashy configuration (root@10.0.0.4:/opt/dashy/user-data/)
```

## Services
- **oz-monitor**: FastAPI SSE service on `root@10.0.0.15:7654`
  - Reads `/proc/net/dev` for `vmbr*` bridges and `veth{vmid}i0` container interfaces
  - Maps vmid → name via `pct list` (cached 30s)
  - Endpoint: `/api/stream` (SSE), `/api/snapshot` (one-shot JSON), `/widget/azucar` (embedded widget)
  - Systemd: `systemctl {start|stop|status} oz-monitor`

- **Dashy**: LXC container 107, `root@10.0.0.4:4000`
  - Config: `/opt/dashy/user-data/conf.yml`
  - Restart: `ssh root@10.0.0.4 systemctl restart dashy`
  - Always backup before editing: `cp conf.yml conf.yml.backup-$(date +%Y%m%d%H%M%S)`

## Priority Containers (shown first in oz-monitor grid)
caddy, oz, wazuh, panopticon, plexiq, dashy, technitiumdns-primary, docker,
n8n, overseerr, tailscale, navidrome

## Do Not Change
- Color palette — the deep space aesthetic is intentional
- Priority container order — deliberate
- `/proc/net/dev` reading approach — fastest, no auth needed
