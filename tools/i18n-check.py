"""Prüft die Übersetzungen der App.

Sammelt alle Texte aus t('…')-Aufrufen in den Skripten und aus den data-i18n-Markierungen in index.html
und vergleicht sie mit lang/<sprache>.js. Meldet fehlende, überflüssige und fehlerhafte Einträge
(z. B. vergessene {platzhalter}).

  python tools/i18n-check.py            # Bericht für alle Sprachen
  python tools/i18n-check.py --keys     # alle deutschen Texte als JSON ausgeben
"""
import json, re, sys, pathlib
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = ['app.js', 'advice.js', 'photos.js', 'growth.js', 'features.js', 'stoolcam.js', 'quick.js']
UNITS = ['day', 'week', 'month', 'year', 'photo', 'entry', 'change']

def unescape(s):
    return s.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8') if '\\' in s else s

def collect():
    keys = {}
    call = re.compile(r"""(?<![\w.$])t\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$]*)`)""")
    for f in JS:
        src = (ROOT / f).read_text(encoding='utf-8')
        for m in call.finditer(src):
            k = next(g for g in m.groups() if g is not None)
            keys.setdefault(unescape(k), f)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    norm = lambda x: re.sub(r'\s+', ' ', x).strip()
    for m in re.finditer(r'<(\w+)([^>]*?)\sdata-i18n(-html)?(?=[\s>])([^>]*)>(.*?)</\1>', html, re.S):
        txt = m.group(5)
        if not m.group(3):                          # reiner Text: HTML-Entities auflösen
            txt = txt.replace('&amp;', '&')
        keys.setdefault(norm(txt), 'index.html')
    for m in re.finditer(r'data-i18n-(?:ph|aria)="([^"]+)"', html):
        keys.setdefault(m.group(1), 'index.html')
    return keys

def load_lang(code):
    src = (ROOT / 'lang' / f'{code}.js').read_text(encoding='utf-8')
    d = json.loads(re.search(r'I18N\.' + code + r'\s*=\s*(\{.*?\n\});', src, re.S).group(1))
    u = json.loads(re.search(r'I18N_UNITS\.' + code + r'\s*=\s*(\{.*?\});', src, re.S).group(1))
    return d, u

if __name__ == '__main__':
    keys = collect()
    if '--keys' in sys.argv:
        print(json.dumps(sorted(keys), ensure_ascii=False, indent=1)); sys.exit()
    langs = sorted(p.stem for p in (ROOT / 'lang').glob('*.js'))
    print(f'{len(keys)} Texte im Code')
    bad = 0
    for code in langs:
        try: d, u = load_lang(code)
        except Exception as e: print(f'[{code}] Datei nicht lesbar: {e}'); bad += 1; continue
        missing = [k for k in keys if k not in d]
        extra = [k for k in d if k not in keys]
        ph = [k for k in keys if k in d and sorted(re.findall(r'\{\w+\}', k)) != sorted(re.findall(r'\{\w+\}', d[k]))]
        tags = [k for k in keys if k in d and sorted(re.findall(r'</?b>', k)) != sorted(re.findall(r'</?b>', d[k]))]
        nounit = [x for x in UNITS if x not in u or 'other' not in u[x]]
        status = 'OK' if not (missing or ph or tags or nounit) else 'FEHLER'
        print(f'[{code}] {status}: {len(d)} Übersetzungen, {len(missing)} fehlen, {len(extra)} überflüssig, '
              f'{len(ph)} Platzhalter-Fehler, {len(tags)} <b>-Fehler, Einheiten fehlen: {nounit or "-"}')
        for k in missing[:15]: print('   fehlt:', k[:100])
        for k in ph[:10]: print('   Platzhalter:', k[:80], '→', d[k][:80])
        for k in tags[:10]: print('   <b>:', k[:80])
        if status != 'OK': bad += 1
    sys.exit(1 if bad else 0)
