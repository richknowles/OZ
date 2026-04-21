"""
oz-monitor — real-time LAN telemetry for LAN of OZ dashboard.

Reads /proc/net/dev directly on the Proxmox host. No Proxmox API auth needed.
Maps veth{vmid}i0 -> container name via `pct list` (cached 30s).
Streams per-interface rx/tx bytes/sec via Server-Sent Events.
"""

import asyncio
import json
import subprocess
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="oz-monitor")

STATIC = Path(__file__).parent / "static"

# Interfaces we always track by friendly name
BRIDGES = {
    "vmbr0": "LAN",
    "vmbr1": "LAN2",
    "vmbr2": "DMZ",
}

# Priority containers — shown first in the grid
PRIORITY = [
    "caddy", "oz", "wazuh", "panopticon", "plexiq",
    "dashy", "technitiumdns-primary", "docker",
    "n8n", "overseerr", "tailscale", "navidrome",
]

_ct_cache = {"ts": 0.0, "map": {}}


def ct_map() -> dict[str, str]:
    """Return {veth_iface: container_name}, refreshed every 30s."""
    now = time.time()
    if now - _ct_cache["ts"] < 30 and _ct_cache["map"]:
        return _ct_cache["map"]
    try:
        out = subprocess.check_output(["pct", "list"], text=True, timeout=5)
    except Exception:
        return _ct_cache["map"]
    mapping: dict[str, str] = {}
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 3 and parts[1] == "running":
            vmid, name = parts[0], parts[-1]
            mapping[f"veth{vmid}i0"] = name
    _ct_cache["ts"] = now
    _ct_cache["map"] = mapping
    return mapping


def read_proc_net() -> dict[str, tuple[int, int]]:
    """Parse /proc/net/dev -> {iface: (rx_bytes, tx_bytes)}."""
    result: dict[str, tuple[int, int]] = {}
    with open("/proc/net/dev") as f:
        for line in f.readlines()[2:]:
            if ":" not in line:
                continue
            name, rest = line.split(":", 1)
            name = name.strip()
            fields = rest.split()
            if len(fields) < 16:
                continue
            result[name] = (int(fields[0]), int(fields[8]))
    return result


def snapshot(prev: dict[str, tuple[int, int]], prev_ts: float) -> dict:
    """Build a full LAN-of-OZ payload: bridges + per-container rates."""
    now = time.time()
    curr = read_proc_net()
    dt = max(now - prev_ts, 0.001)

    containers = ct_map()
    bridges_data = []
    container_data = []

    for iface, (rx, tx) in curr.items():
        prx, ptx = prev.get(iface, (rx, tx))
        rx_rate = max(0, int((rx - prx) / dt))
        tx_rate = max(0, int((tx - ptx) / dt))

        if iface in BRIDGES:
            bridges_data.append({
                "iface": iface,
                "label": BRIDGES[iface],
                "rx": rx_rate,
                "tx": tx_rate,
            })
        elif iface in containers:
            container_data.append({
                "iface": iface,
                "name": containers[iface],
                "rx": rx_rate,
                "tx": tx_rate,
            })

    # Sort: priority first (in declared order), then alpha
    pri_index = {n: i for i, n in enumerate(PRIORITY)}
    container_data.sort(key=lambda c: (pri_index.get(c["name"], 999), c["name"]))

    total_rx = sum(b["rx"] for b in bridges_data)
    total_tx = sum(b["tx"] for b in bridges_data)

    return {
        "ts": now,
        "total": {"rx": total_rx, "tx": total_tx},
        "bridges": bridges_data,
        "containers": container_data,
    }, curr, now


@app.get("/api/stream")
async def stream():
    """SSE stream — one snapshot per second."""
    async def gen():
        prev = read_proc_net()
        prev_ts = time.time()
        await asyncio.sleep(1.0)
        while True:
            payload, prev, prev_ts = snapshot(prev, prev_ts)
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(1.0)
    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.get("/api/snapshot")
def one_shot():
    """Single snapshot — useful for debugging."""
    prev = read_proc_net()
    time.sleep(1.0)
    payload, _, _ = snapshot(prev, time.time() - 1.0)
    return payload


@app.get("/")
def index():
    return FileResponse(str(STATIC / "index.html"))


@app.get("/widget/azucar")
def azucar_widget():
    return FileResponse(str(STATIC / "azucar.html"))


app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")
