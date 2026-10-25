#!/usr/bin/env python3
"""Εργαλείο για το κρυπτογραφημένο αρχείο δεδομένων του site.

Τα δεδομένα ζουν ΜΟΝΟ κρυπτογραφημένα στο data/archive.enc.json.
Ο κωδικός δεν αποθηκεύεται πουθενά στο repository: δίνεται στη μεταβλητή
περιβάλλοντος ARCHIVE_PASSWORD ή πληκτρολογείται όταν ζητηθεί.

Χρήση:
  python3 tools/archive.py decrypt /tmp/archive.json      # αποκρυπτογράφηση σε αρχείο ΕΚΤΟΣ repo
  python3 tools/archive.py encrypt /tmp/archive.json      # κρυπτογράφηση πίσω στο data/archive.enc.json
  python3 tools/archive.py mark ant1 mr-bogus 1-12 found  # σήμανση επεισοδίων (found|partial|missing)
  python3 tools/archive.py mark ant1 mr-bogus 7 partial "λείπουν 2 λεπτά στο τέλος"
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
            rows.append({"c": c["id"], "cn": c["name"], "i": s["id"], "t": s["title"], "n": t, "f": f, "p": p})
    iv = os.urandom(12)
    ct = AESGCM(base64.b64decode(k)).encrypt(iv, json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    json.dump({"v": 1, "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}, open(INDEX, "w", encoding="utf-8"))
    return True


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
        for n in parse_range(args[2]):
            if state is None:
                dub["episodes"].pop(str(n), None)
            else:
                e = {"s": state}
                if note:
                    e["n"] = note
                dub["episodes"][str(n)] = e
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
