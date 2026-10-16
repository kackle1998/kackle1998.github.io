"""Copy the game's scene code into the event-animation mockup template.

The chat's mockup widgets can't load project files, so the template carries its own copy of
the scene kit (js/scene.js) and the run map art it stands on (sky, spires, slingshot). This
script rewrites the template's KIT regions from the game's current source, so mockups render
exactly as the game does: the same CSS 3D camera, tilted ground, standees and palette.

Run it after changing js/scene.js, the sky, spire or slingshot art in js/runmap.js, the hero
sprite, the Moss palette or the .bw- styles:

    python tools/mockup-kit.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / ".claude/skills/event-animation/mockup-template.html"


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def statement(src, start, rel):
    """The whole JS declaration that starts with `start` (a regex): a function up to its body's
    closing brace, anything else up to the semicolon that ends it. Skips strings and comments."""
    m = re.search(start, src, re.M)
    if not m:
        sys.exit(f"mockup-kit: can't find /{start}/ in {rel}")
    i, depth = m.start(), 0
    is_fn = src.startswith("function", m.start()) or "function " in m.group(0)
    body = False  # for a function: inside its body's braces
    while i < len(src):
        c = src[i]
        if src.startswith("//", i):
            i = src.index("\n", i)
            continue
        if src.startswith("/*", i):
            i = src.index("*/", i) + 2
            continue
        if c in "'\"`":
            j = i + 1
            while src[j] != c:
                j += 2 if src[j] == "\\" else 1
            i = j + 1
            continue
        if c in "([{":
            if is_fn and c == "{" and depth == 0:
                body = True
            depth += 1
        elif c in ")]}":
            depth -= 1
            if is_fn and body and depth == 0:
                return src[m.start():i + 1]
        elif c == ";" and depth == 0 and not is_fn:
            return src[m.start():i + 1]
        i += 1
    sys.exit(f"mockup-kit: /{start}/ in {rel} never ends")


def strip_comments(js):
    """Drop whole-line and block comments, so the copy pasted into each widget stays small."""
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"^\s*//.*\n", "", js, flags=re.M)
    js = re.sub(r"[ \t]+//[^'\"`\n]*$", "", js, flags=re.M)  # trailing comments (none inside strings)
    return re.sub(r"\n\s*\n+", "\n", js)


def kit_js():
    js = []
    take = lambda rel, *starts: [statement(read(rel), s, rel) for s in starts]
    moss = re.search(r"^  moss: (\{.*?\n  \}),", read("js/options.js"), re.S | re.M).group(1)
    hero = re.search(r"^\s*hero: \[.*?\],", read("js/data.js"), re.S | re.M).group(0).strip()
    js.append("const Palette = { cur: " + moss + " };")
    js.append("const SPRITES = { " + hero + " };")
    js += take("js/data.js", r"^const PAL =")
    js += take("js/render.js", r"^function expandSprite")
    js += take("js/engine.js", r"^function mulberry32")
    js.append("const sfx = () => {};")
    js.append("const RunMap = (() => {")
    js += take("js/runmap.js",
               r"^  const BAY =", r"^  const rgb =", r"^  const luma =", r"^  function ramp\(",
               r"^  const noise =", r"^  const SPIRE_ANTES =", r"^  function propArt\(", r"^  function strata\(",
               r"^  const SKY = ", r"^  function skyDrawer\(", r"^  function paint\(",
               r"^  const SL =", r"^  const POUCH =", r"^  const forkArt =", r"^  const pouchArt =")
    js.append("  return { BAY, ramp, SPIRE_ANTES, propArt, skyDrawer, forkArt, pouchArt, SL, POUCH };\n})();")
    scene = read("js/scene.js").replace("'use strict';", "")
    js.append(scene)
    for rel in ("js/settings.js", "js/factory.js"):  # the settings, and the forge's Factory.build
        js.append(read(rel).replace("'use strict';", ""))
    return strip_comments("\n".join(js)).strip()


def kit_css():
    css = read("style.css")
    rules = [l for l in css.splitlines() if l.startswith(".bw-") and not l.startswith(".bw-hud")]
    # .bw-pl spans lines: take its whole block.
    pl = re.search(r"^\.bw-pl \{.*?\n\}", css, re.S | re.M).group(0)
    rules = [r for r in rules if not r.startswith(".bw-pl")] + [re.sub(r"/\*.*?\*/", "", pl, flags=re.S)]
    rules.append(re.search(r"^@keyframes rmBob.*$", css, re.M).group(0))
    p = re.search(r"moss: \{(.*?)\n  \}", read("js/options.js"), re.S).group(1)
    tokens = dict(re.findall(r"(\w+): '(#[0-9a-f]{6})'", p))
    rules.insert(0, ".mk-kit{" + ";".join(f"--{k}:{v}" for k, v in tokens.items()) + "}")
    return "\n".join(rules)


def put(text, name, body):
    a, b = f"/* KIT:{name} */", f"/* /KIT:{name} */"
    if a not in text or b not in text:
        sys.exit(f"mockup-kit: the template has no {a} ... {b} region")
    head, rest = text.split(a, 1)
    return head + a + "\n" + body + "\n" + b + rest.split(b, 1)[1]


text = TEMPLATE.read_text(encoding="utf-8")
text = put(put(text, "css", kit_css()), "js", kit_js())
TEMPLATE.write_text(text, encoding="utf-8", newline="\n")
print(f"mockup-kit: refreshed {TEMPLATE.relative_to(ROOT)} ({len(text) // 1024} KB)")
