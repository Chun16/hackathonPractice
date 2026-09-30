"""Builds the single-file site (index.html) from the files in src/.
Run: python3 build.py"""
from pathlib import Path

root = Path(__file__).parent
page = (root / 'src' / 'page.html').read_text(encoding='utf-8')
scripts = '\n'.join((root / 'src' / name).read_text(encoding='utf-8')
                    for name in ['engine.js', 'scenarios.js', 'ui.js'])
html = page.replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
(root / 'index.html').write_text(html, encoding='utf-8')
print('index.html written,', len(html), 'bytes')
