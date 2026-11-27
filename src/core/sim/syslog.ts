/**
 * Syslog nach RFC 5424 (Format) über UDP nach RFC 5426 (Port 514). Geräte mit IP-Stack schicken
 * sicherheitsrelevante Ereignisse an den eingetragenen Syslog-Server; ein Rechner mit dem Dienst
 * «Syslog-Server» sammelt sie. So lässt sich später nachweisen, was wann wo geschah (STRIDE:
 * Repudiation, «Abstreiten»).
 *
 * Die Meldung trägt eine kurze MSGID (z.B. «PORTSEC») und strukturierte Daten
 * `[leyonet@32473 …]`; 32473 ist die Enterprise-Nummer für Dokumentation und Beispiele (RFC 5612).
 * Die Oberfläche übersetzt anhand der MSGID, auf der Leitung steht der englische Text.
 */

export const SYSLOG_PORT = 514;
/** Höchstens so viele Meldungen hält der Server (älteste fallen weg). */
export const MAX_SYSLOG = 200;
/** Facility 4: «security/authorization messages» (RFC 5424, Tabelle 1). */
export const SYSLOG_FACILITY = 4;
/** Schweregrade (RFC 5424, Tabelle 2). */
export const SYSLOG_SEVERITY = { emergency: 0, alert: 1, critical: 2, error: 3, warning: 4, notice: 5, informational: 6, debug: 7 } as const;
export const SYSLOG_SD_ID = 'leyonet@32473';

export interface SyslogMessage {
  kind: 'syslog';
  facility: number;
  severity: number;
  /** HOSTNAME: Name des Geräts (ohne Leerzeichen auf der Leitung). */
  host: string;
  /** MSGID, z.B. «PORTSEC», «DHCPSNOOP», «SSHFAIL». */
  msgid: string;
  /** MSG: kurzer englischer Text. */
  text: string;
  /** Strukturierte Daten (SD-PARAMs). */
  params: Record<string, string>;
}

/** Empfangene Meldung beim Syslog-Server. */
export interface SyslogEntry extends SyslogMessage {
  from: string;
  received: number;
}

/** MSGID je Warnung des Wächters auf Endgeräten. */
export const ALERT_MSGID: Record<'arpChange' | 'arpBlocked' | 'arpFlood' | 'arpRejected' | 'synFlood' | 'portScan', string> = {
  arpChange: 'ARPCHANGE',
  arpBlocked: 'ARPBLOCK',
  arpFlood: 'ARPSPOOF',
  arpRejected: 'ARPSPOOF',
  synFlood: 'SYNFLOOD',
  portScan: 'PORTSCAN',
};

/** Welche MSGIDs zu welchem Angriff gehören (für den Prüfbaustein «logged»). */
export const ATTACK_MSGIDS: Record<string, readonly string[]> = {
  arpSpoof: ['ARPSPOOF', 'ARPCHANGE', 'ARPBLOCK'],
  synFlood: ['SYNFLOOD'],
  portScan: ['PORTSCAN'],
  sshGuess: ['SSHFAIL', 'SSHLOGIN'],
  dhcpRogue: ['DHCPSNOOP', 'PORTSEC'],
};

/** RFC 5424: PARAM-VALUE maskiert «"», «\» und «]». */
const sdValue = (v: string) => v.replace(/["\\\]]/g, (c) => `\\${c}`);
/** RFC 5424: HOSTNAME, MSGID nur druckbares US-ASCII ohne Leerzeichen; NILVALUE «-», wenn leer. */
const token = (v: string, max: number) => v.replace(/[^\x21-\x7e]/g, '_').slice(0, max) || '-';

/** Meldung als Text auf der Leitung, z.B. «<36>1 - R1 leyonet - PORTSEC [leyonet@32473 port="3"] violation». */
export function formatSyslog(m: SyslogMessage): string {
  const pri = m.facility * 8 + m.severity;
  const params = Object.entries(m.params);
  const sd = params.length ? `[${SYSLOG_SD_ID}${params.map(([k, v]) => ` ${token(k, 32)}="${sdValue(v)}"`).join('')}]` : '-';
  // TIMESTAMP als NILVALUE: Die Simulation kennt keine Uhrzeit, nur die Zeit seit dem Start.
  return `<${pri}>1 - ${token(m.host, 255)} leyonet - ${token(m.msgid, 32)} ${sd} ${m.text}`;
}
