# Sicherheit / Security

## Sicherheitslücke melden

Bitte **vertraulich** melden, nicht als öffentliches Issue: auf GitHub unter **Security → Report a vulnerability** ([direkt](https://github.com/vonam-git/leyoNET/security/advisories/new)). Die Adresse steht auch in `https://leyonet.ch/.well-known/security.txt` und `https://app.leyonet.ch/.well-known/security.txt` (RFC 9116).

Hilfreich sind: betroffene Adresse oder Datei, Schritte zum Nachvollziehen, mögliche Auswirkung. Wir bestätigen den Eingang innert 7 Tagen und beheben bestätigte Lücken so rasch wie möglich; wer meldet, wird auf Wunsch in den Release-Notizen genannt.

Bitte beim Testen: keine Daten anderer lesen oder ändern, keine Last erzeugen, die den Unterricht stört, keine Prüfungen während der Schulzeit angreifen. Gut gemeinte Tests in diesem Rahmen verfolgen wir nicht.

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für die jeweils neueste Version (Webversion, Einzeldatei, Desktop-App).

## Wie leyoNET geprüft wird

- Massnahmen und Bedrohungen: [docs/sicherheit.md](docs/sicherheit.md), Informationssicherheit und Datenschutz für Schulen: [docs/isds-konzept.md](docs/isds-konzept.md).
- Bei jedem Release greift `scripts/sicherheit/angriff.mjs` den Server von aussen an (lokal, alle Angriffe).
- Wöchentlich und nach jedem Release prüft der Workflow «Sicherheitsprüfung live» app.leyonet.ch, beta.leyonet.ch und leyonet.ch (nur lesend) und eröffnet bei einem Befund ein Issue.

---

**Reporting a vulnerability:** please use GitHub's private vulnerability reporting (Security → Report a vulnerability). We acknowledge within 7 days.
