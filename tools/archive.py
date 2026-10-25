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
"""
import base64, datetime, getpass, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENC = os.path.join(ROOT, "data", "archive.enc.json")
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
    elif cmd == "find":
        q = args[0].lower()
        for c in load(pw)["channels"]:
            for s in c["series"]:
                if q in s["title"].lower():
                    print(c["id"], s["id"], "—", s["title"], f"({s.get('total')} επ.)")
    elif cmd == "mark":
        obj = load(pw)
        s = get_series(obj, args[0], args[1])
        state = {"found": "f", "partial": "p", "missing": None}[args[3]]
        note = args[4] if len(args) > 4 else None
        for n in parse_range(args[2]):
            if state is None:
                s["episodes"].pop(str(n), None)
            else:
                e = {"s": state}
                if note:
                    e["n"] = note
                s["episodes"][str(n)] = e
        save(obj, pw)
    elif cmd == "total":
        obj = load(pw)
        get_series(obj, args[0], args[1])["total"] = int(args[2]) if args[2] != "none" else None
        save(obj, pw)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
