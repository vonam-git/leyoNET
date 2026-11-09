// Arbeitsblätter zu den Katalog-Übungen «Modul 145» (catalogM145.ts).
// Aufbau wie inhalt.mjs: `answer` steht nur in der Musterlösung (_mL.pdf).
// Nur Zeichen aus WinAnsi verwenden (keine Pfeile).

const M145 = { module: 'Modul 145', series: 'M145' };

const VLAN_TABLE = {
  table: [
    ['VLAN', 'Name', 'Netz', 'Gateway', 'Farbe'],
    ['10', 'ENTWICKLUNG', '192.168.10.0/24', '192.168.10.1', 'rot'],
    ['20', 'VERWALTUNG', '192.168.20.0/24', '192.168.20.1', 'blau'],
    ['30', 'SALES', '192.168.30.0/24', '192.168.30.1', 'grün'],
    ['40', 'ITMGMT', '192.168.40.0/24', '192.168.40.1', 'violett'],
  ],
  widths: [0.7, 1.4, 1.6, 1.4, 0.9],
};

const PCS_TABLE = {
  table: [
    ['PC', 'Switch / Port', 'VLAN', 'Adresse'],
    ['PC Entwicklung 1 / 2', 'Switch 1OG / port1, port2', '10', '192.168.10.10 / .11'],
    ['PC Verwaltung 1 / 2', 'Switch 1OG / port3, port4', '20', '192.168.20.10 / .11'],
    ['PC Verwaltung 3 / 4', 'Switch 2OG / port1, port2', '20', '192.168.20.12 / .13'],
    ['PC Sales 1', 'Switch 2OG / port3', '30', '192.168.30.10'],
    ['PC ITMGMT 1', 'Switch 2OG / port4', '40', '192.168.40.10'],
  ],
  widths: [1.6, 1.9, 0.6, 1.6],
};

const sheet = (file, block, title, subtitle, entry, intro, section) => ({
  ...M145,
  file,
  block,
  title,
  subtitle,
  entries: [entry],
  projects: [file],
  intro,
  sections: [section],
});

export const M145_SHEETS = [
  // --- UE02 ---------------------------------------------------------------------------
  sheet(
    'M145_UE02_Netzwerk_OldSchool',
    'Netzwerk OldSchool',
    'UE02: Netzwerk OldSchool',
    'Zwei Abteilungen, zwei Switches, ein Router · Richtzeit 45 Minuten',
    'm145-ue02',
    [
      { p: 'Die Firma will die Abteilungen **Entwicklung** und **Verwaltung** voneinander trennen. Ohne VLANs geht das nur «klassisch»: Jede Abteilung bekommt ihren eigenen Switch und ihr eigenes Netz, der **Router** verbindet die beiden Netze. Das braucht viele Geräte und Kabel – genau das lösen später die VLANs.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Zwei Netze mit einem Router',
      stars: 1,
      catalog: 'UE02 Netzwerk OldSchool: Zwei Netze mit einem Router',
      blocks: [
        {
          table: [
            ['Gerät', 'Anschluss', 'Adresse', 'Gateway'],
            ['Router', 'eth0 (zu Switch Entwicklung)', '192.168.1.1/24', '–'],
            ['Router', 'eth1 (zu Switch Verwaltung)', '192.168.2.1/24', '–'],
            ['PC Entwicklung 1 / 2', '–', '192.168.1.10 / .11', '192.168.1.1'],
            ['PC Verwaltung 1 / 2', '–', '192.168.2.10 / .11', '192.168.2.1'],
          ],
          widths: [1.6, 2, 1.4, 1.1],
        },
        { list: ['Router-Anschlüsse adressieren (Fenster des Routers oder Befehlszeile: «interface eth0», «ip address 192.168.1.1 255.255.255.0»).', 'PCs adressieren, Gateway eintragen.', 'In der Simulation testen: Ping innerhalb jeder Abteilung, zum Router und von der Entwicklung in die Verwaltung.'] },
        { h: 'Fragen' },
        {
          question: {
            name: 'geraete',
            text: 'Die Firma bekommt eine dritte Abteilung. Was braucht es zusätzlich, wenn man beim «OldSchool»-Aufbau bleibt?',
            answer: 'Einen weiteren Switch, einen weiteren Router-Anschluss (oder einen grösseren Router), Kabel und ein drittes Netz mit eigenem Gateway.',
          },
        },
        {
          question: {
            name: 'broadcast',
            text: 'Ein PC der Entwicklung sendet einen Broadcast (z.B. ARP). Kommt er in der Verwaltung an? Begründe.',
            answer: 'Nein. Der Router leitet Broadcasts nicht weiter. Jedes Router-Interface begrenzt eine Broadcast-Domäne.',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- UE03 ---------------------------------------------------------------------------
  sheet(
    'M145_UE03_Portbasiertes_VLAN',
    'Portbasiertes VLAN',
    'UE03: Portbasiertes VLAN',
    'Ein Switch, zwei VLANs · Richtzeit 45 Minuten',
    'm145-ue03',
    [
      { p: 'Ein **VLAN** (Virtual LAN) teilt einen Switch logisch in mehrere Switches auf. Beim **portbasierten VLAN** gehört jeder Port fest zu einem VLAN («Access-Port»). Rahmen bleiben in ihrem VLAN: Jedes VLAN ist eine eigene Broadcast-Domäne. VLAN-Nummern gehen von 1 bis 4094 (0 und 4095 sind reserviert), VLAN 1 ist das Standard-VLAN.' },
      VLAN_TABLE,
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Zwei Abteilungen an einem Switch',
      stars: 2,
      catalog: 'UE03 Portbasiertes VLAN: Zwei Abteilungen an einem Switch',
      blocks: [
        { list: ['VLAN 10 und 20 auf Switch 1OG anlegen und benennen: «vlan 10», «name ENTWICKLUNG», «exit».', 'Ports zuweisen: «interface port1», «switchport mode access», «switchport access vlan 10» (Entwicklung an port1 und port2, Verwaltung an port3 und port4).', 'Mit «show vlan brief» kontrollieren.', 'Abnahme: Ping innerhalb jedes VLANs geht, zwischen den VLANs nicht.'] },
        { tip: 'Tipp: Mit «interface range port1 - 2» konfigurierst du mehrere Ports auf einmal.' },
        { h: 'Fragen' },
        {
          fields: [
            { label: 'Broadcast-Domänen (ohne VLAN 1)', name: 'domaenen', answer: '2' },
            { label: 'Befehl für die Übersicht', name: 'befehl', answer: 'show vlan brief' },
          ],
        },
        {
          question: {
            name: 'gleichesnetz',
            text: 'Angenommen, beide Abteilungen hätten Adressen im selben Netz 192.168.10.0/24. Würde der Ping zwischen den VLANs dann funktionieren? Begründe.',
            answer: 'Nein. Der Switch trennt die VLANs auf Schicht 2: Die ARP-Anfrage (Broadcast) bleibt im eigenen VLAN, die Gegenseite erhält sie nie.',
          },
        },
        { check: 6 },
      ],
    },
  ),

  // --- UE04 ---------------------------------------------------------------------------
  sheet(
    'M145_UE04_Trunk_VLAN',
    'Trunk VLAN',
    'UE04: Trunk VLAN',
    'VLANs über zwei Stockwerke · Richtzeit 60 Minuten',
    'm145-ue04',
    [
      { p: 'Sollen mehrere VLANs über **ein** Kabel zum nächsten Switch, wird der Port zum **Trunk**. Nach **IEEE 802.1Q** erhält jeder Rahmen ein 4 Byte langes **Tag** mit der VLAN-ID; ein Ethernet-Rahmen wird dadurch bis zu 1522 Byte lang. Nur das **native VLAN** (Standard: VLAN 1) läuft ohne Tag über den Trunk. Access-Ports zu den PCs bleiben ohne Tag – die Endgeräte merken vom VLAN nichts.' },
      VLAN_TABLE,
      PCS_TABLE,
    ],
    {
      id: 'a1',
      heading: 'Auftrag – VLANs über zwei Stockwerke',
      stars: 3,
      catalog: 'UE04 Trunk VLAN: VLANs über zwei Stockwerke',
      blocks: [
        { list: ['Auf Switch 2OG die VLANs 20, 30 und 40 anlegen und die Ports zuweisen.', 'Uplink port8 auf beiden Switches als Trunk: «interface port8», «switchport mode trunk».', 'Mit «show interfaces trunk» kontrollieren, welche VLANs der Trunk überträgt.', 'Abnahme: Die Verwaltung erreicht sich über beide Stockwerke. Zwischen den VLANs geht kein Ping.'] },
        { h: 'Fragen' },
        {
          question: {
            name: 'tag',
            text: 'PC Verwaltung 1 pingt PC Verwaltung 3. Mit welchem Tag läuft der Rahmen über den Trunk, und wo wird das Tag wieder entfernt?',
            answer: 'Mit dem Tag VLAN 20 (802.1Q). Switch 2OG entfernt das Tag, bevor er den Rahmen am Access-Port an PC Verwaltung 3 gibt.',
          },
        },
        {
          question: {
            name: 'fehlt',
            text: 'Was passiert, wenn VLAN 20 auf Switch 2OG nicht angelegt ist, der Port aber in VLAN 20 steht?',
            answer: 'Der Switch verwirft die Rahmen dieses VLANs (die Konsole meldet das fehlende VLAN). Ein VLAN muss in der VLAN-Datenbank stehen, sonst wird es nicht weitergeleitet.',
          },
        },
        { check: 6 },
      ],
    },
  ),

  // --- UE05 ---------------------------------------------------------------------------
  sheet(
    'M145_UE05_VLAN_Theorie_Check',
    'VLAN Theorie-Check',
    'UE05: VLAN Theorie-Check',
    'Wer empfängt den Broadcast? · Richtzeit 30 Minuten',
    'm145-ue05',
    [
      { p: 'Vier Switches hängen in einer Kette. Alle PCs haben Adressen im selben Netz 192.168.99.0/24. Lies die Konfiguration genau: Welche PCs erhalten einen Broadcast von **PC A**? Begründe Schritt für Schritt und prüfe erst danach in der Simulation.' },
      {
        table: [
          ['Switch', 'PCs (Access-VLAN)', 'Nach oben', 'Nach unten'],
          ['Switch A', 'A (10), B (20)', '–', 'port8: Trunk, nativ 1'],
          ['Switch B', 'C (10), D (30)', 'port7: Trunk, nativ 1', 'port8: Access VLAN 10'],
          ['Switch C', 'E (20), F (10)', 'port7: Access VLAN 20', 'port8: Trunk, nativ 20'],
          ['Switch D', 'G (10), H (20)', 'port7: Trunk, nativ 10', '–'],
        ],
        widths: [1, 1.4, 1.7, 1.7],
      },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Broadcast verfolgen',
      stars: 3,
      catalog: 'UE05 VLAN Theorie-Check: Wer empfängt den Broadcast?',
      blocks: [
        { h: 'Schritt für Schritt' },
        { question: { name: 's1', lines: 1, text: 'Switch A: Rahmen verlässt port8 mit Tag:', answer: 'VLAN 10 (getaggt)' } },
        { question: { name: 's2', lines: 1, text: 'Switch B: empfängt den Rahmen in VLAN:', answer: '10 – C erhält ihn' } },
        { question: { name: 's3', lines: 1, text: 'Switch B port8 nach Switch C:', answer: 'ohne Tag (Access VLAN 10)' } },
        { question: { name: 's4', lines: 1, text: 'Switch C ordnet den Rahmen VLAN ... zu:', answer: '20 – E erhält ihn, F nicht' } },
        { question: { name: 's5', lines: 1, text: 'Switch C port8 nach Switch D:', answer: 'ohne Tag (VLAN 20 ist dort nativ)' } },
        { question: { name: 's6', lines: 1, text: 'Switch D ordnet den Rahmen VLAN ... zu:', answer: '10 (nativ) – G erhält ihn, H nicht' } },
        {
          question: {
            name: 'ergebnis',
            text: 'Welche PCs empfangen den Broadcast von PC A? Welche zwei Konfigurationsfehler führen dazu?',
            answer: 'C, E und G. Fehler 1: Zwischen Switch B und C sind die Access-Ports in verschiedenen VLANs (10 und 20). Fehler 2: Auf dem Trunk zwischen Switch C und D ist das native VLAN verschieden (20 und 10).',
          },
        },
        { tip: 'Prüfen: Paketliste öffnen, auf PC A «ping 192.168.99.99» – die ARP-Anfrage zeigt, wer den Broadcast bekommt.' },
        {
          question: {
            name: 'gefahr',
            text: 'Warum ist ein verschiedenes natives VLAN gefährlich?',
            answer: 'Rahmen ohne Tag wechseln unbemerkt das VLAN. So gelangt Verkehr in ein fremdes VLAN (Sicherheitsproblem, Grundlage für VLAN-Hopping), und Netze funktionieren unerwartet.',
          },
        },
        { check: 3 },
      ],
    },
  ),

  // --- UE06 ---------------------------------------------------------------------------
  sheet(
    'M145_UE06_Router_on_a_Stick',
    'Router-on-a-Stick',
    'UE06: Router-on-a-Stick',
    'Inter-VLAN-Routing über einen Trunk · Richtzeit 60 Minuten',
    'm145-ue06',
    [
      { p: 'VLANs sind voneinander getrennt. Damit sie miteinander sprechen, braucht es **Inter-VLAN-Routing** auf Schicht 3. Beim **Router-on-a-Stick** hängt der Router mit **einem** Kabel als Trunk am Switch. Für jedes VLAN gibt es ein **Subinterface** (z.B. eth0.10) mit dem Tag dieses VLANs und der Gateway-Adresse. Das spart Router-Anschlüsse, das eine Kabel kann aber zum Engpass werden.' },
      VLAN_TABLE,
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Routing zwischen VLANs',
      stars: 3,
      catalog: 'UE06 Router-on-a-Stick: Routing zwischen VLANs',
      blocks: [
        { list: ['Router 1OG (eth0) mit port7 von Switch 1OG verbinden; port7 als Trunk.', 'Auf Switch 1OG die VLANs 30 und 40 ergänzen (alle vier VLANs auf beiden Switches).', 'Subinterfaces: «interface eth0.10», «encapsulation dot1q 10», «ip address 192.168.10.1 255.255.255.0», ebenso für 20, 30 und 40.', 'Alle PCs erhalten ihr Gateway 192.168.<VLAN>.1.', 'Abnahme: Ping zwischen allen Abteilungen.'] },
        { h: 'Fragen' },
        {
          question: {
            name: 'weg',
            text: 'PC Entwicklung 1 pingt PC Sales 1. Beschreibe den Weg des Echo Request mit den Tags auf den Trunks.',
            answer: 'PC Entwicklung 1 an Switch 1OG (ohne Tag), über port7 mit Tag 10 zum Router (eth0.10). Der Router routet ins Netz 192.168.30.0/24 und sendet über eth0.30 mit Tag 30 zurück an Switch 1OG, dann mit Tag 30 über port8 zu Switch 2OG und ohne Tag an PC Sales 1.',
          },
        },
        {
          question: {
            name: 'engpass',
            text: 'Warum kann das Kabel zum Router zum Engpass werden?',
            answer: 'Der ganze Verkehr zwischen den VLANs läuft zweimal über dasselbe Kabel (hin zum Router und zurück).',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- UE07 ---------------------------------------------------------------------------
  sheet(
    'M145_UE07_Layer_3_Switch',
    'Layer-3-Switch',
    'UE07: Layer-3-Switch',
    'Inter-VLAN-Routing mit SVIs · Richtzeit 45 Minuten',
    'm145-ue07',
    [
      { p: 'Ein **Layer-3-Switch** kombiniert Switching (Schicht 2, MAC-basiert im VLAN) mit Routing (Schicht 3, IP-basiert zwischen VLANs). Statt Subinterfaces gibt es **SVIs** (Switched Virtual Interfaces): ein virtuelles Interface «interface vlan 10» je VLAN mit der Gateway-Adresse. Das Routing geschieht im Switch selbst, ohne Umweg über ein Kabel.' },
      VLAN_TABLE,
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Routing mit SVIs',
      stars: 3,
      catalog: 'UE07 Layer-3-Switch: Routing mit SVIs',
      blocks: [
        { list: ['Auf dem L3-Switch 1OG je VLAN ein SVI: «interface vlan 10», «ip address 192.168.10.1 255.255.255.0», «no shutdown».', 'Routing einschalten: «ip routing» im Konfigurationsmodus.', 'Mit «show ip route» die direkt verbundenen Netze (C) kontrollieren.', 'Abnahme: Ping zwischen allen Abteilungen.'] },
        { h: 'Fragen' },
        {
          fields: [
            { label: 'Befehl: Routing einschalten', name: 'routing', answer: 'ip routing' },
            { label: 'Befehl: Routingtabelle', name: 'tabelle', answer: 'show ip route' },
          ],
        },
        {
          question: {
            name: 'vergleich',
            text: 'Nenne zwei Vorteile des Layer-3-Switches gegenüber dem Router-on-a-Stick.',
            answer: 'Kein Engpass über ein einzelnes Kabel (Routing im Switch, mit voller Geschwindigkeit), ein Gerät weniger, einfachere Verkabelung.',
          },
        },
        { check: 3 },
      ],
    },
  ),

  // --- UE07b --------------------------------------------------------------------------
  sheet(
    'M145_UE07b_Layer_3_Switch_mit_ACL',
    'Layer-3-Switch mit ACL',
    'UE07b: Layer-3-Switch mit ACL',
    'Zugriff zwischen VLANs regeln · Richtzeit 90 Minuten',
    'm145-ue07b',
    [
      { p: 'Mit Inter-VLAN-Routing können grundsätzlich alle VLANs miteinander sprechen. **Zugriffslisten (ACL)** regeln, was erlaubt ist. Sie werden von oben nach unten geprüft; die erste passende Regel gilt. Am Ende steht immer unsichtbar **«deny ip any any»**. Eine Liste wirkt erst, wenn sie einem Interface zugewiesen ist: «ip access-group NAME in» am SVI prüft alles, was **aus dem VLAN kommt**, «out» alles, was **ins VLAN geroutet** wird.' },
      { box: 'Schreibweise: «permit icmp 192.168.40.0 0.0.0.255 any». Die Wildcard-Maske 0.0.0.255 ist die umgekehrte Subnetzmaske: 0 = Bit muss passen, 1 = egal. «host 192.168.10.10» steht für eine einzelne Adresse.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Zugriff zwischen VLANs regeln',
      stars: 4,
      catalog: 'UE07b Layer-3-Switch mit ACL',
      blocks: [
        {
          table: [
            ['Von / nach', 'ENTWICKLUNG', 'VERWALTUNG', 'SALES', 'ITMGMT'],
            ['ENTWICKLUNG', '–', 'gesperrt', 'gesperrt', 'nur Antwort'],
            ['VERWALTUNG', 'gesperrt', '–', 'erlaubt', 'nur Antwort'],
            ['SALES', 'gesperrt', 'erlaubt', '–', 'nur Antwort'],
            ['ITMGMT', 'ICMP', 'ICMP', 'ICMP', '–'],
          ],
          widths: [1.4, 1.2, 1.2, 1, 1],
        },
        { p: 'Plane je VLAN eine Liste für eingehende Pakete am SVI (VLAN10-IN bis VLAN40-IN):' },
        { question: { name: 'acl10', lines: 1, text: 'VLAN10-IN:', answer: 'permit icmp 192.168.10.0 0.0.0.255 192.168.40.0 0.0.0.255' } },
        { question: { name: 'acl20a', lines: 1, text: 'VLAN20-IN (Regel 1):', answer: 'permit ip 192.168.20.0 0.0.0.255 192.168.30.0 0.0.0.255' } },
        { question: { name: 'acl20b', lines: 1, text: 'VLAN20-IN (Regel 2):', answer: 'permit icmp 192.168.20.0 0.0.0.255 192.168.40.0 0.0.0.255' } },
        { question: { name: 'acl30a', lines: 1, text: 'VLAN30-IN (Regel 1):', answer: 'permit ip 192.168.30.0 0.0.0.255 192.168.20.0 0.0.0.255' } },
        { question: { name: 'acl30b', lines: 1, text: 'VLAN30-IN (Regel 2):', answer: 'permit icmp 192.168.30.0 0.0.0.255 192.168.40.0 0.0.0.255' } },
        { question: { name: 'acl40', lines: 1, text: 'VLAN40-IN:', answer: 'permit icmp 192.168.40.0 0.0.0.255 any' } },
        { tip: 'Ein Ping besteht aus Echo Request und Echo Reply: Die Gegenrichtung muss ebenfalls erlaubt sein. «show access-lists» zeigt die Treffer je Regel.' },
        {
          question: {
            name: 'anyany',
            text: 'Warum ist «permit ip any any» am Ende einer Liste hier keine gute Lösung?',
            answer: 'Dann wäre alles erlaubt, die Liste filtert nichts mehr. Es soll nur das Nötige zugelassen sein (Prinzip der minimalen Rechte).',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- UE08 ---------------------------------------------------------------------------
  sheet(
    'M145_UE08_DHCP',
    'DHCP auf dem Layer-3-Switch',
    'UE08: DHCP',
    'Pools je VLAN auf dem Layer-3-Switch · Richtzeit 45 Minuten',
    'm145-ue08',
    [
      { p: 'Statt die Adressen von Hand zu vergeben, übernimmt der Layer-3-Switch die Aufgabe des **DHCP-Servers**: Für jedes VLAN gibt es einen **Pool** mit Netz, Gateway («default-router») und DNS-Server. Der Switch wählt den Pool, in dessen Netz das VLAN-Interface liegt, an dem die Anfrage ankommt. Adressen für Gateway, Drucker und Server schliesst man aus («ip dhcp excluded-address»).' },
      { box: 'Beispiel: «ip dhcp excluded-address 192.168.10.1 192.168.10.9», «ip dhcp pool VLAN10», «network 192.168.10.0 255.255.255.0», «default-router 192.168.10.1», «dns-server 198.51.100.53». DNS-Server 198.51.100.53 ist eine Beispieladresse für einen öffentlichen DNS-Server.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – DHCP auf dem Layer-3-Switch',
      stars: 3,
      catalog: 'UE08 DHCP auf dem Layer-3-Switch',
      blocks: [
        { list: ['Vier Pools VLAN10 bis VLAN40 mit Netz, Gateway und DNS-Server einrichten.', 'Je VLAN die Adressen .1 bis .9 ausschliessen.', 'Alle PCs auf DHCP umstellen.', 'In der Simulation: «show ip dhcp binding» auf dem L3-Switch, «ipconfig» auf einem PC.'] },
        { h: 'DORA' },
        {
          fields: [
            { label: '1. Client an alle', name: 'd', answer: 'DHCP Discover' },
            { label: '2. Server an Client', name: 'o', answer: 'DHCP Offer' },
            { label: '3. Client an alle', name: 'r', answer: 'DHCP Request' },
            { label: '4. Server an Client', name: 'a', answer: 'DHCP Ack' },
          ],
        },
        {
          question: {
            name: 'erste',
            text: 'Welche Adresse erhält der erste PC in VLAN 10, und warum nicht 192.168.10.1?',
            answer: '192.168.10.10. Die Adressen .1 bis .9 sind ausgeschlossen, .1 ist zudem die Adresse des Switches (Gateway).',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- UE09 ---------------------------------------------------------------------------
  sheet(
    'M145_UE09_DHCP_extern',
    'DHCP extern',
    'UE09: DHCP extern',
    'Zentraler DHCP-Server mit Relay · Richtzeit 60 Minuten',
    'm145-ue09',
    [
      { p: 'Ein DHCP-Discover ist ein **Broadcast** und bleibt in seinem VLAN. Steht der Server in einem anderen VLAN, braucht es einen **DHCP-Relay** (hier der Layer-3-Switch, «ip helper-address»): Er nimmt die Anfrage an, trägt seine Interface-Adresse als **GIADDR** ein und schickt sie per Unicast an den Server. Der Server wählt anhand der GIADDR den passenden Bereich und antwortet dem Relay, das die Antwort im VLAN des Clients verteilt.' },
      { box: 'Achtung bei ACLs: DHCP vom Client zum Relay ist UDP 68 nach 67, die Antwort UDP 67 nach 68, dazu der Relay-Verkehr zum Server. «permit ip any any» ist keine Lösung.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Zentraler Server mit Relay',
      stars: 4,
      catalog: 'UE09 DHCP extern: Zentraler Server mit Relay',
      blocks: [
        { list: ['DHCP-Server an port5 des L3-Switches, port5 in VLAN 20.', 'Server: 192.168.20.200/24, Gateway 192.168.20.1.', 'DHCP-Dienst: eigener Bereich 192.168.20.100 bis .199; unter «Weitere Bereiche» je .100 bis .199 für VLAN 10, 30 und 40 mit Gateway .1.', 'L3-Switch: «interface vlan 10», «ip helper-address 192.168.20.200» (ebenso VLAN 30 und 40).', 'Pools auf dem Switch zurückbauen: «no ip dhcp pool VLAN10» usw.'] },
        { h: 'Fragen' },
        {
          fields: [
            { label: 'GIADDR einer Anfrage aus VLAN 30', name: 'giaddr', answer: '192.168.30.1' },
            { label: 'Ports Client zu Server (UDP)', name: 'ports', answer: '68 nach 67' },
          ],
        },
        {
          question: {
            name: 'vlan20',
            text: 'Warum braucht VLAN 20 keinen Relay?',
            answer: 'Der Server steht selbst in VLAN 20. Der Broadcast der Clients erreicht ihn direkt.',
          },
        },
        {
          question: {
            name: 'doppelt',
            text: 'Was könnte passieren, wenn die Pools auf dem L3-Switch stehen bleiben?',
            answer: 'In VLAN 20 antworten zwei Server (Switch und DHCP-Server). Die Clients nehmen das erste Angebot, die Adressen stammen dann aus verschiedenen Bereichen; im schlimmsten Fall werden Adressen doppelt vergeben.',
          },
        },
        { check: 6 },
      ],
    },
  ),

  // --- UE10 ---------------------------------------------------------------------------
  sheet(
    'M145_UE10_Three_Tier',
    'Netzwerkdesign Three-Tier',
    'UE10: Netzwerkdesign Three-Tier',
    'Core, Distribution und Access · Richtzeit 2 × 90 Minuten',
    'm145-ue10',
    [
      { p: '**Netzwerkdesign** ist die Planung eines Netzes nach Leistung, Skalierbarkeit, Sicherheit und Zuverlässigkeit. Grosse Campus-Netze baut man nach dem **3-Schichten-Modell**:' },
      {
        table: [
          ['Schicht', 'Aufgabe', 'Geräte, Geschwindigkeit'],
          ['Core', 'Schneller Transport, Routing zum WAN, hochverfügbar, Sicherheitsrichtlinien', 'Router oder Multilayer-Switches, 10 bis 100 Gbit/s'],
          ['Distribution', 'Fasst den Access Layer zusammen, Routing zwischen den Netzen, QoS', 'Multilayer-Switches, 10 bis 40 Gbit/s'],
          ['Access', 'Anschluss der Endgeräte, erste Sicherheitsstufe (Ports, VLANs)', 'Managed Layer-2-Switches, 1 bis 10 Gbit/s'],
        ],
        widths: [1, 2.6, 2],
      },
      { p: 'Vorteile: hohe Skalierbarkeit und Fehlerisolierung. Nachteile: mehr Geräte, höhere Komplexität und Kosten.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – Campus nach dem 3-Schichten-Modell',
      stars: 5,
      catalog: 'UE10 Netzwerkdesign: Three-Tier (Core, Distribution, Access)',
      blocks: [
        {
          table: [
            ['Verbindung', 'Netz', 'Adressen'],
            ['Core 1 – Core 2', '10.255.0.0/30', '.1 / .2'],
            ['Core 1 – Distribution 1 (VLAN 901)', '10.255.1.0/30', 'Core .1, SVI .2'],
            ['Core 2 – Distribution 2 (VLAN 902)', '10.255.2.0/30', 'Core .1, SVI .2'],
            ['Core 1 – Server Zentrale', '10.0.100.0/24', 'Core .1, Server .10'],
            ['Etagen 1 bis 4 (VLAN 10 bis 40)', '192.168.<VLAN>.0/24', 'Gateway .1 auf der Distribution'],
          ],
          widths: [2.3, 1.5, 1.9],
        },
        { list: ['Distribution 1 (VLAN 10, 20, 901) und Distribution 2 (VLAN 30, 40, 902): VLANs anlegen, Ports zu den Access-Switches als Trunk, Port 1 als Access-Port im Transfer-VLAN.', 'SVIs: Gateways der Etagen und Transfernetz zum Core.', 'OSPF auf Core 1, Core 2, Distribution 1 und 2: «router ospf 1», «network 0.0.0.0 255.255.255.255 area 0».', 'Kontrolle: «show ip ospf neighbor», «show ip route».'] },
        { h: 'Fragen' },
        {
          fields: [
            { label: 'Schicht mit dem Inter-VLAN-Routing', name: 'schicht', answer: 'Distribution Layer' },
            { label: 'Schicht mit den Endgeräten', name: 'access', answer: 'Access Layer' },
          ],
        },
        {
          question: {
            name: 'ausfall',
            text: 'Die Verbindung Core 1 – Core 2 fällt aus. Welche Etagen können den Server noch erreichen? Wie würdest du das Design verbessern?',
            answer: 'Nur Etage 1 und 2 (über Distribution 1 und Core 1). Verbesserung: jede Distribution an beide Cores anschliessen (redundante Uplinks) und den Server redundant anbinden.',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- UE11 ---------------------------------------------------------------------------
  sheet(
    'M145_UE11_Collapsed_Core',
    'Netzwerkdesign Collapsed Core',
    'UE11: Netzwerkdesign Collapsed Core',
    'Core und Distribution in einer Schicht · Richtzeit 90 Minuten',
    'm145-ue11',
    [
      { p: 'Kleinere und mittlere Unternehmen (KMU) brauchen selten drei Schichten. Beim **Collapsed Core** (2-Schichten-Modell) übernimmt der Core auch die Aufgaben der Distribution: Routing zwischen den VLANs, Anbindung von Servern und WAN. Das ist einfacher und günstiger, bietet aber weniger Redundanz. Damit ein Ausfall nicht das ganze Netz trifft, hängt jeder Access-Switch an **beiden** Core-Switches. **Spanning Tree (IEEE 802.1D)** verhindert die Schleifen, indem es Ersatzwege blockiert.' },
    ],
    {
      id: 'a1',
      heading: 'Auftrag – KMU-Netz mit Collapsed Core',
      stars: 4,
      catalog: 'UE11 Netzwerkdesign: Collapsed Core',
      blocks: [
        { list: ['Auf allen fünf Switches Spanning Tree einschalten, Core A mit Priorität 4096 zur Root-Bridge machen.', 'VLANs 10, 20, 30 und 100 auf Core A und Core B, Verbindungen zwischen Switches als Trunk.', 'Access-Switches: VLAN des Büros anlegen, port1 als Access-Port, port7 und port8 als Trunk.', 'Core A: Server an port5 in VLAN 100, SVIs 192.168.<VLAN>.1/24.', 'In der Simulation: «show spanning-tree» – welche Ports sind blockiert?'] },
        { h: 'Fragen' },
        {
          fields: [
            { label: 'Root-Bridge', name: 'root', answer: 'Core A' },
            { label: 'Blockierte Ports (Beispiel Access 1)', name: 'blocked', answer: 'port8 (Uplink zu Core B)' },
          ],
        },
        {
          question: {
            name: 'vergleich',
            text: 'Vergleiche Collapsed Core und Three-Tier: Wann wählst du welches Modell?',
            answer: 'Collapsed Core für KMU mit einem Gebäude oder wenigen Etagen: einfacher, günstiger. Three-Tier für grosse Campus-Netze mit vielen Gebäuden: besser skalierbar, Fehler bleiben isoliert, aber teurer und komplexer.',
          },
        },
        {
          question: {
            name: 'gateway',
            text: 'Core A fällt aus. Was funktioniert noch, was nicht?',
            answer: 'Spanning Tree schaltet die Ersatzwege über Core B frei, die Büros erreichen sich innerhalb ihres VLANs. Das Routing zwischen den VLANs und der Server fallen aus, weil Core A das einzige Gateway ist (Abhilfe z.B. mit einem redundanten Gateway auf Core B).',
          },
        },
        { check: 5 },
      ],
    },
  ),

  // --- Zusatzübungen -----------------------------------------------------------------
  {
    ...M145,
    file: 'M145_Zusatzuebungen',
    block: 'Zusatzübungen',
    title: 'Zusatzübungen VLAN',
    subtitle: 'Fehlersuche, Management-VLAN, Port-Channel · Richtzeit je 30 bis 45 Minuten',
    entries: ['m145-x1', 'm145-x2', 'm145-x3'],
    projects: ['M145_Zusatz_1', 'M145_Zusatz_2', 'M145_Zusatz_3'],
    intro: [{ p: 'Drei Übungen zum Vertiefen. Sie bauen auf den Netzen aus UE06 und UE07 auf und lassen sich unabhängig voneinander lösen.' }],
    sections: [
      {
        id: 'x1',
        heading: 'Zusatz 1 – Fehlersuche Router-on-a-Stick',
        stars: 4,
        catalog: 'Zusatz 1: Fehlersuche Router-on-a-Stick',
        blocks: [
          { p: 'Im Netz aus UE06 sind vier Fehler versteckt. Gehe systematisch vor (von Schicht 1 nach oben) und notiere jeden Fehler mit der Korrektur.' },
          { question: { name: 'f1', lines: 1, text: 'Fehler 1:', answer: 'Switch 2OG: VLAN 30 fehlt (vlan 30 anlegen, port3 in VLAN 30)' } },
          { question: { name: 'f2', lines: 1, text: 'Fehler 2:', answer: 'Switch 1OG port8: Trunk erlaubt nur VLAN 10, 20, 30 (VLAN 40 fehlt)' } },
          { question: { name: 'f3', lines: 1, text: 'Fehler 3:', answer: 'PC Verwaltung 2: falsches Gateway 192.168.20.254' } },
          { question: { name: 'f4', lines: 1, text: 'Fehler 4:', answer: 'Router: Subinterface für VLAN 40 mit Tag 41 statt 40' } },
          { check: 4 },
        ],
      },
      {
        id: 'x2',
        heading: 'Zusatz 2 – Management-VLAN und natives VLAN',
        stars: 3,
        catalog: 'Zusatz 2: Management-VLAN und natives VLAN',
        blocks: [
          { p: 'Switches verwaltet man über ein eigenes **Management-VLAN**, nicht über VLAN 1. Das native VLAN eines Trunks stellt man auf ein ungenutztes VLAN, damit kein Benutzerverkehr ohne Tag läuft.' },
          { list: ['VLAN 99 (MGMT) und 999 (NATIVE) auf beiden Switches.', 'Switch 2OG: «interface vlan 99», «ip address 192.168.99.12 255.255.255.0», «ip default-gateway 192.168.99.1».', 'L3-Switch: SVI 192.168.99.1/24.', 'Trunk port8 auf beiden Seiten: «switchport trunk native vlan 999».'] },
          {
            question: {
              name: 'hopping',
              text: 'Was ist VLAN-Hopping (Double Tagging), und wie hilft das unbenutzte native VLAN dagegen?',
              answer: 'Ein Angreifer im nativen VLAN sendet einen Rahmen mit zwei Tags. Der erste Switch entfernt das äussere Tag (natives VLAN) und leitet den Rahmen mit dem inneren Tag weiter – er landet in einem fremden VLAN. Ist das native VLAN unbenutzt (kein Endgerät darin), kann niemand so einen Rahmen einschleusen.',
            },
          },
          { check: 4 },
        ],
      },
      {
        id: 'x3',
        heading: 'Zusatz 3 – Port-Channel zwischen den Stockwerken',
        stars: 4,
        catalog: 'Zusatz 3: Port-Channel zwischen den Stockwerken',
        blocks: [
          { p: 'Zwei Kabel zwischen denselben Switches bilden ohne Bündelung eine Schleife. Ein **Port-Channel** (Link Aggregation, LACP nach **IEEE 802.1AX**) fasst sie zu einem logischen Link zusammen.' },
          { list: ['Auf beiden Switches: «interface range port7 - 8», «channel-group 1 mode active».', 'Kontrolle: «show etherchannel summary».', 'Test: ein Kabel abziehen – der Ping läuft weiter.'] },
          {
            question: {
              name: 'stp',
              text: 'Was würde Spanning Tree statt des Port-Channels mit dem zweiten Kabel machen? Was ist der Nachteil?',
              answer: 'Spanning Tree blockiert einen der beiden Ports. Das Kabel steht nur als Reserve bereit und trägt keinen Verkehr; mit dem Port-Channel tragen beide Kabel Last.',
            },
          },
          { check: 3 },
        ],
      },
    ],
  },
];
