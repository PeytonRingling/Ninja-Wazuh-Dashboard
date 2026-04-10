# IT Operations Dashboard

A locally-run web dashboard providing a unified view of Wazuh SIEM and NinjaOne RMM environments. Correlates endpoint data across both platforms for a single pane of glass into your fleet's security and management status.

## Stack

- **Backend:** Python + FastAPI + uvicorn
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Recharts

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone the repository

```bash
git clone git@github.com:Suntado/Ninja-Wazuh-Dashboard.git
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

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Build the frontend

```bash
cd frontend
npm run build
cd ..
```

### 6. Run the backend

```bash
cd backend
python main.py
```

Open **http://localhost:8000** in your browser. The backend serves the built frontend directly.

---

### Development mode (hot reload)

Run two terminals simultaneously:

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

Open **http://localhost:5173**. The Vite dev server proxies API calls to the backend automatically.

> **Note:** After any frontend changes in production mode, re-run `npm run build` and restart the backend.

---

## Features

### Home
- Live system status indicators for Wazuh, NinjaOne, and overall fleet health
- Wazuh 24h alert volume sparkline with severity breakdown
- NinjaOne device connectivity bar and patch compliance bar
- Endpoint Intel fleet score ring with per-severity agent counts
- Recent critical alerts feed with agent name, rule, level, and timestamp
- Quick-navigation cards to jump directly into any section

### Endpoint Intelligence
- Correlated view joining NinjaOne RMM devices with Wazuh SIEM agents by hostname
- Fleet score ring (% of agents with no critical/high alerts)
- Risk categorization: Critical Alerts · Offline + Alerts · No SIEM Coverage · Not in RMM · Healthy
- Clickable coverage bar and metric cards for instant filtering
- Device cards with inline expansion — click to reveal NinjaOne details + recent Wazuh alerts
- Shows last logged-on user per device (from NinjaOne)
- Filter by OS (Windows 11 / Windows 10 / Server / Linux / macOS), device type, and IP address search
- Card view (grouped by risk category) and table view
- Adjustable alert time window (1h / 3h / 6h / 12h / 24h)

### Wazuh SIEM
- Alert volume chart (24h / 7d / 30d) with per-severity stacked bars
- Top 20 noisy rules with alert counts and visual bar indicators
- Severity donut chart — click a segment to filter the alert table
- Paginated, filterable alert table (by severity, agent, rule ID, time window)
- Expanded alert detail with Windows Event data, hashes (SHA256 / MD5 / IMPHASH), MITRE ATT&CK tags, compliance mappings
- VirusTotal links for file hashes
- Agent status grid

### NinjaOne RMM
- Device health grid with online/offline status, OS, last seen
- Click to expand device details
- Patch compliance summary with failed / pending / patched breakdown
- Recent activity feed with filters

### General
- 60-second auto-refresh on all data
- Manual refresh per section
- Loading skeletons while fetching
- Graceful error states — if one integration is unavailable, the rest continue working
- All API credentials stay server-side — nothing touches the browser

## Security Notes

- Wazuh SSL verification is disabled to support self-signed certificates — **do not expose this backend publicly**
- All credentials are loaded from `.env` at startup — never commit your `.env` file
- The `.gitignore` excludes `.env` automatically
