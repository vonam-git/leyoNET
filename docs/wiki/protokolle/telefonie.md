---
titel: Telefonie über IP (SIP und RTP)
kurz: Wie ein IP-Telefon ein Gespräch aufbaut (SIP, SDP), die Sprache überträgt (RTP mit G.711) und woran man die Qualität misst (Verlust, Laufzeit, Jitter).
reihenfolge: 27.5
schicht: 7 (Anwendung, über UDP)
hilfe: [voip]
demos: [voipQos]
uebungen: [voip-qos]
normen: [RFC 3261, RFC 8866, RFC 3550, RFC 3551, ITU-T G.711, ITU-T G.114]
protokolle: [SIP, SDP, RTP]
verwandt: [qos, ip-telefon, udp, poe]
---
## Zwei Protokolle, zwei Aufgaben

Ein Telefongespräch über das Datennetz braucht zwei Dinge: Jemand muss das Gespräch **aufbauen** (wer ruft wen an, wo ist das andere Telefon, welcher Codec?) und dann muss die **Sprache** fliessen. Dafür gibt es zwei Protokolle:

| Aufgabe | Protokoll | Transport |
|---|---|---|
| Anmelden, Anrufen, Auflegen | SIP (RFC 3261) mit SDP (RFC 8866) | UDP 5060, Text wie HTTP |
| Sprache | RTP (RFC 3550) | UDP, hier Port 4000, alle 20 ms ein Paket |

## Telefonanlage

Die Telefonanlage (in leyoNET ein Dienst auf einem Server) ist **Registrar** und **Proxy**. Beim Start meldet sich jedes Telefon mit `REGISTER` an: «Nummer 201 erreichst du unter 192.168.1.21.» Ruft jemand die 201 an, schaut die Anlage nach und leitet die Anfrage weiter. Ohne Anlage kann ein Telefon auch direkt eine IP-Adresse anrufen.

## Ablauf eines Anrufs

```
Telefon 201          Telefonanlage          Telefon 202
   │── INVITE (SDP) ───▶│── INVITE (SDP) ───▶│
   │◀── 180 Ringing ────│◀── 180 Ringing ────│   es klingelt
   │◀── 200 OK (SDP) ───│◀── 200 OK (SDP) ───│   abgenommen
   │── ACK ────────────▶│── ACK ────────────▶│
   │◀═══════════ RTP (Sprache, beide Richtungen) ══════════▶│
   │── BYE ────────────▶│── BYE ────────────▶│   aufgelegt
   │◀── 200 OK ─────────│◀── 200 OK ─────────│
```

Im INVITE und im 200 OK steht ein **SDP**-Teil: `c=IN IP4 192.168.1.21` (wohin die Sprache gehen soll), `m=audio 4000 RTP/AVP 0` (Port und Payload Type 0 = G.711 µ-law). Die Antworten finden über die **Via**-Zeilen den Weg zurück.

## Sprache mit RTP

G.711 (ITU-T) tastet die Sprache 8000-mal pro Sekunde ab, ein Byte je Abtastwert: 64 kbit/s. Alle 20 ms entsteht ein Paket mit 160 Bytes Sprache. Der RTP-Kopf (12 Bytes) trägt:

| Feld | Bedeutung |
|---|---|
| Version, Payload Type | 2, Typ 0 = PCMU (G.711 µ-law, RFC 3551) |
| Sequenznummer | +1 je Paket: Daran erkennt der Empfänger Verluste und falsche Reihenfolge |
| Zeitstempel | +160 je Paket (Abtastwerte): wann gesprochen wurde |
| SSRC | Kennung der Quelle |

Mit allen Köpfen (RTP 12, UDP 8, IP 20, Ethernet 18 Bytes) braucht ein Gespräch rund **87 kbit/s je Richtung**, nicht 64.

## Qualität

| Grösse | gut | schlecht | Warum |
|---|---|---|---|
| Laufzeit in eine Richtung | bis 150 ms (ITU-T G.114) | über 400 ms | Man fällt sich ins Wort |
| Verlust | bis 1 % | über 5 % | Silben fehlen |
| Jitter | bis 30 ms | über 60 ms | Der Puffer im Telefon läuft leer oder über |

**Jitter** ist die Schwankung der Laufzeit. RFC 3550 rechnet sie fortlaufend: J = J + (|D| − J) / 16, wobei D der Unterschied der Laufzeit zweier aufeinanderfolgender Pakete ist. Ein Telefon zeigt nach dem Gespräch alle drei Werte.

Steht eine Leitung im Stau, leidet die Sprache zuerst: Sie wartet hinter grossen Datenpaketen. Abhilfe schafft [[qos]].

## In leyoNET

- Telefon: Einstellungen → Telefonie: Rufnummer und Adresse der Anlage. Befehlszeile: `call 202`, `call 192.168.1.22`, `hangup`.
- Server: Einstellungen → Telefonie → «Telefonanlage einschalten»; dort stehen in der Simulation die angemeldeten Nummern.
- Paketliste: Filter `sip` oder `rtp`; die Bytes zeigen den SIP-Text und den RTP-Kopf.
- Prüfbaustein «Telefongespräch», auf Wunsch unter Last.
