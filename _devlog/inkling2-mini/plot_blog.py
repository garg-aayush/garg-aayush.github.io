"""Blog charts (clean dark-mode SVGs matching aayushgarg.dev) from data/results.jsonl.

Run from any directory on Linux or macOS:

    uv run --no-project python _devlog/inkling2-mini/plot_blog.py

(Still accepts --with matplotlib if invoked with the earlier command.)
SVGs go to <repo root>/static/img/blog-2026-11-23/.
"""
import argparse
import html
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "results.jsonl"
OUT_DIR = HERE.parents[1] / "static" / "img" / "blog-2026-11-23"

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--png-dir", type=Path, help="ignored (kept for CLI compatibility)")
ap.parse_args()

# Palette harmonized with static/design-tokens.css
BG = "#161618"
TRACK = "#1F1F23"
GRID = "#26262B"
AXIS = "#34343B"
TEXT_PRIMARY = "#F5F5F7"
TEXT_CONTENT = "#DADADF"
TEXT_MUTED = "#A6A6AB"
TEXT_DIM = "#86868B"

FONT_STACK = (
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, '
    '"Helvetica Neue", Arial, sans-serif'
)

# Setup colors: consistent across every chart, >6:1 contrast on #161618
C_F16_DS = "#3B9EFF"   # 16-bit KV + DSpark (Fast 131K)
C_Q8 = "#F0884D"       # 8-bit KV (Long context 262K)
C_Q8_DS = "#52C48A"    # 8-bit KV + DSpark (Balanced 196K)
C_F16 = "#B794F6"      # 16-bit KV (baseline)

VARIANTS = [
    ("f16_ub512_dspark", "16-bit KV + DSpark", C_F16_DS),
    ("q8_ub512", "8-bit KV", C_Q8),
    ("q8_ub512_dspark", "8-bit KV + DSpark", C_Q8_DS),
]

rows = []
with DATA.open() as f:
    for line in f:
        r = json.loads(line)
        if "error" not in r:
            rows.append(r)


def esc(s):
    return html.escape(str(s), quote=True)


def svg_doc(width, height, title, desc, body):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <title>{esc(title)}</title>
  <desc>{esc(desc)}</desc>
  <defs>
    <style>
      text {{
        font-family: {FONT_STACK};
        font-variant-numeric: tabular-nums;
      }}
      .title {{ font-size: 16px; font-weight: 600; fill: {TEXT_PRIMARY}; }}
      .subtitle {{ font-size: 12.5px; font-weight: 400; fill: {TEXT_DIM}; }}
      .label {{ font-size: 13px; font-weight: 500; fill: {TEXT_CONTENT}; }}
      .val {{ font-size: 13px; font-weight: 600; fill: {TEXT_PRIMARY}; }}
      .val-sm {{ font-size: 12px; font-weight: 600; fill: {TEXT_PRIMARY}; }}
      .tick {{ font-size: 11.5px; font-weight: 400; fill: {TEXT_DIM}; }}
      .axis-title {{ font-size: 12px; font-weight: 400; fill: {TEXT_MUTED}; }}
      .legend {{ font-size: 12.5px; font-weight: 500; fill: {TEXT_CONTENT}; }}
      .note {{ font-size: 11.5px; font-weight: 400; fill: {TEXT_MUTED}; }}
      .note-dim {{ font-size: 11px; font-weight: 400; fill: {TEXT_DIM}; }}
    </style>
  </defs>
  <rect width="{width}" height="{height}" fill="{BG}"/>
{body}
</svg>
"""


def write_svg(name, content):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{name}.svg").write_text(content, encoding="utf-8")


def header_block(title, subtitle, x=28, y=34):
    return (
        f'  <text class="title" x="{x}" y="{y}">{esc(title)}</text>\n'
        f'  <text class="subtitle" x="{x}" y="{y + 20}">{esc(subtitle)}</text>\n'
    )


def inline_legend(items, x=28, y=76, gap=22):
    """Horizontal legend with rounded line+dot swatches."""
    parts = []
    cx = x
    for label, color in items:
        parts.append(
            f'  <line x1="{cx}" y1="{y - 4}" x2="{cx + 18}" y2="{y - 4}" '
            f'stroke="{color}" stroke-width="2.5" stroke-linecap="round"/>\n'
        )
        parts.append(
            f'  <circle cx="{cx + 9}" cy="{y - 4}" r="3.5" fill="{color}" '
            f'stroke="{BG}" stroke-width="1.5"/>\n'
        )
        parts.append(
            f'  <text class="legend" x="{cx + 25}" y="{y}">{esc(label)}</text>\n'
        )
        cx += 25 + int(len(label) * 6.9) + gap
    return "".join(parts)


# ---------------------------------------------------------------------------
# Chart 1: Max context that survived a full session
# ---------------------------------------------------------------------------
def build_max_context():
    stable = {r["variant"]: r["stable_ctx"] for r in rows if r.get("phase") == "stable"}
    print("stable_ctx:", stable)

    items = [
        ("q8_ub512", "8-bit KV", C_Q8),
        ("q8_ub512_dspark", "8-bit KV + DSpark", C_Q8_DS),
        ("f16_ub512", "16-bit KV", C_F16),
        ("f16_ub512_dspark", "16-bit KV + DSpark", C_F16_DS),
    ]
    items.sort(key=lambda it: stable[it[0]], reverse=True)

    W, H = 700, 272
    x_left, x_right = 176, 668
    plot_w = x_right - x_left
    max_x = 300.0
    y_start = 94
    row_h = 40
    bar_h = 22

    def sx(k):
        return x_left + (k / max_x) * plot_w

    out = [header_block(
        "Max context that survived a full session",
        "RTX 4090 (24 GB VRAM), largest stable window on a 16K grid",
    )]

    y_top = y_start - 10
    y_bot = y_start + (len(items) - 1) * row_h + bar_h + 10
    for tick in (0, 100, 200, 300):
        tx = sx(tick)
        col = AXIS if tick == 0 else GRID
        out.append(f'  <line x1="{tx:.1f}" y1="{y_top}" x2="{tx:.1f}" y2="{y_bot}" stroke="{col}" stroke-width="1"/>\n')
        lbl = "0" if tick == 0 else f"{tick}K"
        out.append(f'  <text class="tick" x="{tx:.1f}" y="{y_bot + 16}" text-anchor="middle">{lbl}</text>\n')

    for i, (key, name, color) in enumerate(items):
        k = stable[key] / 1000.0
        y = y_start + i * row_h
        bw = (k / max_x) * plot_w
        out.append(
            f'  <rect x="{x_left}" y="{y}" width="{plot_w:.1f}" height="{bar_h}" '
            f'rx="4" fill="{TRACK}"/>\n'
        )
        out.append(
            f'  <rect x="{x_left}" y="{y}" width="{bw:.1f}" height="{bar_h}" '
            f'rx="4" fill="{color}"/>\n'
        )
        out.append(
            f'  <text class="label" x="{x_left - 14}" y="{y + 15.5}" text-anchor="end">{esc(name)}</text>\n'
        )
        out.append(
            f'  <text class="val" x="{x_left + bw + 10:.1f}" y="{y + 15.5}">{k:.0f}K</text>\n'
        )

    write_svg(
        "max-context",
        svg_doc(
            W, H,
            "Max context that survived a full session",
            "8-bit KV fits 262K tokens, 8-bit KV with DSpark fits 229K, 16-bit KV fits 180K and 16-bit KV with DSpark fits 139K.",
            "".join(out),
        ),
    )


# ---------------------------------------------------------------------------
# Chart 2: Time to first token vs prompt size
# ---------------------------------------------------------------------------
def build_ttft():
    def curve(variant, turn):
        pts = [
            ((r["prompt_n"] + (r.get("cached_n") or 0)) / 1000.0, r["ttft_s"])
            for r in rows
            if r.get("phase") == "curve2"
            and r.get("turn") == turn
            and r.get("variant") == variant
        ]
        return sorted(pts)

    W, H = 700, 392
    x_left, x_right = 64, 668
    y_top, y_bot = 104, 336
    plot_w = x_right - x_left
    plot_h = y_bot - y_top
    max_x, max_y = 272.0, 165.0

    def sx(x):
        return x_left + (x / max_x) * plot_w

    def sy(y):
        return y_bot - (y / max_y) * plot_h

    out = [header_block(
        "Time to first token vs prompt size",
        "Cold prompts (solid) compared with cached follow-up turns (dashed), in seconds",
    )]
    out.append(inline_legend([(name, col) for _, name, col in VARIANTS], x=28, y=80))

    for ytick in (0, 30, 60, 90, 120, 150):
        yy = sy(ytick)
        col = AXIS if ytick == 0 else GRID
        out.append(f'  <line x1="{x_left}" y1="{yy:.1f}" x2="{x_right}" y2="{yy:.1f}" stroke="{col}" stroke-width="1"/>\n')
        lbl = f"{ytick} s" if ytick == 150 else str(ytick)
        out.append(f'  <text class="tick" x="{x_left - 10}" y="{yy + 4:.1f}" text-anchor="end">{lbl}</text>\n')

    for xtick in (0, 64, 128, 192, 256):
        xx = sx(xtick)
        lbl = "0" if xtick == 0 else f"{xtick}K"
        out.append(f'  <line x1="{xx:.1f}" y1="{y_bot}" x2="{xx:.1f}" y2="{y_bot + 4}" stroke="{AXIS}" stroke-width="1"/>\n')
        out.append(f'  <text class="tick" x="{xx:.1f}" y="{y_bot + 19}" text-anchor="middle">{lbl}</text>\n')

    out.append(
        f'  <text class="axis-title" x="{(x_left + x_right) / 2:.1f}" y="{H - 14}" text-anchor="middle">'
        f'Prompt size (tokens)</text>\n'
    )

    fu = curve("q8_ub512", "follow_up")
    print("follow-up q8_ub512:", [(round(x, 1), round(y, 3)) for x, y in fu])
    fu_pts = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in fu)
    out.append(
        f'  <polyline points="{fu_pts}" fill="none" stroke="{TEXT_DIM}" '
        f'stroke-width="2" stroke-dasharray="6 5"/>\n'
    )
    out.append(
        f'  <text class="note" x="{x_right - 4}" y="{sy(6):.1f}" text-anchor="end">'
        f'Cached follow-up turns: 0.2-0.75 s</text>\n'
    )

    draw_order = [VARIANTS[1], VARIANTS[2], VARIANTS[0]]
    end_labels = {
        "f16_ub512_dspark": (12, 5, "start", "58 s at 136K"),
        "q8_ub512_dspark": (-10, -10, "end", "125 s at 226K"),
        "q8_ub512": (-8, -11, "end", "146 s at 259K"),
    }
    for key, name, color in draw_order:
        pts = curve(key, "cold")
        print(f"cold {key}:", [(round(x, 1), round(y, 2)) for x, y in pts])
        poly = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in pts)
        out.append(
            f'  <polyline points="{poly}" fill="none" stroke="{color}" '
            f'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>\n'
        )
        for x, y in pts[:-1]:
            out.append(
                f'  <circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="2.8" fill="{color}" '
                f'stroke="{BG}" stroke-width="1"/>\n'
            )
        ex, ey = pts[-1]
        out.append(
            f'  <circle cx="{sx(ex):.1f}" cy="{sy(ey):.1f}" r="4.5" fill="{color}" '
            f'stroke="{BG}" stroke-width="1.5"/>\n'
        )
        dx, dy, anchor, text = end_labels[key]
        out.append(
            f'  <text class="val-sm" x="{sx(ex) + dx:.1f}" y="{sy(ey) + dy:.1f}" '
            f'text-anchor="{anchor}" style="fill:{color}">{esc(text)}</text>\n'
        )

    write_svg(
        "ttft-vs-context",
        svg_doc(
            W, H,
            "Time to first token vs prompt size",
            "Cold prompt time to first token grows with prompt size and is almost identical across setups until each hits its VRAM ceiling: 58 s at 136K for 16-bit KV with DSpark, 125 s at 226K for 8-bit KV with DSpark and 146 s at 259K for 8-bit KV. Cached follow-up turns stay under 1 second.",
            "".join(out),
        ),
    )


# ---------------------------------------------------------------------------
# Chart 3: Code generation speed vs context depth
# ---------------------------------------------------------------------------
def build_code_speed():
    groups = defaultdict(lambda: [0.0, 0.0])
    for r in rows:
        if r.get("phase") == "codedepth":
            g = groups[(r["variant"], r["depth"])]
            g[0] += r["gen_n"]
            g[1] += r["gen_n"] / r["decode_tps"]

    W, H = 700, 386
    x_left, x_right = 68, 636
    y_top, y_bot = 104, 330
    plot_w = x_right - x_left
    plot_h = y_bot - y_top
    max_x, max_y = 160.0, 120.0

    def sx(x):
        return x_left + (x / max_x) * plot_w

    def sy(y):
        return y_bot - (y / max_y) * plot_h

    out = [header_block(
        "Code generation speed as context grows",
        "Low thinking effort, four coding problems per depth (tokens per second)",
    )]
    out.append(inline_legend([(name, col) for _, name, col in VARIANTS], x=28, y=80))

    for ytick in (0, 20, 40, 60, 80, 100, 120):
        yy = sy(ytick)
        col = AXIS if ytick == 0 else GRID
        out.append(f'  <line x1="{x_left}" y1="{yy:.1f}" x2="{x_right}" y2="{yy:.1f}" stroke="{col}" stroke-width="1"/>\n')
        lbl = f"{ytick} t/s" if ytick == 120 else str(ytick)
        out.append(f'  <text class="tick" x="{x_left - 10}" y="{yy + 4:.1f}" text-anchor="end">{lbl}</text>\n')

    for xtick in (0, 32, 64, 96, 120, 160):
        xx = sx(xtick)
        lbl = "0" if xtick == 0 else f"{xtick}K"
        out.append(f'  <line x1="{xx:.1f}" y1="{y_bot}" x2="{xx:.1f}" y2="{y_bot + 4}" stroke="{AXIS}" stroke-width="1"/>\n')
        out.append(f'  <text class="tick" x="{xx:.1f}" y="{y_bot + 19}" text-anchor="middle">{lbl}</text>\n')

    out.append(
        f'  <text class="axis-title" x="{(x_left + x_right) / 2:.1f}" y="{H - 14}" text-anchor="middle">'
        f'Code already in context (tokens)</text>\n'
    )

    x64 = sx(64)
    out.append(
        f'  <line x1="{x64:.1f}" y1="{y_top + 6}" x2="{x64:.1f}" y2="{y_bot}" '
        f'stroke="{GRID}" stroke-width="1" stroke-dasharray="4 4"/>\n'
    )
    out.append(
        f'  <text class="note-dim" x="{x64 + 6:.1f}" y="{y_top + 18}">'
        f'Past 64K, plain 8-bit KV beats 8-bit KV + DSpark</text>\n'
    )

    series = {}
    for key, name, color in VARIANTS:
        pts = sorted((d / 1000.0, g[0] / g[1]) for (v, d), g in groups.items() if v == key)
        series[key] = pts
        print(f"codedepth {key}:", [(x, round(y, 2)) for x, y in pts])
        poly = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in pts)
        out.append(
            f'  <polyline points="{poly}" fill="none" stroke="{color}" '
            f'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>\n'
        )
        for x, y in pts:
            out.append(
                f'  <circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="3.8" fill="{color}" '
                f'stroke="{BG}" stroke-width="1.5"/>\n'
            )

    start_pos = {
        "f16_ub512_dspark": (8, -9, "start"),
        "q8_ub512_dspark": (3, 18, "start"),
        "q8_ub512": (6, 15, "start"),
    }
    end_pos = {
        "f16_ub512_dspark": (0, -11, "middle"),
        "q8_ub512": (10, 4, "start"),
        "q8_ub512_dspark": (10, 4, "start"),
    }
    for key, _, color in VARIANTS:
        pts = series[key]
        x0, y0 = pts[0]
        dx, dy, anchor = start_pos[key]
        out.append(
            f'  <text class="val-sm" x="{sx(x0) + dx:.1f}" y="{sy(y0) + dy:.1f}" '
            f'text-anchor="{anchor}" style="fill:{color}">{y0:.0f}</text>\n'
        )
        xe, ye = pts[-1]
        dx, dy, anchor = end_pos[key]
        out.append(
            f'  <text class="val-sm" x="{sx(xe) + dx:.1f}" y="{sy(ye) + dy:.1f}" '
            f'text-anchor="{anchor}" style="fill:{color}">{ye:.0f}</text>\n'
        )

    write_svg(
        "code-speed-vs-context",
        svg_doc(
            W, H,
            "Code generation speed as context grows",
            "On an empty context 16-bit KV with DSpark runs at 103 tok/s, 8-bit KV with DSpark at 98 tok/s and plain 8-bit KV at 76 tok/s. By 120K tokens 16-bit KV with DSpark (61 tok/s) and plain 8-bit KV (59 tok/s) are nearly tied, while 8-bit KV with DSpark slows to 49 tok/s and 43 tok/s at 160K.",
            "".join(out),
        ),
    )


if __name__ == "__main__":
    build_max_context()
    build_ttft()
    build_code_speed()
