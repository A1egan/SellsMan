from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
original = text

css = '<link rel="stylesheet" href="assets/workspace-v2.css">'
core = '<script src="assets/workspace-v2-core.js"></script>'
app = '<script src="assets/workspace-v2.js"></script>'

if css not in text:
    marker = '</head>'
    if marker not in text:
        raise SystemExit('missing </head> marker')
    text = text.replace(marker, f'{css}\n{marker}', 1)

if core not in text or app not in text:
    marker = '</body>'
    if marker not in text:
        raise SystemExit('missing </body> marker')
    scripts = []
    if core not in text:
        scripts.append(core)
    if app not in text:
        scripts.append(app)
    text = text.replace(marker, '\n'.join(scripts) + '\n' + marker, 1)

if text != original:
    path.write_text(text, encoding='utf-8')
    print('workspace v2 assets linked')
else:
    print('workspace v2 assets already linked')
