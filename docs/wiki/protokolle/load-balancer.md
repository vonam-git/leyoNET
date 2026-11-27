---
titel: Load Balancer
kurz: Ein Load Balancer verteilt die Verbindungen der Clients auf mehrere gleiche Server und nimmt ausgefallene aus dem Spiel.
reihenfolge: 26
schicht: 4 (Transport) bis 7 (Anwendung)
hilfe: [loadbalancer]
demos: [loadBalancer]
normen: [RFC 9293]
protokolle: [Load Balancer]
verwandt: [server, http, tcp, ecmp, vrrp]
---
## Wozu?

Ein einzelner Webserver hat Grenzen: Er schafft nur so viele Anfragen, und fällt er aus, ist die Seite weg. Stellt man mehrere gleiche Server hin, braucht es jemanden, der die Clients verteilt. Das ist der **Load Balancer**: Die Clients kennen nur seine Adresse (z.B. über DNS `www.firma.example`), er gibt jede Verbindung an einen der Server dahinter weiter.

## Verfahren

| Verfahren | Wie | Gut für |
|---|---|---|
| Round Robin | der Reihe nach | gleich starke Server, kurze Anfragen |
| Least Connections | an den Server mit den wenigsten offenen Verbindungen | unterschiedlich lange Anfragen |
| Source Hash | nach der Adresse des Clients | Sitzungen, die beim selben Server bleiben müssen |

## Health Checks

Der Load Balancer prüft regelmässig, ob die Server antworten, hier alle 2 s mit einem TCP-Verbindungsaufbau. Nach zwei Fehlschlägen gilt ein Server als ausgefallen und bekommt keine neuen Verbindungen mehr, nach zwei Erfolgen ist er wieder dabei. Die Clients merken vom Ausfall nichts.

## Reverse Proxy auf Schicht 4

leyoNET arbeitet wie HAProxy im TCP-Modus: Der Load Balancer nimmt die TCP-Verbindung des Clients selbst an und baut eine **zweite Verbindung** zum gewählten Server auf. Dazwischen reicht er die Daten unverändert weiter. Darum sieht der Server als Absender den Load Balancer, nicht den Client. Echte Load Balancer auf Schicht 7 schreiben die Client-Adresse dafür in einen HTTP-Kopf (z.B. «X-Forwarded-For»).

Der Load Balancer selbst ist so ein einzelner Punkt, der ausfallen kann. In grossen Netzen gibt es darum zwei, die sich eine Adresse teilen, wie bei [[vrrp]].

## In leyoNET

Im Shop unter **Server → Load Balancer** (fertig eingerichtet) oder auf einem Server unter **Dienste → Load Balancer**: Port, Verfahren, Health Check und die Server dahinter. In der Simulation zeigt die Tabelle je Server «bereit» oder «ausgefallen», offene und gesamte Verbindungen. Die Paketliste zeigt je Aufruf zwei TCP-Verbindungen; der Webserver meldet in seiner Konsole den Load Balancer als Client.
