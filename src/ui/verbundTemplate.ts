/**
 * Vorlage «Klassen-Infrastruktur» für den Verbund: Provider (Internet-Gerät, an dem die Standorte
 * anhängen) und eine Zentrale mit Webserver in 198.51.100.0/24 (RFC 5737). Die Lehrperson lädt sie
 * mit einem Klick in ihre Klasse und kann sie danach selbst erweitern (DNS, Mail, VPN-Gateway …).
 */
import { setVerbundProvider, type Topology } from '../core';
import { Start, unwrap } from './catalogKit';

export const VERBUND_HUB_IP = '198.51.100.10';

export function verbundInfra(): Topology {
  return new Start()
    .router('Provider', 0, 0, ['198.51.100.1/24'], 'internet')
    .add('switch', 'Switch Zentrale', 0, 170)
    .add('server', 'Zentrale', -140, 300)
    .link('Provider', 'Switch Zentrale')
    .link('Zentrale', 'Switch Zentrale')
    .host('Zentrale', VERBUND_HUB_IP, '24', '198.51.100.1')
    .web('Zentrale', '<h1>Klassen-Verbund</h1><p>Willkommen in der Zentrale. Dein Standort ist verbunden.</p>')
    .area('Klassen-Infrastruktur', 'purple', -260, -90, 460, 460, '198.51.100.0/24')
    .apply((t, id) => unwrap(setVerbundProvider(t, id('Provider'), true))).topology;
}
