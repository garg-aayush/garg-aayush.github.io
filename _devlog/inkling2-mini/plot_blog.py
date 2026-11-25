"""Blog charts (clean dark-mode SVGs matching aayushgarg.dev) from results JSONL files.

Run from any directory on Linux or macOS:

    uv run --no-project python _devlog/inkling2-mini/plot_blog.py

By default this writes both matched chart sets into <repo root>/static/img/blog-2026-11-23/:
- b12676 (latest): max-context.svg, ttft-vs-context.svg, code-speed-vs-context.svg
- b12631 (original): max-context-b12631.svg, ttft-vs-context-b12631.svg, code-speed-vs-context-b12631.svg

Both sets share the same axis ranges so toggling between builds never rescales.
Pass --data FILE (and optionally --build LABEL, --suffix SUFFIX, --out-dir DIR) to draw one file.
"""
import argparse
import html
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_NEW = HERE / "data" / "results_b12676.jsonl"
DATA_OLD = HERE / "data" / "results.jsonl"
OUT_DIR = HERE.parents[1] / "static" / "img" / "blog-2026-11-23"

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--png-dir", type=Path, help="ignored (kept for CLI compatibility)")
ap.add_argument("--data", type=Path, help="single results file to draw from")
ap.add_argument("--build", type=str, help="build label shown in subtitles (default inferred from filename)")
ap.add_argument("--suffix", type=str, default="", help="filename suffix when using --data (for example -b12631)")
ap.add_argument("--out-dir", type=Path, help="folder for the SVGs (default: static/img/blog-2026-11-23)")
args = ap.parse_args()
if args.out_dir:
    OUT_DIR = args.out_dir

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
C_F16_DS = "#3B9EFF"   # 16-bit KV + DSpark
C_Q8 = "#F0884D"       # 8-bit KV
C_Q8_DS = "#52C48A"    # 8-bit KV + DSpark
C_F16 = "#B794F6"      # 16-bit KV (baseline)

VARIANTS = [
    ("f16_ub512_dspark", "16-bit KV + DSpark", C_F16_DS),
    ("q8_ub512", "8-bit KV", C_Q8),
    ("q8_ub512_dspark", "8-bit KV + DSpark", C_Q8_DS),
]


def load_rows(path: Path):
    loaded = []
    with path.open() as f:
        for line in f:
            r = json.loads(line)
            if "error" not in r:
                loaded.append(r)
    return loaded


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
def build_max_context(rows, build_label, suffix):
    stable = {r["variant"]: r["stable_ctx"] for r in rows if r.get("phase") == "stable"}
    print(f"[{build_label}] stable_ctx:", stable)

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
    max_x = 430.0
    y_start = 94
    row_h = 40
    bar_h = 22

    def sx(k):
        return x_left + (k / max_x) * plot_w

    out = [header_block(
        "Max context that survived a full session",
        f"RTX 4090 (24 GB VRAM), build {build_label}, largest stable window on a 16K grid",
    )]

    y_top = y_start - 10
    y_bot = y_start + (len(items) - 1) * row_h + bar_h + 10
    for tick in (0, 100, 200, 300, 400):
        tx = sx(tick)
        col = AXIS if tick == 0 else GRID
        out.append(f'  <line x1="{tx:.1f}" y1="{y_top}" x2="{tx:.1f}" y2="{y_bot}" stroke="{col}" stroke-width="1"/>\n')
        lbl = "0" if tick == 0 else f"{tick}K"
        out.append(f'  <text class="tick" x="{tx:.1f}" y="{y_bot + 16}" text-anchor="middle">{lbl}</text>\n')

    desc_parts = []
    for i, (key, name, color) in enumerate(items):
        k = stable[key] / 1000.0
        k_int = stable[key] // 1000
        desc_parts.append(f"{name} fits {k_int}K")
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
            f'  <text class="val" x="{x_left + bw + 10:.1f}" y="{y + 15.5}">{k_int}K</text>\n'
        )

    desc = f"On build {build_label}, " + ", ".join(desc_parts[:-1]) + " and " + desc_parts[-1] + " tokens."
    write_svg(
        f"max-context{suffix}",
        svg_doc(W, H, "Max context that survived a full session", desc, "".join(out)),
    )


# ---------------------------------------------------------------------------
# Chart 2: Time to first token vs prompt size
# ---------------------------------------------------------------------------
def build_ttft(rows, build_label, suffix):
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
    max_x, max_y = 392.0, 260.0

    def sx(x):
        return x_left + (x / max_x) * plot_w

    def sy(y):
        return y_bot - (y / max_y) * plot_h

    out = [header_block(
        "Time to first token vs prompt size",
        f"Build {build_label}: cold prompts (solid) compared with cached follow-up turns (dashed), in seconds",
    )]
    out.append(inline_legend([(name, col) for _, name, col in VARIANTS], x=28, y=80))

    for ytick in (0, 50, 100, 150, 200, 250):
        yy = sy(ytick)
        col = AXIS if ytick == 0 else GRID
        out.append(f'  <line x1="{x_left}" y1="{yy:.1f}" x2="{x_right}" y2="{yy:.1f}" stroke="{col}" stroke-width="1"/>\n')
        lbl = f"{ytick} s" if ytick == 250 else str(ytick)
        out.append(f'  <text class="tick" x="{x_left - 10}" y="{yy + 4:.1f}" text-anchor="end">{lbl}</text>\n')

    for xtick in (0, 64, 128, 192, 256, 320, 384):
        xx = sx(xtick)
        lbl = "0" if xtick == 0 else f"{xtick}K"
        out.append(f'  <line x1="{xx:.1f}" y1="{y_bot}" x2="{xx:.1f}" y2="{y_bot + 4}" stroke="{AXIS}" stroke-width="1"/>\n')
        out.append(f'  <text class="tick" x="{xx:.1f}" y="{y_bot + 19}" text-anchor="middle">{lbl}</text>\n')

    out.append(
        f'  <text class="axis-title" x="{(x_left + x_right) / 2:.1f}" y="{H - 14}" text-anchor="middle">'
        f'Prompt size (tokens)</text>\n'
    )

    fu = curve("q8_ub512", "follow_up")
    fu_min = min(y for _, y in fu)
    fu_max = max(y for _, y in fu)
    print(f"[{build_label}] follow-up q8_ub512:", [(round(x, 1), round(y, 3)) for x, y in fu])
    fu_pts = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in fu)
    out.append(
        f'  <polyline points="{fu_pts}" fill="none" stroke="{TEXT_DIM}" '
        f'stroke-width="2" stroke-dasharray="6 5"/>\n'
    )
    out.append(
        f'  <text class="note" x="{x_right - 4}" y="{sy(10):.1f}" text-anchor="end">'
        f'Cached follow-up turns: {fu_min:.1f}-{fu_max:.2f} s</text>\n'
    )

    draw_order = [VARIANTS[1], VARIANTS[2], VARIANTS[0]]
    if build_label == "b12631":
        end_pos = {
            "f16_ub512_dspark": (12, 4, "start"),
            "q8_ub512_dspark": (12, 14, "start"),
            "q8_ub512": (-10, -11, "end"),
        }
    else:
        end_pos = {
            "f16_ub512_dspark": (12, 4, "start"),
            "q8_ub512_dspark": (12, 6, "start"),
            "q8_ub512": (-10, -10, "end"),
        }

    desc_bits = []
    for key, name, color in draw_order:
        pts = curve(key, "cold")
        print(f"[{build_label}] cold {key}:", [(round(x, 1), round(y, 2)) for x, y in pts])
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
        dx, dy, anchor = end_pos[key]
        label = f"{ey:.0f} s at {ex:.0f}K"
        desc_bits.append(f"{label} for {name}")
        out.append(
            f'  <text class="val-sm" x="{sx(ex) + dx:.1f}" y="{sy(ey) + dy:.1f}" '
            f'text-anchor="{anchor}" style="fill:{color}">{esc(label)}</text>\n'
        )

    desc = (
        f"On build {build_label}, cold prompt time to first token grows with prompt size until each setup hits its VRAM ceiling: "
        + ", ".join(desc_bits)
        + ". Cached follow-up turns stay under 1 second."
    )
    write_svg(
        f"ttft-vs-context{suffix}",
        svg_doc(W, H, "Time to first token vs prompt size", desc, "".join(out)),
    )


# ---------------------------------------------------------------------------
# Chart 3: Code generation speed vs context depth
# ---------------------------------------------------------------------------
def build_code_speed(rows, build_label, suffix):
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
    max_x, max_y = 160.0, 140.0

    def sx(x):
        return x_left + (x / max_x) * plot_w

    def sy(y):
        return y_bot - (y / max_y) * plot_h

    out = [header_block(
        "Code generation speed as context grows",
        f"Build {build_label}, low thinking effort, four coding problems per depth (tokens per second)",
    )]
    out.append(inline_legend([(name, col) for _, name, col in VARIANTS], x=28, y=80))

    for ytick in (0, 20, 40, 60, 80, 100, 120, 140):
        yy = sy(ytick)
        col = AXIS if ytick == 0 else GRID
        out.append(f'  <line x1="{x_left}" y1="{yy:.1f}" x2="{x_right}" y2="{yy:.1f}" stroke="{col}" stroke-width="1"/>\n')
        lbl = f"{ytick} t/s" if ytick == 140 else str(ytick)
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

    if build_label == "b12631":
        x64 = sx(64)
        out.append(
            f'  <line x1="{x64:.1f}" y1="{y_top + 6}" x2="{x64:.1f}" y2="{y_bot}" '
            f'stroke="{GRID}" stroke-width="1" stroke-dasharray="4 4"/>\n'
        )
        out.append(
            f'  <text class="note-dim" x="{x64 + 6:.1f}" y="{y_top + 18}">'
            f'Past 64K, plain 8-bit KV beats 8-bit KV + DSpark</text>\n'
        )
    else:
        out.append(
            f'  <text class="note-dim" x="{x_right}" y="{y_top + 18}" text-anchor="end">'
            f'8-bit KV + DSpark leads at every depth up to 160K</text>\n'
        )

    series = {}
    draw_variants = [VARIANTS[1], VARIANTS[0], VARIANTS[2]] if build_label != "b12631" else VARIANTS
    for key, name, color in draw_variants:
        pts = sorted((d / 1000.0, g[0] / g[1]) for (v, d), g in groups.items() if v == key)
        series[key] = pts
        print(f"[{build_label}] codedepth {key}:", [(x, round(y, 2)) for x, y in pts])
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

    if build_label == "b12631":
        start_pos = {
            "f16_ub512_dspark": (8, -9, "start"),
            "q8_ub512_dspark": (6, 18, "start"),
            "q8_ub512": (6, 16, "start"),
        }
        end_pos = {
            "f16_ub512_dspark": (0, -11, "middle"),
            "q8_ub512": (10, 4, "start"),
            "q8_ub512_dspark": (10, 4, "start"),
        }
    else:
        start_pos = {
            "q8_ub512_dspark": (8, -9, "start"),
            "f16_ub512_dspark": (6, 18, "start"),
            "q8_ub512": (6, 16, "start"),
        }
        end_pos = {
            "f16_ub512_dspark": (10, 4, "start"),
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

    f16_0, f16_e = series["f16_ub512_dspark"][0][1], series["f16_ub512_dspark"][-1][1]
    q8_0, q8_e = series["q8_ub512"][0][1], series["q8_ub512"][-1][1]
    q8d_0, q8d_e = series["q8_ub512_dspark"][0][1], series["q8_ub512_dspark"][-1][1]
    desc = (
        f"On build {build_label}, empty context speeds are {q8d_0:.0f} tok/s for 8-bit KV with DSpark, "
        f"{f16_0:.0f} tok/s for 16-bit KV with DSpark and {q8_0:.0f} tok/s for plain 8-bit KV. "
        f"At 120K tokens 16-bit KV with DSpark ends at {f16_e:.0f} tok/s; at 160K tokens 8-bit KV with DSpark is {q8d_e:.0f} tok/s and plain 8-bit KV is {q8_e:.0f} tok/s."
    )
    write_svg(
        f"code-speed-vs-context{suffix}",
        svg_doc(W, H, "Code generation speed as context grows", desc, "".join(out)),
    )


def render_set(data_path: Path, build_label: str, suffix: str):
    rows = load_rows(data_path)
    build_max_context(rows, build_label, suffix)
    build_ttft(rows, build_label, suffix)
    build_code_speed(rows, build_label, suffix)


if __name__ == "__main__":
    if args.data:
        label = args.build or ("b12676" if "b12676" in args.data.name else "b12631")
        render_set(args.data, label, args.suffix)
    else:
        render_set(DATA_NEW, "b12676", "")
        render_set(DATA_OLD, "b12631", "-b12631")
