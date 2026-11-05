// Arbeitsblätter zu den Katalog-Übungen «Modul 129» (catalogM129.ts).
// Aufbau wie inhalt.mjs: `answer` steht nur in der Musterlösung (_mL.pdf).
// Nur Zeichen aus WinAnsi verwenden (keine Pfeile).

const M129 = { module: 'Modul 129', series: 'M129' };

const subnetFields = (prefix, s) => [
  { label: 'Netzadresse mit CIDR', name: `${prefix}netz`, answer: s.net },
  { label: 'Subnetzmaske', name: `${prefix}maske`, answer: s.mask },
  { label: 'Kleinster Host', name: `${prefix}min`, answer: s.first },
  { label: 'Grösster Host', name: `${prefix}max`, answer: s.last },
  { label: 'Broadcast', name: `${prefix}bc`, answer: s.bc },
  { label: 'Router (Gateway)', name: `${prefix}router`, answer: s.router },
];

export const M129_SHEETS = [
  // --- UE01 Subnetting ---------------------------------------------------------------------
  {
    ...M129,
    file: 'M129_UE01_Subnetting',
    block: 'IP-Subnetting',
    title: 'UE01: IP-Subnetting',
    subtitle: 'Netze aufteilen, nach Bedarf planen, Fehler finden · Richtzeit 90 Minuten',
    entries: ['m129-sub-a1', 'm129-sub-a2', 'm129-sub-a3'],
    projects: ['M129_UE01_A1', 'M129_UE01_A2', 'M129_UE01_A3'],
    intro: [
      { p: 'Ein Unternehmen bekommt meist einen einzigen Adressblock. Mit **Subnetting** teilt man ihn in kleinere Netze auf: Jede Abteilung erhält ihr eigenes Netz, der Router verbindet sie. Dazu «leiht» man Bits aus dem Host-Teil der Adresse für den Netz-Teil.' },
      { tip: 'Hilfsmittel in leyoNET: Werkzeuge » Subnetzrechner. Rechne zuerst selbst und kontrolliere danach.' },
    ],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag 1 – Vier gleich grosse Subnetze',
        stars: 2,
        catalog: 'UE01 Subnetting – Auftrag 1: Vier gleich grosse Subnetze',
        blocks: [
          { p: 'Die Firma erhält das Netz **192.168.40.0/24** und braucht vier gleich grosse Subnetze, in dieser Reihenfolge: Verwaltung, Produktion, Verkauf, Lager. Kabel und Geräte sind im Startnetz vorbereitet.' },
          {
            list: [
              'Der Router («Router Firma») erhält in jedem Subnetz die **kleinste Host-Adresse**.',
              'Die beiden PCs einer Abteilung erhalten die Adressen **.10 und .11 im Subnetz** (Beispiel Produktion: 64 + 10 = 192.168.40.74 und .75).',
              'Gateway der PCs ist der Router-Anschluss in ihrem Subnetz.',
            ],
          },
          { h: 'Vorüberlegung' },
          {
            fields: [
              { label: 'Geliehene Bits', name: 'bits', answer: '2 (2 hoch 2 = 4 Subnetze)' },
              { label: 'Neue Präfixlänge', name: 'prefix', answer: '/26' },
              { label: 'Adressen pro Subnetz', name: 'adressen', answer: '64' },
              { label: 'Hosts pro Subnetz', name: 'hosts', answer: '62' },
            ],
          },
          { h: 'Verwaltung' },
          { fields: subnetFields('vw_', { net: '192.168.40.0/26', mask: '255.255.255.192', first: '192.168.40.1', last: '192.168.40.62', bc: '192.168.40.63', router: '192.168.40.1' }) },
          { h: 'Produktion' },
          { fields: subnetFields('pr_', { net: '192.168.40.64/26', mask: '255.255.255.192', first: '192.168.40.65', last: '192.168.40.126', bc: '192.168.40.127', router: '192.168.40.65' }) },
          { h: 'Verkauf' },
          { fields: subnetFields('vk_', { net: '192.168.40.128/26', mask: '255.255.255.192', first: '192.168.40.129', last: '192.168.40.190', bc: '192.168.40.191', router: '192.168.40.129' }) },
          { h: 'Lager' },
          { fields: subnetFields('la_', { net: '192.168.40.192/26', mask: '255.255.255.192', first: '192.168.40.193', last: '192.168.40.254', bc: '192.168.40.255', router: '192.168.40.193' }) },
          { h: 'In der Simulation' },
          {
            question: {
              name: 'gateway',
              lines: 3,
              text: 'Entferne bei einem PC kurz das Gateway und pinge einen PC in einer anderen Abteilung. Was meldet die Eingabeaufforderung, und warum?',
              answer: 'Der Ping scheitert (Ziel nicht erreichbar bzw. kein Weg). Der PC erkennt an seiner Maske, dass das Ziel in einem anderen Subnetz liegt. Ohne Gateway weiss er nicht, wohin er das Paket schicken soll.',
            },
          },
          {
            question: {
              name: 'broadcast',
              text: 'Warum darf ein PC der Produktion nicht die Adresse 192.168.40.127 erhalten?',
              answer: '192.168.40.127 ist die Broadcast-Adresse des Subnetzes 192.168.40.64/26. Sie spricht alle Geräte im Subnetz an und ist für Hosts nicht verwendbar.',
            },
          },
          { check: 12 },
        ],
      },
      {
        id: 'a2',
        heading: 'Auftrag 2 – Subnetze nach Bedarf (VLSM)',
        stars: 4,
        catalog: 'UE01 Subnetting – Auftrag 2: Subnetze nach Bedarf (VLSM)',
        blocks: [
          { p: 'Gleich grosse Subnetze verschwenden oft Adressen. Mit **VLSM** (Variable Length Subnet Mask) bekommt jedes Netz genau die Grösse, die es braucht. Aus **10.20.0.0/24** sollen entstehen:' },
          {
            table: [
              ['Netz', 'Benötigte Hosts', 'Router-Anschluss', 'PC'],
              ['Schulung', '100', 'Router A', '10.20.0.10'],
              ['Büro', '50', 'Router A', '10.20.0.138'],
              ['Labor', '20', 'Router B', '10.20.0.202'],
              ['Transfer Router A – Router B', '2', 'A: .225, B: .226', '–'],
            ],
            widths: [2, 1.2, 1.5, 1.2],
          },
          { tip: 'Vorgehen: Netze nach Grösse sortieren und lückenlos ab 10.20.0.0 vergeben, das grösste zuerst. Die Router-Anschlüsse ins LAN erhalten die kleinste Host-Adresse.' },
          { h: 'Schulung (100 Hosts)' },
          { fields: subnetFields('sch_', { net: '10.20.0.0/25', mask: '255.255.255.128', first: '10.20.0.1', last: '10.20.0.126', bc: '10.20.0.127', router: '10.20.0.1' }) },
          { h: 'Büro (50 Hosts)' },
          { fields: subnetFields('bu_', { net: '10.20.0.128/26', mask: '255.255.255.192', first: '10.20.0.129', last: '10.20.0.190', bc: '10.20.0.191', router: '10.20.0.129' }) },
          { h: 'Labor (20 Hosts)' },
          { fields: subnetFields('lab_', { net: '10.20.0.192/27', mask: '255.255.255.224', first: '10.20.0.193', last: '10.20.0.222', bc: '10.20.0.223', router: '10.20.0.193' }) },
          { h: 'Transfernetz' },
          {
            fields: [
              { label: 'Netzadresse mit CIDR', name: 'tr_netz', answer: '10.20.0.224/30' },
              { label: 'Broadcast', name: 'tr_bc', answer: '10.20.0.227' },
              { label: 'Router A', name: 'tr_a', answer: '10.20.0.225' },
              { label: 'Router B', name: 'tr_b', answer: '10.20.0.226' },
            ],
          },
          {
            question: {
              name: 'frei',
              text: 'Welcher Adressbereich ist danach noch frei? Wie viele Adressen sind das?',
              answer: '10.20.0.228 bis 10.20.0.255, also 28 Adressen (z.B. als 10.20.0.228/30, 10.20.0.232/29 und 10.20.0.240/28 nutzbar).',
            },
          },
          {
            question: {
              name: 'reihenfolge',
              lines: 3,
              text: 'Warum vergibt man die Netze von gross nach klein? Was könnte passieren, wenn man mit dem Labor beginnt?',
              answer: 'Ein Netz muss an einer Grenze beginnen, die durch seine Grösse teilbar ist (ein /25 bei .0 oder .128). Beginnt man mit kleinen Netzen, entstehen Lücken, und das /25 passt eventuell nicht mehr hinein. Gross zuerst vergeben lässt keine Lücken.',
            },
          },
          {
            question: {
              name: 'routing',
              text: 'Was braucht es, damit PC Labor den PC Schulung erreicht?',
              answer: 'Router A kennt das Labor-Netz nicht direkt, Router B die Netze Schulung und Büro nicht. Lösung: automatisches Routing oder statische Routen (Router A: 10.20.0.192/27 über 10.20.0.226; Router B: Standardroute über 10.20.0.225).',
            },
          },
          { check: 9 },
        ],
      },
      {
        id: 'a3',
        heading: 'Auftrag 3 – Fehlersuche im Firmennetz',
        stars: 3,
        catalog: 'UE01 Subnetting – Auftrag 3: Fehlersuche im Firmennetz',
        blocks: [
          { p: 'Das Netz aus Auftrag 1 ist aufgebaut, doch einige PCs erreichen sich nicht. Bei den PCs sind **vier Einstellungen falsch**; Router und Kabel stimmen. Gehe systematisch vor: Zuerst die Warnungen in leyoNET beachten, dann mit **ipconfig** die Einstellungen lesen, mit **ping** testen und die Adressen mit dem Subnetzrechner prüfen.' },
          { h: 'Gefundene Fehler' },
          {
            fields: [
              { label: 'Fehler 1: Gerät', name: 'f1_geraet', answer: 'PC Verwaltung 2', wide: true },
              { label: 'Was ist falsch?', name: 'f1_fehler', answer: 'Adresse 192.168.40.10 doppelt', wide: true },
              { label: 'Fehler 2: Gerät', name: 'f2_geraet', answer: 'PC Produktion 2', wide: true },
              { label: 'Was ist falsch?', name: 'f2_fehler', answer: 'Maske /24 statt /26', wide: true },
              { label: 'Fehler 3: Gerät', name: 'f3_geraet', answer: 'PC Verkauf 1', wide: true },
              { label: 'Was ist falsch?', name: 'f3_fehler', answer: 'Gateway 192.168.40.1 (Netz Verwaltung)', wide: true },
              { label: 'Fehler 4: Gerät', name: 'f4_geraet', answer: 'PC Lager 2', wide: true },
              { label: 'Was ist falsch?', name: 'f4_fehler', answer: 'Adresse .50 liegt im Netz Verwaltung', wide: true },
            ],
          },
          { h: 'Korrekturen' },
          {
            fields: [
              { label: 'PC Verwaltung 2', name: 'k1', answer: '192.168.40.11/26' },
              { label: 'PC Produktion 2', name: 'k2', answer: 'Maske 255.255.255.192' },
              { label: 'PC Verkauf 1', name: 'k3', answer: 'Gateway 192.168.40.129' },
              { label: 'PC Lager 2', name: 'k4', answer: '192.168.40.203/26' },
            ],
          },
          {
            question: {
              name: 'maske',
              lines: 3,
              text: 'PC Produktion 2 mit Maske /24 erreicht die anderen Abteilungen nicht, obwohl Adresse und Gateway stimmen. Erkläre warum.',
              answer: 'Mit /24 hält er das ganze Netz 192.168.40.0 bis 255 für sein eigenes. Ziele in den anderen Abteilungen spricht er darum direkt per ARP an statt über das Gateway. Diese Geräte liegen aber hinter dem Router, und ARP geht nicht durch den Router: Es kommt keine Antwort.',
            },
          },
          {
            question: {
              name: 'werkzeuge',
              text: 'Welche Werkzeuge und Hinweise haben dir bei der Suche am meisten geholfen?',
              answer: 'Z.B. die Warnung «Adresse doppelt», ipconfig (Adresse, Maske, Gateway), ping zwischen den Abteilungen, der Subnetzrechner, die Paketliste mit ARP-Anfragen ohne Antwort.',
            },
          },
          { check: 5 },
        ],
      },
    ],
  },

  // --- UE02 Statisches Routing ---------------------------------------------------------------
  {
    ...M129,
    file: 'M129_UE02_Routing',
    block: 'Statisches Routing',
    title: 'UE02: Statisches Routing mit drei Routern',
    subtitle: 'Adressen, statische Routen, NAT und Verwaltungszugang · Richtzeit 2 × 90 Minuten',
    entries: ['m129-routing-a1', 'm129-routing-a2', 'm129-routing-a3'],
    projects: ['M129_UE02_A1', 'M129_UE02_A2', 'M129_UE02_A3'],
    intro: [
      { p: 'Drei Router verbinden vier Netze und führen ins Internet. Du richtest sie in leyoNET ein, im Fenster des Routers oder auf seiner **Befehlszeile** (Doppelklick auf den Router). Wichtig: **Router-Adressen werden immer fest eingetragen**, nie per DHCP, damit sie stets unter derselben Adresse erreichbar sind. Üblich ist die erste oder letzte Adresse des Netzes.' },
      {
        table: [
          ['Netz', 'Adressbereich', 'Router', 'Adresse'],
          ['LAN1', '192.168.1.0/24', 'Router1 eth0', '192.168.1.254/24'],
          ['LAN2 (Transfer)', '192.168.2.0/30', 'Router1 eth1 / Router2 eth1', '.1 / .2'],
          ['LAN3', '192.168.3.0/24', 'Router2 eth0', '192.168.3.254/24'],
          ['LAN4 (Transfer)', '172.16.12.80/28', 'Router2 eth2 / Router3 eth0', '.94 / .81'],
          ['Provider', '203.0.113.0/24', 'Router3 eth1 / Provider', '.1 / .2'],
          ['Verwaltung', '192.168.56.0/24', 'Router1/2/3', '.101 / .102 / .103'],
        ],
        widths: [1.3, 1.4, 1.9, 1.4],
      },
      { tip: 'Der Provider steht auf 203.0.113.2, der Webserver im Internet auf 198.51.100.10 (Adressen für Dokumentation, RFC 5737).' },
    ],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag 1 – Drei Router statisch verbinden',
        stars: 3,
        catalog: 'UE02 Routing – Auftrag 1: Drei Router statisch verbinden',
        blocks: [
          { p: 'Richte die Anschlüsse aller drei Router und die beiden PCs (PC LAN1 192.168.1.10, PC LAN3 192.168.3.10) ein. Trage danach **statische Routen** ein, kein automatisches Routing.' },
          { h: 'Transfernetze berechnen' },
          {
            fields: [
              { label: 'LAN2: Hosts', name: 'lan2_hosts', answer: '2 (.1 und .2)' },
              { label: 'LAN2: Broadcast', name: 'lan2_bc', answer: '192.168.2.3' },
              { label: 'LAN4: Hosts', name: 'lan4_hosts', answer: '14 (.81 bis .94)' },
              { label: 'LAN4: Broadcast', name: 'lan4_bc', answer: '172.16.12.95' },
            ],
          },
          { h: 'Befehlszeile: so geht es in leyoNET' },
          {
            table: [
              ['Schritt', 'Befehl in leyoNET'],
              ['Konfigurieren', 'enable, configure terminal'],
              ['Name', 'hostname Router1'],
              ['Adresse', 'interface eth0, ip address 192.168.1.254/24'],
              ['Statische Route', 'ip route 0.0.0.0/0 192.168.2.2'],
              ['Übernehmen', 'sofort wirksam (mit «end» zurück, Rückgängig mit Strg+Z)'],
              ['Kontrolle', 'show ip interface brief, show ip route'],
            ],
            widths: [1.4, 4],
          },
          { h: 'Statische Routen planen' },
          {
            fields: [
              { label: 'Router1', name: 'r1_route', answer: '0.0.0.0/0 (Standardroute) über 192.168.2.2', wide: true },
              { label: 'Router2', name: 'r2_route1', answer: '192.168.1.0/24 über 192.168.2.1', wide: true },
              { label: 'Router2', name: 'r2_route2', answer: '0.0.0.0/0 über 172.16.12.81', wide: true },
              { label: 'Router3', name: 'r3_route', answer: '192.168.1.0/24, 192.168.2.0/30 und 192.168.3.0/24 über 172.16.12.94', wide: true },
            ],
          },
          {
            question: {
              name: 'standard',
              lines: 3,
              text: 'Warum genügt bei Router1 eine einzige Route, während Router3 drei Routen braucht?',
              answer: 'Router1 hat nur einen Weg nach aussen: Alles, was nicht in seinen eigenen Netzen liegt, geht zu Router2 (Standardroute). Router3 dagegen hat zwei Richtungen: Die internen Netze liegen hinter Router2, alles andere im Internet. Darum braucht er für jedes interne Netz eine Route (oder eine Sammelroute) und für das Internet die Standardroute.',
            },
          },
          { h: 'Abnahme: Pings von den Routern (Befehlszeile «ping …»)' },
          {
            fields: [
              { label: 'Router1: ping 192.168.2.2', name: 'ab_r1a', answer: 'Antwort' },
              { label: 'Router1: ping 192.168.3.254', name: 'ab_r1b', answer: 'Antwort' },
              { label: 'Router1: ping 172.16.12.81', name: 'ab_r1c', answer: 'Antwort' },
              { label: 'Router2: ping 192.168.1.254', name: 'ab_r2a', answer: 'Antwort' },
              { label: 'Router3: ping 192.168.1.254', name: 'ab_r3a', answer: 'Antwort' },
              { label: 'Router3: ping 192.168.3.254', name: 'ab_r3b', answer: 'Antwort' },
            ],
          },
          { check: 11 },
        ],
      },
      {
        id: 'a2',
        heading: 'Auftrag 2 – Ins Internet mit NAT',
        stars: 4,
        catalog: 'UE02 Routing – Auftrag 2: Ins Internet mit NAT',
        blocks: [
          { p: 'Die LANs sollen ins Internet. Router3 braucht dafür eine **Standardroute zum Provider** (203.0.113.2) und muss die privaten Absenderadressen übersetzen: **Source-NAT mit Masquerade**, das heisst «nimm die Adresse des ausgehenden Anschlusses».' },
          {
            table: [
              ['Schritt', 'Befehl in leyoNET (Router3)'],
              ['Standardroute', 'ip route 0.0.0.0/0 203.0.113.2'],
              ['NAT (Masquerade)', 'interface eth1, ip nat outside'],
              ['Kontrolle', 'show ip route, show ip nat translations'],
            ],
            widths: [1.4, 4],
          },
          {
            question: {
              name: 'ohnenat',
              lines: 3,
              text: 'Setze zuerst nur die Standardroute (noch ohne NAT) und pinge von PC LAN1 den Webserver 198.51.100.10. Was passiert? Erkläre.',
              answer: 'Es kommt keine Antwort. Das Paket trägt die private Absenderadresse 192.168.1.10. Private Adressen (RFC 1918) werden im Internet nicht geroutet: Der Provider verwirft das Paket bzw. kennt keinen Weg zurück.',
            },
          },
          {
            fields: [
              { label: 'Absender, den der Webserver sieht', name: 'absender', answer: '203.0.113.1', wide: true },
            ],
          },
          {
            question: {
              name: 'masquerade',
              text: 'Wann ist «Masquerade» praktischer als eine feste Übersetzungsadresse?',
              answer: 'Wenn die öffentliche Adresse nicht fest ist, z.B. weil der Router sie vom Provider per DHCP erhält. Masquerade nimmt immer die aktuelle Adresse des ausgehenden Anschlusses.',
            },
          },
          { h: 'Abnahme: Pings ins Internet' },
          {
            fields: [
              { label: 'Router1: ping 198.51.100.10', name: 'in_r1', answer: 'Antwort' },
              { label: 'Router2: ping 198.51.100.10', name: 'in_r2', answer: 'Antwort' },
              { label: 'Router3: ping 198.51.100.10', name: 'in_r3', answer: 'Antwort' },
              { label: 'PC LAN3: http://198.51.100.10/', name: 'in_web', answer: 'Seite geladen' },
            ],
          },
          { check: 5 },
        ],
      },
      {
        id: 'a3',
        heading: 'Auftrag 3 – Verwaltungsnetz und SSH',
        stars: 3,
        catalog: 'UE02 Routing – Auftrag 3: Verwaltungsnetz und SSH',
        blocks: [
          { p: 'Router werden selten an der Konsole eingerichtet, sondern über das Netz. Dafür bekommen sie einen eigenen Anschluss in einem **Verwaltungsnetz** 192.168.56.0/24. Das Admin-Notebook (192.168.56.10/24) meldet sich per **SSH** an.' },
          {
            table: [
              ['Schritt', 'leyoNET (Befehlszeile)'],
              ['Anschluss', 'interface eth2, ip address 192.168.56.101/24 (Router2: eth3, .102; Router3: eth2, .103)'],
              ['Benutzer', 'username admin password …'],
              ['SSH einschalten', 'ip ssh, line vty, transport input ssh, login local'],
              ['Anmelden (Admin-Notebook)', 'ssh admin@192.168.56.101'],
            ],
            widths: [1.4, 4],
          },
          {
            question: {
              name: 'warum',
              lines: 3,
              text: 'Nenne zwei Gründe für ein eigenes Verwaltungsnetz.',
              answer: 'Die Verwaltung funktioniert auch, wenn das Routing der Nutzdaten gestört ist; Zugang nur aus einem geschützten Netz (Sicherheit); Verwaltungsverkehr stört den Nutzverkehr nicht; Geräte sind immer unter einer festen Adresse erreichbar.',
            },
          },
          {
            question: {
              name: 'ssh',
              text: 'Warum verwendet man SSH statt Telnet?',
              answer: 'SSH verschlüsselt die Verbindung samt Passwort. Bei Telnet geht alles im Klartext über das Netz und kann mitgelesen werden.',
            },
          },
          {
            fields: [
              { label: 'Befehl für die Routingtabelle', name: 'befehl', answer: 'show ip route' },
              { label: 'Next Hop Standardroute Router1', name: 'nexthop', answer: '192.168.2.2' },
            ],
          },
          { check: 6 },
        ],
      },
    ],
  },

  // --- UE03 Protokollanalyse -------------------------------------------------------------------
  {
    ...M129,
    file: 'M129_UE03_Protokollanalyse',
    block: 'Protokollanalyse',
    title: 'UE03: Protokollanalyse',
    subtitle: 'ICMP, TTL, DHCP, ARP, DNS und HTTP untersuchen · Richtzeit 3 × 45 Minuten',
    entries: ['m129-lab-a1', 'm129-lab-a2', 'm129-lab-a3'],
    projects: ['M129_UE03_A1', 'M129_UE03_A2', 'M129_UE03_A3'],
    intro: [
      { p: 'Ein **Netzwerkprotokoll** legt fest, in welchem Format und in welcher Reihenfolge Geräte Daten austauschen. Mit einem **Protokollanalysator** zeichnet man den Verkehr auf und untersucht jedes Paket Schicht für Schicht. In leyoNET ist das die **Paketliste** mit Filtern, OSI-Ansicht und Hex-Ansicht; sie zeichnet in der Simulation alles auf.' },
      { box: '**Rechtliches:** Netzwerkverkehr anderer Personen darf man nur mit deren Zustimmung mitschneiden. Wer ohne Wissen der Betroffenen aufzeichnet, verletzt ihre Persönlichkeitsrechte. In leyoNET ist das kein Problem: Alles ist simuliert.' },
      {
        table: [
          ['Gerät', 'Rolle', 'Adresse'],
          ['PC W11', 'Arbeitsplatz im Intranet', '192.168.1.11/24'],
          ['Server Intranet', 'DHCP und DNS fürs Intranet', '192.168.1.2/24'],
          ['Firewall', 'Router zwischen Intranet, DMZ und Internet (NAT)', '192.168.1.1 · 10.10.1.1 · 203.0.113.2'],
          ['Webserver DMZ', 'Webseite web.labor.example', '10.10.1.20/24'],
          ['Webserver News', 'Seite im Internet www.news.example', '198.51.100.10'],
        ],
        widths: [1.4, 2.6, 2],
      },
      { tip: 'Nur den Verkehr an einem bestimmten Gerät ansehen, z.B. an der Firewall: In der Paketliste mit «host Firewall» filtern. Jede Zeile zeigt, von welchem Gerät zu welchem das Paket gerade läuft.' },
    ],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag 1 – ICMP und TTL',
        stars: 2,
        catalog: 'UE03 Protokollanalyse – Auftrag 1: ICMP und TTL',
        blocks: [
          { p: 'Starte die Simulation. Pinge von PC W11 zuerst die Firewall (**ping 192.168.1.1**), dann den Webserver in der DMZ (**ping 10.10.1.20**). Filtere die Paketliste mit **icmp** und klicke ein Paket an.' },
          {
            question: {
              name: 'schicht',
              text: 'Auf welcher Schicht zeigt die OSI-Ansicht ICMP an? Wie ist ICMP verpackt?',
              answer: 'Auf Schicht 3 (Vermittlung). ICMP ist im Datenteil eines IPv4-Pakets verpackt (Protokollnummer 1), das wiederum in einem Ethernet-Rahmen steckt. Darum zählt man ICMP mal zu Schicht 3, mal zu Schicht 4.',
            },
          },
          {
            question: {
              name: 'protokolle',
              text: 'Welche Protokolle sind an einem Ping beteiligt? Denke auch an das, was vor dem ersten Echo Request passiert.',
              answer: 'ARP (Adresse des Nachbarn bzw. Gateways auflösen), dann ICMP Echo Request und Echo Reply in IPv4 in Ethernet.',
            },
          },
          {
            fields: [
              { label: 'EtherType im Ethernet-Kopf', name: 'ethertype', answer: '0x0800 (IPv4)' },
              { label: 'Protokoll im IPv4-Kopf', name: 'ipproto', answer: '1 (ICMP)' },
              { label: 'Grösse der Ping-Daten', name: 'daten', answer: '32 Bytes' },
              { label: 'ICMP-Nachricht gesamt', name: 'icmplen', answer: '40 Bytes (8 Kopf + 32 Daten)' },
            ],
          },
          {
            question: {
              name: 'andere',
              text: 'Welche anderen Werte kennst du im Feld «Protokoll» des IPv4-Kopfs? Entferne den Filter und schau dir andere Pakete an.',
              answer: '6 = TCP, 17 = UDP, 89 = OSPF, 50 = ESP (IPsec).',
            },
          },
          {
            question: {
              name: 'dns',
              text: 'Ist DNS ein Protokoll der Schicht 4?',
              answer: 'Nein. DNS ist ein Protokoll der Anwendungsschicht (Schicht 7). Es nutzt UDP auf Port 53 (bei grossen Antworten TCP) als Transport.',
            },
          },
          { h: 'TTL über die Firewall' },
          { p: 'Vergleiche denselben Echo Request an zwei Stellen: im Intranet (PC W11 » Switch Intranet) und in der DMZ (Firewall » Switch DMZ). Filter: **ip.dst == 10.10.1.20**' },
          {
            fields: [
              { label: 'TTL im Intranet', name: 'ttl1', answer: '64' },
              { label: 'TTL in der DMZ', name: 'ttl2', answer: '63' },
            ],
          },
          {
            question: {
              name: 'unterschied',
              lines: 3,
              text: 'Was ist an diesem Paket nach der Firewall sonst noch anders, was gleich geblieben?',
              answer: 'Anders: Quell- und Ziel-MAC-Adresse (neuer Rahmen auf dem neuen Abschnitt), TTL um 1 kleiner und darum auch die Prüfsumme im IPv4-Kopf. Gleich: Quell- und Ziel-IP-Adresse (zwischen Intranet und DMZ gibt es kein NAT) und die ICMP-Daten.',
            },
          },
          {
            question: {
              name: 'ttlzweck',
              text: 'Wozu dient die TTL? Was passiert, wenn sie 0 erreicht?',
              answer: 'Sie verhindert, dass Pakete bei einem Routing-Fehler endlos kreisen. Jeder Router zieht 1 ab; bei 0 verwirft er das Paket und meldet «Time Exceeded» an den Absender. tracert nutzt genau das.',
            },
          },
          { tip: 'Windows beginnt mit TTL 128, Linux und leyoNET mit 64. An der TTL einer Antwort lässt sich darum oft das Betriebssystem erraten.' },
          { check: 6 },
        ],
      },
      {
        id: 'a2',
        heading: 'Auftrag 2 – DHCP',
        stars: 3,
        catalog: 'UE03 Protokollanalyse – Auftrag 2: DHCP',
        blocks: [
          { p: 'Das Notebook Gast hat noch keine Adresse. Stelle es auf **automatisch (DHCP)**, starte die Simulation und filtere die Paketliste mit **dhcp**.' },
          {
            fields: [
              { label: '1. Nachricht', name: 'd1', answer: 'Discover' },
              { label: '2. Nachricht', name: 'd2', answer: 'Offer' },
              { label: '3. Nachricht', name: 'd3', answer: 'Request' },
              { label: '4. Nachricht', name: 'd4', answer: 'Ack' },
              { label: 'Transportprotokoll', name: 'transport', answer: 'UDP' },
              { label: 'Zielport / Quellport', name: 'ports', answer: '67 / 68' },
              { label: 'Absender-IP Discover', name: 'srcip', answer: '0.0.0.0' },
              { label: 'Ziel-IP Discover', name: 'dstip', answer: '255.255.255.255' },
            ],
          },
          {
            question: {
              name: 'warum',
              lines: 3,
              text: 'Warum schickt das Notebook die erste Nachricht von 0.0.0.0 an 255.255.255.255?',
              answer: 'Es hat noch keine eigene Adresse (darum 0.0.0.0) und kennt den DHCP-Server nicht. Es schickt die Anfrage darum als Broadcast an alle im Netz; antworten wird der DHCP-Server.',
            },
          },
          {
            fields: [
              { label: 'Filter mit beiden Ports', name: 'filter1', answer: 'udp.port == 67 or udp.port == 68', wide: true },
              { label: 'Kürzerer Filter', name: 'filter2', answer: 'dhcp', wide: true },
            ],
          },
          {
            question: {
              name: 'erhalten',
              text: 'Welche Einstellungen hat das Notebook erhalten (ipconfig /all)?',
              answer: 'IP 192.168.1.100, Maske 255.255.255.0, Gateway 192.168.1.1, DNS-Server 192.168.1.2, DHCP-Server 192.168.1.2.',
            },
          },
          { check: 5 },
        ],
      },
      {
        id: 'a3',
        heading: 'Auftrag 3 – ARP, DNS und HTTP',
        stars: 4,
        catalog: 'UE03 Protokollanalyse – Auftrag 3: ARP, DNS und HTTP',
        blocks: [
          { p: 'PC W11 ruft **http://web.labor.example/** auf. Damit der ganze Ablauf sichtbar wird, löschst du vorher auf PC W11 die Caches: **arp -d** und **ipconfig /flushdns**. Danach im Browser die Adresse eingeben und laden.' },
          {
            question: {
              name: 'ablauf',
              lines: 4,
              text: 'Was muss passieren, bevor PC W11 die Seite erhält? Nenne die Schritte in der Reihenfolge der Paketliste.',
              answer: '1. ARP: MAC-Adresse des DNS-Servers 192.168.1.2 erfragen (gleiches Netz). 2. DNS: Adresse von web.labor.example erfragen, Antwort 10.10.1.20. 3. ARP: MAC des Gateways 192.168.1.1 erfragen, weil 10.10.1.20 in einem anderen Netz liegt. 4. TCP-Verbindungsaufbau (SYN, SYN/ACK, ACK) zu Port 80. 5. HTTP GET und Antwort 200 OK. 6. Verbindungsabbau.',
            },
          },
          {
            fields: [
              { label: 'Ziel-IP der 1. ARP-Anfrage', name: 'arp1', answer: '192.168.1.2 (DNS-Server)', wide: true },
              { label: 'EtherType von ARP', name: 'arptype', answer: '0x0806', wide: true },
            ],
          },
          {
            question: {
              name: 'firewall',
              text: 'Auch die Firewall schickt eine ARP-Anfrage in die DMZ. Ist sie eine Folge der ersten ARP-Anfrage von PC W11?',
              answer: 'Nein. Die Firewall muss das Paket an 10.10.1.20 weiterleiten und braucht dafür die MAC-Adresse des Webservers in der DMZ. Jeder Netzabschnitt löst seine Adressen selbst auf.',
            },
          },
          { h: 'Die DNS-Anfrage zerlegen' },
          {
            fields: [
              { label: 'DNS-Nachricht (Bytes)', name: 'dnslen', answer: '35' },
              { label: 'UDP-Kopf (Bytes)', name: 'udplen', answer: '8' },
              { label: 'IPv4-Kopf (Bytes)', name: 'iplen', answer: '20' },
              { label: 'Ethernet-Kopf (Bytes)', name: 'ethlen', answer: '14' },
              { label: 'Ganzer Rahmen (Bytes)', name: 'framelen', answer: '77' },
              { label: 'Transport / Zielport', name: 'dnsport', answer: 'UDP / 53' },
            ],
          },
          {
            question: {
              name: 'udpfelder',
              text: 'Welche Felder hat der UDP-Kopf, und wie lang ist jedes?',
              answer: 'Quellport, Zielport, Länge und Prüfsumme, je 2 Bytes (zusammen 8 Bytes).',
            },
          },
          { h: 'HTTP an zwei Stellen' },
          {
            question: {
              name: 'filter',
              text: 'Filtere mit **ip.dst == 10.10.1.20 and http**. Was zeigt die Paketliste jetzt an?',
              answer: 'Nur HTTP-Pakete an den Webserver 10.10.1.20, also die GET-Anfrage, auf jedem Abschnitt, den sie durchläuft (Intranet und DMZ).',
            },
          },
          {
            question: {
              name: 'get',
              lines: 3,
              text: 'Vergleiche die GET-Anfrage im Intranet und in der DMZ. Worin unterscheiden sich die beiden Rahmen, obwohl es dasselbe Paket ist?',
              answer: 'Andere MAC-Adressen (im Intranet von PC W11 an die Firewall, in der DMZ von der Firewall an den Webserver), TTL 64 bzw. 63 und darum eine andere IPv4-Prüfsumme. IP-Adressen, Ports und der HTTP-Inhalt sind gleich.',
            },
          },
          {
            fields: [
              { label: 'Statuszeile der HTTP-Antwort', name: 'status', answer: 'HTTP/1.1 200 OK', wide: true },
            ],
          },
          { check: 7 },
        ],
      },
    ],
  },
];
