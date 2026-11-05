// Inhalt der Arbeitsblätter zu den Katalog-Übungen «Modul 117» (Modul 129: inhaltM129.mjs).
// Jedes Blatt gehört zu einer oder mehreren Übungen (catalogM117.ts, Feld
// `sheet`); jeder Abschnitt nennt seine Übung im Katalog. `answer` ist die
// Musterlösung (nur im _mL-PDF ausgefüllt).
//
// Blöcke: p (Absatz, **fett**), tip (klein, kursiv), h (Zwischentitel),
// box (grauer Kasten), table (erste Zeile = Kopf), fields (Beschriftung +
// Feld, zwei Spalten), question (Frage + mehrzeiliges Feld), check (Anzahl
// Lernziele bzw. Punkte), list (Aufzählung).
// Nur Zeichen aus WinAnsi verwenden (keine Pfeile): «» – • × ² sind erlaubt.

const netFields = (prefix, n) => [
  { label: 'Netzadresse (Netz-ID)', name: `${prefix}netz`, answer: n.net },
  { label: 'Kleinster Host', name: `${prefix}min`, answer: n.first },
  { label: 'Grösster Host', name: `${prefix}max`, answer: n.last },
  { label: 'Broadcast', name: `${prefix}bc`, answer: n.bc },
  { label: 'Anzahl max. Hosts', name: `${prefix}hosts`, answer: n.hosts },
];

const pcTable = (mask, third = () => 0) => [
  ['PC', 'IP-Adresse', 'Subnetzmaske'],
  ...['110', '120', '130', '140', '150', '160'].map((last, i) => [`PC0${i + 1}`, `192.168.${third(i)}.${last}`, mask]),
];

const siteFields = (prefix, s) => [
  { label: 'Netzadresse mit CIDR', name: `${prefix}netz`, answer: s.net },
  { label: 'Subnetzmaske', name: `${prefix}maske`, answer: s.mask },
  { label: 'Kleinster Host', name: `${prefix}min`, answer: s.first },
  { label: 'Grösster Host', name: `${prefix}max`, answer: s.last },
  { label: 'Broadcast', name: `${prefix}bc`, answer: s.bc },
  { label: 'Anzahl Hosts', name: `${prefix}hosts`, answer: s.hosts },
];

import { M129_SHEETS } from './inhaltM129.mjs';

export const SHEETS = [
  {
    file: 'M06C_M117_UE03_Router01',
    block: 'Block 6: IP und Router',
    title: 'UE03: Router01',
    subtitle: 'Netze mit Switches und Subnetzmasken · Richtzeit 45 Minuten',
    entries: ['m117-ue03-a1', 'm117-ue03-a2', 'm117-ue03-a3', 'm117-ue03-a4'],
    projects: ['M06C_UE03_A1', 'M06C_UE03_A2', 'M06C_UE03_A3', 'M06C_UE03_A4'],
    intro: [{ p: 'Ihr habt IP-Adressen und Subnetze berechnet. Doch wie verhalten sie sich in einem Netz? Zuerst arbeiten wir nur mit Switches, bevor Router dazukommen.' }],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag 1 – Ein Netz mit zwei Switches',
        stars: 1,
        catalog: 'UE03 Router01 – Auftrag 1: Ein Netz mit zwei Switches',
        blocks: [
          { p: 'Verbinde PC01 bis PC03 mit Switch 1, PC04 bis PC06 mit Switch 2 und die beiden Switches miteinander. Die PCs bekommen diese Einstellungen:' },
          { table: pcTable('255.255.255.0'), widths: [1, 2, 2] },
          { h: 'Bevor wir starten, macht euch folgende Überlegung' },
          { fields: netFields('', { net: '192.168.0.0/24', first: '192.168.0.1', last: '192.168.0.254', bc: '192.168.0.255', hosts: '254' }) },
          { h: 'In der Simulation' },
          { p: 'Wechsle mit **M** in die Simulation, öffne auf einem PC den Desktop (Doppelklick) und pinge in der Eingabeaufforderung die anderen PCs an: **ping 192.168.0.X**' },
          {
            question: {
              name: 'alle',
              text: 'Was stellt ihr fest? Könnt ihr alle PCs anpingen?',
              answer: 'Ja. Alle sechs PCs liegen im Netz 192.168.0.0/24 und sind über die beiden Switches verbunden. Jeder Ping erhält vier Antworten.',
            },
          },
          {
            question: {
              name: 'leer',
              lines: 3,
              text: 'Pinge **192.168.0.99**, eine Adresse im Netz, zu der es keinen PC gibt. Was meldet die Eingabeaufforderung? Beobachte die Paketliste und die Leitungen: Wohin laufen die Rahmen?',
              answer: '«Zielhost nicht erreichbar»: Niemand antwortet. Der PC fragt zuerst per ARP «Wer hat 192.168.0.99?». Diese Anfrage ist ein Broadcast; die Switches leiten sie an alle Anschlüsse weiter, darum laufen Rahmen zu allen PCs. Weil keine Antwort kommt, wird gar kein Ping gesendet.',
            },
          },
          {
            question: {
              name: 'eigen',
              text: 'Pinge die eigene Adresse und danach **127.0.0.1**. Welche Adresse antwortet, und was erscheint in der Paketliste?',
              answer: 'Es antwortet die eigene Adresse bzw. 127.0.0.1. In der Paketliste erscheint nichts: Das Paket verlässt den PC nicht, es läuft intern über die Loopback-Schnittstelle.',
            },
          },
          { fields: [{ label: 'Wie nennt sich 127.0.0.1?', name: 'loopback', answer: 'Loopback-Adresse (localhost)', wide: true }] },
          { check: 6 },
        ],
      },
      {
        id: 'a2',
        heading: 'Auftrag 2 – Zwei Netze an denselben Switches',
        stars: 1,
        catalog: 'UE03 Router01 – Auftrag 2: Zwei Netze an denselben Switches',
        blocks: [
          { p: 'Wir verändern die Aufgabe: PC03, PC05 und PC06 kommen in ein zweites Netz. Kabel und Switches bleiben, wie sie sind.' },
          { table: pcTable('255.255.255.0', (i) => ([2, 4, 5].includes(i) ? 1 : 0)), widths: [1, 2, 2] },
          { h: 'LAN 1' },
          { fields: netFields('lan1_', { net: '192.168.0.0/24', first: '192.168.0.1', last: '192.168.0.254', bc: '192.168.0.255', hosts: '254' }) },
          { h: 'LAN 2' },
          { fields: netFields('lan2_', { net: '192.168.1.0/24', first: '192.168.1.1', last: '192.168.1.254', bc: '192.168.1.255', hosts: '254' }) },
          {
            question: {
              name: 'lan1lan2',
              lines: 3,
              text: 'Pingt wiederum alle an (ping 192.168.Y.X). Was stellt ihr fest? Ist es möglich, einen Client aus LAN 1 im LAN 2 anzupingen?',
              answer: 'Nein. Innerhalb von LAN 1 (PC01, PC02, PC04) und innerhalb von LAN 2 (PC03, PC05, PC06) klappt der Ping, auch über beide Switches. Von LAN 1 nach LAN 2 kommt keine Antwort: Der PC erkennt an der Maske, dass das Ziel in einem anderen Netz liegt, und hat kein Gateway.',
            },
          },
          {
            question: {
              name: 'noetig',
              lines: 3,
              text: 'Was hindert die Verbindung, bzw. was ist nötig, damit ein Ping zwischen den Netzen möglich ist?',
              answer: 'Die Netze sind logisch getrennt, auch wenn sie an denselben Switches hängen. Nötig ist ein Router mit einem Anschluss in jedem Netz; die PCs tragen seine Adresse als Standardgateway ein.',
            },
          },
          { check: 6 },
        ],
      },
      {
        id: 'a3',
        heading: 'Auftrag 3 – Subnetzmaske /25',
        stars: 2,
        catalog: 'UE03 Router01 – Auftrag 3: Maske /25',
        blocks: [
          { p: 'Wieder die Ausgangslage von Auftrag 1 (alle in 192.168.0.x). Jetzt bekommen aber alle PCs die Subnetzmaske 255.255.255.128, in CIDR-Schreibweise /25.' },
          { table: pcTable('255.255.255.128'), widths: [1, 2, 2] },
          {
            fields: [
              { label: 'Netz von PC01 und PC02', name: 'netz1', answer: '192.168.0.0/25' },
              { label: 'Netz von PC03 bis PC06', name: 'netz2', answer: '192.168.0.128/25' },
              { label: 'Broadcast (oberes Netz)', name: 'bc2', answer: '192.168.0.255' },
              { label: 'Hosts pro Netz', name: 'hosts', answer: '126' },
            ],
          },
          {
            question: {
              name: 'wer',
              lines: 3,
              text: 'Versucht wiederum, alle untereinander anzupingen. Was stellt ihr fest? Wer kann mit wem kommunizieren?',
              answer: 'Mit /25 entstehen zwei Netze: 192.168.0.0/25 (0–127) mit PC01 und PC02 sowie 192.168.0.128/25 (128–255) mit PC03 bis PC06. Nur innerhalb dieser Netze klappt der Ping, obwohl alle am selben Switch-Netz hängen.',
            },
          },
          { check: 6 },
        ],
      },
      {
        id: 'a4',
        heading: 'Auftrag 4 – Subnetzmaske /26 (optional)',
        stars: 2,
        catalog: 'UE03 Router01 – Auftrag 4: Maske /26 (optional)',
        blocks: [
          { p: 'Wir machen nochmals eine Steigerung: Alle PCs bekommen die Subnetzmaske /26.' },
          { table: [['PC', 'IP-Adresse / CIDR'], ...['110', '120', '130', '140', '150', '160'].map((l, i) => [`PC0${i + 1}`, `192.168.0.${l} / 26`])], widths: [1, 3] },
          {
            fields: [
              { label: 'Subnetzmaske dezimal', name: 'maske', answer: '255.255.255.192' },
              { label: 'Hosts pro Netz', name: 'hosts', answer: '62' },
              { label: 'Netz von PC01, PC02', name: 'netz1', answer: '192.168.0.64/26' },
              { label: 'Netz von PC03 bis PC06', name: 'netz2', answer: '192.168.0.128/26' },
            ],
          },
          {
            question: {
              name: 'wer',
              lines: 3,
              text: 'Wie sieht es jetzt aus? Wer gehört mit wem zusammen?',
              answer: 'PC01 (.110) und PC02 (.120) liegen in 192.168.0.64/26 (64–127), PC03 bis PC06 (.130–.160) in 192.168.0.128/26 (128–191). Die Gruppen sind dieselben wie bei /25, die Netze aber halb so gross.',
            },
          },
          { check: 6 },
        ],
      },
    ],
  },
  {
    file: 'M06D_M117_UE04_Router02',
    block: 'Block 6: IP und Router',
    title: 'UE04: Router02',
    subtitle: 'Router verbinden Netze · Richtzeit 45 Minuten',
    entries: ['m117-ue04-a1', 'm117-ue04-a2'],
    projects: ['M06D_UE04_A1', 'M06D_UE04_A2'],
    intro: [
      { p: 'Ihr habt euch mit Subnetting und Switches auseinandergesetzt. Jetzt vertiefen wir den Router: Seine Hauptaufgabe ist es, **Datenpakete zwischen verschiedenen Netzen zu vermitteln und weiterzuleiten.**' },
    ],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag 1 – Ein Router verbindet Sursee und Zürich',
        stars: 2,
        catalog: 'UE04 Router02 – Auftrag 1: Ein Router verbindet Sursee und Zürich',
        blocks: [
          { p: 'Verkable beide Standorte mit ihrem Switch und die Switches mit dem Router. Verwende diese Einstellungen:' },
          {
            table: [
              ['Gerät', 'IP-Adresse', 'Subnetzmaske'],
              ['PC01 Sursee', '192.168.0.11', '255.255.255.0'],
              ['PC02 Sursee', '192.168.0.12', '255.255.255.0'],
              ['Router, Anschluss Sursee', '192.168.0.X', '255.255.255.0'],
              ['PC01 Zürich', '192.168.1.11', '255.255.255.0'],
              ['PC02 Zürich', '192.168.1.12', '255.255.255.0'],
              ['Router, Anschluss Zürich', '192.168.1.X', '255.255.255.0'],
            ],
            widths: [2, 1.5, 1.5],
          },
          {
            question: {
              name: 'routerip',
              text: 'Richte die Anschlüsse des Routers auf beiden Seiten ein. Welche IP-Adressen hast du gewählt und warum?',
              answer: '192.168.0.1 und 192.168.1.1: Die kleinste Host-Adresse ist die übliche Wahl für das Gateway. Sie ist leicht zu merken und kollidiert nicht mit den PCs. Möglich ist jede freie Adresse im jeweiligen Netz.',
            },
          },
          {
            question: {
              name: 'erfolg',
              lines: 3,
              text: 'Pinge die PCs am eigenen und am anderen Standort an. Bist du erfolgreich? Was gibt es bei dieser Konfiguration zu beachten?',
              answer: 'Am eigenen Standort sofort. Zum anderen Standort erst, wenn bei jedem PC das Standardgateway eingetragen ist (192.168.0.1 bzw. 192.168.1.1). Der Router kennt beide Netze direkt und braucht keine Routen.',
            },
          },
          { check: 6 },
        ],
      },
      {
        id: 'a2',
        heading: 'Auftrag 2 – Zwei Router mit Transfernetz',
        stars: 3,
        catalog: 'UE04 Router02 – Auftrag 2: Zwei Router mit Transfernetz',
        blocks: [
          { p: 'Wir erweitern das Netz mit einem zweiten Router. Die Netze von Sursee und Zürich bleiben; die Router-Anschlüsse ins LAN bekommen die kleinste Adresse (.1). Zwischen den Routern liegt ein sogenanntes **Transfernetz**:' },
          {
            table: [
              ['Router', 'Transfernetz', 'Adresse'],
              ['Router 01', '172.16.0.0/30', '172.16.0.1'],
              ['Router 02', '172.16.0.0/30', '172.16.0.2'],
            ],
            widths: [1, 1, 1],
          },
          { fields: netFields('', { net: '172.16.0.0/30', first: '172.16.0.1', last: '172.16.0.2', bc: '172.16.0.3', hosts: '2' }) },
          {
            question: {
              name: 'warum30',
              text: 'Warum genügt für ein Transfernetz ein /30?',
              answer: 'Zwischen zwei Routern braucht es genau zwei Adressen. Ein /30 hat vier Adressen: Netz, zwei Hosts, Broadcast. So wird kein Adressraum verschwendet.',
            },
          },
          {
            question: {
              name: 'routing',
              lines: 3,
              text: 'Was braucht es zusätzlich, damit Sursee Zürich erreicht? Wie hast du es gelöst?',
              answer: 'Router 01 kennt das Netz 192.168.1.0/24 nicht direkt (und Router 02 nicht 192.168.0.0/24). Lösung: bei beiden Routern automatisches Routing einschalten oder statische Routen eintragen: Router 01: 192.168.1.0/24 über 172.16.0.2, Router 02: 192.168.0.0/24 über 172.16.0.1.',
            },
          },
          { check: 5 },
        ],
      },
    ],
  },
  {
    file: 'M06E_M117_UE05_Router03',
    block: 'Block 6: IP und Router',
    title: 'UE05: Router03',
    subtitle: 'Drei Standorte mit Standleitungen · Richtzeit 90 Minuten',
    entries: ['m117-ue05'],
    projects: ['M06E_UE05'],
    sections: [
      {
        id: 'netz',
        heading: 'Auftrag – Netz mit drei Standorten',
        stars: 4,
        catalog: 'UE05 Router03: Drei Standorte mit Standleitungen',
        blocks: [
          { p: 'Wir erstellen ein neues Netz mit drei Standorten. Von jedem Standort ist eine Adresse aus seinem Netz bekannt:' },
          {
            table: [
              ['Standort', 'Farbe', 'Adresse aus dem Netz'],
              ['Sursee', 'grün', '192.168.1.44/25'],
              ['Luzern', 'blau', '10.125.113.13/28'],
              ['Zürich', 'orange', '172.20.13.57/24'],
            ],
            widths: [1, 1, 2],
          },
          {
            list: [
              'Jeder Standort hat **3 Notebooks** mit fester Adresse («Notebook Sursee 1» bis «Notebook Sursee 3»), einen **Switch** («Switch Sursee») und einen **Router** («Router Sursee»); ebenso für Luzern und Zürich.',
              'Router-Anschlüsse ins LAN erhalten immer die **kleinste Host-Adresse**.',
              'Die Router sind über **Standleitungen** (Transportnetze /30) verbunden, siehe Tabelle. Routing: «Automatisches Routing».',
              'Dokumentation: Jeder Standort ist ein farbiger **Bereich** mit seinem Netz (Feld «Netz (CIDR)»). leyoNET zeigt dann Maske, kleinsten und grössten Host, Broadcast und Anzahl Hosts. Die Router-Schnittstellen mit Adresse im CIDR-Format blendest du unter **Ansicht** ein.',
            ],
          },
          {
            table: [
              ['Standleitung', 'Netz', 'erster Router', 'zweiter Router'],
              ['Sursee – Luzern', '172.31.0.0/30', 'Sursee .1', 'Luzern .2'],
              ['Sursee – Zürich', '172.31.0.4/30', 'Sursee .5', 'Zürich .6'],
              ['Luzern – Zürich', '172.31.0.8/30', 'Luzern .9', 'Zürich .10'],
            ],
            widths: [1.4, 1.3, 1, 1],
          },
          { h: 'Netzinfos berechnen: Sursee' },
          { fields: [...siteFields('su_', { net: '192.168.1.0/25', mask: '255.255.255.128', first: '192.168.1.1', last: '192.168.1.126', bc: '192.168.1.127', hosts: '126' }), { label: 'Router (LAN)', name: 'su_router', answer: '192.168.1.1/25' }] },
          { h: 'Netzinfos berechnen: Luzern' },
          { fields: [...siteFields('lu_', { net: '10.125.113.0/28', mask: '255.255.255.240', first: '10.125.113.1', last: '10.125.113.14', bc: '10.125.113.15', hosts: '14' }), { label: 'Router (LAN)', name: 'lu_router', answer: '10.125.113.1/28' }] },
          { h: 'Netzinfos berechnen: Zürich' },
          { fields: [...siteFields('zh_', { net: '172.20.13.0/24', mask: '255.255.255.0', first: '172.20.13.1', last: '172.20.13.254', bc: '172.20.13.255', hosts: '254' }), { label: 'Router (LAN)', name: 'zh_router', answer: '172.20.13.1/24' }] },
          {
            question: {
              name: 'luzern',
              text: 'Luzern hat nur ein /28. Reicht das für den Standort? Begründe.',
              answer: 'Ja: Ein /28 hat 14 Hosts. Gebraucht werden 3 Notebooks und der Router, also 4. Es bleiben 10 Adressen für weitere Geräte.',
            },
          },
          { check: 15 },
        ],
      },
    ],
  },
  {
    file: 'M07A_M117_UE01_Netzwerkdienste',
    block: 'Block 7: Netzwerkdienste',
    title: 'UE01 Netzwerkdienste: Firmennetzwerk aufbauen I',
    subtitle: 'Routing und DHCP · Richtzeit 90 Minuten',
    entries: ['m117-m07a'],
    projects: ['M07A_UE01'],
    sections: [
      {
        id: 'dhcp',
        heading: 'Auftrag – Firmennetz der Watch SA mit DHCP',
        stars: 3,
        catalog: 'UE01 Netzwerkdienste: Firmennetz Watch SA mit DHCP',
        blocks: [
          { p: 'Die Firma Watch SA hat drei Standorte in der Schweiz, die über Router verbunden sind. Jeder Standort hat einen eigenen **DHCP-Server**, der die Adressen an seinem Standort vergibt. Ziel: das Routing vertiefen und neu einen DHCP-Server einbinden.' },
          {
            table: [
              ['Standort', 'Netz', 'Router', 'Server (DHCP)', 'DHCP-Bereich'],
              ['Bern', '192.168.10.0/24', '192.168.10.1', '192.168.10.10', '192.168.10.100 – 199'],
              ['Basel', '192.168.20.0/24', '192.168.20.1', '192.168.20.10', '192.168.20.100 – 199'],
              ['Locarno', '192.168.30.0/24', '192.168.30.1', '192.168.30.10', '192.168.30.100 – 199'],
            ],
            widths: [1, 1.4, 1.2, 1.3, 1.7],
          },
          {
            table: [
              ['Standleitung (WAN)', 'Netz', 'Adressen'],
              ['Router Bern – Router Basel', '172.16.50.0/30', 'Bern .1, Basel .2'],
              ['Router Bern – Router Locarno', '172.16.51.0/30', 'Bern .1, Locarno .2'],
              ['Router Basel – Router Locarno', '172.16.52.0/30', 'Basel .1, Locarno .2'],
            ],
            widths: [2, 1.3, 1.5],
          },
          {
            list: [
              'Die Gerätenamen sind im Startnetz vorgegeben (z.B. «Server Bern», «SWBE01», «WSBE01»); ändere sie nicht.',
              'Die Router brauchen diesmal **drei Anschlüsse** (Erweitert » Anschlüsse).',
              'Der Router (Gateway) bekommt die kleinste Adresse im LAN, der Server x.y.z.10.',
              'Der DHCP-Server vergibt x.y.z.100 bis x.y.z.199 und gibt das Gateway mit; die Notebooks beziehen ihre Adresse automatisch.',
              'Routing: «Automatisches Routing» bei allen drei Routern.',
            ],
          },
          { p: 'Starte die Simulation und prüfe: Von jedem Notebook muss ein Notebook an einem anderen Standort per Ping erreichbar sein.' },
          { h: 'DHCP verstehen' },
          {
            question: {
              name: 'dora',
              text: 'Welche vier Nachrichten tauschen Client und DHCP-Server aus? Nenne sie in der richtigen Reihenfolge (Paketliste, Filter «dhcp»).',
              answer: 'DHCP Discover, Offer, Request, Ack (DORA).',
            },
          },
          {
            question: {
              name: 'ipconfig',
              text: 'Welche Einstellungen erhält WSBE01 vom DHCP-Server? Lies sie mit **ipconfig /all** ab.',
              answer: 'IP-Adresse aus 192.168.10.100–199 (die erste ist 192.168.10.100), Subnetzmaske 255.255.255.0, Standardgateway 192.168.10.1, DHCP-Server 192.168.10.10.',
            },
          },
          {
            question: {
              name: 'vorteile',
              text: 'Nenne zwei Vorteile eines DHCP-Servers.',
              answer: 'Keine manuelle Konfiguration der Geräte; keine doppelten Adressen; zentrale Verwaltung von Gateway und DNS; Geräte lassen sich einfach hinzufügen oder entfernen.',
            },
          },
          {
            question: {
              name: 'standort',
              lines: 3,
              text: 'Warum braucht jeder Standort einen eigenen DHCP-Server? Wie ginge es auch mit einem einzigen?',
              answer: 'Die erste Anfrage (Discover) ist ein Broadcast, und Router leiten Broadcasts nicht weiter. Sie erreicht also nur Server im eigenen Netz. Mit einem DHCP-Relay auf den Routern könnte ein zentraler Server alle Standorte versorgen.',
            },
          },
          { check: 18 },
        ],
      },
    ],
  },
  {
    file: 'M07B_M117_UE02_Netzwerkdienste',
    block: 'Block 7: Netzwerkdienste',
    title: 'UE02 Netzwerkdienste: Firmennetzwerk aufbauen II',
    subtitle: 'Webserver, DNS und feste Zuweisungen · Richtzeit 90 Minuten',
    entries: ['m117-m07b'],
    projects: ['M07B_UE02'],
    sections: [
      {
        id: 'dns',
        heading: 'Auftrag – Intranet mit Webserver und DNS',
        stars: 4,
        catalog: 'UE02 Netzwerkdienste: Webserver, DNS und feste Zuweisungen',
        blocks: [
          { p: 'Das Firmennetz aus UE01 ist fertig und in leyoNET als Startnetz vorbereitet. Heute kommen ein **Webserver** und an allen Standorten ein **DNS-Server** dazu, damit jeder Standort die firmeneigene Webseite im Intranet erreicht.' },
          {
            list: [
              'Am Standort Bern steht ein Webserver in einer eigenen Zone **Intranet 10.10.10.0/24**: Router Bern bekommt einen zusätzlichen Anschluss mit 10.10.10.1/24, der Webserver 10.10.10.10/24 (mit Gateway).',
              'Die Server x.y.z.10 werden zusätzlich **DNS-Server** (DHCP und DNS auf demselben Server). A-Eintrag: **watch-sa.example** » 10.10.10.10.',
              'Der DHCP-Server gibt den DNS-Server an die Notebooks weiter. Trage ihn auch beim Server selbst ein.',
              'In jedem Netz kommt eine dritte Workstation dazu (**WSBE03, WSBS03, WSLO03**). Sie erhält per DHCP immer **x.y.z.200** (DHCP-Server » «Feste Zuweisungen», erkannt an der MAC-Adresse).',
              'Dokumentation: Bereiche mit ihrem Netz in den Farben Bern **grün**, Basel **rot**, Locarno **gelb**, Intranet **violett**. Router-Schnittstellen im CIDR-Format einblenden (Ansicht).',
              'Bonus (freiwillig): eine eigene Startseite für die Firma (index.html des Webservers anpassen).',
            ],
          },
          { p: 'Prüfe im Webbrowser der Notebooks: Die Webseite muss über die IP-Adresse **und** über den Namen erreichbar sein.' },
          { h: 'Fragen' },
          {
            question: {
              name: 'ablauf',
              lines: 4,
              text: 'Was macht ein DNS-Server? Beschreibe, was passiert, wenn WSBS02 die Adresse http://watch-sa.example/ aufruft.',
              answer: 'Er übersetzt Namen in IP-Adressen. WSBS02 fragt seinen DNS-Server 192.168.20.10 nach watch-sa.example und erhält 10.10.10.10. Dann baut der Browser eine TCP-Verbindung zu 10.10.10.10, Port 80, auf und holt die Seite mit HTTP GET.',
            },
          },
          {
            question: {
              name: 'fehler',
              lines: 3,
              text: 'Die Webseite klappt mit http://10.10.10.10/, aber nicht mit dem Namen. Nenne zwei mögliche Ursachen.',
              answer: 'Der A-Eintrag fehlt oder ist falsch geschrieben; der DNS-Dienst ist nicht eingeschaltet; das Notebook kennt keinen DNS-Server (DHCP gibt ihn nicht mit oder die Adresse wurde noch nicht neu bezogen).',
            },
          },
          {
            question: {
              name: 'gateway',
              text: 'Warum braucht der Webserver ein Standardgateway?',
              answer: 'Seine Antworten gehen in andere Netze (192.168.x.0/24). Ohne Gateway weiss er nicht, wohin er sie schicken soll.',
            },
          },
          {
            question: {
              name: 'fest',
              lines: 3,
              text: 'Wozu dient eine feste Zuweisung über DHCP, und woran erkennt der DHCP-Server das Gerät?',
              answer: 'Das Gerät erhält immer dieselbe Adresse (z.B. Drucker, Server, Arbeitsplatz der Chefin) und wird trotzdem zentral über DHCP verwaltet. Erkannt wird es an seiner MAC-Adresse.',
            },
          },
          { fields: [{ label: 'MAC-Adresse von WSBE03', name: 'mac', answer: 'je nach Netz (Reiter Anschlüsse)', wide: true }] },
          { check: 19 },
        ],
      },
    ],
  },
  {
    file: 'M07C_M117_UE03_Netzwerkdienste',
    block: 'Block 7: Netzwerkdienste',
    title: 'UE03 Netzwerkdienste: Firmennetzwerk aufbauen III',
    subtitle: 'Prüfungsvorbereitung: Firmennetz der Holzer AG · Richtzeit 80 Minuten',
    entries: ['m117-m07c'],
    projects: ['M07C_UE03'],
    sections: [
      {
        id: 'holzer',
        heading: 'Auftrag – Netzwerkkonzept der Holzer AG umsetzen',
        stars: 5,
        catalog: 'UE03 Netzwerkdienste: Firmennetz Holzer AG (Prüfungsvorbereitung)',
        blocks: [
          { p: 'Die Firma Holzer AG mit Sitz in Sarnen eröffnet zwei Filialen. Ein Ingenieurbüro hat das Netzwerkkonzept erstellt; es ist genehmigt. Als Netzwerkspezialistin oder Netzwerkspezialist setzt du es um, dokumentierst es und nimmst es in Betrieb. Die Übung ist aufgebaut wie die praktische Prüfung: **75 Punkte, Note = 5 × Punkte / 75 + 1.**' },
          {
            table: [
              ['Standort', 'Netz', 'DHCP-Server', 'DHCP-Bereich', 'Notebooks'],
              ['Sarnen (Hauptsitz)', '10.33.0.0/22', 'DHCP Sarnen 10.33.0.10', '10.33.1.0 – 10.33.2.255', '3 dynamisch, 1 fest: 10.33.0.100'],
              ['Sempach', '10.14.12.0/25', 'DHCP Sempach 10.14.12.10', '10.14.12.50 – 10.14.12.100', '2 dynamisch, 2 fest: .120, .121'],
              ['Luzern', '10.40.90.0/24', 'DHCP Luzern 10.40.90.10', '10.40.90.100 – 10.40.90.200', '5 dynamisch, 3 fest: .250, .251, .252'],
            ],
            widths: [1.3, 1.2, 1.5, 1.6, 1.8],
          },
          {
            list: [
              'Namen: Switch **SW_<Standort>**, Router **R_<Standort>** (tiefste Adresse im Netz), Server **DHCP <Standort>**. Die Notebooks heissen wie ihre IP-Adresse, z.B. «10.33.1.0».',
              'Dynamische Notebooks beziehen ihre Adresse per DHCP, feste über eine **feste Zuweisung** im DHCP-Server (MAC-Adresse).',
              'Transportnetze: R_Sarnen – R_Sempach **10.10.10.0/30**, R_Sarnen – R_Luzern **10.10.10.4/30**, R_Luzern – R_Sempach **10.10.10.8/30** (zuerst genannter Router .1). Routing: «Automatisches Routing».',
              'Intranet **192.168.0.0/24** am R_Luzern (zusätzlicher Anschluss 192.168.0.1), Webserver «Webserver» 192.168.0.10.',
              'Auf allen DHCP-Servern läuft auch DNS mit dem A-Eintrag **intranet.holzer.example** » 192.168.0.10; der DHCP-Server gibt den DNS-Server mit.',
              'Bereiche mit Netz: Sarnen **blau**, Sempach **rot**, Luzern **grün**, Intranet **orange**. In die **Notiz** jedes Standorts gehören Netzadresse, Maske, kleinster und grösster Host, Broadcast und Anzahl Hosts (wird mitbewertet). Router-Schnittstellen im CIDR-Format einblenden (Ansicht).',
              'Tipp: Luzern braucht einen Switch mit mehr als 8 Anschlüssen.',
            ],
          },
          { h: 'Dokumentation Sarnen' },
          { fields: siteFields('sa_', { net: '10.33.0.0/22', mask: '255.255.252.0', first: '10.33.0.1', last: '10.33.3.254', bc: '10.33.3.255', hosts: '1022' }) },
          { h: 'Dokumentation Sempach' },
          { fields: siteFields('se_', { net: '10.14.12.0/25', mask: '255.255.255.128', first: '10.14.12.1', last: '10.14.12.126', bc: '10.14.12.127', hosts: '126' }) },
          { h: 'Dokumentation Luzern' },
          { fields: siteFields('lu_', { net: '10.40.90.0/24', mask: '255.255.255.0', first: '10.40.90.1', last: '10.40.90.254', bc: '10.40.90.255', hosts: '254' }) },
          {
            question: {
              name: 'host0',
              text: 'Der DHCP-Bereich von Sarnen beginnt bei 10.33.1.0. Ist das eine gültige Host-Adresse? Begründe.',
              answer: 'Ja. Im Netz 10.33.0.0/22 sind nur 10.33.0.0 (Netzadresse) und 10.33.3.255 (Broadcast) reserviert. 10.33.1.0 liegt dazwischen und ist ein normaler Host.',
            },
          },
          { check: { points: 75 } },
        ],
      },
    ],
  },
  ...M129_SHEETS,
];
