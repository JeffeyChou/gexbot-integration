import time
import requests
import psycopg2
import os
import schedule
import json
import logging
from dashboard_image import generate_and_send

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("GEXBOT_API_KEY")
DB_URL = os.getenv("DATABASE_URL")
DISCORD_WEBHOOKS = [
    url.strip() for url in os.getenv("DISCORD_WEBHOOKS", os.getenv("DISCORD_WEBHOOK", "")).split(",") if url.strip()
]
HEADERS = {"User-Agent": "GexbotSentinel/Scheduler/1.0", "Accept": "application/json"}

AGGREGATION = "zero"
SCHEDULER_TICKERS = os.getenv("SCHEDULER_TICKERS", "SPX,SPY,QQQ,IWM").split(",")

def get_db_connection():
    return psycopg2.connect(DB_URL)

def send_discord_alert(message):
    if not DISCORD_WEBHOOKS:
        return
    for webhook_url in DISCORD_WEBHOOKS:
        try:
            requests.post(webhook_url, json={"content": message}, timeout=5)
        except Exception as e:
            logger.error(f"Discord alert failed for {webhook_url[:60]}: {e}")

def cache_chain_data(ticker, data):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO gex_snapshots
            (timestamp, ticker, spot_price, sum_gex_vol, strikes_data, full_data)
            VALUES (to_timestamp(%s), %s, %s, %s, %s, %s)
            ON CONFLICT (ticker, timestamp) DO NOTHING
        """, (
            data.get('timestamp'), ticker, data.get('spot'),
            data.get('sum_gex_vol'), json.dumps(data.get('strikes', [])),
            json.dumps(data)
        ))
        cur.execute("""
            INSERT INTO gex_major_levels
            (timestamp, ticker, spot, zero_gamma, mpos_vol, mpos_oi, mneg_vol, mneg_oi, net_gex_vol, net_gex_oi)
            VALUES (to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticker, timestamp) DO NOTHING
        """, (
            data.get('timestamp'), ticker, data.get('spot'),
            data.get('zero_gamma'), data.get('major_pos_vol'), data.get('major_pos_oi'),
            data.get('major_neg_vol'), data.get('major_neg_oi'),
            data.get('sum_gex_vol'), data.get('sum_gex_oi')
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"DB cache chain failed for {ticker}: {e}")
    finally:
        cur.close()
        conn.close()

def cache_maxchange_data(ticker, data):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO gex_max_change
            (timestamp, ticker, current_strike, current_val, one_min_strike, one_min_val,
             five_min_strike, five_min_val, thirty_min_strike, thirty_min_val, full_data)
            VALUES (to_timestamp(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticker, timestamp) DO NOTHING
        """, (
            data.get('timestamp'), ticker,
            data['current'][0], data['current'][1],
            data['one'][0], data['one'][1],
            data['five'][0], data['five'][1],
            data['thirty'][0], data['thirty'][1],
            json.dumps(data)
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"DB cache maxchange failed for {ticker}: {e}")
    finally:
        cur.close()
        conn.close()

def fetch_and_cache_ticker(ticker):
    logger.info(f"Scheduler: fetching {ticker} data...")
    chain_data = None
    maxchange_data = None
    try:
        chain_url = f"https://api.gexbot.com/{ticker}/classic/{AGGREGATION}?key={API_KEY}"
        resp = requests.get(chain_url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            chain_data = resp.json()
            cache_chain_data(ticker, chain_data)
            logger.info(f"{ticker} chain cached.")
        else:
            logger.error(f"{ticker} chain fetch failed: {resp.status_code}")
            send_discord_alert(f"⚠️ {ticker} chain error: {resp.status_code}")

        mc_url = f"https://api.gexbot.com/{ticker}/classic/{AGGREGATION}/maxchange?key={API_KEY}"
        resp = requests.get(mc_url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            maxchange_data = resp.json()
            cache_maxchange_data(ticker, maxchange_data)
            logger.info(f"{ticker} maxchange cached.")
        else:
            logger.error(f"{ticker} maxchange fetch failed: {resp.status_code}")
            send_discord_alert(f"⚠️ {ticker} maxchange error: {resp.status_code}")

    except Exception as e:
        logger.exception(f"Scheduler {ticker} error: {e}")
        send_discord_alert(f"🚨 Scheduler Exception ({ticker}): {e}")

    return chain_data, maxchange_data

def fetch_cache_and_generate():
    for ticker in SCHEDULER_TICKERS:
        chain_data, maxchange_data = fetch_and_cache_ticker(ticker)
        if chain_data and maxchange_data:
            for webhook_url in DISCORD_WEBHOOKS:
                generate_and_send(chain_data, maxchange_data, webhook_url, ticker=ticker)

if __name__ == "__main__":
    if not API_KEY:
        logger.warning("GEXBOT_API_KEY not set. Scheduler may fail.")
    if not DB_URL:
        logger.error("DATABASE_URL not set. Exiting.")
        exit(1)

    logger.info(f"Scheduler started. Tickers: {SCHEDULER_TICKERS}. Initial fetch...")
    send_discord_alert(f"✅ Gexbot Sentinel Scheduler Started — Tickers: {', '.join(SCHEDULER_TICKERS)}")
    fetch_cache_and_generate()

    schedule.every(5).minutes.do(fetch_cache_and_generate)

    while True:
        schedule.run_pending()
        time.sleep(1)
