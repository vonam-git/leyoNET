---
titel: SSH
kurz: Router und Switches aus der Ferne verwalten: Benutzer, Passwort und Verwaltungsnetz, statt mit dem Konsolenkabel daneben zu stehen.
reihenfolge: 27
schicht: 7 (Anwendung, über TCP 22)
hilfe: [ssh]
demos: [routerOnAStick]
uebungen: [m129-routing-a3]
normen: [RFC 4253]
protokolle: [SSH]
verwandt: [router, switch, tcp]
---
## Wozu

Ein Netzwerkgerät konfiguriert man selten mit dem Kabel an der Konsole, sondern aus der Ferne. **SSH** (Secure Shell) öffnet dafür eine verschlüsselte Befehlszeile über das Netz. Ältere Verfahren wie Telnet übertragen das Passwort im Klartext.

## Einrichten

Das Gerät braucht eine **erreichbare Adresse** (Router: ein Anschluss oder Loopback; Switch: ein VLAN-Interface), einen **Benutzer** und SSH auf den virtuellen Leitungen:

```
Router(config)# username admin password Netz2026
Router(config)# ip ssh
Router(config)# line vty 0 4
Router(config-line)# transport input ssh
Router(config-line)# login local
```

Am PC:

```
C:\> ssh admin@192.168.10.1
```

In der Praxis gehört die Verwaltung in ein eigenes **Management-VLAN**, das nur Administratoren erreichen ([[acl]]).

## Was man im Mitschnitt sieht

Nach dem TCP-Handshake tauschen Client und Server ihre Versionen im Klartext aus (`SSH-2.0-…`), danach sind nur noch verschlüsselte Bytes zu sehen. Genau das ist der Unterschied zu Telnet oder HTTP.
