"""Imports the Evra product catalogue (PDF) into the app: js/catalog-details.js.

For every product it takes the catalogue's Turkish texts: name, category, introduction
and features, the installation steps, how it works with Evra (with example requests),
the problems-and-solutions table, and the sample message Evra sends. js/catalog.js
merges these into the product list; the Devices pages and Evra (via the assistant's
products.json) use them.

    python tools/import_catalogue.py "..\\Evra_Urun_Katalogu Son.pdf"

Needs the pypdf package (pip install pypdf). The catalogue's font draws brackets,
dashes, colons, "+" and some digits from its private-use area; PUA below maps them back.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "js" / "catalog-details.js"

# Catalogue name (as the PDF text reads it) -> app product id, and the name as printed.
NAMES = {
    "Evra Merkez Ünitesi": ("hub", "Evra Merkez Ünitesi"),
    "Duvar Kontrol Ekranı": ("panel", "Duvar Kontrol Ekranı"),
    "Hareket Sensörü": ("motion", "Hareket Sensörü"),
    "Sıcaklık ve Nem Sensörü": ("climate-sensor", "Sıcaklık ve Nem Sensörü"),
    "Kapı ve Pencere Sensörü": ("contact", "Kapı ve Pencere Sensörü"),
    "Varlık Sensörü Radar": ("presence", "Varlık Sensörü (Radar)"),
    "Akıllı Duman Dedektörü": ("smoke", "Akıllı Duman Dedektörü"),
    "Su Basma Sensörü": ("leak", "Su Basma Sensörü"),
    "Acil Yardım Butonu": ("sos", "Acil Yardım Butonu"),
    "İç Mekan Kamerası": ("camera-indoor", "İç Mekan Kamerası"),
    "Doğalgaz Kaçak Dedektörü": ("gas", "Doğalgaz Kaçak Dedektörü"),
    "Akıllı Ana Su Vanası Kolu": ("water-valve", "Akıllı Ana Su Vanası Kolu"),
    "İç Ortam Sireni": ("siren", "İç Ortam Sireni"),
    "Dış Mekan Kamerası": ("camera-outdoor", "Dış Mekan Kamerası"),
    "Akıllı Kapı Kilidi": ("lock", "Akıllı Kapı Kilidi"),
    "Akıllı Radyatör Vanası": ("trv", "Akıllı Radyatör Vanası"),
    "Kombi ve Yerden Isıtma Rölesi": ("boiler-relay", "Kombi ve Yerden Isıtma Rölesi"),
    "Yerden Isıtma Aktüatörü": ("floor-actuator", "Yerden Isıtma Aktüatörü"),
    "Akıllı Duvar Termostatı": ("thermostat", "Akıllı Duvar Termostatı"),
    "Klima ve TV Kumandası IR + RF433": ("ir-remote", "Klima ve TV Kumandası (IR + RF433)"),
    "Hava Kalitesi CO₂ Sensörü": ("co2", "Hava Kalitesi (CO₂) Sensörü"),
    "Akıllı Priz Enerji Ölçümlü": ("plug", "Akıllı Priz (Enerji Ölçümlü)"),
    "Akıllı Renkli Ampul": ("bulb", "Akıllı Renkli Ampul"),
    "Akıllı LED Şerit": ("led-strip", "Akıllı LED Şerit"),
    "Akıllı Duvar Anahtarı Modülü": ("wall-switch", "Akıllı Duvar Anahtarı Modülü"),
    "Zigbee Akıllı Priz Ağ Güçlendirici": ("zigbee-plug", "Zigbee Akıllı Priz (Ağ Güçlendirici)"),
    "Enerji Ölçer Modülü": ("energy-meter", "Enerji Ölçer Modülü"),
    "Akıllı Stor Perde Motoru Zincirli": ("blind-chain", "Akıllı Stor Perde Motoru (Zincirli)"),
    "Akıllı Boru Motor Stor/Zebra": ("blind-tube", "Akıllı Boru Motor (Stor/Zebra)"),
    "Akıllı Klasik Perde Motoru Kornişli": ("curtain", "Akıllı Klasik Perde Motoru (Kornişli)"),
    "Elektrikli Panjur Modülü": ("shutter", "Elektrikli Panjur Modülü"),
    "Akıllı Hava Temizleyici": ("air-purifier", "Akıllı Hava Temizleyici"),
    "Robot Süpürge": ("robot-vacuum", "Robot Süpürge"),
    "Akıllı Kettle": ("smart-kettle", "Akıllı Kettle"),
    "Akıllı Vantilatör": ("smart-fan", "Akıllı Vantilatör"),
    "Otomatik Mama Makinesi": ("pet-feeder", "Otomatik Mama Makinesi"),
    "Otomatik Kedi Tuvaleti": ("cat-litter", "Otomatik Kedi Tuvaleti"),
    "Akıllı Sulama Vanası": ("irrigation", "Akıllı Sulama Vanası"),
    "Mesh Wi-Fi Sistemi": ("mesh", "Mesh Wi-Fi Sistemi"),
}

CATEGORIES = {
    "MERKEZ VE EKRAN": "hub", "SENSÖRLER": "sensors", "GÜVENLİK": "security", "ISITMA": "heating", "İKLİM": "climate",
    "ENERJİ VE AYDINLATMA": "energy", "PERDE VE PANJUR": "covers", "EV ALETLERİ": "appliances", "EVCİL HAYVAN": "pets",
    "BAHÇE VE BALKON": "garden", "AĞ": "network",
}


# The catalogue's font draws some characters from its private-use area; these are what they show.
PUA = {"": "(", "": ")", "": "[", "": "-", "": "–", "": ":", "": ".", "": "+",
       **{chr(0xE071 + i): str(i) for i in range(10)}}
PUA_TABLE = str.maketrans(PUA)


def fix(text: str) -> str:
    """Tidies spacing and drops any bracket left without its partner."""
    t = re.sub(r"\s+", " ", text.translate(PUA_TABLE)).strip()
    out, depth = [], 0
    for ch in t:
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                continue
            depth -= 1
        out.append(ch)
    t = "".join(out)
    return t.replace("‹", "").replace("›", "").strip(" ·")


def unquote(text: str) -> str:
    return fix(text).strip().strip('"“”').strip()


def find(lines, needle, start=0):
    return next((i for i in range(start, len(lines)) if needle in lines[i]), -1)


def paragraphs(rows):
    """Blank-line separated paragraphs from column text."""
    out, cur = [], []
    for r in rows:
        if r.strip():
            cur.append(r.strip())
        elif cur:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def parse_page(page: str):
    lines = page.translate(PUA_TABLE).split("\n")  # one character for one, so columns stay put
    while lines and not lines[0].strip():
        lines.pop(0)
    # Product pages start with their category; the contents and "how to read" pages don't.
    if len(lines) < 10 or lines[0].strip() not in CATEGORIES or find(lines, "Ürün tanıtımı") < 0:
        return None
    category = lines[0].strip()
    raw_name = re.sub(r"\s+\d+$", "", lines[1].strip())
    key = re.sub(r"\s+", " ", raw_name.replace(")", "").replace("(", "")).strip()
    if key not in NAMES:
        raise SystemExit(f"Unknown product in the catalogue: {raw_name!r}. Add it to NAMES.")
    pid, name = NAMES[key]
    model = fix(lines[2])

    i_intro, i_setup = find(lines, "Ürün tanıtımı"), find(lines, "Ürün kurulumu")
    i_problems = find(lines, "Gözlemlenebilecek sorunlar")
    i_sources = find(lines, "Sorun/çözüm kaynakları")

    # Evra's sample message: the speech bubble above the introduction.
    i_bubble = next((i for i in range(3, i_intro) if re.search(r"Evra (asistanı|ekranı)\s*$", lines[i])), -1)
    says = ""
    if i_bubble >= 0:
        col = max(0, lines[i_bubble].index("Evra") - 12)  # the message starts left of the "Evra" label
        says = fix(" ".join(l[col:] for l in lines[i_bubble + 1:i_intro] if l[col:].strip()))

    # 1. Introduction (right column): the first paragraph, then one feature per paragraph or wide gap.
    col1 = lines[i_intro].index("1") - 6
    paras = paragraphs([l[col1:] for l in lines[i_intro + 1:i_setup]])
    paras = [p for p in paras if not p[0].startswith("Temsili çizim")]
    # A paragraph starting in lower case is the previous one carrying on past a gap.
    merged = []
    for p in paras:
        if merged and p[0][:1].islower():
            merged[-1] = merged[-1] + p
        else:
            merged.append(p)
    paras = merged
    summary = fix(" ".join(paras[0])) if paras else ""
    features = []
    for p in paras[1:]:
        for part in re.split(r"\s{3,}", "  ".join(p) if len(p) == 1 else " ".join(p)):
            if part.strip():
                features.append(fix(part))

    # 2. Installation (left column) and 3. How it works (right column).
    col3 = lines[i_setup].index("3", lines[i_setup].index("Ürün kurulumu")) - 4
    steps, works, examples = [], [], []
    for l in lines[i_setup + 1:i_problems]:
        left, right = l[:col3], l[col3:]
        if left.strip():
            indent = len(left) - len(left.lstrip())
            if indent <= 1 or not steps:
                steps.append(left.strip())
            else:
                steps[-1] += " " + left.strip()
        r = right.strip()
        if r.startswith("›"):
            examples.append(r[1:].strip())
        elif r and examples and right.startswith("      "):
            examples[-1] += " " + r
        elif r:
            works.append(r)
    steps = [re.sub(r"^\d+\.\s*", "", fix(s)) for s in steps]  # the app numbers them itself
    examples = [unquote(e) for e in examples]

    # 4. Problems and solutions: two columns under SORUN / ÇÖZÜM.
    trouble = []
    i_head = find(lines, "ÇÖZÜM", i_problems)
    if i_head >= 0:
        cs = lines[i_head].index("ÇÖZÜM")
        end = i_sources if i_sources > 0 else len(lines)
        prob, sol = [], []
        for l in lines[i_head + 1:end] + [""]:
            if not l.strip():
                if prob or sol:
                    trouble.append({"problem": fix(" ".join(prob)), "solution": fix(" ".join(sol))})
                    prob, sol = [], []
                continue
            if l[:cs].strip():
                prob.append(l[:cs].strip())
            if l[cs:].strip():
                sol.append(l[cs:].strip())

    return pid, {
        "name": name,
        "category": CATEGORIES.get(category, ""),
        "catalogueModel": model,
        "summary": summary,
        "features": features,
        "setup": steps,
        "howItWorks": fix(" ".join(works)),
        "examples": examples,
        "troubleshooting": trouble,
        "evraSays": says,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("This needs pypdf:  python -m pip install pypdf")
    reader = PdfReader(sys.argv[1])
    details = {}
    for page in reader.pages:
        parsed = parse_page(page.extract_text(extraction_mode="layout") or "")
        if parsed:
            details[parsed[0]] = parsed[1]
    missing = [v[0] for v in NAMES.values() if v[0] not in details]
    header = ("// Generated by tools/import_catalogue.py from the Evra product catalogue (PDF). Don't edit by hand:\n"
              "// run the importer again with the new catalogue. js/catalog.js merges these into PRODUCTS.\n")
    OUT.write_text(header + "export const DETAILS = " + json.dumps(details, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{len(details)} products -> {OUT}")
    if missing:
        print("Not found in the catalogue:", ", ".join(missing))


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    main()
