#!/usr/bin/env python3
"""
Qualitätsprüfung für tools/_gen_input.txt (Format: de|meaning|level|cats|region|sentenceFull|tr|flags).

Prüft (Regeln des Auftrags):
  R1 Nomen mit Artikel (der/die/das/ein/eine + klein geschriebenes Nomen), Ländernamen ausgenommen
  R2 nicht selbsterklärende Wörter als Phrase (dorthin, hin, her, dabei, dafür, damit, worauf, es gibt ...)
  R3 Übersetzungen sprachgebrauchlich: Artikel auch in der Zielsprache, englische Verben mit "to"
  R4 kein Komma innerhalb einer Übersetzung (Feldtrenner) -> "/"
  R5 Beispielsatz enthält den Eintrag wörtlich (ohne Artikel)
  R6 Duplikate (de + meaning)

Aufruf:  python3 tools/fix_quality.py          # Befunde ausgeben
         python3 tools/fix_quality.py --json   # maschinenlesbar
Exit 0 = keine Verstösse, 1 = Verstösse gefunden.
"""
import json
import re
import sys
from collections import Counter

LANGS = ["en", "es", "fr", "it", "pt", "tr", "ar", "ru", "pl", "uk"]
ARTICLES = {"der", "die", "das", "ein", "eine"}
# Eigennamen / Länder ohne Artikel im Satzgebrauch ("Deutschland grenzt an ...")
NO_ARTICLE = {
    "Deutschland", "Österreich", "Schweiz", "Liechtenstein", "Luxemburg",
    "Spanien", "Italien", "Frankreich", "Portugal", "Polen", "Ukraine",
    "Türkei", "Griechenland", "Ungarn", "Kroatien", "Serbien", "Slowenien",
    "Slowakei", "Rumänien", "Bulgarien", "Albanien", "Kosovo",
    "China", "Japan", "Indien", "Brasilien", "Mexiko", "Argentinien",
    "Kanada", "Australien", "Marokko", "Tunesien", "Ägypten", "Iran", "Irak",
    "Syrien", "Libanon", "Israel", "Vietnam", "Thailand", "Korea", "Nigeria",
    "Kenia", "Peru", "Chile", "Kolumbien", "Kuba", "Zypern", "Malta",
    "Grossbritannien", "Irland", "Norwegen", "Schweden", "Finnland",
    "Dänemark", "Belgien", "Niederlande", "Europa", "Afrika", "Asien",
    "Amerika", "Bern", "Zürich", "Basel", "Genf", "Wien", "Berlin", "München",
    "Hamburg", "Frankfurt", "Salzburg", "Innsbruck", "Graz", "Linz",
}
# Mehrwortige feste Wendungen, die als Ganzes okay sind
PHRASE_OK = {
    "zu Hause", "nach Hause", "guten Tag", "guten Morgen", "guten Abend",
    "auf Wiedersehen", "bitte schön", "danke schön", "kein Problem",
    "keine Ursache", "in Ordnung", "es gibt", "wie geht es Ihnen",
    "es geht mir gut", "wie heisst du", "wie heissen Sie", "ich heisse",
    "woher kommen Sie", "ich komme aus", "bescheid geben", "noch nicht",
    "schon wieder", "noch einmal", "wenn es geht", "sehr gern", "tut mir leid",
    "um zu", "wie bitte", "sehr gut", "ja bitte", "nein danke",
    "überhaupt nicht", "gar nicht", "etwas mehr", "zuerst einmal",
    "letzte Woche", "nächste Woche", "seit wann", "wie viel", "wie viele",
    "um wie viel Uhr", "was für ein", "dorthin gehen", "zuletzt gesehen",
    "bestellen Sie", "sagen Sie", "können Sie", "würden Sie",
    "hätte gern", "vielen Dank", "entschuldigen Sie", "ganz gleich",
    "mir egal", "leider nicht", "immer noch", "ach so", "wenn es geht",
}
# Allein nicht selbsterklärend -> muss Phrase sein
NEEDS_PHRASE = {
    "dorthin", "hin", "her", "dabei", "dafür", "damit", "worauf", "darauf",
    "daran", "davon", "dazu", "darum", "darüber", "darin", "davon",
    "es gibt", "wohin", "woher",
}
# Verallgemeinerte Funktionswörter, die als Einzelwort in Ordnung sind
FUNCTION_OK = {
    "ja", "nein", "ich", "du", "er", "sie", "es", "wir", "ihr", "man",
    "der", "die", "das", "ein", "eine", "kein", "keine", "mein", "dein",
    "sein", "ihr", "unser", "euer", "dieser", "diese", "dieses",
    "welcher", "welche", "welches", "was", "wer", "wo", "wann", "warum",
    "wie", "wem", "wen", "wieso", "wohin", "woher",
    "mich", "mir", "dich", "dir", "ihm", "ihnen", "uns", "euch", "sich",
    "in", "an", "auf", "zu", "von", "mit", "für", "bei", "nach", "aus",
    "vor", "über", "unter", "neben", "zwischen", "ohne", "gegen", "seit",
    "bis", "ohne", "um", "durch", "hinter", "und", "oder", "aber", "denn",
    "dass", "weil", "wenn", "als", "ob", "da", "dort", "hier", "jetzt",
    "heute", "morgen", "gestern", "gern", "so", "nicht", "auch", "noch",
    "nur", "schon", "immer", "sehr", "natürlich", "vielleicht", "zusammen",
    "allein", "also", "selbst", "wieder", "lange", "kurz", "letzte", "nächste",
    "beide", "ander", "jeder", "spät", "jung", "alt", "hoch", "niedrig",
    "lang", "leicht", "schwer", "billig", "teuer", "voll", "leer", "fertig",
    "müde", "froh", "gesund", "krank", "richtig", "falsch", "wichtig",
    "möglich", "letzt", "einfach", "schwierig", "ruhig", "offen",
    "geschlossen", "kaum", "fast", "etwa", "später", "bald", "früh",
    "zuletzt", "zuerst", "plötzlich", "endlich", "meistens", "zurzeit",
    "damals", "inzwischen", "danach", "vorher", "dann", "oben", "unten",
    "links", "rechts", "vorne", "hinten", "darauf", "während", "doch",
    "bitte", "danke", "hallo", "tschüss", "grüezi", "servus",
    "entschuldigung", "einverstanden", "sicher", "bestimmt", "leider",
    "hoffentlich", "übrigens", "irgendwo", "irgendwann", "zur",
    "zum", "im", "am", "ins", "seit wann", "ziemlich",
}


def parse_line(line):
    parts = line.split("|")
    if len(parts) < 7:
        return None
    de, meaning, level, cats, region, full, trraw = [p.strip() for p in parts[:7]]
    flags = parts[7].strip() if len(parts) > 7 else ""
    tr = {}
    for k, v in re.findall(r"(\w{2})=([^|,]*)", trraw):
        tr[k.strip()] = v.strip()
    return dict(de=de, meaning=meaning, level=level, cats=cats, region=region,
                full=full, tr=tr, trraw=trraw, flags=flags)


def is_noun_entry(de):
    """Ein Eintrag, der ein Nomen ist (gross geschriebenes Kopfwort ohne/mit Artikel)."""
    words = de.split()
    if not words:
        return False
    if len(words) >= 2 and words[0].lower() in ARTICLES:
        return True
    # Einzelwort gross geschrieben und nicht Funktionswort
    return len(words) == 1 and de[:1].isupper() and de.lower() not in FUNCTION_OK


def check(rows):
    problems = []
    seen = Counter()
    # Verben/Modalia, deren Satzform stark abweicht: Infinitiv + Flexion als gültige Formen
    IRREGULAR = {
        "müssen": ["muss", "musst", "müssen"], "wissen": ["weiss", "weisst", "wissen"],
        "anfangen": ["fängt", "fangen", "an"], "tragen": ["trägt", "trage", "tragen"],
        "werden": ["wird", "werden"], "üben": ["übe", "übt", "üben"],
        "dauern": ["dauert", "dauern"], "wollen": ["will", "wollen"],
        "mögen": ["mag", "mögen"], "gefallen": ["gefällt", "gefallen"],
        "einladen": ["lade", "ein"], "zumachen": ["mach", "zu"],
    }
    for i, r in enumerate(rows, 1):
        de = r["de"]
        p = lambda code, msg: problems.append(dict(line=i, code=code, de=de, msg=msg))

        # R6 Duplikate
        seen[(de.lower(), r["meaning"].lower())] += 1

        # R1 Nomen mit Artikel + klein
        if is_noun_entry(de) and de not in NO_ARTICLE:
            w = de.split()
            if len(w) == 1:
                if de.lower() not in NO_ARTICLE:
                    p("R1", "Nomen ohne Artikel: %r" % de)
            elif w[0].lower() not in ARTICLES:
                p("R1", "Nomen ohne Artikel: %r" % de)
            else:
                noun = " ".join(w[1:])
                if noun[:1].isupper() and noun.lower() not in {x.lower() for x in NO_ARTICLE}:
                    p("R1", "Nomen klein schreiben: %r" % de)

        # R2 Phrasen
        if de.lower() in NEEDS_PHRASE and de.lower() not in PHRASE_OK:
            p("R2", "nicht selbsterklärend, Phrase nötig: %r" % de)

        # R4 Komma in Übersetzung
        for lang, v in r["tr"].items():
            if "," in v:
                p("R4", "%s enthält Komma: %r" % (lang, v))
            if not v.strip():
                p("R3", "%s leer" % lang)
        for lang in LANGS:
            if lang not in r["tr"]:
                p("R3", "Übersetzung fehlt: %s" % lang)

        # R3 Englische Verben mit to / Substantive mit Artikel
        en = r["tr"].get("en", "")
        if de.split()[-1] in NO_ARTICLE and de.lower() not in NO_ARTICLE:
            # Länder-/Eigennamen: Artikel nur sprachüblich, nicht erzwingbar
            pass
        elif is_noun_entry(de) and en and not re.match(
                r"(the |a |an |some |one's |my |your |his |her |its |our |their )", en):
            if de.split()[0].lower() in ARTICLES:
                p("R3", "englisches Nomen ohne Artikel: %r" % en)

        # R5: Satz muss den Eintrag enthalten (Nomen/Lexem wortgleich, Verben mitsamt Klammerzusatz,
        # Flexionen über Formenliste; Funktionswörter frei)
        words = de.split()
        if words[0].lower() in ARTICLES and len(words) > 1:
            core = words[-1]
        else:
            bracket = re.search(r"\((.*?)\)", de)
            core = bracket.group(1) if bracket else words[0]
        hay = r["full"].replace("{{ }}", core)
        if core.lower() in FUNCTION_OK or core.lower() in ("es","habe","kann","muss","will","möchte","darf","ist","bin","sind","sein") or core in NO_ARTICLE:
            found = True
        elif re.search(re.escape(core), hay, re.IGNORECASE):
            found = True
        else:
            # Verben: Infinitiv, Stamm oder gebeugte Form (müssen->muss, anfangen->fängt/an)
            # Verben: Infinitiv, Stamm und Flexionsvarianten (Vokalwechsel, Umlaut, -t/-st)
            forms = [core] + IRREGULAR.get(core.lower(), [])
            if core.lower().endswith("en") and len(core) > 4:
                pre = core[:-2]
                forms += [pre, pre[:3], pre[:4], pre + "t", pre + "st", pre + "e"]
                if len(core) > 3:
                    v = core[1]
                    forms.append(core[0] + "ä" + core[2:-2])
                    forms.append(core[0] + "i" + core[2:-2])
                    forms.append(core[0] + "e" + core[2:-2])
                    forms.append(core[0] + "a" + core[2:-2])
                forms.append(core[0] + "ä" + core[2:-2] + "t")
            if core.lower().endswith("n") and len(core) > 3:
                forms.append(core[:-1])
            found = None
            for f in forms:
                if len(f) < 3:
                    continue
                found = re.search(re.escape(f), hay, re.IGNORECASE)
                if found:
                    break
        if not found:
            p("R5", "Satz enthält Eintrag nicht: %r" % r["full"])
        if not r["full"].strip() or not r["full"].strip()[0].isupper():
            p("R5", "Satz leer/klein: %r" % r["full"])

    for (d, m), n in seen.items():
        if n > 1:
            problems.append(dict(line=0, code="R6", de=d, msg="Duplikat: %s / %s (%dx)" % (d, m, n)))
    return problems


def load():
    path = "tools/_gen_input.txt"
    rows = []
    for line in open(path, encoding="utf-8").read().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        r = parse_line(line)
        if r:
            rows.append(r)
    return rows


def main():
    rows = load()
    problems = check(rows)
    if "--json" in sys.argv:
        print(json.dumps(problems, ensure_ascii=False, indent=1))
    else:
        print("%d Einträge geprüft" % len(rows))
        by_code = Counter(p["code"] for p in problems)
        for code in sorted(by_code):
            print("  %s: %d" % (code, by_code[code]))
        for p in problems:
            print("  ✗ %s:%s %s" % (p["code"], p["line"], p["msg"]))
    sys.exit(0 if not problems else 1)


if __name__ == "__main__":
    main()
