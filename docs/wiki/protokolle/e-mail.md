---
titel: E-Mail: SMTP, POP3 und IMAP
kurz: Wie eine Mail vom Absender über Mailserver und MX-Einträge ins Postfach kommt und wie man sie abholt.
reihenfolge: 26
schicht: 7 (Anwendung, über TCP)
hilfe: [mail]
demos: [mail]
normen: [RFC 5321, RFC 1939, RFC 9051]
protokolle: [SMTP, POP3, IMAP]
verwandt: [dns, tcp, server]
---
## Der Weg einer Mail

1. Anna schreibt im Mailprogramm an `ben@schule.example` und sendet per **SMTP** (Port 25) an ihren Mailserver.
2. Ist Ben auf einem anderen Server, fragt Annas Server per DNS nach dem **MX-Eintrag** von `schule.example` und liefert die Mail per SMTP dorthin.
3. Die Mail liegt in Bens Postfach.
4. Ben holt sie ab: per **POP3** (Port 110, die Mail wird heruntergeladen und gelöscht) oder per **IMAP** (Port 143, die Mail bleibt auf dem Server, mehrere Geräte sehen denselben Stand).

## Der SMTP-Dialog

```
S: 220 mail.schule.example
C: HELO pc1
S: 250 OK
C: MAIL FROM:<anna@schule.example>
C: RCPT TO:<ben@schule.example>
C: DATA
C: Subject: Hallo
C: …
C: .
S: 250 OK
C: QUIT
```

Jede Antwort beginnt mit einem dreistelligen Code: 2xx heisst Erfolg, 5xx dauerhafter Fehler.

## In leyoNET

Ein Server wird unter Erweitert → Dienste zum Mailserver mit Domain und Postfächern. Das Mailprogramm im Desktop zeigt den ganzen Protokolldialog; in der Paketliste lässt er sich mit «TCP-Verbindung folgen» Zeile für Zeile lesen.
