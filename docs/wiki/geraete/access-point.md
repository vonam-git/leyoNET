---
titel: Access Point
kurz: Spannt ein WLAN auf: SSID, Band, Kanal und WPA2-Passwort, mehrere Access Points für Roaming und Mesh über Stockwerke.
reihenfolge: 8
schicht: 1 und 2
hilfe: [device.accesspoint]
demos: [wlan]
uebungen: [wlan]
verwandt: [wlan, switch]
---
## Wozu

Ein Access Point verbindet Funk-Geräte mit dem kabelgebundenen Netz. Er arbeitet wie ein Switch auf Schicht 2: Für die Clients im WLAN und die Geräte am Kabel ist es dasselbe Netz. Eine IP-Adresse braucht er nur zur Verwaltung.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| SSID | Name des WLANs, den die Clients sehen |
| Passwort | WPA2-Schlüssel; ohne Passwort ist das Netz offen |
| Band und Kanal | 2,4 oder 5 GHz; benachbarte Access Points auf verschiedene Kanäle |
| Mesh | Access Points verbinden sich per Funk statt Kabel |

## Mehrere Access Points

Haben mehrere Access Points dieselbe SSID und dasselbe Passwort, wechseln Clients beim Verschieben zum stärkeren (**Roaming**). Im **Mesh** reicht ein Kabel zum ersten Access Point; die anderen verbinden sich per Funk, auch über Stockwerke. Wie die Anmeldung abläuft, erklärt [[wlan]].
