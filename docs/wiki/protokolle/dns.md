---
titel: DNS
kurz: Namen in Adressen übersetzen: Zonen, Einträge (A, AAAA, CNAME, MX, PTR …), Weiterleitung, Cache und nslookup.
reihenfolge: 22
schicht: 7 (Anwendung, über UDP 53)
hilfe: [dns]
demos: [dns]
uebungen: [web-dns, m117-m07b, m129-lab-a3]
normen: [RFC 1034, RFC 1035, RFC 3596, RFC 2606]
protokolle: [DNS]
verwandt: [http, e-mail, server]
---
## Wozu

Menschen merken sich `www.schule.example`, Geräte brauchen `192.168.0.3`. Das **Domain Name System** übersetzt Namen in Adressen. Jeder Rechner hat dafür einen DNS-Server eingetragen (fest oder per DHCP) und fragt ihn, bevor er eine Verbindung aufbaut.

## Einträge

| Typ | ordnet zu | Beispiel |
|---|---|---|
| A | Name → IPv4-Adresse | `web.schule.example A 192.168.0.3` |
| AAAA | Name → IPv6-Adresse | `web AAAA 2001:db8::3` |
| CNAME | Alias → anderer Name | `www CNAME web` |
| MX | Domain → Mailserver (mit Vorrang) | `schule.example MX 10 mail` |
| NS | Domain → zuständiger Nameserver | |
| PTR | Adresse → Name (Rückwärtsauflösung) | |
| TXT | freier Text | |

Jeder Eintrag hat eine **TTL**: So lange darf ein Client die Antwort im Cache behalten.

## Ablauf einer Abfrage

1. Der Browser will `www.schule.example` und fragt den DNS-Server (UDP, Port 53).
2. Der Server findet `www` als CNAME auf `web` und dazu den A-Eintrag.
3. Er antwortet **autorisierend** mit der Kette; der Client merkt sich das Ergebnis.
4. Kennt der Server die Zone nicht, **leitet er weiter** an einen anderen DNS-Server (z.B. den des Providers) und antwortet «nicht autorisierend».

Beispielnamen enden auf `.example`, einer Domain, die nach RFC 2606 nie vergeben wird.

## In leyoNET

Ein Server wird unter Erweitert → Dienste zum DNS-Server und bekommt eine Zone.

```
C:\> nslookup www.schule.example
C:\> nslookup -type=MX schule.example
C:\> nslookup 192.168.0.3
C:\> ipconfig /displaydns
C:\> ipconfig /flushdns
```
