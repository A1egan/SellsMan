from pathlib import Path

path = Path('assets/workspace-v2.js')
text = path.read_text(encoding='utf-8')
old = "    board.scrollTo({ left: target, behavior: 'smooth' });\n"
new = "    board.scrollLeft = target;\n"
if new in text:
    print('Immediate board scrolling already applied')
    raise SystemExit(0)
if old not in text:
    raise SystemExit('smooth board scroll call not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Applied deterministic board scrolling')
