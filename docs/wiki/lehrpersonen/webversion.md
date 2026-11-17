---
titel: Webversion: Sessions, Klassen und Ansehen
kurz: Arbeitsstand unter einem Code, Klassen-Sessions, Arbeiten live ansehen, die Admin-Konsole unter /admin mit Statistik und Zwei-Faktor-Anmeldung.
reihenfolge: 9
verwandt: [klassen-verbund, pruefungen, faq]
---
## Sessions statt Konten

In der Webversion ([app.leyonet.ch](https://app.leyonet.ch) oder auf dem Schulserver) speichert leyoNET den Arbeitsstand unter einem **Session-Code** wie `K7QX-3MPA`. Wer den Code kennt, arbeitet an einem anderen Gerät weiter. Gespeichert ist nur die Netzwerk-Konfiguration, keine Namen; nach einer einstellbaren Zeit wird die Session gelöscht.

## Klassen

In der **Admin-Konsole** eröffnen Sie eine Klasse mit einer Bezeichnung wie «INF22a» und verteilen den **Klassencode**. Die Lernenden treten unter «Session» der Klasse bei. Sie sehen danach alle Sessions der Klasse mit Stand und Fortschritt und können jede **ansehen**: Das Netz erscheint bei Ihnen schreibgeschützt und wird alle paar Sekunden neu geladen. «Beenden» holt Ihr eigenes Projekt zurück.

Bei jeder Klasse blenden Sie Übungen und ganze Module ein oder aus und geben den [[klassen-verbund]] frei.

## Die Admin-Konsole

Die Admin-Konsole ist eine eigene Seite: **`/admin`** (z.B. `https://app.leyonet.ch/admin`). «Admin» bzw. Alt+A im Simulator öffnet sie in einem eigenen Tab, der neben dem Unterricht offen bleiben kann. Links stehen die Bereiche, die **Übersicht** zeigt laufende Prüfungen, Klassen, aktive Sessions und den Stand der Sicherheit. Solange eine Prüfung läuft, steht oben eine rote Leiste mit Fortschritt und Restzeit.

Unter **Sessions und Statistik** stehen alle aktiven Sessions mit Kennzahlen; jede lässt sich live ansehen, im Editor öffnen, verlängern oder löschen. Gespeichert und angezeigt werden nur technische Angaben.

## Zwei-Faktor-Anmeldung

Unter **Sicherheit** richten Sie eine Authenticator-App ein (z.B. Aegis, 2FAS, Google oder Microsoft Authenticator): QR-Code scannen, Code bestätigen, die acht Wiederherstellungscodes sicher aufbewahren. Danach braucht die Anmeldung Passwort bzw. Schlüssel **und** den Code aus der App. Die App rechnet nur auf dem Handy; leyoNET kennt weder Telefonnummer noch E-Mail. Der Hauptadmin kann Zwei-Faktor für alle Zugänge verlangen.

## Eigene Zugänge

Arbeiten mehrere Lehrpersonen oder Schulen auf derselben Instanz, legt der Hauptadmin **Zugänge** an: eine Bezeichnung (ohne Personennamen) und einen Schlüssel `LN-…`, der nur einmal angezeigt wird. Jeder Zugang sieht nur seine Klassen und Prüfungen, eine Schule auch die ihrer Lehrpersonen.

Eigenen Server einrichten: [Plesk](https://github.com/vonam-git/leyoNET/blob/main/docs/plesk.md) oder [Installation mit Docker](https://github.com/vonam-git/leyoNET/blob/main/docs/installation.md).
