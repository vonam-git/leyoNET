---
titel: HTTP
kurz: Wie der Browser eine Webseite holt: URL, DNS, TCP-Verbindung, GET-Anfrage, Statuscode und Antwort – Byte für Byte.
reihenfolge: 25
schicht: 7 (Anwendung, über TCP 80)
hilfe: [web]
demos: [web]
uebungen: [web-dns, static-nat-dmz, port-forward]
normen: [RFC 9112, RFC 3986]
protokolle: [HTTP/1.1]
verwandt: [tcp, dns, nat]
---
## Eine Seite abrufen

Die Adresse `http://www.schule.example/stundenplan.html` besteht aus Schema (`http`), Rechnername und Pfad. Der Browser:

1. fragt per [[dns]] nach der Adresse von `www.schule.example`,
2. baut eine [[tcp]]-Verbindung zu Port 80 auf,
3. schickt eine **Anfrage**,
4. erhält die **Antwort** mit Statuscode und Inhalt und zeigt sie an.

```
GET /stundenplan.html HTTP/1.1
Host: www.schule.example

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 412

<h1>Stundenplan</h1>…
```

## Statuscodes

| Code | Bedeutung |
|---|---|
| 200 OK | alles in Ordnung |
| 301 / 302 | umgezogen, neue Adresse folgt |
| 404 Not Found | Seite gibt es nicht |
| 500 | Fehler auf dem Server |

`Content-Length` zählt **Bytes**, nicht Zeichen: Ein «ü» braucht in UTF-8 zwei Byte.

## In leyoNET

Ein Server wird unter Erweitert → Dienste zum Webserver; die Seiten sind eigenes HTML, auch mit kleinen Bildern. Der Browser im Desktop zeigt jeden Schritt (DNS, TCP, GET, Antwort) und die Seite; Links darin lösen neue simulierte Abrufe aus. HTTPS mit echter Verschlüsselung gibt es nicht.
