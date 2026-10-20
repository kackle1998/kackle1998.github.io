import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *p: os.path.join(HERE, *p)
# Write turn_all.json into IDOL_PARTS in js/idol.js.
import json
d = json.load(open(P('pieces', 'turn_all.json')))
def anchors_js(a):
  return '{ ' + ', '.join(f"{k}: {json.dumps(v).replace(',', ', ')}" for k, v in a.items()) + ' }'
out = []
for c in ('alien', 'lion', 'robot', 'golem'):
  out.append(f"  {c}: {{")
  for k in ('mask', 'vessel', 'pedestal'):
    out.append(f"    {k}: {{")
    for f in [f for f in ('L', 'QL', 'F', 'QR', 'R') if f in d[c][k]]:
      fr = d[c][k][f]
      out.append(f"      {f}: {{ anchors: {anchors_js(fr['anchors'])}, art: [")
      for i in range(0, 32, 4): out.append("        " + ", ".join(f"'{r}'" for r in fr['art'][i:i + 4]) + ",")
      out.append("      ] },")
    out.append("    },")
  out.append("  },")
p = P('..', '..', 'js', 'idol.js')
s = open(p).read()
a = s.index("const IDOL_PARTS = {\n") + len("const IDOL_PARTS = {\n"); b = s.index("\n};\n\nconst Idol")
open(p, 'w').write(s[:a] + "\n".join(out) + s[b:])
