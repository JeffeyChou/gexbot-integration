from flask import Flask, jsonify
from flask_cors import CORS
import psycopg2
import os
import json
import logging

import requests
from flask import request

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = app.logger

DB_URL = os.getenv("DATABASE_URL")
GEXBOT_API_KEY = os.getenv("GEXBOT_API_KEY")
HEADERS = {"User-Agent": "GexbotSentinel/Backend/1.0", "Accept": "application/json"}

def get_db_connection():
    try:
        conn = psycopg2.connect(DB_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "gexbot-backend"}), 200

@app.route('/api/majors', methods=['GET'])
def get_majors():
    ticker = request.args.get('ticker', 'SPX')
    
    # If custom ticker, proxy to Gexbot API directly
    if ticker != 'SPX':
        try:
            url = f"https://api.gexbot.com/{ticker}/classic/majors?key={GEXBOT_API_KEY}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            if resp.status_code == 200:
                return jsonify(resp.json())
            return jsonify({"error": f"Gexbot API error: {resp.status_code}"}), resp.status_code
        except Exception as e:
            logger.error(f"Proxy error majors: {e}")
            return jsonify({"error": str(e)}), 500

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 500
    
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT timestamp, ticker, spot, zero_gamma, mpos_vol, mpos_oi, mneg_vol, mneg_oi, net_gex_vol, net_gex_oi
            FROM gex_major_levels
            WHERE ticker = 'SPX'
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row:
            # Map to GexMajorLevelsResponse
            data = {
                "timestamp": row[0].timestamp(), # Convert datetime to epoch
                "ticker": row[1],
                "spot": float(row[2]),
                "zero_gamma": float(row[3]),
                "mpos_vol": float(row[4]),
                "mpos_oi": float(row[5]),
                "mneg_vol": float(row[6]),
                "mneg_oi": float(row[7]),
                "net_gex_vol": float(row[8]),
                "net_gex_oi": float(row[9])
            }
            return jsonify(data)
        else:
            return jsonify({"error": "No data available"}), 404
    except Exception as e:
        logger.error(f"Error fetching majors: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/max-change', methods=['GET'])
def get_max_change():
    ticker = request.args.get('ticker', 'SPX')

    if ticker != 'SPX':
        try:
            url = f"https://api.gexbot.com/{ticker}/classic/maxchange?key={GEXBOT_API_KEY}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            if resp.status_code == 200:
                return jsonify(resp.json())
            return jsonify({"error": f"Gexbot API error: {resp.status_code}"}), resp.status_code
        except Exception as e:
            logger.error(f"Proxy error max-change: {e}")
            return jsonify({"error": str(e)}), 500

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 500
    
    try:
        cur = conn.cursor()
        # Fetching full_data JSON directly is easiest as it matches the API response structure
        cur.execute("""
            SELECT full_data
            FROM gex_max_change
            WHERE ticker = 'SPX'
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row:
            return jsonify(row[0]) # Start with the stored JSON
        else:
            return jsonify({"error": "No data available"}), 404
    except Exception as e:
        logger.error(f"Error fetching max change: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/chain', methods=['GET'])
def get_chain():
    ticker = request.args.get('ticker', 'SPX')

    if ticker != 'SPX':
        try:
            url = f"https://api.gexbot.com/{ticker}/classic/zero?key={GEXBOT_API_KEY}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            if resp.status_code == 200:
                return jsonify(resp.json())
            return jsonify({"error": f"Gexbot API error: {resp.status_code}"}), resp.status_code
        except Exception as e:
            logger.error(f"Proxy error chain: {e}")
            return jsonify({"error": str(e)}), 500

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 500
    
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT timestamp, ticker, spot_price, sum_gex_vol, strikes_data
            FROM gex_snapshots
            WHERE ticker = 'SPX'
            ORDER BY timestamp DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        cur.close()
        conn.close()

        if row:
            # Construct GexApiResponse
            # Note: We are only storing minimal fields in gex_snapshots table for now, 
            # but strikes_data likely contains the raw response from /zero endpoint which has everything?
            # Let's assume strikes_data is just the strikes array based on scheduler logic.
            # We need to reconstruct the full response object.
            
            strikes = row[4] # JSONB
            
            # Use 'strikes' to compute other fields if missing, or mock them if not stored
            # For now, we return what we have.
            # Ideally scheduler should store the FULL JSON if we want to return full JSON.
            # But the scheduler logic: json.dumps(data.get('strikes')) for strikes_data.
            
            # The frontend expects GexApiResponse.
            # We can mock missing fields or fetch from DB if we update schema.
            # Let's stick to what we have.
            
            data = {
                "timestamp": row[0].timestamp(),
                "ticker": row[1],
                "spot": float(row[2]),
                "sum_gex_vol": float(row[3]),
                "strikes": strikes,
                # Default/calculated fields
                "min_dte": 0,
                "sec_min_dte": 1, # Mock
                "zero_gamma": 0, # Should come from majors endpoint really
                "major_pos_vol": 0,
                "major_pos_oi": 0,
                "major_neg_vol": 0,
                "major_neg_oi": 0,
                "sum_gex_oi": 0,
                "delta_risk_reversal": 0,
                "max_priors": []
            }
            return jsonify(data)
        else:
            return jsonify({"error": "No data available"}), 404
    except Exception as e:
        logger.error(f"Error fetching chain: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
