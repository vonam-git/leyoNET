---
titel: DHCP
kurz: Adressen automatisch verteilen: Discover, Offer, Request, Ack, Lease-Dauer, feste Zuweisungen und DHCP-Relay über Router.
reihenfolge: 20
schicht: 7 (Anwendung, über UDP 67/68)
hilfe: [dhcp, scopes]
demos: [dhcp]
uebungen: [dhcp, m117-m07a, m145-ue08, m145-ue09, m129-lab-a2]
normen: [RFC 2131, RFC 2132, RFC 1542]
protokolle: [DHCP]
verwandt: [server, layer3-switch, dhcpv6, client-gruppe]
---
## Wozu

Hundert Geräte von Hand zu konfigurieren ist mühsam und fehleranfällig. Ein **DHCP-Server** verteilt Adresse, Maske, Gateway und DNS-Server automatisch, für eine begrenzte Zeit (**Lease**).

## DORA

| Schritt | von → an | Inhalt |
|---|---|---|
| **D**iscover | Client → Broadcast | «Ist hier ein DHCP-Server?» (Client hat noch keine Adresse: 0.0.0.0) |
| **O**ffer | Server → Client | Angebot: Adresse, Maske, Gateway, DNS, Lease-Dauer |
| **R**equest | Client → Broadcast | «Ich nehme das Angebot dieses Servers» |
| **A**ck | Server → Client | Bestätigung; ab jetzt gilt die Adresse |

Nach der halben Lease-Dauer erneuert der Client. Mit `ipconfig /release` gibt er die Adresse zurück, mit `/renew` holt er eine neue. Ohne Antwort wiederholt er das Discover und meldet nach drei Versuchen «kein Server».

![DHCP in der Simulation: Discover, Offer, Request, Acknowledge](dhcp)

## Feste Zuweisungen und Relay

- **Reservierung:** Ein Gerät mit einer bestimmten MAC-Adresse bekommt immer dieselbe Adresse, z.B. ein Drucker.
- **DHCP-Relay:** DHCP-Anfragen sind Broadcasts und kommen nicht über Router. Ein Router oder Layer-3-Switch mit `ip helper-address` leitet sie an einen zentralen Server weiter und trägt das Netz der Anfrage ein (GIADDR). Der Server wählt danach den passenden Bereich.
- **Pools auf dem Router:** Router und Layer-3-Switches können auch selbst DHCP-Server sein (`ip dhcp pool`).

## Typische Fehler

Der Bereich ist zu klein (Client-Gruppen!), überschneidet sich mit festen Adressen, oder das verteilte Gateway stimmt nicht. Clients ohne Antwort zeigen in `ipconfig` keine gültige Adresse.
