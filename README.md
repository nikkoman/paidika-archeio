# Παιδικό Αρχείο

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
git commit -am "Ενημέρωση: Mr. Bogus" && git push
```

Για μεγαλύτερες αλλαγές: `decrypt` σε αρχείο **εκτός** repository, επεξεργασία του JSON, `encrypt`.
Μην κάνετε ποτέ commit το αποκρυπτογραφημένο JSON.

### Μορφή δεδομένων

`channels[] → series[]` με `id, title, kind, years, aired, total, notes, gddb, channel (μόνο ΕΡΤ), episodes`.
Το `episodes` είναι αντικείμενο `{"7": {"s": "p", "n": "σημείωση"}}`, όπου `s` = `f` (βρέθηκε) ή `p` (βρέθηκε με ελλείψεις).
Τα επεισόδια που λείπουν απλώς δεν αναφέρονται. Τίτλοι που ξεκινούν με «The» γράφονται «Tick, The».

Πηγή στοιχείων σειρών: [GreekDubDB](https://www.greekdubdb.com).
