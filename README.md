# Αρχείο Παιδικών Μεταγλωττίσεων

Αρχείο με τις μεταγλωττισμένες παιδικές σειρές της ελληνικής τηλεόρασης (ANT1, MEGA, STAR, ΣΚΑΪ, ΕΡΤ, ALTER) έως το 2003,
και με το ποια επεισόδια έχουν βρεθεί σε εγγραφές και ψηφιοποιήσεις.

Το site είναι στατικό (GitHub Pages). Τα δεδομένα βρίσκονται **μόνο κρυπτογραφημένα** στο `data/archive.enc.json`
(AES-GCM, κλειδί από τον κωδικό με PBKDF2-SHA256). Ο browser τα αποκρυπτογραφεί όταν ο επισκέπτης δώσει τον κωδικό.
Ο κωδικός δεν υπάρχει πουθενά μέσα στο repository.

## Ενημέρωση δεδομένων

```bash
export ARCHIVE_PASSWORD=...            # ο κωδικός του site
python3 tools/archive.py find bogus                         # βρες κανάλι + id σειράς
python3 tools/archive.py mark ant1 mr-bogus 1-12 found      # βρέθηκαν τα επεισόδια 1–12
python3 tools/archive.py mark ant1 mr-bogus 7 partial "λείπουν 2 λεπτά στο τέλος"
python3 tools/archive.py mark ant1 mr-bogus 13 missing      # αφαίρεση σήμανσης
python3 tools/archive.py total ant1 nintama-rantaro 42      # ορισμός συνόλου επεισοδίων
python3 tools/archive.py eplist ant1 mr-bogus eps.json      # λίστα επεισοδίων (θέτει και το σύνολο)
python3 tools/archive.py image ant1 mr-bogus https://...    # εικόνα σειράς
git commit -am "Ενημέρωση: Mr. Bogus" && git push
```

Για μεγαλύτερες αλλαγές: `decrypt` σε αρχείο **εκτός** repository, επεξεργασία του JSON, `encrypt`.
Μην κάνετε ποτέ commit το αποκρυπτογραφημένο JSON.

Κοινές σειρές σε πολλά κανάλια: κάθε σειρά καναλιού έχει `work` (το έργο) και `dub` (τη μεταγλώττιση).
Ίδια μεταγλώττιση → κοινή πρόοδος (`samedub`), διαφορετική → χωριστή αλλά συνδεδεμένη (`splitdub`).

```bash
python3 tools/archive.py samedub ant1 conan-the-adventurer star conan-the-adventurer
python3 tools/archive.py splitdub star babar
```

### Μορφή δεδομένων

`channels[] → series[]` με `id, title, kind, years, aired, total, notes, gddb, channel (μόνο ΕΡΤ), img, work, dub`.
`works{work: {eplist}}` και `dubs{dub: {episodes}}`.
Το `eplist` είναι `[{"s": 1, "e": 1, "t": "Τίτλος"}]` (εμφανίζεται ως S01E001)· για anime χωρίς κύκλους `"s": null` και απόλυτη αρίθμηση. Τα κλειδιά του `episodes` είναι η θέση στη λίστα (1, 2, 3…).
Το `dubs[...].episodes` είναι αντικείμενο `{"7": {"s": "p", "n": "σημείωση"}}`, όπου `s` = `f` (βρέθηκε) ή `p` (βρέθηκε με ελλείψεις).
Τα επεισόδια που λείπουν απλώς δεν αναφέρονται. Τίτλοι που ξεκινούν με «The» γράφονται «Tick, The».

Πηγή στοιχείων σειρών: [GreekDubDB](https://www.greekdubdb.com).

## Discord bot

Εντολές στο Discord: `/βρέθηκε`, `/ελλείψεις`, `/λείπει`, `/πρόοδος` (με αυτόματη συμπλήρωση σειράς).
Ροή: Discord → Cloudflare Worker (`discord/worker.js`) → GitHub `repository_dispatch` →
workflow `Ενημέρωση αρχείου` (`.github/workflows/archive-update.yml`) → commit στα δεδομένα → GitHub Pages.

Μυστικά GitHub (Settings → Secrets and variables → Actions):
`ARCHIVE_PASSWORD`, `ARCHIVE_INDEX_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`.
Μυστικά Worker: `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`, `INDEX_KEY` (= ARCHIVE_INDEX_KEY), προαιρετικά `ALLOWED_ROLE_ID`.
Οι εντολές καταχωρούνται στο Discord με το workflow `Καταχώριση εντολών Discord` (Run workflow).

Η εντολή `/πες` στέλνει το κείμενο του χρήστη στο Claude (μοντέλο Haiku) μαζί με τον κατάλογο σειρών,
δείχνει τι κατάλαβε και περιμένει «Επιβεβαίωση» πριν στείλει ενημέρωση (cmd `batch`). Χρειάζεται το secret `ANTHROPIC_API_KEY` στο Worker.
