import { formatIp, parseIp } from '../net/ipv4';
import { FIREWALL_PROTOCOLS, normalizeMatch, type FirewallProtocol, type FirewallRule } from '../model/security';

/**
 * Regeln für Firewall und Zugriffslisten auf der Befehlszeile lesen und
 * schreiben. Erlaubt sind die Schreibweisen von Cisco-ACLs und eine kurze
 * eigene Form:
 *
 *   permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80
 *   allow tcp any 192.168.2.80/32 port 80 in eth0
 *
 * Adressen: «any», «host A», «A W» (Wildcard-Maske), «A/Länge» oder «A» (eine Adresse).
 * Protokoll: ip (= alle), any, tcp, udp, icmp. Port: «eq N» oder «port N».
 */

export type RuleParse = { ok: true; rule: FirewallRule } | { ok: false; error: string };

/** Wildcard-Maske (z.B. 0.0.0.255) in eine Präfixlänge umrechnen; null, wenn sie nicht zusammenhängend ist. */
export function wildcardPrefix(text: string): number | null {
  const w = parseIp(text);
  if (w === null) return null;
  const hosts = w + 1;
  if ((hosts & (hosts - 1)) !== 0 && hosts !== 2 ** 32) return null;
  return 32 - Math.log2(hosts);
}

function prefixWildcard(prefix: number): string {
  return formatIp(prefix === 0 ? 0xffffffff : (2 ** (32 - prefix) - 1) >>> 0);
}

/** Liest eine Adressangabe ab `tokens[at]`; liefert Normalform und Anzahl verbrauchter Tokens. */
function readAddress(tokens: string[], at: number): { value: string; used: number } | null {
  const first = tokens[at]?.toLowerCase();
  if (first === undefined) return null;
  if (first === 'any') return { value: 'any', used: 1 };
  if (first === 'host') {
    const value = tokens[at + 1] !== undefined && !tokens[at + 1]!.includes('/') ? normalizeMatch(tokens[at + 1]!) : null;
    return value ? { value, used: 2 } : null;
  }
  const next = tokens[at + 1];
  if (parseIp(first) !== null && next !== undefined) {
    const prefix = wildcardPrefix(next);
    if (prefix !== null) {
      const value = normalizeMatch(`${first}/${prefix}`);
      return value ? { value, used: 2 } : null;
    }
  }
  const value = normalizeMatch(first);
  return value && value !== 'any' ? { value, used: 1 } : null;
}

/**
 * Regel aus Tokens lesen (ohne Befehlswort davor). `iface` übersetzt den Namen
 * nach «in» in einen Anschluss; fehlt die Funktion, ist «in» nicht erlaubt (ACL).
 */
export function parseRule(tokens: string[], iface?: (name: string) => number | null): RuleParse {
  const action = tokens[0]?.toLowerCase();
  if (action !== 'permit' && action !== 'allow' && action !== 'deny') return { ok: false, error: '% Expected permit, allow or deny' };
  const protoText = tokens[1]?.toLowerCase();
  const protocol = (protoText === 'ip' || protoText === 'ipv6' ? 'any' : protoText) as FirewallProtocol;
  if (!FIREWALL_PROTOCOLS.includes(protocol)) return { ok: false, error: `% Unknown protocol: ${tokens[1] ?? ''} (ip, tcp, udp, icmp)` };
  const src = readAddress(tokens, 2);
  if (!src) return { ok: false, error: `% Invalid source: ${tokens[2] ?? '(missing)'}` };
  const dstAt = 2 + src.used;
  const dst = readAddress(tokens, dstAt);
  if (!dst) return { ok: false, error: `% Invalid destination: ${tokens[dstAt] ?? '(missing)'}` };
  const rule: FirewallRule = { action: action === 'deny' ? 'deny' : 'allow', protocol, src: src.value, dst: dst.value };
  let at = dstAt + dst.used;
  while (at < tokens.length) {
    const word = tokens[at]!.toLowerCase();
    const value = tokens[at + 1];
    if ((word === 'eq' || word === 'port') && value !== undefined) {
      if (protocol !== 'tcp' && protocol !== 'udp') return { ok: false, error: '% A port needs tcp or udp' };
      const port = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
      if (!(port >= 1 && port <= 65535)) return { ok: false, error: `% Invalid port: ${value}` };
      rule.port = port;
    } else if (word === 'in' && value !== undefined && iface) {
      const index = iface(value);
      if (index === null) return { ok: false, error: `% Unknown interface: ${value}` };
      rule.iface = index;
    } else return { ok: false, error: `% Unexpected: ${tokens[at]}` };
    at += 2;
  }
  return { ok: true, rule };
}

function ciscoAddress(value: string): string {
  if (value === 'any') return 'any';
  if (!value.includes('/')) return `host ${value}`;
  const [net = '', prefix = ''] = value.split('/');
  return parseIp(net) !== null ? `${net} ${prefixWildcard(Number(prefix))}` : value;
}

/** Zeile einer Zugriffsliste im Stil von Cisco, z.B. «permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80». */
export function formatAclRule(rule: FirewallRule): string {
  const proto = rule.protocol === 'any' ? 'ip' : rule.protocol;
  const port = rule.port !== undefined ? ` eq ${rule.port}` : '';
  return `${rule.action === 'allow' ? 'permit' : 'deny'} ${proto} ${ciscoAddress(rule.src)} ${ciscoAddress(rule.dst)}${port}`;
}

/** Firewall-Regel in der kurzen Form, z.B. «allow tcp any 192.168.2.80 port 80 in eth0». */
export function formatFirewallRule(rule: FirewallRule, ifaceName: (index: number) => string): string {
  const port = rule.port !== undefined ? ` port ${rule.port}` : '';
  const inside = rule.iface !== undefined ? ` in ${ifaceName(rule.iface)}` : '';
  return `${rule.action} ${rule.protocol} ${rule.src} ${rule.dst}${port}${inside}`;
}
