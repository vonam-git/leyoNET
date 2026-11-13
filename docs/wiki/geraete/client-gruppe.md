---
titel: Client-Gruppe
kurz: Ein Symbol für viele gleiche Rechner, z.B. ein ganzes Schulzimmer – praktisch, um DHCP-Bereiche und Netzgrössen zu üben.
reihenfolge: 3
hilfe: [device.clientgroup]
uebungen: [server-group]
verwandt: [dhcp, subnetting]
---
## Wozu

Ein Schulzimmer mit 25 PCs als 25 einzelne Geräte zu zeichnen, wäre unübersichtlich. Die **Client-Gruppe** steht für 2 bis 500 gleiche Rechner an einem Anschluss. Jedes Mitglied hat eine eigene MAC-Adresse und holt seine Adresse per [[dhcp]].

## Was man damit übt

- **Netzgrösse:** 25 Clients brauchen mindestens 25 freie Adressen. Ein /27 (30 Hosts) reicht knapp, für Server und Drucker besser /26.
- **DHCP-Bereich:** Ist der Bereich zu klein, bleiben Mitglieder ohne Adresse; die Gruppe zeigt, wie viele ihre Adresse erhalten haben.
- **Kosten:** Die Gruppe zählt beim Preis für jedes Mitglied.

In der Simulation lässt sich ein einzelnes Mitglied auswählen, um zu pingen oder `ipconfig` anzusehen.
