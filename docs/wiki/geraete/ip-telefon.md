---
titel: IP-Telefon
kurz: Tischtelefon für Voice over IP, gespeist per PoE (Klasse 2), mit fester Adresse oder per DHCP.
symbol: ipphone
reihenfolge: 2.5
schicht: 7 (Anwendung), Strom über Schicht 1
hilfe: [device.ipphone]
demos: [poe]
verwandt: [poe, telefonie, qos, switch, ip-kamera]
---
## Wozu

Ein IP-Telefon telefoniert über das Datennetz statt über eine eigene Telefonleitung (Voice over IP). Im Netz ist es ein gewöhnliches Endgerät: Es braucht eine IP-Adresse, eine Maske und meist ein Gateway, damit es die Telefonanlage erreicht.

## Strom über das Netzwerkkabel

Ein Tischtelefon hat selten ein eigenes Netzteil. Es bezieht den Strom per [[poe]] vom Switch und meldet dabei die **Klasse 2**: Der Switch reserviert 7 W, am Telefon kommen nach 100 m Kabel noch 6,49 W an. Liefert der Switch kein PoE, ist das Budget aufgebraucht oder der Port abgeschaltet, bleibt das Telefon aus: In leyoNET wird es grau mit einem Blitz, sein Kabel rot.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| Adresse | fest oder per DHCP, wie bei einem PC |
| Strom über | PoE (Standard) oder Netzteil |
| Klasse | 0–8; Standard 2 (7 W) |

In der Simulation öffnet ein Doppelklick das Telefon mit Anzeige und Wähltastatur. E-Mail, Browser, Firewall und Dienste hat es nicht, wie ein echtes Tischtelefon. Wie Anrufe laufen, auch über einen SIP-Provider hinter NAT, erklärt [[telefonie]].
