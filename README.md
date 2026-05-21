# IT Operations Dashboard

A locally-run web dashboard providing a unified, real-time view of Wazuh SIEM and NinjaOne RMM environments. Correlates endpoint data across both platforms for a single pane of glass into your fleet's security posture and device management status — eliminating the need to context-switch between two separate consoles.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python + FastAPI + uvicorn |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Recharts |
| Integrations | Wazuh SIEM REST API, NinjaOne RMM REST API |
| Storage | SQLite (local suppression log) |

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone the repository

```bash
git clone https://github.com/PeytonRingling/Ninja-Wazuh-Dashboard.git
cd Ninja-Wazuh-Dashboard
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```
WAZUH_URL=https://your-wazuh-host:55000
WAZUH_USERNAME=your-wazuh-username
WAZUH_PASSWORD=your-wazuh-password
WAZUH_INDEXER_URL=https://your-wazuh-host:443
WAZUH_INDEXER_USERNAME=admin
WAZUH_INDEXER_PASSWORD=your-indexer-password
NINJA_URL=https://your-ninja-instance.rmmservices.net
NINJA_CLIENT_ID=your-ninja-client-id
NINJA_CLIENT_SECRET=your-ninja-client-secret
```

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 4. Install frontend dependencies and build

```bash
cd frontend
npm install
npm run build
cd ..
```

### 5. Run

```bash
cd backend
python main.py
```

Open **http://localhost:8000** in your browser. The backend serves the compiled frontend directly.

---

### Development mode (hot reload)

**Terminal 1 — Backend:**
```bash
cd backend
python main.py
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies API calls to the backend.

> After any frontend changes in production mode, re-run `npm run build` and restart the backend.

---

## Features

### Home
- Live status pills for Wazuh SIEM, NinjaOne RMM, and fleet health
- 24h alert volume sparkline with per-severity color coding
- NinjaOne device connectivity bar and patch compliance bar
- Endpoint Intel fleet score ring with per-severity agent counts
- Recent critical alerts feed — agent, rule, level, relative timestamp
- Quick-navigation cards to jump directly into any section

### Endpoint Intelligence
- Correlated view joining NinjaOne RMM devices with Wazuh SIEM agents by hostname
- Fleet score ring — percentage of agents with no critical/high alerts
- Risk categorization: **Critical Alerts · Offline + Alerts · No SIEM Coverage · Not in RMM · Healthy**
- Clickable coverage bar and KPI cards for instant filtering
- Device cards with inline expansion — NinjaOne details + recent Wazuh alerts side by side
- Last logged-on user, offline duration, OS, IPs, hardware info per device
- Filter by OS, device type, and free-text search by hostname or IP
- Card view (grouped by risk category) and table view with CSV export
- Adjustable alert time window (1h / 3h / 6h / 12h / 24h)

### Wazuh SIEM
- Alert volume chart (24h / 7d / 30d) with stacked severity bars
- Top noisy rules table with alert counts, severity levels, and trend indicators (↑↓ vs prior period)
- Quick-suppress workflow — generate ready-to-paste Wazuh XML with suppression impact preview
- Rule suppression changelog — tracks every suppressed rule, alert reduction %, and notes
- Severity donut chart — click a segment to filter the alert table
- Paginated, filterable alert table with severity, agent, rule ID, and time window filters
- Expanded alert detail: Windows Event data, file hashes (SHA256 / MD5 / IMPHASH), MITRE ATT&CK tags, compliance mappings, VirusTotal links
- Agent status grid with color-coded last-active timestamps (green < 15 min, yellow < 1 hr, red stale)

### NinjaOne RMM
- Device health grid with online/offline status, offline duration, OS, last seen, last logged-on user
- Patch compliance summary with failed / pending / patched breakdown and per-patch age
- Recent activity feed with severity filters
- Patches sorted oldest-first so stale patches are immediately visible

### General
- **Global search** (`Ctrl+K`) — search across rules, agents, and devices from anywhere
- **Keyboard shortcuts** — `H` Home · `W` Wazuh · `N` NinjaOne · `E` Endpoint Intel · `?` shortcut reference
- **Light / dark mode** toggle with `localStorage` persistence and `prefers-color-scheme` detection
- **Dynamic browser tab title** — shows critical alert count when non-zero, e.g. `(3 Crit) OPS Dashboard`
- **Browser notifications** for new critical alerts (requires permission grant)
- 60-second auto-refresh on summary data, manual refresh per section
- Loading skeletons on all async data, graceful error states per integration

## Theme

The dashboard ships with a **Midnight Purple** dark theme (default) and a clean light mode. The dark theme uses a deep `#0d0d1a` background with violet accent (`#7c3aed`), floating cards with a subtle purple glow, and a vivid severity palette:

| Severity | Color |
|----------|-------|
| Critical | `#ff2d6d` — hot rose with pulse glow |
| High     | `#ff6b35` — vivid orange |
| Medium   | `#fbbf24` — warm amber |
| Low      | `#34d399` — mint green |

## Data Persistence

Rule suppressions and their changelog are stored in a local SQLite database (`suppression_log.db`) created automatically in the project root on first run. This file is excluded from git.

## Security Notes

- Wazuh SSL verification is disabled to support self-signed certificates — **do not expose this backend publicly**
- All credentials are loaded from `.env` at startup and never sent to the browser
- The `.gitignore` excludes `.env` and `*.db` automatically
