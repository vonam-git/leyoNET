---
titel: Webversion: Sessions, Klassen und Ansehen
kurz: Arbeitsstand unter einem Code, Klassen-Sessions, Arbeiten der Lernenden live ansehen und die Admin-Konsole mit eigenen Zugängen.
reihenfolge: 9
verwandt: [klassen-verbund, pruefungen, faq]
---
## Sessions statt Konten

In der Webversion ([app.leyonet.ch](https://app.leyonet.ch) oder auf dem Schulserver) speichert leyoNET den Arbeitsstand unter einem **Session-Code** wie `K7QX-3MPA`. Wer den Code kennt, arbeitet an einem anderen Gerät weiter. Gespeichert ist nur die Netzwerk-Konfiguration, keine Namen; nach einer einstellbaren Zeit wird die Session gelöscht.

## Klassen

In der **Admin-Konsole** (Werkzeuge → Admin-Konsole) eröffnen Sie eine Klasse mit einer Bezeichnung wie «INF22a» und verteilen den **Klassencode**. Die Lernenden treten unter «Session» der Klasse bei. Sie sehen danach alle Sessions der Klasse mit Stand und Fortschritt und können jede **ansehen**: Das Netz erscheint bei Ihnen schreibgeschützt und wird alle paar Sekunden neu geladen. «Beenden» holt Ihr eigenes Projekt zurück.

Bei jeder Klasse blenden Sie Übungen und ganze Module ein oder aus und geben den [[klassen-verbund]] frei.

## Eigene Zugänge

Arbeiten mehrere Lehrpersonen oder Schulen auf derselben Instanz, legt der Hauptadmin **Zugänge** an: eine Bezeichnung (ohne Personennamen) und einen Schlüssel `LN-…`, der nur einmal angezeigt wird. Jeder Zugang sieht nur seine Klassen und Prüfungen, eine Schule auch die ihrer Lehrpersonen.

Eigenen Server einrichten: [Plesk](https://github.com/vonam-git/leyoNET/blob/main/docs/plesk.md) oder [Installation mit Docker](https://github.com/vonam-git/leyoNET/blob/main/docs/installation.md).
