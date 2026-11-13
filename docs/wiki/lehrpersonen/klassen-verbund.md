---
titel: Klassen-Verbund im Unterricht
kurz: Jede Gruppe baut einen Standort und schliesst ihn an Ihre Infrastruktur an; das Dashboard auf dem Beamer zeigt live, wer wirklich online ist.
reihenfolge: 10
hilfe: [verbund]
demos: [verbund]
uebungen: [verbund-anschluss, verbund-webserver]
verwandt: [webversion, nat, statisches-routing]
---
## Die Idee

Statt dass alle allein an einem Netz arbeiten, wird die Klasse zu einem Netz: Jede Gruppe baut ihren **Standort** (Router, Switch, PCs) und schliesst ihn an die gemeinsame **Klassen-Infrastruktur** an, einen Provider und eine Zentrale mit Webserver. Wer Adressen, Standardroute und NAT richtig einrichtet, ist online. Der Beamer zeigt es allen.

## Ablauf in der Lektion

1. Admin-Konsole → Klasse → «Verbund freigeben», «Vorlage laden».
2. Die Lernenden treten mit dem Klassencode, ihrer **Platznummer** und einer Gruppe (z.B. «Team Rot») bei.
3. Am Router: Abschnitt «Klassen-Verbund» → «Anschluss an die Klassen-Infrastruktur», dann «Adressen eintragen». Jeder Platz *n* bekommt ein eigenes Transfernetz 203.0.113.(4·n)/30.
4. **Dashboard** öffnen (Admin-Konsole → Klasse → Dashboard), Vollbild auf den Beamer.

Das Dashboard rechnet in Ihrem Browser alle 20 Sekunden den ganzen Verbund durch und prüft per Ping und Webseite: nicht verbunden, angeschlossen, online, Dienste erreichbar, fertig. Niemand kann «fertig» melden, grün wird nur, was funktioniert. Nachrichten zwischen den Standorten fliegen als Lichtpunkt über die Karte.

## Didaktische Hinweise

- Die erste Viertelstunde gehört dem Anschluss: Die Klasse sieht live, wie ein Standort nach dem anderen grün wird. Das motiviert.
- Danach die Verbund-Übungen im Katalog, z.B. den eigenen Webserver per Portweiterleitung veröffentlichen ([[nat]]).
- Fehlersuche gemeinsam: Ein Klick auf einen Standort im Dashboard zeigt sein Netz, die Klasse sucht den Fehler mit.

Ausführlich: [Klassen-Verbund](https://github.com/vonam-git/leyoNET/blob/main/docs/verbund.md).
