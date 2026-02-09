import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import LinearSegmentedColormap
import numpy as np
import io
import requests
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

COLOR_BG = '#0a0a0a'
COLOR_PANEL = '#111111'
COLOR_TEXT = '#e5e7eb'
COLOR_TEXT_DIM = '#9ca3af'
COLOR_GREEN = '#10b981'
COLOR_RED = '#ef4444'
COLOR_YELLOW = '#f59e0b'
COLOR_PURPLE = '#a855f7'
COLOR_BLUE = '#3b82f6'
COLOR_GRID = '#1f2937'
COLOR_BORDER = '#374151'

GEX_CMAP = LinearSegmentedColormap.from_list(
    'gex_diverge',
    [(0, COLOR_RED), (0.5, '#1f2937'), (1, COLOR_GREEN)]
)


def _format_compact(value):
    abs_val = abs(value)
    if abs_val >= 1e9:
        return f"{value / 1e9:.1f}B"
    if abs_val >= 1e6:
        return f"{value / 1e6:.1f}M"
    if abs_val >= 1e3:
        return f"{value / 1e3:.1f}K"
    return f"{value:.1f}"


def _filter_strikes_near_spot(chain_data, pct_range=0.02):
    spot = chain_data.get('spot', 0)
    if spot == 0:
        return [], [], [], []

    lower = spot * (1 - pct_range)
    upper = spot * (1 + pct_range)

    strikes_raw = chain_data.get('strikes', [])
    filtered_strikes = []
    gex_vol_vals = []
    gex_oi_vals = []
    priors_list = []

    for s in strikes_raw:
        strike = s[0]
        if lower <= strike <= upper:
            filtered_strikes.append(round(strike))
            gex_vol_vals.append(s[1])
            gex_oi_vals.append(s[2])
            prior = s[3] if len(s) > 3 else 0
            priors_list.append(prior)

    return filtered_strikes, gex_vol_vals, gex_oi_vals, priors_list


def _draw_depth_profile(ax, strikes, values, spot, zero_gamma, title, major_pos, major_neg, title_position='bottom-left'):
    if not strikes or not values:
        ax.set_facecolor(COLOR_PANEL)
        ax.text(0.5, 0.5, 'No Data', transform=ax.transAxes,
                ha='center', va='center', color=COLOR_TEXT_DIM, fontsize=14)
        return

    # Dynamic bar height based on strike spacing
    sorted_strikes = sorted(set(strikes))
    if len(sorted_strikes) >= 2:
        diffs = [sorted_strikes[i+1] - sorted_strikes[i] for i in range(len(sorted_strikes)-1)]
        min_gap = min(diffs)
        bar_height = min_gap * 0.7
    else:
        bar_height = 3.5

    colors = [COLOR_GREEN if v >= 0 else COLOR_RED for v in values]
    ax.barh(strikes, values, color=colors, height=bar_height, alpha=0.85, edgecolor='none')

    # Reference lines (no inline text)
    ax.axhline(y=spot, color=COLOR_YELLOW, linewidth=2, linestyle='-', alpha=0.9)
    ax.axhline(y=zero_gamma, color=COLOR_PURPLE, linewidth=1.5, linestyle='--', alpha=0.7)
    if major_pos and min(strikes) <= major_pos <= max(strikes):
        ax.axhline(y=major_pos, color=COLOR_GREEN, linewidth=1, linestyle=':', alpha=0.6)
    if major_neg and min(strikes) <= major_neg <= max(strikes):
        ax.axhline(y=major_neg, color=COLOR_RED, linewidth=1, linestyle=':', alpha=0.6)

    ax.axvline(x=0, color=COLOR_BORDER, linewidth=0.5)

    ax.set_facecolor(COLOR_PANEL)
    ax.tick_params(colors=COLOR_TEXT_DIM, labelsize=7)
    ax.set_ylabel('Strike', color=COLOR_TEXT_DIM, fontsize=8)
    ax.grid(axis='x', color=COLOR_GRID, linewidth=0.3, alpha=0.5)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color(COLOR_BORDER)
    ax.spines['left'].set_color(COLOR_BORDER)

    y_min = min(strikes) - 5
    y_max = max(strikes) + 5
    ax.set_ylim(y_max, y_min)

    # Title placement: bottom-left (xlabel) or bottom-right (text annotation)
    if title_position == 'bottom-right':
        ax.text(0.98, -0.04, title, transform=ax.transAxes,
                color=COLOR_TEXT, fontsize=10, fontweight='bold',
                va='top', ha='right')
    else:
        ax.set_xlabel(title, color=COLOR_TEXT, fontsize=10, fontweight='bold', labelpad=8)

    # Key levels text block in top-right corner
    info_lines = [
        (f'SPOT: {spot:.0f}', COLOR_YELLOW),
        (f'Zero Gamma: {zero_gamma:.0f}', COLOR_PURPLE),
    ]
    if major_pos:
        info_lines.append((f'Resistance: {major_pos:.0f}', COLOR_GREEN))
    if major_neg:
        info_lines.append((f'Support: {major_neg:.0f}', COLOR_RED))

    for i, (text, color) in enumerate(info_lines):
        ax.text(0.98, 0.97 - i * 0.045, text, transform=ax.transAxes,
                color=color, fontsize=6.5, fontweight='bold',
                va='top', ha='right', fontfamily='monospace',
                bbox=dict(boxstyle='round,pad=0.15', facecolor=COLOR_BG, alpha=0.7, edgecolor='none'))


def _draw_max_shifts(ax, maxchange_data):
    ax.set_facecolor(COLOR_PANEL)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis('off')

    ax.set_title('Max GEX Shifts', color=COLOR_TEXT, fontsize=10, fontweight='bold', pad=8)

    rows = [
        ('Current', maxchange_data.get('current', [0, 0])),
        ('1 Min', maxchange_data.get('one', [0, 0])),
        ('5 Min', maxchange_data.get('five', [0, 0])),
        ('10 Min', maxchange_data.get('ten', [0, 0])),
        ('15 Min', maxchange_data.get('fifteen', [0, 0])),
        ('30 Min', maxchange_data.get('thirty', [0, 0])),
    ]

    header_y = 9.0
    ax.text(0.5, header_y, 'Interval', color=COLOR_TEXT_DIM, fontsize=7, fontweight='bold', va='center')
    ax.text(4.0, header_y, 'Strike', color=COLOR_TEXT_DIM, fontsize=7, fontweight='bold', va='center')
    ax.text(7.5, header_y, 'Change', color=COLOR_TEXT_DIM, fontsize=7, fontweight='bold', va='center')

    ax.plot([0.3, 9.7], [header_y - 0.4, header_y - 0.4], color=COLOR_BORDER, linewidth=0.5)

    for i, (label, data) in enumerate(rows):
        y = header_y - 1.2 - i * 1.2
        strike_val = data[0] if isinstance(data, (list, tuple)) else 0
        change_val = data[1] if isinstance(data, (list, tuple)) else 0
        val_color = COLOR_GREEN if change_val >= 0 else COLOR_RED
        indicator = '\u25b2' if change_val >= 0 else '\u25bc'

        ax.text(0.5, y, label, color=COLOR_TEXT_DIM, fontsize=8, va='center', fontfamily='monospace')
        ax.text(4.0, y, f'{strike_val:.0f}', color=COLOR_TEXT, fontsize=8, va='center',
                fontweight='bold', fontfamily='monospace')
        ax.text(7.5, y, f'{indicator} {_format_compact(change_val)}', color=val_color,
                fontsize=8, va='center', fontweight='bold', fontfamily='monospace')


def _draw_3d_surface(ax, chain_data):
    time_labels = ['-30m', '-15m', '-10m', '-5m', '-1m', 'Now']
    spot_priors = chain_data.get('spot_priors', [chain_data.get('spot', 0)] * 6)
    spot = chain_data.get('spot', 0)

    min_spot = min(spot_priors) if spot_priors else spot
    max_spot = max(spot_priors) if spot_priors else spot
    lower = min_spot * 0.995
    upper = max_spot * 1.005

    strikes_raw = chain_data.get('strikes', [])
    filtered = [(round(s[0]), s[1], s[3] if len(s) > 3 else 0)
                for s in strikes_raw if lower <= s[0] <= upper]
    filtered.sort(key=lambda x: x[0])

    if len(filtered) < 3:
        ax.set_facecolor(COLOR_PANEL)
        ax.text2D(0.5, 0.5, 'Insufficient Data', transform=ax.transAxes,
                  ha='center', va='center', color=COLOR_TEXT_DIM, fontsize=10)
        return

    y_strikes = [f[0] for f in filtered]
    z_data = []
    for strike_val, gex_vol, prior in filtered:
        if isinstance(prior, list) and len(prior) >= 5:
            row = [prior[4], prior[3], prior[2], prior[1], prior[0], gex_vol]
        else:
            p = prior if isinstance(prior, (int, float)) else 0
            row = [p, p, p, p, p, gex_vol]
        z_data.append(row)

    z_arr = np.array(z_data)
    x_indices = np.arange(len(time_labels))
    y_indices = np.arange(len(y_strikes))
    X, Y = np.meshgrid(x_indices, y_indices)

    max_abs = max(np.max(np.abs(z_arr)), 1)

    ax.set_facecolor(COLOR_BG)
    surf = ax.plot_surface(X, Y, z_arr, cmap=GEX_CMAP, vmin=-max_abs, vmax=max_abs,
                           alpha=0.8, edgecolor='none', antialiased=True)

    spot_z_values = []
    for t_idx, sp in enumerate(spot_priors):
        best_idx = min(range(len(y_strikes)), key=lambda i: abs(y_strikes[i] - sp))
        spot_z_values.append(z_arr[best_idx, t_idx])

    y_spot_indices = []
    for sp in spot_priors:
        best_idx = min(range(len(y_strikes)), key=lambda i: abs(y_strikes[i] - sp))
        frac = best_idx
        if best_idx < len(y_strikes) - 1:
            denom = y_strikes[best_idx + 1] - y_strikes[best_idx]
            if denom != 0:
                frac = best_idx + (sp - y_strikes[best_idx]) / denom
        y_spot_indices.append(frac)

    ax.plot(x_indices, y_spot_indices, spot_z_values, color=COLOR_YELLOW,
            linewidth=2, alpha=0.9, zorder=10)
    ax.scatter(x_indices, y_spot_indices, spot_z_values, color=COLOR_YELLOW,
               s=12, alpha=0.9, zorder=11, depthshade=False)

    ax.set_xticks(x_indices)
    ax.set_xticklabels(time_labels, fontsize=6, color=COLOR_TEXT_DIM)
    y_tick_step = max(1, len(y_strikes) // 6)
    ax.set_yticks(y_indices[::y_tick_step])
    ax.set_yticklabels([str(y_strikes[i]) for i in range(0, len(y_strikes), y_tick_step)],
                       fontsize=6, color=COLOR_TEXT_DIM)
    ax.tick_params(axis='z', labelsize=5, colors=COLOR_TEXT_DIM)

    ax.set_xlabel('Time', fontsize=7, color=COLOR_TEXT_DIM, labelpad=2)
    ax.set_ylabel('Strike', fontsize=7, color=COLOR_TEXT_DIM, labelpad=2)
    ax.set_zlabel('GEX Vol', fontsize=7, color=COLOR_TEXT_DIM, labelpad=2)
    ax.set_title('Historical GEX Surface', color=COLOR_TEXT, fontsize=10,
                 fontweight='bold', pad=0, y=0.98)

    ax.xaxis.pane.fill = False
    ax.yaxis.pane.fill = False
    ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor(COLOR_GRID)
    ax.yaxis.pane.set_edgecolor(COLOR_GRID)
    ax.zaxis.pane.set_edgecolor(COLOR_GRID)
    ax.grid(color=COLOR_GRID, linewidth=0.3, alpha=0.3)
    ax.view_init(elev=25, azim=-55)


def _draw_trend_pivots(ax, chain_data):
    strikes, gex_vol, _, _ = _filter_strikes_near_spot(chain_data, pct_range=0.02)
    spot = chain_data.get('spot', 0)
    zero_gamma = chain_data.get('zero_gamma', 0)
    major_pos_vol = chain_data.get('major_pos_vol', 0)
    major_neg_vol = chain_data.get('major_neg_vol', 0)
    major_pos_oi = chain_data.get('major_pos_oi', 0)
    major_neg_oi = chain_data.get('major_neg_oi', 0)

    if not strikes:
        ax.set_facecolor(COLOR_PANEL)
        ax.text(0.5, 0.5, 'No Data', transform=ax.transAxes,
                ha='center', va='center', color=COLOR_TEXT_DIM, fontsize=14)
        return

    max_abs = max(abs(v) for v in gex_vol) if gex_vol else 1
    scaled = [v / max_abs * 100 for v in gex_vol]

    ax.fill_between(strikes, scaled, 0, where=[s >= 0 for s in scaled],
                    color=COLOR_GREEN, alpha=0.3, interpolate=True)
    ax.fill_between(strikes, scaled, 0, where=[s < 0 for s in scaled],
                    color=COLOR_RED, alpha=0.3, interpolate=True)
    ax.plot(strikes, scaled, color='#8b5cf6', linewidth=1.5, alpha=0.8)

    ax.axhline(y=0, color=COLOR_BORDER, linewidth=0.5)
    ax.axvline(x=spot, color=COLOR_YELLOW, linewidth=2, alpha=0.9)
    ax.text(spot, ax.get_ylim()[1] if ax.get_ylim()[1] != 0 else 100,
            f' SPOT {spot:.0f}', color=COLOR_YELLOW, fontsize=7,
            va='top', ha='left', fontweight='bold')

    strike_min = min(strikes)
    strike_max = max(strikes)
    if major_pos_vol and strike_min <= major_pos_vol <= strike_max:
        ax.axvline(x=major_pos_vol, color=COLOR_GREEN, linewidth=1.5, linestyle='--', alpha=0.7)
    if major_neg_vol and strike_min <= major_neg_vol <= strike_max:
        ax.axvline(x=major_neg_vol, color=COLOR_RED, linewidth=1.5, linestyle='--', alpha=0.7)

    ax.set_facecolor(COLOR_PANEL)
    ax.set_xlabel('GEX Trend & Major Pivots', color=COLOR_TEXT, fontsize=10, fontweight='bold', labelpad=8)
    ax.set_ylabel('Scaled Net GEX (Vol)', color=COLOR_TEXT_DIM, fontsize=8)
    ax.tick_params(colors=COLOR_TEXT_DIM, labelsize=7)
    ax.grid(color=COLOR_GRID, linewidth=0.3, alpha=0.5)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color(COLOR_BORDER)
    ax.spines['left'].set_color(COLOR_BORDER)

    # Hardcoded pivot info text at bottom
    regime = 'LONG Gamma' if spot > zero_gamma else 'SHORT Gamma'
    regime_color = COLOR_GREEN if spot > zero_gamma else COLOR_RED
    pivot_parts = [
        (f'SPOT: {spot:.2f}', COLOR_YELLOW),
        (f'   Zero Gamma: {zero_gamma:.2f}', COLOR_PURPLE),
        (f'   [{regime}]', regime_color),
        (f'   Res(Vol): {major_pos_vol:.0f}', COLOR_GREEN),
        (f'   Supp(Vol): {major_neg_vol:.0f}', COLOR_RED),
        (f'   Res(OI): {major_pos_oi:.0f}', COLOR_GREEN),
        (f'   Supp(OI): {major_neg_oi:.0f}', COLOR_RED),
    ]
    x_pos = 0.01
    for text, color in pivot_parts:
        ax.text(x_pos, -0.15, text, transform=ax.transAxes,
                color=color, fontsize=7, fontweight='bold',
                va='top', ha='left', fontfamily='monospace')
        # Approximate x advance per character
        x_pos += len(text) * 0.0085


def _draw_header(fig, chain_data, maxchange_data):
    est = ZoneInfo('America/New_York')
    now_est = datetime.now(est)
    ts = chain_data.get('timestamp', 0)
    data_time = datetime.fromtimestamp(ts, tz=est).strftime('%Y-%m-%d %H:%M EST') if ts else 'N/A'

    ticker = chain_data.get('ticker', 'SPX')
    spot = chain_data.get('spot', 0)
    zero_g = chain_data.get('zero_gamma', 0)
    net_vol = chain_data.get('sum_gex_vol', 0)
    net_oi = chain_data.get('sum_gex_oi', 0)
    regime = 'LONG Gamma (Bullish)' if spot > zero_g else 'SHORT Gamma (Bearish)'
    regime_color = COLOR_GREEN if spot > zero_g else COLOR_RED

    header_y = 0.975
    fig.text(0.02, header_y, f'{ticker}', color=COLOR_TEXT, fontsize=16,
             fontweight='bold', va='top', fontfamily='monospace')
    fig.text(0.08, header_y, f'Spot: {spot:.2f}', color=COLOR_YELLOW, fontsize=11,
             fontweight='bold', va='top', fontfamily='monospace')
    fig.text(0.22, header_y, f'Zero Gamma: {zero_g:.2f}', color=COLOR_PURPLE, fontsize=10,
             va='top', fontfamily='monospace')
    fig.text(0.42, header_y, regime, color=regime_color, fontsize=10,
             fontweight='bold', va='top')
    fig.text(0.62, header_y, f'Net GEX Vol: {_format_compact(net_vol)}', color=COLOR_TEXT_DIM,
             fontsize=9, va='top', fontfamily='monospace')
    fig.text(0.80, header_y, f'Net GEX OI: {_format_compact(net_oi)}', color=COLOR_TEXT_DIM,
             fontsize=9, va='top', fontfamily='monospace')
    fig.text(0.98, header_y, data_time, color=COLOR_TEXT_DIM, fontsize=8,
             va='top', ha='right', fontfamily='monospace')

    fig.text(0.02, header_y - 0.022,
             f'Res(Vol): {chain_data.get("major_pos_vol", 0):.0f}  |  '
             f'Supp(Vol): {chain_data.get("major_neg_vol", 0):.0f}  |  '
             f'Res(OI): {chain_data.get("major_pos_oi", 0):.0f}  |  '
             f'Supp(OI): {chain_data.get("major_neg_oi", 0):.0f}',
             color=COLOR_TEXT_DIM, fontsize=7, va='top', fontfamily='monospace')


def generate_dashboard_image(chain_data, maxchange_data):
    fig = plt.figure(figsize=(16, 9), facecolor=COLOR_BG, dpi=120)

    # 4-row grid: rows 0-2 for depth profiles + shifts/surface, row 3 for trend
    # height_ratios: depth/shifts rows smaller, surface row taller, trend row standard
    gs = gridspec.GridSpec(4, 3, figure=fig,
                           height_ratios=[1.2, 1.2, 1.6, 1.2],
                           hspace=0.35, wspace=0.25,
                           top=0.93, bottom=0.08, left=0.05, right=0.97)

    _draw_header(fig, chain_data, maxchange_data)

    strikes, gex_vol, gex_oi, priors = _filter_strikes_near_spot(chain_data)
    spot = chain_data.get('spot', 0)
    zero_gamma = chain_data.get('zero_gamma', 0)

    # Depth profiles span rows 0-2, cols 0 and 1
    ax_vol = fig.add_subplot(gs[0:3, 0])
    _draw_depth_profile(ax_vol, strikes, gex_vol, spot, zero_gamma,
                        'GEX Depth Profile (Volume)',
                        chain_data.get('major_pos_vol'),
                        chain_data.get('major_neg_vol'))

    ax_oi = fig.add_subplot(gs[0:3, 1])
    _draw_depth_profile(ax_oi, strikes, gex_oi, spot, zero_gamma,
                        'GEX Depth Profile (Open Interest)',
                        chain_data.get('major_pos_oi'),
                        chain_data.get('major_neg_oi'),
                        title_position='bottom-right')

    # Max shifts: row 0, col 2
    ax_shifts = fig.add_subplot(gs[0, 2])
    _draw_max_shifts(ax_shifts, maxchange_data)

    # Historical surface: rows 1-2, col 2 (doubled height)
    ax_surface = fig.add_subplot(gs[1:3, 2], projection='3d')
    _draw_3d_surface(ax_surface, chain_data)

    # Trend & pivots: row 3, all columns
    ax_trend = fig.add_subplot(gs[3, :])
    _draw_trend_pivots(ax_trend, chain_data)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor=fig.get_facecolor(),
                edgecolor='none', bbox_inches='tight', pad_inches=0.1)
    plt.close(fig)
    buf.seek(0)
    return buf


def send_dashboard_to_discord(image_buffer, webhook_url, ticker='SPX'):
    if not webhook_url:
        logger.warning("No DISCORD_WEBHOOK configured, skipping image send")
        return False

    est = ZoneInfo('America/New_York')
    now_est = datetime.now(est)
    filename = f"gex_dashboard_{ticker}_{now_est.strftime('%H%M')}.png"

    try:
        resp = requests.post(
            webhook_url,
            files={'file': (filename, image_buffer, 'image/png')},
            data={'content': f'**{ticker} GEX Dashboard** \u2014 {now_est.strftime("%Y-%m-%d %H:%M EST")}'},
            timeout=15
        )
        if resp.status_code in (200, 204):
            logger.info(f"Dashboard image sent to Discord: {filename}")
            return True
        else:
            logger.error(f"Discord webhook returned {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        logger.error(f"Failed to send dashboard to Discord: {e}")
        return False


def is_market_hours():
    est = ZoneInfo('America/New_York')
    now = datetime.now(est)
    if now.weekday() >= 5:
        return False
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=5, second=0, microsecond=0)
    return market_open <= now <= market_close


def generate_and_send(chain_data, maxchange_data, webhook_url, ticker='SPX'):
    if not is_market_hours():
        logger.info("Outside market hours, skipping dashboard image generation")
        return

    try:
        image_buf = generate_dashboard_image(chain_data, maxchange_data)
        send_dashboard_to_discord(image_buf, webhook_url, ticker)
    except Exception as e:
        logger.exception(f"Dashboard generation/send failed: {e}")
