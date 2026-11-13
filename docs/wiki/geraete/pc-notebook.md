---
titel: PC und Notebook
kurz: Endgeräte mit Desktop: Befehlszeile, Webbrowser, E-Mail und Netzwerkeinstellungen – fest oder per DHCP.
reihenfolge: 1
schicht: 1 bis 7 (Endgerät)
hilfe: [device.pc, device.notebook]
uebungen: [two-pcs, duplicate-ip, dhcp]
verwandt: [ipv4, dhcp, server]
---
## Wozu

PC und Notebook sind die Geräte, an denen Menschen arbeiten. Sie senden und empfangen, leiten aber nichts weiter. Das Notebook kann zusätzlich per **WLAN** ins Netz; ein PC braucht ein Kabel.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| IP-Adresse und Maske | eigene Adresse und Grösse des Netzes |
| Standardgateway | Router, an den alles geht, was nicht im eigenen Netz liegt |
| DNS-Server | wer Namen wie `www.schule.example` in Adressen übersetzt |
| DHCP | statt fester Werte alles automatisch vom DHCP-Server |
| IPv6 | automatisch (SLAAC/DHCPv6) oder fest, je nach IP-Version des Projekts |

## Der Desktop

In der Simulation öffnet ein Doppelklick den **Desktop** des Geräts:

- **Befehlszeile:** `ping`, `tracert`, `ipconfig /all`, `ipconfig /release` und `/renew`, `arp -a`, `nslookup`, `netstat`, `ssh`.
- **Webbrowser:** zeigt jeden Schritt (DNS, TCP, HTTP) und die Seite.
- **E-Mail:** Senden per SMTP, Abholen per POP3 oder IMAP.
- **Netzwerk:** Adressen und Tabellen auf einen Blick.

```
C:\> ipconfig /all
C:\> ping 192.168.1.1
C:\> tracert www.schule.example
```
