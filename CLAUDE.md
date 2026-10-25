# Αρχείο Παιδικών Μεταγλωττίσεων — σημειώσεις για το Claude

Αυτό το αρχείο φορτώνεται αυτόματα σε κάθε νέα συνεδρία Claude (Claude Code) που ανοίγει το repository,
ώστε να συνεχίζει τη δουλειά χωρίς να χρειάζεται η αρχική συζήτηση. Γλώσσα επικοινωνίας με τον ιδιοκτήτη: **ελληνικά**.

## Τι είναι
- Site (GitHub Pages): https://nikkoman.github.io/paidika-archeio/ — με κωδικό (τον γνωρίζει ο ιδιοκτήτης· **δεν** γράφεται στο repo).
- Οδηγός για τα μέλη (δημόσιος, χωρίς κωδικό): https://nikkoman.github.io/paidika-archeio/manual.html
- Περιεχόμενο: μεταγλωττισμένες **παιδικές σειρές** (όχι ταινίες) με 1η προβολή **έως 2003**, σε 6 καρτέλες:
  ANT1, MEGA, STAR, ΣΚΑΪ, ΕΡΤ (ΕΡΤ/ΕΤ1/ΝΕΤ/ΕΤ2/ΕΤ3/ΕΡΤ2…), ALTER. ~694 σειρές, ~632 με λίστα επεισοδίων.
- Τα μέλη ενός Discord server ψηφιοποιούν VHS και σημειώνουν ανά επεισόδιο: βρέθηκε / με ελλείψεις (+σημείωση) / λείπει.

## Πηγές & κανόνες δεδομένων
- Κύρια πηγή σειρών: GreekDubDB (network pages: ANT1 id=9, MEGA 4, STAR 2, ΣΚΑΪ 101, ALTER 22,
  ΕΡΤ 3,5,8,18,223,71,37,219). Μόνο πρωτότυποι τίτλοι· «The X» γράφεται «X, The».
- Έτη: «1η προβολή» = έτος μεταγλώττισης GreekDubDB, ποτέ πριν την ίδρυση του καναλιού
  (ANT1 1990, MEGA 1989, STAR/ΣΚΑΪ 1993, ALTER 1994)· τότε `airedApprox: true` και `dubyear` κρατά το αρχικό.
  Ο χρήστης θέλει ακριβή έτη **μόνο** αν τα γράφει η GreekDubDB — όχι εικασίες.
- Λίστες επεισοδίων: μόνο από πηγές (Wikipedia, TheTVDB, TVmaze, ANN…), **ποτέ τίτλοι από μνήμη**· κενός τίτλος αν λείπει.
  Μορφή εμφάνισης SxxExxx· anime χωρίς κύκλους απόλυτη αρίθμηση (`"s": null`).
- Αποφάσεις του χρήστη για σύνολα: TMNT 1987 ANT1 χωρίς Red Sky (169) · Captain Planet MEGA 65 · Nintama ANT1 47 (1ο intro) ·
  Dr. Slump ANT1 έως 50 · Pokémon STAR 587 (πριν το 16:9) · Thomas STAR/ALTER κύκλοι 1–10 (262, κοινή μεταγλώττιση) ·
  Sesame Street ΕΡΤ 70s–80s, STAR 80s–90s (~2600, κατά προσέγγιση) · One Piece ALTER 106 · Oggy ALTER κύκλοι 1–2 (156 σκετς).
- Αποφάσεις για μεταγλωττίσεις (έλεγχος GreekDubDB, 10/2026): Heathcliff MEGA (1989) χωριστά από STAR (1993) ·
  Les Nouvelles Aventures de Lucky Luke μόνο ALTER (η ΕΡΤ2 έχει δική της του 2017) · Delfy ΕΡΤ/ALTER διαφορετικές μεταγλωττίσεις.
- Εικόνες χαρακτήρων: **δεν** τις αναζητούμε/ανεβάζουμε εμείς (πνευματικά δικαιώματα)· μόνο URL που δίνει ο χρήστης (`archive.py image`).

## Δομή δεδομένων
- `data/archive.enc.json`: όλα τα δεδομένα, κρυπτογραφημένα (AES-GCM, PBKDF2-SHA256 από τον κωδικό του site).
- `channels[].series[]` → `id, title, kind, years, aired, airedApprox, dubyear, total, notes, gddb, channel(ΕΡΤ), img, work, dub`.
- `works{work: {eplist}}` (λίστα επεισοδίων ανά έργο) · `dubs{dub: {episodes: {"7": {"s":"f|p","n":"…","b":"όνομα","d":"YYYY-MM-DD HH:MM"}}}}` (πρόοδος ανά μεταγλώττιση· `b/d` = ποιος/πότε, ώρα Ελλάδας, από το Discord).
  Προαιρετικά `dubs[dub].claim = {n, b, d}`: «έχουμε n επεισόδια, άγνωστο ποια» (`archive.py claim` ή op `count` στο `batch`)· το site δείχνει τα μη σημειωμένα ως «άγνωστο ποια» (μπλε).
  Ίδια μεταγλώττιση σε 2 κανάλια = ίδιο `dub` → κοινή πρόοδος. `work` = GreekDubDB title id (`g123`).
- `data/index.enc.json`: μικρό ευρετήριο για το Discord bot (κλειδί `ARCHIVE_INDEX_KEY`)· `data/titles.enc.json`: τίτλοι επεισοδίων ανά έργο, `data/who.enc.json`: ποιος/πότε ανά επεισόδιο — και τα δύο για το /πες (ίδιο κλειδί, γράφονται από το `index`).

## Εργαλεία
`tools/archive.py` (χρειάζεται `ARCHIVE_PASSWORD`, και `ARCHIVE_INDEX_KEY` για `index`):
`find`, `mark`, `batch`, `total`, `eplist`, `image`, `samedub`, `splitdub`, `decrypt`/`encrypt`, `index`.
Μετά από αλλαγή δεδομένων: `index` (αν υπάρχει το κλειδί) → commit → `git pull --rebase` → push
(το bot κάνει συχνά commits, άρα πάντα rebase πριν το push). Ποτέ commit αποκρυπτογραφημένου JSON.
Μετά από αλλαγή σε `assets/*.js|css`: ανανέωσε το `?v=` στο `index.html` (cache).

## Discord bot
- Cloudflare Worker `paidika-bot` (https://paidika-bot.me-600.workers.dev, έλεγχος: `/check`), κώδικας `discord/worker.js`.
  Ο ιδιοκτήτης τον επικολλά χειροκίνητα στο Cloudflare (Edit code → Deploy) μετά από κάθε αλλαγή.
- Εντολές (`discord/commands.json`, καταχώριση με workflow «Καταχώριση εντολών Discord»):
  `/πες` (απλή γλώσσα μέσω Claude Haiku, με κουμπί Επιβεβαίωση· δέχεται και σκέτη σημείωση ανά επεισόδιο, op `"note"` στο `batch`, που προστίθεται χωρίς αλλαγή κατάστασης· κενή = διαγραφή), `/βρέθηκε`, `/ελλείψεις`, `/λείπει`, `/πρόοδος`.
- Failsafe (στον κώδικα του Worker, `guard`): μία σειρά ανά αίτημα· χωρίς δικαιώματα διαχειριστή (Administrator/Manage Server ή `ADMIN_ROLE_ID`)
  «λείπει» έως 10 επεισόδια τη φορά και μόνο σε επεισόδια που πέρασε ο ίδιος (όχι άλλο μέλος ή παλιές καταχωρίσεις).
- Ροή: Worker → GitHub `repository_dispatch` → `.github/workflows/archive-update.yml` → commit → Pages.
- Secrets Worker: `DISCORD_PUBLIC_KEY`, `GITHUB_TOKEN`, `INDEX_KEY`, `ANTHROPIC_API_KEY` (προαιρ. `ALLOWED_ROLE_ID`).
  Secrets GitHub: `ARCHIVE_PASSWORD`, `ARCHIVE_INDEX_KEY`, `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`.

## Νέα συνεδρία — πρώτα βήματα
- Ζήτα από τον ιδιοκτήτη τον κωδικό του site (`ARCHIVE_PASSWORD`) και το `ARCHIVE_INDEX_KEY` — δεν υπάρχουν στο repo.
- Πρόσθεση σειράς: ο χρήστης δίνει τίτλο/link GreekDubDB + κανάλι (+ τυχόν περιορισμό επεισοδίων).
  Δεν υπάρχει εντολή `add`: `decrypt` σε αρχείο εκτός repo → προσθήκη στο `channels[].series[]` (`work`=`g<id>`, `dub`=`<work>@<έτος>`,
  έλεγχος αν το ίδιο `work`/μεταγλώττιση υπάρχει ήδη σε άλλο κανάλι) → `encrypt` → `eplist` από πηγές → `index` → commit/push.
- Νέο κανάλι: νέο στοιχείο στο `channels[]` (`id`, `name`, `series`) + λογότυπο `assets/logos/<id>.png` (από τον χρήστη).

## Εκκρεμότητες / ιδέες
- Μεταγενέστερες μεταγλωττίσεις (π.χ. Nils 2008) ως «ταμπέλες» μέσα στη σειρά, χωρίς να φορτώνεται η λίστα — συμφωνήθηκε ως ιδέα, δεν έχει υλοποιηθεί.
- Herman & Katnip (ANT1): ο χρήστης θα πει ποια σκετς περιλαμβάνει.
- ~62 σειρές χωρίς αξιόπιστους τίτλους επεισοδίων (μένουν με αριθμημένα κουτάκια).
