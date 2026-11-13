---
titel: Häufige Fragen
kurz: Datenschutz, Internetzugang, Speichern, Geräte im Schulzimmer und was leyoNET bewusst nicht kann.
reihenfolge: 11
verwandt: [crashkurs, webversion]
---
## Datenschutz und Betrieb

**Brauchen die Lernenden ein Konto?** Nein. In der Webversion gibt es nur Session-Codes, gespeichert ist nur die Netzwerk-Konfiguration. Es gibt keine Cookies, kein Tracking und keine externen Ressourcen.

**Darf die Schule leyoNET einsetzen?** leyoNET ist auf das Schweizer Datenschutzgesetz und die DSGVO ausgelegt. Für die Abklärung an der Schule gibt es ein [ISDS-Konzept](https://github.com/vonam-git/leyoNET/blob/main/docs/isds-konzept.md) und eine [DSFA-Abklärung](https://github.com/vonam-git/leyoNET/blob/main/docs/dsfa-abklaerung.md).

**Geht es ohne Internet?** Ja. Die Einzeldatei `leyonet.html` läuft offline, auch vom USB-Stick; sie kann technisch keine Verbindung aufbauen.

## Im Schulzimmer

**Wo wird gespeichert?** In der Einzeldatei und der Desktop-Version im Browser bzw. Programm des Geräts; zusätzlich als Projektdatei (Strg+S). In der Webversion unter dem Session-Code.

**Welche Geräte?** Jeder aktuelle Browser auf Windows, macOS, Linux oder Chromebook. Tablets gehen zum Ansehen; zum Bauen sind Maus und Tastatur angenehmer.

**Wie zeige ich etwas vor?** Datei → Demo-Netze → «Vorführen», viele Demos mit Führung. Oder ein beliebiges Demo-Netz als [Schaufenster](https://app.leyonet.ch/?schaufenster) auf dem Beamer laufen lassen.

## Grenzen

**Ist das ein Ersatz für echte Geräte?** Nein, eine Ergänzung. leyoNET zeigt, was in den Paketen passiert, was im Rack selten sichtbar ist. Die Bedienung echter Geräte (Konsole, Firmware, Verkabelung) bleibt eigener Unterricht.

**Was fehlt bewusst?** HTTPS/TLS mit echter Verschlüsselung, QoS, Multicast-Routing, Rapid-STP, VRRP/HSRP und Bitfehler auf der Leitung. Welche Protokolle wie vereinfacht sind, steht auf jeder Protokollseite unter «Was leyoNET vereinfacht».
