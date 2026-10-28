#!/usr/bin/env python3
"""Checagens estáticas básicas do projeto Infinity Clicker."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
html_path, css_path, js_path = ROOT / "public/index.html", ROOT / "public/styles.css", ROOT / "public/game.js"
checks = [
    ("HTML existe", html_path.is_file()),
    ("CSS existe", css_path.is_file()),
    ("JavaScript existe", js_path.is_file()),
]
if html_path.is_file():
    html = html_path.read_text(encoding="utf-8")
    checks.extend([
        ("HTML carrega styles.css", 'href="styles.css"' in html),
        ("HTML carrega game.js", 'src="game.js"' in html),
        ("Sem CDN externo na interface", not re.search(r"https?://(?:cdn\.|unpkg\.com|cdnjs\.)", html)),
    ])
if js_path.is_file():
    js = js_path.read_text(encoding="utf-8")
    checks.extend([
        ("Cinco mundos configurados", all(w in js for w in ("Campo de Grama", "Deserto", "Neve", "Vulcão", "Céu"))),
        ("Save local", "localStorage" in js),
        ("Autosave", "AUTOSAVE_MS" in js),
        ("Ganho offline", "OFFLINE_CAP_SECONDS" in js),
        ("Renascimento", "REBIRTH_DIVISOR" in js),
        ("Baús", "CHEST_BASE_CHANCE_GOLD" in js),
    ])
failed = False
for label, okay in checks:
    print(f"{'OK' if okay else 'FALHOU'} - {label}")
    failed |= not okay
sys.exit(1 if failed else 0)
