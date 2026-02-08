import React from 'react';
import { Terminal, Copy, Check, Server, Database, Globe } from 'lucide-react';

export const DevOpsGuide: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 rounded-2xl border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-2">Oracle Cloud ARM64 Deployment</h2>
        <p className="text-gray-400">
          This guide details the exact configuration to deploy the Gexbot stack on Oracle Ampere A1 (4 OCPU, 24GB RAM).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Steps */}
        <div className="lg:col-span-2 space-y-8">
          
          <Step 
            number={1} 
            title="Database Schema" 
            desc="Initialize PostgreSQL with tables for Chain, Major Levels, and Max Change endpoints."
          >
             <CodeBlock language="sql" code={`
-- init.sql

-- 1. Main Chain Snapshots
CREATE TABLE IF NOT EXISTS gex_snapshots (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    spot_price DECIMAL(10, 2),
    sum_gex_vol DECIMAL(15, 2),
    strikes_data JSONB -- Stores the full array of strike data
);

-- 2. Major Levels Snapshots
CREATE TABLE IF NOT EXISTS gex_major_levels (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    spot DECIMAL(10, 2),
    zero_gamma DECIMAL(10, 2),
    mpos_vol DECIMAL(10, 2),
    mpos_oi DECIMAL(10, 2),
    mneg_vol DECIMAL(10, 2),
    mneg_oi DECIMAL(10, 2),
    net_gex_vol DECIMAL(15, 2),
    net_gex_oi DECIMAL(15, 2)
);

-- 3. Max Change Snapshots (New Endpoint)
CREATE TABLE IF NOT EXISTS gex_max_change (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    current_strike INT,
    current_val DECIMAL(15, 2),
    one_min_strike INT,
    one_min_val DECIMAL(15, 2),
    five_min_strike INT,
    five_min_val DECIMAL(15, 2),
    thirty_min_strike INT,
    thirty_min_val DECIMAL(15, 2),
    full_data JSONB -- Store the full JSON just in case
);

CREATE INDEX idx_gex_max_change_time ON gex_max_change(timestamp DESC);
CREATE INDEX idx_gex_major_time ON gex_major_levels(timestamp DESC);
CREATE INDEX idx_gex_time ON gex_snapshots(timestamp DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    role VARCHAR(20) DEFAULT 'READ', 
    description TEXT
);
             `} />
          </Step>

          <Step 
            number={2} 
            title="Docker Compose Architecture" 
            desc="Orchestrates the Flask API, React Frontend, Scheduler, and Postgres DB."
          >
             <CodeBlock language="yaml" code={`
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      POSTGRES_USER: gex_user
      POSTGRES_PASSWORD: \${DB_PASS}
      POSTGRES_DB: gex_db
    restart: always

  backend:
    build: ./backend
    command: gunicorn --bind 0.0.0.0:5000 wsgi:app
    expose:
      - "5000"
    environment:
      - DATABASE_URL=postgresql://gex_user:\${DB_PASS}@db:5432/gex_db
      - DISCORD_WEBHOOK=\${DISCORD_WEBHOOK}
    depends_on:
      - db

  scheduler:
    build: ./backend
    command: python scheduler.py
    environment:
      - DATABASE_URL=postgresql://gex_user:\${DB_PASS}@db:5432/gex_db
      - GEXBOT_API_KEY=\${GEXBOT_API_KEY}
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
             `} />
          </Step>

           <Step 
            number={3} 
            title="Python Scheduler (ARM64 Optimized)" 
            desc="Fetches from all 3 Gexbot endpoints: Chain, Majors, and MaxChange."
          >
             <CodeBlock language="python" code={`
# scheduler.py
import time
import requests
import psycopg2
import os
import schedule
import json
from datetime import datetime

API_KEY = os.getenv("GEXBOT_API_KEY")
DB_URL = os.getenv("DATABASE_URL")
HEADERS = {"User-Agent": "GexbotSentinel/1.0", "Accept": "application/json"}

def fetch_gex_majors():
    try:
        url = f"https://api.gexbot.com/SPX/classic/full/majors?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200: return
        data = resp.json()

        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO gex_major_levels 
            (timestamp, ticker, spot, zero_gamma, mpos_vol, mpos_oi, mneg_vol, mneg_oi, net_gex_vol, net_gex_oi)
            VALUES (to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('timestamp'), data.get('ticker'), data.get('spot'),
            data.get('zero_gamma'), data.get('mpos_vol'), data.get('mpos_oi'),
            data.get('mneg_vol'), data.get('mneg_oi'), 
            data.get('net_gex_vol'), data.get('net_gex_oi')
        ))
        conn.commit(); conn.close()
    except Exception as e:
        print(f"Error majors: {e}")

def fetch_gex_max_change():
    try:
        url = f"https://api.gexbot.com/SPX/classic/full/maxchange?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200: return
        data = resp.json()

        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO gex_max_change 
            (timestamp, ticker, current_strike, current_val, one_min_strike, one_min_val, five_min_strike, five_min_val, thirty_min_strike, thirty_min_val, full_data)
            VALUES (to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('timestamp'), data.get('ticker'), 
            data['current'][0], data['current'][1],
            data['one'][0], data['one'][1],
            data['five'][0], data['five'][1],
            data['thirty'][0], data['thirty'][1],
            json.dumps(data)
        ))
        conn.commit(); conn.close()
    except Exception as e:
        print(f"Error max change: {e}")

def fetch_gex_chain():
    try:
        url = f"https://api.gexbot.com/SPX/classic/zero?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code != 200: return
        data = resp.json()

        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO gex_snapshots 
            (timestamp, ticker, spot_price, sum_gex_vol, strikes_data)
            VALUES (to_timestamp(%s), %s, %s, %s, %s)
        """, (
            data.get('timestamp'), data.get('ticker'), data.get('spot'),
            data.get('sum_gex_vol'), json.dumps(data.get('strikes'))
        ))
        conn.commit(); conn.close()
    except Exception as e:
        print(f"Error chain: {e}")

# Run every 5 minutes
schedule.every(5).minutes.do(fetch_gex_majors)
schedule.every(5).minutes.do(fetch_gex_max_change)
schedule.every(5).minutes.do(fetch_gex_chain)

print("Scheduler started...")
while True:
    schedule.run_pending()
    time.sleep(1)
             `} />
          </Step>

        </div>

        {/* Right Column: Infrastructure Checklist */}
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-24">
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <Server size={18} className="text-emerald-500" />
              Infrastructure Checklist
            </h3>
            
            <ul className="space-y-4">
              <CheckItem label="Instance: VM.Standard.A1.Flex (4 OCPU)" />
              <CheckItem label="OS: Oracle Linux 8 / Ubuntu 22.04 ARM64" />
              <CheckItem label="Ingress: Open Ports 80 (HTTP), 443 (HTTPS)" />
              <CheckItem label="Firewall: Configure iptables / netfilter" />
              <CheckItem label="Docker: Ensure buildx for multi-arch support" />
            </ul>

            <div className="mt-8 pt-6 border-t border-gray-800">
               <h4 className="text-sm font-semibold text-gray-400 mb-3">ARM64 Docker Build Tip</h4>
               <p className="text-xs text-gray-500 mb-3">
                 When building on an x86 machine for Oracle Cloud ARM, use buildx:
               </p>
               <div className="bg-gray-950 p-2 rounded border border-gray-800 text-xs font-mono text-emerald-400 break-all">
                 docker buildx build --platform linux/arm64 -t gex-backend:latest .
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const Step: React.FC<{ number: number; title: string; desc: string; children: React.ReactNode }> = ({ number, title, desc, children }) => (
  <div className="group">
    <div className="flex items-start gap-4 mb-3">
      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold text-gray-300 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
        {number}
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-200">{title}</h3>
        <p className="text-gray-400 text-sm mt-1">{desc}</p>
      </div>
    </div>
    <div className="pl-12">
      {children}
    </div>
  </div>
);

const CheckItem: React.FC<{ label: string }> = ({ label }) => (
  <li className="flex items-start gap-3 text-sm text-gray-300">
    <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
      <Check size={10} className="text-emerald-500" />
    </div>
    {label}
  </li>
);

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-800 bg-[#0d1117] group mt-4">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs font-mono text-gray-500 uppercase">{language}</span>
        <button 
          onClick={handleCopy}
          className="text-gray-500 hover:text-white transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-gray-300 leading-relaxed whitespace-pre">
          <code>{code.trim()}</code>
        </pre>
      </div>
    </div>
  );
};