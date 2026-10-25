#!/usr/bin/env python3
"""Εργαλείο για το κρυπτογραφημένο αρχείο δεδομένων του site.

Τα δεδομένα ζουν ΜΟΝΟ κρυπτογραφημένα στο data/archive.enc.json.
Ο κωδικός δεν αποθηκεύεται πουθενά στο repository: δίνεται στη μεταβλητή
περιβάλλοντος ARCHIVE_PASSWORD ή πληκτρολογείται όταν ζητηθεί.

Χρήση:
  python3 tools/archive.py decrypt /tmp/archive.json      # αποκρυπτογράφηση σε αρχείο ΕΚΤΟΣ repo
  python3 tools/archive.py encrypt /tmp/archive.json      # κρυπτογράφηση πίσω στο data/archive.enc.json
  python3 tools/archive.py mark ant1 mr-bogus 1-12 found  # σήμανση επεισοδίων (found|partial|missing)
  python3 tools/archive.py mark ant1 mr-bogus 7 partial "λείπουν 2 λεπτά στο τέλος" [όνομα]   # όνομα: ποιος το σημείωσε (b/d στο επεισόδιο)
  python3 tools/archive.py batch ant1 mr-bogus '[{"range":"34","state":"note","note":"λείπουν 4 δευτ."}]'  # σημείωση χωρίς αλλαγή κατάστασης
  python3 tools/archive.py claim ant1 mr-bogus 45 [όνομα] # «έχουμε 45, άγνωστο ποια» (0 = διαγραφή)
  python3 tools/archive.py total ant1 nintama-rantaro 42   # ορισμός συνόλου επεισοδίων
  python3 tools/archive.py find bogus                      # αναζήτηση σειράς (κανάλι + id)
  python3 tools/archive.py index                           # ευρετήριο για το Discord bot (θέλει ARCHIVE_INDEX_KEY)
  python3 tools/archive.py eplist ant1 mr-bogus eps.json   # λίστα επεισοδίων: [{"s":1,"e":1,"t":"Τίτλος"}, ...]
                                                           # (για anime χωρίς κύκλους: "s": null, "e" = απόλυτος αριθμός)
  python3 tools/archive.py image ant1 mr-bogus https://...  # εικόνα σειράς (URL) ή "none"
  python3 tools/archive.py samedub ant1 conan-the-adventurer star conan-the-adventurer  # ίδια μεταγλώττιση → κοινή πρόοδος
  python3 tools/archive.py splitdub star conan-the-adventurer                          # χωρισμός σε δική της μεταγλώττιση

Δομή: κάθε σειρά καναλιού έχει "work" (το έργο, κοινό σε όλα τα κανάλια) και "dub" (τη μεταγλώττιση).
Η πρόοδος (επεισόδια) αποθηκεύεται ανά μεταγλώττιση στο obj["dubs"], η λίστα επεισοδίων ανά έργο στο obj["works"].
"""
import base64, datetime, getpass, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENC = os.path.join(ROOT, "data", "archive.enc.json")
INDEX = os.path.join(ROOT, "data", "index.enc.json")
TITLES = os.path.join(ROOT, "data", "titles.enc.json")
WHO = os.path.join(ROOT, "data", "who.enc.json")
ITER = 250_000


def password():
    pw = os.environ.get("ARCHIVE_PASSWORD")
    return pw if pw else getpass.getpass("Κωδικός: ")


def key(pw, salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode("utf-8"))


def encrypt_obj(obj, pw):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(key(pw, salt)).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    b = lambda x: base64.b64encode(x).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b(salt), "iv": b(iv), "ct": b(ct)}


def decrypt_obj(env, pw):
    d = lambda k: base64.b64decode(env[k])
    pt = AESGCM(key(pw, d("salt"))).decrypt(d("iv"), d("ct"), None)
    return json.loads(pt.decode("utf-8"))


def load(pw):
    return decrypt_obj(json.load(open(ENC, encoding="utf-8")), pw)


def save(obj, pw):
    obj["updated"] = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(ENC), exist_ok=True)
    json.dump(encrypt_obj(obj, pw), open(ENC, "w", encoding="utf-8"))


def write_index(obj):
    """Μικρό κρυπτογραφημένο ευρετήριο για το Discord bot (γρήγορο κλειδί AES, χωρίς PBKDF2)."""
    k = os.environ.get("ARCHIVE_INDEX_KEY")
    if not k:
        return False
    rows = []
    for c in obj["channels"]:
        for s in c["series"]:
            eps = obj.get("dubs", {}).get(s.get("dub"), {}).get("episodes", {})
            t = s.get("total") or len(obj.get("works", {}).get(s.get("work"), {}).get("eplist") or [])
            f = sum(1 for n, e in eps.items() if e.get("s") == "f" and (not t or int(n) <= t))
            p = sum(1 for n, e in eps.items() if e.get("s") == "p" and (not t or int(n) <= t))
            cl = obj.get("dubs", {}).get(s.get("dub"), {}).get("claim")
            u = max(0, min(cl["n"], t or cl["n"]) - f - p) if cl else 0
            rows.append({"c": c["id"], "cn": c["name"], "i": s["id"], "t": s["title"], "n": t, "f": f, "p": p, "u": u,
                         "d": s.get("dub"), "w": s.get("work"), **({"g": s["gr"]} if s.get("gr") else {}), **({"cl": cl} if cl else {})})
    # τίτλοι επεισοδίων ανά έργο (θέση στη λίστα = αριθμός επεισοδίου), για να βρίσκει το /πες επεισόδια από τον τίτλο
    titles = {}
    for w, v in obj.get("works", {}).items():
        eps = v.get("eplist") or []
        if any(e.get("t") for e in eps):
            titles[w] = [(f"S{e['s']:02d}E{e['e']:02d} " if e.get("s") else "") + (e.get("t") or "") for e in eps]
    # ποιος σημείωσε τι και πότε, ανά μεταγλώττιση: {dub: [[επ, κατάσταση, όνομα, ημ/νία, σημείωση, discord id], ...]}
    who = {}
    for dub, v in obj.get("dubs", {}).items():
        # όλα τα σημειωμένα επεισόδια (όνομα null = παλιά καταχώριση χωρίς όνομα) — το bot τα χρειάζεται για το failsafe
        lst = [[int(n), e.get("s"), e.get("b"), e.get("d"), e.get("n", ""), e.get("u")] for n, e in v.get("episodes", {}).items()]
        if lst:
            who[dub] = sorted(lst)
    for path, data in ((INDEX, rows), (TITLES, titles), (WHO, who)):
        iv = os.urandom(12)
        ct = AESGCM(base64.b64decode(k)).encrypt(iv, json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
        json.dump({"v": 1, "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}, open(path, "w", encoding="utf-8"))
    return True


def stamp(by):
    """Ποιος και πότε (ώρα Ελλάδας) σημείωσε ένα επεισόδιο."""
    if not by:
        return {}
    try:
        from zoneinfo import ZoneInfo
        now = datetime.datetime.now(ZoneInfo("Europe/Athens"))
    except Exception:
        now = datetime.datetime.now()
    uid = os.environ.get("BYID", "").strip()  # Discord user id (για tag στο bot)
    return {"b": by[:40], "d": now.strftime("%Y-%m-%d %H:%M"), **({"u": uid[:24]} if uid.isdigit() else {})}


def get_series(obj, ch, sid):
    for c in obj["channels"]:
        if c["id"] == ch:
            for s in c["series"]:
                if s["id"] == sid:
                    return s
    sys.exit(f"Δεν βρέθηκε: {ch}/{sid}")


def parse_range(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    pw = password()
    if cmd == "decrypt":
        json.dump(load(pw), open(args[0], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    elif cmd == "encrypt":
        save(json.load(open(args[0], encoding="utf-8")), pw)
    elif cmd == "index":
        print("index:", write_index(load(pw)))
    elif cmd == "find":
        q = args[0].lower()
        for c in load(pw)["channels"]:
            for s in c["series"]:
                if q in s["title"].lower():
                    print(c["id"], s["id"], "—", s["title"], f"({s.get('total')} επ.)")
    elif cmd == "mark":
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        dub = obj["dubs"].setdefault(s["dub"], {"episodes": {}})
        state = {"found": "f", "partial": "p", "missing": None}[args[3]]
        note = args[4] if len(args) > 4 else None
        who = stamp(args[5] if len(args) > 5 else None)
        for n in parse_range(args[2]):
            if state is None:
                dub["episodes"].pop(str(n), None)
            else:
                e = {"s": state, **who}
                if note:
                    e["n"] = note
                dub["episodes"][str(n)] = e
        save(obj, pw)
    elif cmd == "batch":     # batch ant1 mr-bogus '[{"range":"1-6","state":"found"},{"range":"7","state":"partial","note":"..."}]'
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        dub = obj["dubs"].setdefault(s["dub"], {"episodes": {}})
        ops = json.loads(args[2])
        who = stamp(args[3] if len(args) > 3 else None)
        order = {"found": 0, "missing": 1, "partial": 2, "note": 3}
        for op in sorted(ops, key=lambda o: order.get(o.get("state"), 9)):
            if op["state"] == "count":      # «έχουμε Ν, άγνωστο ποια»· 0 = διαγραφή
                n = int(op.get("count") or 0)
                if n > 0:
                    dub["claim"] = {"n": n, **who}
                else:
                    dub.pop("claim", None)
                continue
            if op["state"] == "note":       # σημείωση χωρίς αλλαγή κατάστασης· κενή σημείωση = διαγραφή
                note = (op.get("note") or "").strip()
                for n in parse_range(op["range"]):
                    e = dub["episodes"].get(str(n))
                    if e is None:
                        print(f"επ. {n}: λείπει, η σημείωση αγνοήθηκε")
                    elif not note:
                        e.pop("n", None)
                    elif note not in e.get("n", ""):
                        e["n"] = (e["n"] + " · " + note if e.get("n") else note)[:200]
                        if who:
                            e["nb"], e["nd"] = who["b"], who["d"]
                continue
            state = {"found": "f", "partial": "p", "missing": None}[op["state"]]
            for n in parse_range(op["range"]):
                if state is None:
                    dub["episodes"].pop(str(n), None)
                else:
                    e = {"s": state, **who}
                    if op.get("note") and state == "p":
                        e["n"] = op["note"][:200]
                    dub["episodes"][str(n)] = e
        save(obj, pw)
    elif cmd == "claim":     # claim ant1 mr-bogus 45 [όνομα] — έχουμε 45 επεισόδια χωρίς να ξέρουμε ποια (0 = διαγραφή)
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        dub = obj["dubs"].setdefault(s["dub"], {"episodes": {}})
        if int(args[2]) > 0:
            dub["claim"] = {"n": int(args[2]), **stamp(args[3] if len(args) > 3 else None)}
        else:
            dub.pop("claim", None)
        save(obj, pw)
    elif cmd == "total":
        obj = load(pw)
        get_series(obj, args[0], args[1])["total"] = int(args[2]) if args[2] != "none" else None
        save(obj, pw)
    elif cmd == "eplist":
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        eps = json.load(open(args[2], encoding="utf-8"))
        obj["works"].setdefault(s["work"], {})["eplist"] = eps
        for c in obj["channels"]:          # ίδιο έργο σε άλλα κανάλια: ευθυγράμμιση συνόλου αν δεν έχει οριστεί
            for o in c["series"]:
                if o["work"] == s["work"] and not o.get("total"):
                    o["total"] = len(eps)
        if len(args) < 4 or args[3] != "keep-total":
            s["total"] = len(eps)
        save(obj, pw)
    elif cmd == "samedub":   # samedub ant1 conan-the-adventurer star conan-the-adventurer
        obj = load(pw)
        a, b = get_series(obj, args[0], args[1]), get_series(obj, args[2], args[3])
        ea = obj["dubs"].setdefault(a["dub"], {"episodes": {}})["episodes"]
        eb = obj["dubs"].pop(b["dub"], {"episodes": {}})["episodes"] if b["dub"] != a["dub"] else {}
        for k, v in eb.items():
            ea.setdefault(k, v)
        b["dub"] = a["dub"]
        save(obj, pw)
    elif cmd == "splitdub":  # splitdub star conan-the-adventurer
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        new = f"{s['work']}@{args[0]}"
        obj["dubs"][new] = {"episodes": dict(obj["dubs"].get(s["dub"], {"episodes": {}})["episodes"])}
        s["dub"] = new
        save(obj, pw)
    elif cmd == "image":
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        if args[2] == "none":
            s.pop("img", None)
        else:
            s["img"] = args[2]
        save(obj, pw)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
