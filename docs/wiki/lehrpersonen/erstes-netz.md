---
titel: Das erste Netz in 10 Minuten
kurz: Zwei PCs, ein Switch und ein Ping: Shop, Verkabeln, Konfigurieren und der Wechsel in die Simulation.
reihenfolge: 2
hilfe: [overview, modes, shop, selection, advanced, shortcuts]
uebungen: [two-pcs, switch-lan]
verwandt: [simulation-verstehen, pc-notebook, switch, ipv4]
---
## Der Bildschirm

Links ist der **Shop** mit allen Geräten, in der Mitte die **Zeichenfläche**, rechts die **Einstellungen** des gewählten Geräts. Oben rechts wechselt der Schalter zwischen **Entwurf** (bauen) und **Simulation** (laufen lassen); die Taste **M** schaltet ebenfalls um.

## Schritt für Schritt

1. Im Shop «Endgeräte» anklicken und zwei **PCs** auf die Fläche ziehen.
2. Unter «Switches» einen **Switch** dazwischen setzen.
3. **K** drücken (Kabel), dann nacheinander PC 1 und den Switch anklicken; ebenso PC 2 und den Switch. leyoNET nimmt den nächsten freien Anschluss; die Link-LEDs an den Kabelenden werden grün.
4. PC 1 anklicken und rechts die **IP-Adresse** `192.168.1.10` mit Maske `255.255.255.0` eintragen. Bei PC 2 `192.168.1.11`. Eingaben speichern beim Verlassen des Feldes, ein «Übernehmen» gibt es nicht.
5. **M** drücken: Die Simulation läuft.
6. PC 1 doppelklicken, im Desktop die **Befehlszeile** öffnen und `ping 192.168.1.11` eingeben.

Vier Antworten? Dann funktioniert das Netz. Unten in der **Paketliste** stehen jetzt zuerst zwei ARP-Rahmen (wer hat 192.168.1.11?) und danach die ICMP-Echos. Warum zuerst ARP kommt, erklärt [[arp]].

> Schon in diesem kleinen Netz steckt viel Unterricht: MAC-Adressen, die der Switch lernt (rechts beim Switch: MAC-Tabelle), Broadcast und Unicast, die Schichten 2 und 3.

## Nützliche Handgriffe

| Taste | Wirkung |
|---|---|
| F1 | Hilfe zum gewählten Gerät oder Fenster |
| Strg+K | Befehlssuche: Befehl oder Gerätenamen eintippen |
| E | Erweiterte Einstellungen mit allen Reitern (Adressen, Routing, VLAN …) |
| Strg+D | Auswahl duplizieren |
| Strg+Z | Rückgängig |
| I | IP-Rechner |
| ? | alle Tastenkürzel |

## Häufige Stolpersteine

- **Kein Ping, Meldung «Zeitüberschreitung»:** Adressen in verschiedenen Netzen? Beide müssen im selben Netz liegen (gleiche Netzadresse nach der Maske), siehe [[ipv4]].
- **Rotes Ausrufezeichen am Gerät:** Zwei Geräte haben dieselbe Adresse.
- **Kabel rot:** Der Anschluss ist abgeschaltet oder die Kabelart passt nicht (z.B. Glasfaser ohne SFP-Modul, siehe [[medien]]).
