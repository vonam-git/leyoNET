---
titel: Klassen-Verbund im Unterricht
kurz: Jede Gruppe baut einen Standort und schliesst ihn an Ihre Infrastruktur an; das Dashboard auf dem Beamer zeigt live, wer wirklich online ist.
reihenfolge: 10
hilfe: [verbund]
demos: [verbund]
uebungen: [verbund-anschluss, verbund-dhcp-dns, verbund-webserver, verbund-fehlersuche, verbund-angriff]
verwandt: [webversion, nat, statisches-routing]
---
## Die Idee

Statt dass alle allein an einem Netz arbeiten, wird die Klasse zu einem Netz: Jede Gruppe baut ihren **Standort** (Router, Switch, PCs) und schliesst ihn an die gemeinsame **Klassen-Infrastruktur** an, einen Provider und eine Zentrale mit Webserver. Wer Adressen, Standardroute und NAT richtig einrichtet, ist online. Der Beamer zeigt es allen.

## Was ist ein Platz, was ist sein Ziel?

Ein **Platz** ist ein Standort im Klassen-Netz, wie eine Filiale einer Firma, gebaut von einer Person oder Gruppe. Die Platznummer (1–62) legt die Adressen fest. Das **Ziel jedes Platzes** ist immer dasselbe: Der Standort hängt am Provider, erreicht die Zentrale, und die Zentrale erreicht den Standort (auf dem Dashboard «online»). Die Verbund-Übungen bauen darauf auf:

| Übung | Ziel des Platzes | Dashboard |
|---|---|---|
| Standort an die Zentrale anschliessen | Anschluss, WAN-Adresse, Standardroute, NAT; der PC ruft die Webseite der Zentrale ab | online |
| Standort mit DHCP und Namen der Zentrale | zusätzlich DHCP am Router mit DNS der Zentrale; Abruf von zentrale.verbund.example | online |
| Eigenen Webserver im Verbund veröffentlichen | zusätzlich Portweiterleitung, die Zentrale ruft die Webseite des Standorts ab | Dienste erreichbar |
| Fehlersuche im Verbund-Standort | fertiger Standort mit 5 Fehlern, an jedem Platz andere; alle finden und beheben | Fehler behoben n/5, dann fertig |
| Standort unter Beschuss | Webseite veröffentlichen und drei Angriffe abwehren ([[it-sicherheit]]) | Dienste erreichbar, dann fertig |

| Platz n | Transitnetz | WAN-Adresse | Provider (Gateway) |
|---|---|---|---|
| 1 | 203.0.113.4/30 | 203.0.113.6 | 203.0.113.5 |
| 2 | 203.0.113.8/30 | 203.0.113.10 | 203.0.113.9 |
| n | 203.0.113.(4·n)/30 | 203.0.113.(4·n+2) | 203.0.113.(4·n+1) |

Die Zentrale (198.51.100.10) hat in der Vorlage eine Webseite und ist DNS-Server für `zentrale.verbund.example` und `www.verbund.example`.

## Ablauf in der Lektion

1. Admin-Konsole → Klasse → «Verbund freigeben», «Vorlage laden».
2. Die Lernenden treten mit dem Klassencode, ihrer **Platznummer** und einer Gruppe (z.B. «Team Rot») bei.
3. Am Router: Abschnitt «Klassen-Verbund» → «Anschluss an die Klassen-Infrastruktur», dann «Adressen eintragen». Jeder Platz *n* bekommt ein eigenes Transitnetz 203.0.113.(4·n)/30.
4. **Dashboard** öffnen (Admin-Konsole → Klasse → Dashboard), Vollbild auf den Beamer.

Das Dashboard rechnet in Ihrem Browser alle 20 Sekunden den ganzen Verbund durch und prüft per Ping und Webseite: nicht verbunden, angeschlossen, online, Dienste erreichbar, fertig. Niemand kann «fertig» melden, grün wird nur, was funktioniert. Nachrichten zwischen den Standorten fliegen als Lichtpunkt über die Karte.

## Didaktische Hinweise

- **Zum Einstieg der Klasse in zwei Sätzen sagen:** «Wir sind eine Firma, ich bin die Zentrale, ihr seid die Filialen. Eure Filiale ist fertig, wenn sie auf dem Beamer grün ist.» Den Kasten «Dein Platz im Klassen-Verbund» und die Schritte darin zeigen.
- Die erste Viertelstunde gehört dem Anschluss: Die Klasse sieht live, wie ein Standort nach dem anderen grün wird. Das motiviert.
- Danach die Verbund-Übungen im Katalog, z.B. den eigenen Webserver per Portweiterleitung veröffentlichen ([[nat]]). Jede Verbund-Übung zeigt im Aufgabenfenster den Kasten «Dein Platz im Klassen-Verbund» mit Platznummer, Transitnetz, WAN-Adresse, Provider und Zentrale für genau diesen Platz und nennt das Ziel in einem Satz.
- Fehlersuche gemeinsam: Ein Klick auf einen Standort im Dashboard zeigt sein Netz, die Klasse sucht den Fehler mit.
- **Wettbewerb Fehlersuche:** Alle öffnen «Fehlersuche im Verbund-Standort». Jeder Platz hat 5 andere Fehler, abschreiben hilft also nicht. Auf dem Beamer füllen sich pro Standort fünf Felder («Fehler behoben n/5»); wer alle hat, wird grün.

Ausführlich: [Klassen-Verbund](https://github.com/vonam-git/leyoNET/blob/main/docs/verbund.md).
