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

- `GET /api/majors?ticker=SPX`: Major Support/Resistance & Zero Gamma
- `GET /api/max-change?ticker=SPX`: Significant GEX shifts
- `GET /api/chain?ticker=SPX`: Full GEX depth profile

## ⚠️ Troubleshooting

- **Database Connection Error**: Ensure the `db` service is healthy before `backend` starts. The `depends_on` condition in docker-compose handles this, but a manual restart (`docker-compose restart backend`) might be needed on slow first-boot.
- **Permission Denied**: If having Docker socket issues, run as sudo or add your user to the docker group: `sudo usermod -aG docker $USER`.
- **Firewall**: Ensure port **10001** is open in your Oracle Cloud Subnet Security List and local firewall (`iptables` or `ufw`).

## 📜 License

MIT
