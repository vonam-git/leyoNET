/**
 * Redundanz und Lastverteilung: Rapid Spanning Tree, VRRP, ECMP und Load Balancer. Jede Übung prüft
 * mit dem Baustein «failover», dass das Netz einen Ausfall übersteht.
 */
import { setOspf, setOspfCost, setStp, setStpPriority, setVrrpGroup } from '../core';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';

/** Drei Switches im Dreieck mit klassischem STP; Switch A ist Root, der direkte Weg A–C ist aktiv. */
function triangle(): Start {
  return new Start()
    .area('LAN 10.20.0.0/24', 'blue', -560, -240, 1000, 640, '10.20.0.0/24')
    .add('switch', 'Switch A', -260, -120)
    .add('switch', 'Switch B', 260, -120)
    .add('switch', 'Switch C', 0, 140)
    .add('pc', 'PC A', -460, -120)
    .add('pc', 'PC C', 0, 320)
    .link('Switch A', 'Switch B')
    .link('Switch B', 'Switch C')
    .link('Switch C', 'Switch A')
    .link('PC A', 'Switch A')
    .link('PC C', 'Switch C')
    .host('PC A', '10.20.0.1', '24')
    .host('PC C', '10.20.0.3', '24')
    .apply((t, id) => {
      for (const n of ['Switch A', 'Switch B', 'Switch C']) t = unwrap(setStp(t, id(n), true));
      return unwrap(setStpPriority(t, id('Switch A'), 4096));
    });
}

/** Zwei Router zwischen LAN und Servernetz; im Servernetz läuft VRRP schon (mit Tracking auf R1). */
function twoRouters(): Start {
  return new Start()
    .area('LAN 192.168.1.0/24', 'blue', -620, -260, 480, 520, '192.168.1.0/24')
    .area('Servernetz 10.0.0.0/24', 'purple', 160, -260, 480, 520, '10.0.0.0/24')
    .add('pc', 'PC 1', -520, -80)
    .add('pc', 'PC 2', -520, 80)
    .add('switch', 'LAN', -300, 0)
    .router('R1', 0, -140, ['192.168.1.2/24', '10.0.0.2/24'])
    .router('R2', 0, 140, ['192.168.1.3/24', '10.0.0.3/24'])
    .add('switch', 'Servernetz', 300, 0)
    .add('server', 'Server', 520, 0)
    .link('PC 1', 'LAN')
    .link('PC 2', 'LAN')
    .link('R1', 'LAN')
    .link('R2', 'LAN')
    .link('R1', 'Servernetz')
    .link('R2', 'Servernetz')
    .link('Server', 'Servernetz')
    .host('PC 1', '192.168.1.10', '24', '192.168.1.2')
    .host('PC 2', '192.168.1.11', '24', '192.168.1.2')
    .host('Server', '10.0.0.10', '24', '10.0.0.1')
    .web('Server', '<h1>Server</h1>')
    .apply((t, id) => {
      t = unwrap(setVrrpGroup(t, id('R1'), { iface: 1, vrid: 2, ip: '10.0.0.1', priority: 110, track: { iface: 0, decrement: 20 } }));
      return unwrap(setVrrpGroup(t, id('R2'), { iface: 1, vrid: 2, ip: '10.0.0.1' }));
    });
}

/** Raute mit OSPF: R1 erreicht das Servernetz über R2 oder R3; der Anschluss zu R3 ist teurer eingestellt. */
function diamond(): Start {
  return new Start()
    .add('pc', 'PC 1', -560, -80)
    .add('pc', 'PC 2', -560, 80)
    .add('switch', 'Switch', -400, 0)
    .router('R1', -200, 0, ['192.168.1.1/24', '10.0.12.1/30', '10.0.13.1/30'])
    .router('R2', 20, -150, ['10.0.12.2/30', '10.0.24.1/30'])
    .router('R3', 20, 150, ['10.0.13.2/30', '10.0.34.1/30'])
    .router('R4', 240, 0, ['10.4.0.1/24', '10.0.24.2/30', '10.0.34.2/30'])
    .add('server', 'Server', 440, 0)
    .link('PC 1', 'Switch')
    .link('PC 2', 'Switch')
    .link('R1', 'Switch')
    .link('R1', 'R2')
    .link('R1', 'R3')
    .link('Server', 'R4')
    .link('R2', 'R4')
    .link('R3', 'R4')
    .host('PC 1', '192.168.1.10', '24', '192.168.1.1')
    .host('PC 2', '192.168.1.11', '24', '192.168.1.1')
    .host('Server', '10.4.0.10', '24', '10.4.0.1')
    .apply((t, id) => {
      for (const r of ['R1', 'R2', 'R3', 'R4']) t = unwrap(setOspf(t, id(r), { networks: [{ network: '0.0.0.0', mask: '0.0.0.0', area: 0 }] }));
      return unwrap(setOspfCost(t, id('R1'), 2, 30));
    });
}

/** Zwei Webserver und ein Load Balancer, der noch nicht eingerichtet ist. */
function webFarm(): Start {
  return new Start()
    .area('Webfarm 192.168.1.0/24', 'teal', -560, -260, 1080, 540, '192.168.1.0/24')
    .add('pc', 'PC', -440, 0)
    .add('switch', 'Switch', -140, 0)
    .add('server', 'Load Balancer', -140, -180, { variant: 'loadbalancer' })
    .add('server', 'Web 1', 240, -100)
    .add('server', 'Web 2', 240, 100)
    .link('PC', 'Switch')
    .link('Load Balancer', 'Switch')
    .link('Web 1', 'Switch')
    .link('Web 2', 'Switch')
    .host('PC', '192.168.1.10', '24')
    .host('Load Balancer', '192.168.1.80', '24')
    .host('Web 1', '192.168.1.81', '24')
    .host('Web 2', '192.168.1.82', '24')
    .web('Web 1', '<h1>Web 1</h1><p>Antwort von Web 1.</p>')
    .web('Web 2', '<h1>Web 2</h1><p>Antwort von Web 2.</p>');
}

export const REDUNDANCY: CatalogEntry[] = [
  {
    id: 'rstp-fast',
    stars: 4,
    features: ['net.stp'],
    level: 4,
    build() {
      return {
        topology: triangle().topology,
        tasks: task('rstpFast', 4, [
          goal('rstpFast', 1, { type: 'rstp', devices: ['Switch A', 'Switch B', 'Switch C'] }),
          goal('rstpFast', 2, { type: 'failover', from: 'PC A', to: 'PC C', a: 'Switch A', b: 'Switch C', within: 1000 }),
          goal('rstpFast', 3, { type: 'noStorm' }),
        ]),
      };
    },
  },
  {
    id: 'vrrp-gateway',
    stars: 4,
    features: ['net.vrrp', 'routing.static'],
    level: 4,
    build() {
      return {
        topology: twoRouters().topology,
        tasks: task('vrrpGateway', 4, [
          goal('vrrpGateway', 1, { type: 'vrrp', device: 'R1', ip: '192.168.1.1' }),
          goal('vrrpGateway', 2, { type: 'vrrp', device: 'R2', ip: '192.168.1.1', state: 'backup' }),
          goal('vrrpGateway', 3, { type: 'gateway', device: 'PC 1', gateway: '192.168.1.1' }),
          goal('vrrpGateway', 4, { type: 'failover', from: 'PC 1', to: 'Server', a: 'R1', b: 'LAN', within: 6000 }),
        ]),
      };
    },
  },
  {
    id: 'ecmp-ospf',
    stars: 4,
    features: ['routing.ospf'],
    level: 4,
    build() {
      return {
        topology: diamond().topology,
        tasks: task('ecmpOspf', 4, [
          goal('ecmpOspf', 1, { type: 'ecmp', device: 'R1', network: '10.4.0.0/24' }),
          goal('ecmpOspf', 2, { type: 'ping', from: 'PC 1', to: 'Server' }),
          goal('ecmpOspf', 3, { type: 'failover', from: 'PC 1', to: 'Server', a: 'R1', b: 'R2', within: 12_000 }),
        ]),
      };
    },
  },
  {
    id: 'lb-webfarm',
    stars: 3,
    features: ['service.loadbalancer', 'service.web'],
    level: 4,
    build() {
      return {
        topology: webFarm().topology,
        tasks: task('lbWebfarm', 3, [
          goal('lbWebfarm', 1, { type: 'balanced', from: 'PC', to: 'Load Balancer', min: 2 }),
          goal('lbWebfarm', 2, { type: 'failover', from: 'PC', to: 'Load Balancer', a: 'Web 1', b: 'Switch', within: 8000, url: 'http://192.168.1.80/' }),
        ]),
      };
    },
  },
];

