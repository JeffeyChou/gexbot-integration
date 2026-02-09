# Gexbot Sentinel 🛡️

A production-ready, microservices-based dashboard for tracking Gexbot financial data, optimized for Oracle Cloud Ampere A1 (ARM64) infrastructure.

## 🚀 Features

- **Multi-Container Architecture**: Dockerized Backend (Flask), Frontend (React/Vite), Database (Postgres), and Scheduler.
- **ARM64 Optimization**: Builds natively on Oracle Cloud Ampere instances.
- **Real-Time Dashboard**: Visualize Zero Gamma, Major Levels, and Max Change data.
- **Multi-Ticker Support**: Quickly switch between major tickers (SPY, QQQ, AAPL, NVDA, etc.) or query custom symbols.
- **Gemini AI Integration**: Generates market analysis caveats based on Gex levels (requires API Key).
- **Discord Alerts**: Notifications for scheduler status and errors.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, Recharts
- **Backend**: Python 3.9, Flask, Gunicorn
- **Database**: PostgreSQL 15 (Alpine)
- **Orchestration**: Docker Compose

## 📋 Prerequisites

- **Oracle Cloud VM**: Standard.A1.Flex (4 OCPU, 24GB RAM recommended)
- **OS**: Ubuntu 22.04 or Oracle Linux 8 (ARM64)
- **Docker & Docker Compose**: Installed and running

## ⚙️ Installation

1.  **Clone the repository**
    ```bash
    git clone <repository_url>
    cd gexbot-sentinel
    ```

2.  **Configure Environment**
    Copy the example environment file and fill in your details:
    ```bash
    cp .env.example .env
    nano .env
    ```
    
    **Required Variables:**
    - `GEXBOT_API_KEY`: Your Gexbot Premium/Classic API Key.
    - `DISCORD_WEBHOOK`: URL for Discord Webhook alerts.
    - `DB_PASS`: Secure password for the PostgreSQL database.
    - `VITE_LLM_API_KEY`: API Key for LLM analysis (Gemini, OpenAI, DeepSeek, etc.).
    - `VITE_LLM_BASE_URL`: (Optional) Custom API Base URL for OpenAI-compatible providers.
    - `VITE_LLM_MODEL`: (Optional) Model name to use (e.g., `gemini-1.5-flash`, `deepseek-chat`).

3.  **Build and Run**
    Launch the stack in detached mode. The build process handles multi-architecture automatically.
    ```bash
    docker-compose up -d --build
    ```

4.  **Access the Dashboard**
    Open your browser and navigate to:
    `http://<YOUR_SERVER_IP>:10001`

## 📂 Project Structure

```
gexbot-sentinel/
├── backend/               # Flask API & Scheduler
├── database/              # Init scripts
├── frontend/              # React Application
└── docker-compose.yml     # Service Orchestration
```

## 🔌 API Endpoints

- `GET /api/chain?ticker=SPX`: Full GEX depth profile (includes spot, zero_gamma, major levels, strikes)
- `GET /api/max-change?ticker=SPX`: Significant GEX shifts per time interval

## ⚡ Quick Deploy (No Docker Rebuild)

For rapid iteration during development, use the dev overlay + deploy script. This avoids rebuilding Docker images entirely.

### One-Time Setup

Switch the running stack to dev mode (adds volume mounts + hot-reload):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This changes three things vs production:
- **Backend**: Mounts `./backend` into the container + enables gunicorn `--reload` (auto-restarts on `.py` file changes)
- **Scheduler**: Mounts `./backend` into the container (restart required to pick up changes)
- **Frontend**: Mounts `./frontend/dist` into nginx (just rebuild + copy)

### Deploy Commands

```bash
# Deploy frontend only (build locally, copy into container, reload nginx)
./deploy.sh frontend

# Restart backend (picks up Python changes via volume mount)
./deploy.sh backend

# Restart scheduler
./deploy.sh scheduler

# Deploy everything
./deploy.sh all

# Apply database schema changes to the live DB
./deploy.sh db-migrate
```

### How Each Service Updates

| Service | What Happens | Downtime |
|---------|-------------|----------|
| **Backend** | gunicorn `--reload` detects `.py` changes automatically via volume mount. Use `./deploy.sh backend` if reload doesn't trigger. | ~1s |
| **Scheduler** | Requires `./deploy.sh scheduler` (restart) to pick up changes. | ~1s |
| **Frontend** | `./deploy.sh frontend` runs `npm run build` locally, copies `dist/` into nginx, reloads nginx. | 0s |
| **Database** | `./deploy.sh db-migrate` runs `database/init.sql` against the live DB. Uses `IF NOT EXISTS` / `IF NOT EXISTS` so it's safe to re-run. | 0s |

### Switching Back to Production Mode

```bash
docker compose up -d --build
```

This rebuilds all images from scratch (ignores the dev overlay).

### For AI Agents

When making code changes to this project, **do NOT rebuild Docker images**. Instead:

1. Edit files directly on disk.
2. **Backend changes** (`backend/*.py`): Auto-detected by gunicorn `--reload` in dev mode. If not, run `./deploy.sh backend`.
3. **Frontend changes** (`frontend/src/**`): Run `./deploy.sh frontend` (builds + copies + reloads nginx).
4. **Schema changes** (`database/init.sql`): Run `./deploy.sh db-migrate`. All statements use `IF NOT EXISTS` / `ON CONFLICT` so re-running is safe.
5. **Verify** at `http://129.146.178.115:10001/`.

## ⚠️ Troubleshooting

- **Database Connection Error**: Ensure the `db` service is healthy before `backend` starts. The `depends_on` condition in docker-compose handles this, but a manual restart (`docker-compose restart backend`) might be needed on slow first-boot.
- **Permission Denied**: If having Docker socket issues, run as sudo or add your user to the docker group: `sudo usermod -aG docker $USER`.
- **Firewall**: Ensure port **10001** is open in your Oracle Cloud Subnet Security List and local firewall (`iptables` or `ufw`).

## 📜 License

MIT
