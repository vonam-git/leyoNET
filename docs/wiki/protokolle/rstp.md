---
titel: Rapid Spanning Tree (RSTP)
kurz: Die schnelle Variante von STP: Vorschlag und Zustimmung statt Wartezeit, ein vorbereiteter Reserveport und Umschalten in Millisekunden.
reihenfolge: 3.2
schicht: 2 (Sicherung)
hilfe: [rstp]
demos: [rstp]
uebungen: [rstp-fast]
normen: [IEEE 802.1Q, IEEE 802.1D]
protokolle: [RSTP]
verwandt: [stp, switch, lacp]
---
## Warum schneller?

Klassisches [[stp]] lässt einen neuen Weg erst nach der Weiterleitungsverzögerung zu (in echten Netzen bis 50 Sekunden). So lange stehen Telefonate und Verbindungen still. **RSTP** (früher IEEE 802.1w, heute Teil von IEEE 802.1Q) wählt die Root-Bridge gleich, schaltet aber in Millisekunden um.

## Vorschlag und Zustimmung

Ein Port, der neu **Designated** wird, leitet nicht einfach los. Er schickt einen **Vorschlag** (Proposal) an den Nachbarn:

1. Der Nachbar erkennt darin seinen neuen Weg zur Root (Root-Port).
2. Er sperrt kurz seine eigenen Designated-Ports (**Synchronisation**), damit nirgends eine Schleife entsteht, und schickt dort seinerseits Vorschläge.
3. Dann antwortet er mit einer **Zustimmung** (Agreement). Beide Ports leiten sofort weiter.

So läuft die Freigabe wie eine Welle von der Root weg durch das Netz, ohne Timer.

## Rollen und Zustände

| Rolle | Zustand | Bedeutung |
|---|---|---|
| Root-Port | forwarding | bester Weg zur Root |
| Designated | forwarding | leitet auf dieser Leitung weg von der Root |
| Alternate | discarding | vorbereitete Reserve für den Root-Port |
| Edge | forwarding | Endgerät angeschlossen, sofort aktiv |

Fällt der Root-Port aus, wird der **Alternate-Port** ohne Wartezeit zum neuen Root-Port. Ändert sich der Baum, schicken die Switches BPDUs mit dem **TC-Flag** (Topology Change); wer es erhält, vergisst die gelernten MAC-Adressen an den übrigen Ports und gibt die Meldung weiter.

## Das RST BPDU

RSTP verwendet dasselbe Rahmenformat wie STP, aber Protokollversion 2 und Typ 0x02. Im Flag-Byte stehen Proposal, Agreement, Rolle, Learning, Forwarding und TC. Ein Switch, der nur STP spricht, versteht das nicht: An diesem Port fällt RSTP auf STP (Version 0) zurück und wartet wie dort.

## In leyoNET

Im Switch unter **Switching → Spanning Tree → Variante** RSTP wählen oder auf der Befehlszeile `spanning-tree mode rstp` (auch `rapid-pvst`). `show spanning-tree` zeigt «protocol rstp», Rollen und Zustände. Die Paketliste filtert mit `rstp`; die Paketdetails zeigen die Flags. In der Demo läuft ein Dauerping weiter, während man ein Kabel entfernt.
