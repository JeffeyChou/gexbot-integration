from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import os
import json
import logging
import requests

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = app.logger

DB_URL = os.getenv("DATABASE_URL")
GEXBOT_API_KEY = os.getenv("GEXBOT_API_KEY")
HEADERS = {"User-Agent": "GexbotSentinel/Backend/1.0", "Accept": "application/json"}

AGGREGATION = "zero"
QUICK_TICKERS = [
    "AAPL", "AMD", "AMZN", "COIN", "GLD", "GOOG", "GOOGL", "INTC", "IWM",
    "META", "MSFT", "MSTR", "MU", "NFLX", "NVDA", "PLTR", "QQQ", "SLV",
    "SOFI", "SPX", "SPY", "TLT", "TSLA", "TSM", "UNH"
]

def get_db_connection():
    try:
        conn = psycopg2.connect(DB_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return None

def cache_chain_data(ticker, data):
    """Cache chain API response to gex_snapshots + gex_major_levels. ON CONFLICT dedup."""
    conn = get_db_connection()
    if not conn:
        return
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
    """Cache maxchange API response. ON CONFLICT dedup."""
    conn = get_db_connection()
    if not conn:
        return
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

def get_cached_chain(ticker):
    """Fallback: latest cached chain from DB via full_data JSONB."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT full_data FROM gex_snapshots
            WHERE ticker = %s ORDER BY timestamp DESC LIMIT 1
        """, (ticker,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        logger.error(f"DB fallback chain failed for {ticker}: {e}")
        return None

def get_cached_maxchange(ticker):
    """Fallback: latest cached maxchange from DB via full_data JSONB."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT full_data FROM gex_max_change
            WHERE ticker = %s ORDER BY timestamp DESC LIMIT 1
        """, (ticker,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        logger.error(f"DB fallback maxchange failed for {ticker}: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "gexbot-backend"}), 200

@app.route('/api/chain', methods=['GET'])
def get_chain():
    ticker = request.args.get('ticker', 'SPX')

    # Always fetch live from Gexbot API
    try:
        url = f"https://api.gexbot.com/{ticker}/classic/{AGGREGATION}?key={GEXBOT_API_KEY}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if ticker in QUICK_TICKERS:
                cache_chain_data(ticker, data)
            return jsonify(data)
        else:
            logger.error(f"Chain API error for {ticker}: {resp.status_code}")
    except Exception as e:
        logger.error(f"Chain API exception for {ticker}: {e}")

    # Fallback to DB cache for QUICK_TICKERS
    if ticker in QUICK_TICKERS:
        cached = get_cached_chain(ticker)
        if cached:
            logger.info(f"Serving cached chain for {ticker}")
            return jsonify(cached)

    return jsonify({"error": "Data unavailable"}), 503

@app.route('/api/max-change', methods=['GET'])
def get_max_change():
    ticker = request.args.get('ticker', 'SPX')

    # Always fetch live from Gexbot API
    try:
        url = f"https://api.gexbot.com/{ticker}/classic/{AGGREGATION}/maxchange?key={GEXBOT_API_KEY}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if ticker in QUICK_TICKERS:
                cache_maxchange_data(ticker, data)
            return jsonify(data)
        else:
            logger.error(f"MaxChange API error for {ticker}: {resp.status_code}")
    except Exception as e:
        logger.error(f"MaxChange API exception for {ticker}: {e}")

    # Fallback to DB cache for QUICK_TICKERS
    if ticker in QUICK_TICKERS:
        cached = get_cached_maxchange(ticker)
        if cached:
            logger.info(f"Serving cached maxchange for {ticker}")
            return jsonify(cached)

    return jsonify({"error": "Data unavailable"}), 503

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
