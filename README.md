# IT Operations Dashboard

A locally-run web dashboard providing a unified view of Wazuh SIEM and NinjaOne RMM environments.

## Stack

- **Backend:** Python + FastAPI + uvicorn
- **Frontend:** React + TypeScript + Tailwind CSS + Recharts

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### 1. Clone / navigate to the project

```bash
cd ninja-wazuh-dashboard
```

### 2. Configure credentials

Copy `.env.example` to `.env` (already done if you received a pre-filled `.env`):

```bash
cp .env.example .env
# Edit .env with your credentials
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

### 5. Run in development mode (two terminals)

**Terminal 1 — Backend:**
```bash
cd backend
python main.py
```
Backend runs on http://localhost:8000

**Terminal 2 — Frontend (hot reload):**
```bash
cd frontend
npm run dev
```
Frontend runs on http://localhost:5173

Open http://localhost:5173 in your browser.

### 6. (Optional) Build frontend for production

```bash
cd frontend
npm run build
```

Then run only the backend — it will serve the built frontend at http://localhost:8000:
```bash
cd backend
python main.py
```

## Features

- **Top bar:** Live alert severity counts and device online/offline status
- **Wazuh tab:**
  - Alert volume chart (24h / 7d / 30d toggleable)
  - Top 20 noisy rules with sortable columns and visual bar indicators
  - Severity donut chart — click to filter the alert table
  - Paginated, filterable alert table (by severity, agent, rule ID)
  - Agent status grid
- **NinjaOne tab:**
  - Device health grid with online/offline status, click to expand details
  - Patch compliance summary cards + bar chart + issue table
  - Recent activity feed with filters
- 60-second auto-refresh on all panels
- Manual refresh per tab
- Loading skeletons while fetching
- Graceful error states — if one API is down, the other tab works normally

## Notes

- All API calls are proxied through the FastAPI backend — no credentials touch the browser
- Responses are cached for 60 seconds
- Wazuh SSL verification is disabled (self-signed certs) — do not expose this backend publicly
