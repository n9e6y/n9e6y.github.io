"""Share images (Open Graph), built from the "Link Preview" design.

Reads the text straight from the live pages (nothing retyped), writes one HTML
card per page into build/, and screenshots each with headless Chrome.

    python3 working_on_it/og/og.py                  # all cards
    python3 working_on_it/og/og.py works home       # just these

Cards (design ids from Link Preview/Link Previews.dc.html):
    home   -> assets/og.png              Home + About (5b light / 5c dark, see CARD['home'])
    works  -> assets/og/works.png        2a
    blog   -> assets/og/blog.png         2b
    posts  -> assets/og/<slug>.png       3a, every writing/*.html except template.html
    work   -> assets/og/<name>.png       3b, every work/*.html that isn't commented out
"""
import html, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# ---- Look. Tune here. ----
CARD = {
    'home': 'light',       # Home/About card: 'light' (5b) or 'dark' (5c)
    'light': {'paper': '#F6F6F3', 'ink': '#111110', 'muted': '#6B6B66', 'deck': '#5E5E59',
              'slash': '#A3A39D', 'rule': '#DCDCD7'},
    'dark':  {'paper': '#111110', 'ink': '#F6F6F3', 'muted': '#8E8E88', 'deck': '#A3A39D',
              'slash': '#5E5E59', 'rule': '#2E2E2B'},
    'pad': '72px 80px 64px',
    'logoH': 44,            # 96 mark height, px
    'nameSize': 92,         # "Nima Yavari" on the home card
    'pageTitleSize': 208,   # "Works" / "Writings"
    'titleSize': 76,        # post / work title; shrinks (to titleMin) only if the text overflows
    'titleMin': 52,
    'fitRoom': 56,          # space the title + deck must leave free between logo and rule before shrinking stops
    'deckSize': 28,
    'footSize': 22,
    # Home lightning tree: same seed and options as the design (seed 9696, accent strike).
    'seed': 9696,
    'bolt': {'light': {'accent': True},
             'dark': {'accent': True, 'color': '#2C2C29', 'dot': '#383835', 'hot': '#4A4A46', 'hotDot': '#55554F'}},
}


def read(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()


def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def one(pattern, src):
    m = re.search(pattern, src, re.S)
    assert m, pattern
    return m.group(1)


# Lightning tree, ported unchanged from the design's DCLogic.lightning().
LIGHTNING_JS = r'''
function lightning(seed, o = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bolts = [], nodes = [];
  const c = o.color || '#E0E0DB', dot = o.dot || '#D6D6D1', hotC = o.hot || '#BDBDB7', hotD = o.hotDot || '#B0B0AA';
  const maxD = o.depth ?? 6, decay = o.decay ?? .28;
  const jag = (x1, y1, x2, y2, amp) => {
    let pts = [[x1, y1], [x2, y2]];
    for (let k = 0; k < 3; k++) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const off = (rnd() - .5) * amp * L / 60;
        out.push([(ax + bx) / 2 - dy / L * off, (ay + by) / 2 + dx / L * off], [bx, by]);
      }
      pts = out; amp *= .55;
    }
    return pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  };
  const path = [1, 1, 1, 1, 0, 0, 1, 0];
  const grow = (x, y, ang, len, d, onPath) => {
    const x2 = x + Math.sin(ang) * len, y2 = y + Math.cos(ang) * len;
    const hot = !!o.accent && onPath;
    bolts.push({ pts: jag(x, y, x2, y2, o.amp ?? 14), stroke: hot ? hotC : c, w: Math.max(o.minW ?? .8, (o.w ?? 2.2) + (hot ? .4 : 0) - d * decay), hot });
    nodes.push({ x: x2, y: y2, r: Math.max(1.2, (o.r ?? 3) - d * .3), fill: hot ? hotD : dot, hot });
    if (d >= maxD) return;
    const spread = (o.spread ?? .4) + rnd() * (o.spreadVar ?? .25), nl = len * ((o.shrink ?? .72) + rnd() * .1);
    [-1, 1].forEach((sg, k) => grow(x2, y2, ang + sg * spread + (rnd() - .5) * .12, nl, d + 1, onPath && path[d] === k));
  };
  (o.roots || [[820, -40, 0, 165]]).forEach(([x, y, a, l]) => grow(x, y, a + (rnd() - .5) * .1, l, 0, true));
  bolts.sort((a, b) => a.hot - b.hot); nodes.sort((a, b) => a.hot - b.hot);
  return { bolts, nodes };
}
'''


def page(body, theme='light', script=''):
    c, t = CARD, CARD[theme]
    return f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..900&family=Geist+Mono:wght@400..600&family=Vazirmatn:wght@300..700&display=block" rel="stylesheet">
<style>
  html, body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; background: {t['paper']}; -webkit-font-smoothing: antialiased; }}
  body {{ position: relative; box-sizing: border-box; padding: {c['pad']}; display: flex; flex-direction: column;
         font-family: 'Geist', sans-serif; color: {t['ink']}; }}
  [lang="fa"] {{ font-family: 'Vazirmatn', sans-serif; }}
  svg.bg {{ position: absolute; inset: 0; }}
  .top {{ position: relative; display: flex; justify-content: space-between; align-items: center; height: {c['logoH']}px; }}
  .top img {{ height: {c['logoH']}px; width: auto; display: block; {'filter: invert(1);' if theme == 'dark' else ''} }}
  .crumb {{ font-family: 'Geist Mono', monospace; font-size: 20px; letter-spacing: .06em; text-transform: uppercase; display: flex; gap: 14px; }}
  .crumb .s {{ color: {t['slash']}; }}
  .crumb .t {{ color: {t['muted']}; }}
  main {{ position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px; min-height: 0; }}
  .name {{ font-size: {c['nameSize']}px; font-weight: 500; letter-spacing: -.045em; line-height: .95; margin-left: -5px; white-space: nowrap; }}
  .lede {{ font-size: 26px; line-height: 1.35; color: {t['deck']}; text-wrap: pretty; }}
  main.home {{ max-width: 540px; }}
  main.big {{ flex-direction: row; align-items: center; justify-content: flex-start; }}
  .big h1 {{ margin: 0 0 0 -12px; font-size: {c['pageTitleSize']}px; font-weight: 500; letter-spacing: -.055em; line-height: .9; }}
  .single h1 {{ margin: 0 0 0 -3px; font-size: {c['titleSize']}px; font-weight: 500; letter-spacing: -.04em; line-height: 1.02; max-width: 980px; text-wrap: balance; }}
  .single .deck {{ margin: 0; font-size: {c['deckSize']}px; line-height: 1.4; color: {t['deck']}; max-width: 960px; text-wrap: pretty; }}
  .foot {{ position: relative; border-top: 1px solid {t['rule']}; padding-top: 24px; display: flex; justify-content: space-between;
          font-family: 'Geist Mono', monospace; font-size: {c['footSize']}px; background: {t['paper']}; }}
  .foot b {{ font-weight: 500; }}
  .foot span {{ color: {t['muted']}; }}
</style></head><body>
{body}
<script>{script}</script>
</body></html>'''


def top(crumb=None):
    right = ''
    if crumb:
        section, tags = crumb
        right = (f'<div class="crumb"><span>{section}</span>'
                 + (f'<span class="s">/</span><span class="t">{" · ".join(tags)}</span>' if tags else '') + '</div>')
    return f'<div class="top"><img src="../logo-96.png" alt="96">{right}</div>'


def foot(left, right):
    return f'<div class="foot"><b>{left}</b><span>{right}</span></div>'


# Shrinks a single-page title (then the deck) only when the text doesn't fit; the design sizes are the default.
FIT_JS = f'''
document.fonts.ready.then(() => {{
  const m = document.querySelector('main.single'); if (!m) return;
  const h = m.querySelector('h1'), d = m.querySelector('.deck');
  const over = () => h.offsetHeight + (d ? 28 + d.offsetHeight : 0) > m.clientHeight - {CARD['fitRoom']};
  let s = {CARD['titleSize']};
  while (over() && s > {CARD['titleMin']}) h.style.fontSize = (s -= 2) + 'px';
  let ds = {CARD['deckSize']};
  while (d && over() && ds > 20) d.style.fontSize = (ds -= 1) + 'px';
}});
'''


def home_card():
    lede = one(r'<p class="big-p">(.*?)</p>', read('about.html'))
    theme = CARD['home']
    body = ('<svg class="bg" id="bolt" width="1200" height="630" viewBox="0 0 1200 630"></svg>'
            + top()
            + f'<main class="home"><div class="name">Nima Yavari</div><div class="lede">{lede}</div></main>'
            + foot('n9e6y.com', 'Works · Writings · About'))
    script = LIGHTNING_JS + f'''
const t = lightning({CARD['seed']}, {json.dumps(CARD['bolt'][theme])}), svg = document.getElementById('bolt'), NS = 'http://www.w3.org/2000/svg';
const el = (n, a) => {{ const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); }};
t.bolts.forEach(b => el('polyline', {{ points: b.pts, fill: 'none', stroke: b.stroke, 'stroke-width': b.w, 'stroke-linejoin': 'miter', 'stroke-linecap': 'round' }}));
t.nodes.forEach(n => el('circle', {{ cx: n.x, cy: n.y, r: n.r, fill: n.fill }}));
'''
    return 'home', os.path.join(ROOT, 'assets', 'og.png'), page(body, theme, script)


def section_card(name, title, url):
    body = top() + f'<main class="big"><h1>{title}</h1></main>' + foot(url, 'Nima Yavari')
    return name, os.path.join(ROOT, 'assets', 'og', name + '.png'), page(body)


def single_card(name, crumb, title, deck, url, meta):
    body = (top(crumb)
            + f'<main class="single"><h1>{title}</h1>' + (f'<p class="deck">{deck}</p>' if deck else '') + '</main>'
            + foot(url, meta))
    return name, os.path.join(ROOT, 'assets', 'og', name + '.png'), page(body, script=FIT_JS)


def post_card(path):
    src = read(path)
    head = one(r'<header class="art-head".*?>(.*?)</header>', src)
    eyebrow = one(r'<div class="eyebrow">(.*?)</div>', head)
    tags = re.findall(r'<span class="tag">(.*?)</span>', eyebrow)
    meta = [text(s) for s in re.findall(r'<span>([^<]*)</span>', eyebrow)]  # date, read time
    title = one(r'<h1>(.*?)</h1>', head)
    deck = one(r'<p class="deck">(.*?)</p>', head)  # kept as HTML so Persian runs stay verbatim
    slug = os.path.splitext(os.path.basename(path))[0]
    return single_card(slug, ('Writing', tags), title, deck, 'n9e6y.com/blog', ' · '.join(meta))


def work_card(path):
    src = read(path)
    head = one(r'<div class="page-head".*?>(.*?)</div>\s*<div class="meta-ledger"', src)
    crumbs = re.findall(r'<span>(.*?)</span>', one(r'<div class="eyebrow crumbs">(.*?)</div>', head))
    title = one(r'<h1[^>]*>(.*?)</h1>', head)
    deck = one(r'<p class="intro">(.*?)</p>', head)
    ledger = dict((text(k), text(v)) for k, v in re.findall(
        r'<span class="k">(.*?)</span><span[^>]*>(.*?)</span>', one(r'<div class="meta-ledger">(.*?)\n    </div>', src)))
    meta = ' · '.join(x for x in (ledger.get('Stack'), ledger.get('Year')) if x)  # no year until the page has one
    name = os.path.splitext(os.path.basename(path))[0]
    return single_card(name, ('Works', crumbs), title, deck, 'n9e6y.com/works', meta)


def cards():
    yield home_card()
    yield section_card('works', 'Works', 'n9e6y.com/works')
    yield section_card('blog', 'Writings', 'n9e6y.com/blog')
    for f in sorted(os.listdir(os.path.join(ROOT, 'writing'))):
        if f.endswith('.html') and f != 'template.html':
            yield post_card('writing/' + f)
    for f in sorted(os.listdir(os.path.join(ROOT, 'work'))):
        if f.endswith('.html') and not read('work/' + f).lstrip().startswith('<!--'):  # skip commented-out pages
            yield work_card('work/' + f)


if __name__ == '__main__':
    only = set(sys.argv[1:])
    os.makedirs(BUILD, exist_ok=True)
    for name, out, doc in cards():
        if only and name not in only:
            continue
        src = os.path.join(BUILD, name + '.html')
        open(src, 'w', encoding='utf-8').write(doc)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630',
                        '--virtual-time-budget=5000', '--screenshot=' + out, 'file://' + src],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('wrote', os.path.relpath(out, ROOT))
