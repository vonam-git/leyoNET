---
titel: Syslog
kurz: Geräte melden Ereignisse an einen zentralen Syslog-Server: Format nach RFC 5424, Versand über UDP 514. So lässt sich später nachweisen, was wann wo geschah.
reihenfolge: 76
schicht: 7 (Anwendung)
hilfe: [syslog]
demos: [syslog]
uebungen: [sec-syslog]
normen: [RFC 5424, RFC 5426, RFC 5612]
protokolle: [Syslog]
verwandt: [it-sicherheit, udp, ssh]
---
## Wozu ein Protokoll?

Ein Router merkt sich nur wenig, und wer ihn angreift, kann seine Spuren dort löschen. Darum schicken Router, Switches, Firewalls und Server ihre Meldungen an einen **Syslog-Server**: eine zentrale Stelle, die alles mit Zeit und Absender sammelt. Fällt etwas auf, lässt sich nachlesen, was geschah. In STRIDE schützt das vor **Repudiation** (Abstreiten).

## Eine Meldung

```
<36>1 - Router leyonet - SSHFAIL [leyonet@32473 user="admin" from="192.168.10.66"] ssh failed login user admin from 192.168.10.66
```

| Teil | Bedeutung |
|---|---|
| `<36>` | PRI = Facility × 8 + Schweregrad: Facility 4 (Sicherheit), Schweregrad 4 (warning) |
| `1` | Version des Formats |
| `-` | Zeitstempel (in leyoNET leer, die Simulation kennt keine Uhrzeit; der Server notiert die Empfangszeit) |
| `Router` | Name des Geräts |
| `leyonet` | Programm, das meldet |
| `SSHFAIL` | Kennung der Meldung (MSGID) |
| `[leyonet@32473 …]` | strukturierte Daten; 32473 ist die Nummer für Beispiele (RFC 5612) |
| Rest | Text der Meldung |

Schweregrade: 0 emergency, 1 alert, 2 critical, 3 error, 4 warning, 5 notice, 6 informational, 7 debug.

## In leyoNET

- **Syslog-Server:** Rechner → Erweitert … → Dienste → Syslog, «Syslog-Server» einschalten. Dort steht auch die Liste der Meldungen.
- **Melden:** Router, Firewall und Switch (mit Verwaltungsadresse) im Reiter «Schutz» bzw. mit `logging host 192.168.10.50`; Rechner unter Dienste → Syslog.
- Gemeldet werden SSH-Anmeldungen (`SSHLOGIN`, `SSHFAIL`), Port-Sicherheit (`PORTSEC`), DHCP-Snooping (`DHCPSNOOP`) und die Warnungen des Wächters (`ARPSPOOF`, `SYNFLOOD`, `PORTSCAN`).
- In der Paketliste: Filter `udp.port == 514`, die Hex-Ansicht zeigt den Text.

> Syslog über UDP ist weder verschlüsselt noch bestätigt: Geht ein Paket verloren, fehlt die Meldung. Für heikle Netze gibt es Syslog über TLS (RFC 5425).
