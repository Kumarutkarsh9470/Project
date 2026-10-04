"""Render a .pptx made by build_course.js to PNGs for a visual check (no LibreOffice needed).

Usage: python preview.py deck.pptx outdir [slide numbers...]
Writes outdir/preview.html, then screenshots each slide with Playwright (node).
Fonts: Calibri -> Carlito, Cambria -> Caladea (metric-compatible), Consolas -> Inconsolata.
"""
import html, json, os, subprocess, sys
from pptx import Presentation
from pptx.util import Emu

src, out = sys.argv[1], sys.argv[2]
only = {int(a) for a in sys.argv[3:]}
os.makedirs(out, exist_ok=True)
p = Presentation(src)
PX = 96 / 914400  # EMU -> px at 96 dpi
FONTS = {"Calibri": "Liberation Sans", "Cambria": "Liberation Serif", "Consolas": "DejaVu Sans Mono", "Courier New": "DejaVu Sans Mono"}

def color(c, default="000000"):
    try:
        return "#" + str(c.rgb)
    except Exception:
        return "#" + default

def bg_of(slide):
    for sh in [slide.slide_layout, slide.slide_layout.slide_master]:
        try:
            f = sh.background.fill
            return color(f.fore_color, "FFFFFF")
        except Exception:
            pass
    return "#FFFFFF"

slides_html = []
for n, s in enumerate(p.slides, 1):
    if only and n not in only:
        continue
    parts = []
    layout_bg = s.slide_layout.name
    bg = "#14283A" if "DARK" in layout_bg else "#FFFFFF"
    for sh in s.shapes:
        x, y, w, h = sh.left * PX, sh.top * PX, sh.width * PX, sh.height * PX
        style = f"left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;"
        if not sh.has_text_frame or not sh.text_frame.text.strip():
            try:
                fill = color(sh.fill.fore_color) if sh.fill.type == 1 else "transparent"
            except Exception:
                fill = "transparent"
            rad = "8px" if "ROUND" in str(getattr(sh, "auto_shape_type", "")) else ("50%" if "OVAL" in str(getattr(sh, "auto_shape_type", "")) else "0")
            parts.append(f'<div class="s" style="{style}background:{fill};border-radius:{rad}"></div>')
            continue
        tf = sh.text_frame
        va = {"MIDDLE (3)": "center", "BOTTOM (4)": "flex-end"}.get(str(tf.vertical_anchor), "flex-start")
        paras = []
        for para in tf.paragraphs:
            al = {"CENTER (2)": "center", "RIGHT (3)": "right"}.get(str(para.alignment), "left")
            runs = []
            for r in para.runs:
                f = r.font
                fam = FONTS.get(f.name or "Calibri", f.name or "Carlito")
                sz = (f.size.pt if f.size else 18) * 96 / 72 * (0.917 if fam == "DejaVu Sans Mono" else 1)
                c = color(f.color) if f.color and f.color.type is not None else "inherit"
                t = html.escape(r.text).replace(" ", "&nbsp;") if fam == "DejaVu Sans Mono" else html.escape(r.text)
                runs.append(f'<span style="font-family:\'{fam}\';font-size:{sz:.1f}px;color:{c};'
                            f'font-weight:{700 if f.bold else 400};font-style:{"italic" if f.italic else "normal"}">{t}</span>')
            paras.append(f'<div style="text-align:{al};line-height:1.2;min-height:1em">{"".join(runs) or "&nbsp;"}</div>')
        parts.append(f'<div class="s t" style="{style}justify-content:{va}">{"".join(paras)}</div>')
    slides_html.append(f'<section id="s{n}" style="background:{bg}">{"".join(parts)}</section>')

W, H = p.slide_width * PX, p.slide_height * PX
page = f"""<!doctype html><html><head><meta charset=utf8>
<link href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&family=Caladea:wght@400;700&family=Inconsolata:wght@400;700&display=swap" rel="stylesheet">
<style>body{{margin:0}} section{{position:relative;width:{W:.0f}px;height:{H:.0f}px;overflow:hidden;margin-bottom:10px;outline:1px solid #ccc}}
.s{{position:absolute;box-sizing:border-box}} .t{{display:flex;flex-direction:column;white-space:pre-wrap;word-wrap:break-word}}</style></head>
<body>{"".join(slides_html)}</body></html>"""
open(os.path.join(out, "preview.html"), "w").write(page)
js = f"""
const {{ chromium }} = require(process.env.PW);
(async () => {{
  const b = await chromium.launch(); const pg = await b.newPage({{ viewport: {{ width: {W:.0f}, height: {H:.0f} }} }});
  await pg.goto('file://{os.path.abspath(out)}/preview.html', {{ waitUntil: 'networkidle' }});
  await pg.evaluate(() => document.fonts.ready);
  for (const el of await pg.$$('section')) {{
    const id = await el.getAttribute('id'); await el.screenshot({{ path: '{os.path.abspath(out)}/' + id + '.png' }});
  }}
  await b.close();
}})();"""
open(os.path.join(out, "shot.js"), "w").write(js)
env = dict(os.environ, PW=os.environ.get("PW", "playwright"))
subprocess.run(["node", os.path.join(out, "shot.js")], check=True, env=env)
print("rendered", len(slides_html), "slides to", out)
