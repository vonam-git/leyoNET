---
titel: Zugangstechniken: DOCSIS, GPON, DSL und LTE
kurz: Wie ein Anschluss zum Provider aufgebaut wird – über Koax, Glasfaser, Telefonleitung oder Mobilfunk – und was das Modem dabei aushandelt.
reihenfolge: 61
schicht: 1 und 2
hilfe: [access]
demos: [cpe, rzVerbund]
uebungen: [modem-vdsl, fiber-ont, cpe-home]
normen: [DOCSIS 3.1, ITU-T G.984, ITU-T G.993.2, ITU-T G.992.5, ITU-T G.994.1]
protokolle: [Ethernet-PHY, 802.11-Funk, DOCSIS, GPON, DSL, LTE; PPPoE]
verwandt: [modem, internet-box, ppp-hdlc, medien]
---
## Die letzte Meile

Zwischen Haus und Provider liegt die «letzte Meile». Je nach Ort ist das ein Koaxkabel des Kabelnetzes, eine Glasfaser, die alte Telefonleitung oder Funk. Jede Technik baut den Anschluss anders auf; das **Modem** (oder die Internet-Box) übernimmt das.

| Technik | Leitung | Ablauf beim Aufbau |
|---|---|---|
| DOCSIS 3.1 (Kabel) | Koax | Kanal suchen, Ranging, DHCP und Konfigurationsdatei per TFTP, Registrierung |
| GPON (Glasfaser) | Glasfaser, passiv geteilt | Seriennummer melden, ONU-ID erhalten, Ranging, Konfiguration (OMCI) |
| VDSL2, ADSL2+ | Telefonleitung | Training (Handshake), dann PPPoE mit Anmeldung |
| LTE (Mobilfunk) | Funk | Verbindung zur Zelle, Anmeldung mit SIM, Bearer mit IP-Adresse |

## Geteilte Medien

Bei Kabel und GPON teilen sich viele Kunden dasselbe Medium. Darum muss sich jedes Modem anmelden und bekommt Sendezeiten zugewiesen (**Ranging**: die Laufzeit wird gemessen, damit sich die Signale nicht überlagern). DSL dagegen ist eine eigene Leitung bis zur Zentrale, dafür hängt die Geschwindigkeit stark von der Länge ab.

## In leyoNET

Die Schritte des Aufbaus erscheinen als eigene Rahmen in der Paketliste. IP-Verkehr fliesst erst, wenn das Modem «online» meldet. Dämpfung, Distanz und Bandbreite sind nicht simuliert. Im [Schaufenster](https://app.leyonet.ch/?schaufenster) laufen drei Techniken nebeneinander: Glasfaser in Zürich, Kabel in Bern, VDSL in Basel.
