import time
import requests
import psycopg2
import os
import schedule
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

API_KEY = os.getenv("GEXBOT_API_KEY")
DB_URL = os.getenv("DATABASE_URL")
DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK")
HEADERS = {"User-Agent": "GexbotSentinel/1.0", "Accept": "application/json"}

def get_db_connection():
    return psycopg2.connect(DB_URL)

def send_discord_alert(message):
    if not DISCORD_WEBHOOK:
        return
    try:
        payload = {"content": message}
        requests.post(DISCORD_WEBHOOK, json=payload, timeout=5)
    except Exception as e:
        logger.error(f"Failed to send Discord alert: {e}")

def fetch_gex_majors():
    logger.info("Fetching Gex Majors...")
    try:
        url = f"https://api.gexbot.com/SPX/classic/full/majors?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            error_msg = f"Failed to fetch majors: {resp.status_code} - {resp.text}"
            logger.error(error_msg)
            send_discord_alert(f"⚠️ Gexbot Error: {error_msg}")
            return
        data = resp.json()

        conn = get_db_connection()
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
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Majors saved successfully.")
    except Exception as e:
        logger.exception(f"Error in fetch_gex_majors: {e}")
        send_discord_alert(f"🚨 Scheduler Exception (Majors): {e}")

def fetch_gex_max_change():
    logger.info("Fetching Gex Max Change...")
    try:
        url = f"https://api.gexbot.com/SPX/classic/full/maxchange?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            error_msg = f"Failed to fetch max change: {resp.status_code} - {resp.text}"
            logger.error(error_msg)
            send_discord_alert(f"⚠️ Gexbot Error: {error_msg}")
            return
        data = resp.json()

        conn = get_db_connection()
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
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Max Change saved successfully.")
    except Exception as e:
        logger.exception(f"Error in fetch_gex_max_change: {e}")
        send_discord_alert(f"🚨 Scheduler Exception (Max Change): {e}")

def fetch_gex_chain():
    logger.info("Fetching Gex Chain...")
    try:
        url = f"https://api.gexbot.com/SPX/classic/zero?key={API_KEY}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            error_msg = f"Failed to fetch chain: {resp.status_code} - {resp.text}"
            logger.error(error_msg)
            send_discord_alert(f"⚠️ Gexbot Error: {error_msg}")
            return
        data = resp.json()

        strikes = data.get('strikes', [])
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO gex_snapshots 
            (timestamp, ticker, spot_price, sum_gex_vol, strikes_data)
            VALUES (to_timestamp(%s), %s, %s, %s, %s)
        """, (
            data.get('timestamp'), data.get('ticker'), data.get('spot'),
            data.get('sum_gex_vol'), json.dumps(strikes)
        ))
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Chain saved successfully.")
    except Exception as e:
        logger.exception(f"Error in fetch_gex_chain: {e}")
        send_discord_alert(f"🚨 Scheduler Exception (Chain): {e}")

if __name__ == "__main__":
    if not API_KEY:
        logger.warning("GEXBOT_API_KEY is not set. Scheduler may fail.")
    if not DB_URL:
        logger.error("DATABASE_URL is not set. Exiting.")
        exit(1)

    logger.info("Scheduler started. Running initial fetch...")
    send_discord_alert("✅ Gexbot Sentinel Scheduler Started on Oracle ARM64")
    # Run once on startup
    fetch_gex_majors()
    fetch_gex_max_change()
    fetch_gex_chain()

    # Schedule every 5 minutes
    schedule.every(5).minutes.do(fetch_gex_majors)
    schedule.every(5).minutes.do(fetch_gex_max_change)
    schedule.every(5).minutes.do(fetch_gex_chain)

    while True:
        schedule.run_pending()
        time.sleep(1)
