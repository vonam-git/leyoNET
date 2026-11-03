import { describe, expect, it } from 'vitest';
import { addArea, configureHost, setDhcpServer } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { NetBuilder, unwrap } from '../sim/testing';
import { buildExam, chooseVariant, hashCode, keyVariantFor, learnerGoals, parseExamKey, randomCode, serializeExamKey } from './exam';
import { answerMatches, evaluateTasks, readTasks, scoreOf, type TaskSet } from './tasks';

/** PC 1 — Router — PC 2, Router mit Bereich «LAN 1». */
function net() {
  const n = new NetBuilder();
  const pc1 = n.host('PC 1', '192.168.1.10', '24', '192.168.1.1');
  const pc2 = n.host('PC 2', '192.168.2.10', '24', '192.168.2.1');
  const r = n.router('Router', ['192.168.1.1/24', '192.168.2.1/24']);
  n.link(pc1, r);
  n.link(r, pc2);
  return { n, pc1, pc2, r };
}

const tasks: TaskSet = {
  title: 'Zwei Netze',
  grading: true,
  goals: [
    { id: 'gw', text: 'Gateway', check: { type: 'gateway', device: 'PC 1', gateway: '@router' }, points: 2, section: 'Adressen' },
    { id: 'pings', text: 'Pings', check: { type: 'pings', pairs: [['PC 1', 'PC 2'], ['PC 2', 'PC 1'], ['PC 1', '192.168.9.9'], ['PC 2', '192.168.1.1']] }, points: 4, section: 'Verbindungen' },
    { id: 'netz', text: 'Netz-ID?', check: { type: 'answer', accept: ['192.168.1.0/24', '192.168.1.0'] }, points: 1, section: 'Fragen' },
    { id: 'wahl', text: 'Welches Gerät verbindet Netze?', check: { type: 'answer', kind: 'choice', options: ['Switch', 'Router'], accept: ['Router'] }, points: 1, section: 'Fragen' },
    { id: 'doku', text: 'Doku', check: { type: 'areaNote', title: 'LAN 1', values: ['192.168.1.0/24', '255.255.255.0', '192.168.1.255', '254'] }, points: 4, section: 'Dokumentation' },
    { id: 'lp', text: 'Darstellung', check: { type: 'manual' }, points: 2, section: 'Dokumentation' },
  ],
};

describe('Teilpunkte, Folgefehler, Fragen und Dokumentation', () => {
  it('Gateway «@router»: jede Router-Adresse im eigenen Netz zählt (Folgefehler)', () => {
    const { n, pc1, r } = net();
    expect(evaluateTasks(n.topology, tasks)[0]!.passed).toBe(true);
    // Router hat .254 statt .1, der PC zeigt konsequent darauf: Gateway trotzdem richtig.
    n.apply((t) => configureHost(t, pc1, { ip: '192.168.1.10', mask: '24', gateway: '192.168.1.254' }));
    expect(evaluateTasks(n.topology, tasks)[0]!.passed).toBe(false);
    void r;
  });

  it('Pings geben anteilige Punkte, Fragen werden tolerant verglichen, «manual» zählt zum Maximum', () => {
    const { n } = net();
    const withAnswers: TaskSet = { ...tasks, answers: { netz: ' 192.168.1.0 /24 ', wahl: 'Switch' } };
    const results = evaluateTasks(n.topology, withAnswers);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.pings).toMatchObject({ passed: false, fraction: 0.75 });
    expect(byId.netz!.passed).toBe(true);
    expect(byId.wahl!.passed).toBe(false);
    expect(byId.lp).toMatchObject({ passed: false, manual: true });
    // gw 2 + pings 3 + netz 1 = 6 von 14; mit Nachkorrektur «Darstellung» 2 → 8.
    expect(scoreOf(withAnswers, results)).toEqual({ points: 6, max: 14 });
    expect(scoreOf(withAnswers, results, { lp: 2 })).toEqual({ points: 8, max: 14 });
  });

  it('Dokumentation in der Notiz eines Bereichs: Werte einzeln, Schreibweisen tolerant', () => {
    const { n } = net();
    n.topology = unwrap(
      addArea(n.topology, { title: 'LAN 1', color: 'green', x: 0, y: 0, width: 100, height: 100, note: 'Netz: 192.168.1.0 / 24\nMaske 255.255.255.0\nBroadcast 192.168.1.25' }),
    ).topology;
    const doku = evaluateTasks(n.topology, tasks).find((r) => r.id === 'doku')!;
    // «192.168.1.25» ist nicht «192.168.1.255», «254» fehlt.
    expect(doku).toMatchObject({ passed: false, fraction: 0.5 });
    expect(doku.reason?.params?.missing).toBe('192.168.1.255, 254');
  });

  it('Antworten: Gross/klein, Leerzeichen, Zahlen, Adressen', () => {
    expect(answerMatches('ROUTER', 'Router')).toBe(true);
    expect(answerMatches('254.', '254')).toBe(true);
    expect(answerMatches('192.168.001.000', '192.168.1.0')).toBe(true);
    expect(answerMatches('10.0.0.1', '10.0.0.10')).toBe(false);
    expect(answerMatches("1'022", '1022')).toBe(true);
  });
});

describe('Prüfungsdatei und Schlüssel', () => {
  it('Prüfungsdatei enthält keine Prüfbausteine und keine Lösungen, der Schlüssel alles', async () => {
    const { n } = net();
    const { learner, key } = await buildExam({ id: 'P-TEST', title: 'Test', code: 'ab12cd', minutes: 45, totalLabel: 'Total', variants: [{ id: '1', tasks, topology: n.topology }] });
    const text = serializeProject(learner.topology, learner.tasks);
    expect(text).not.toContain('@router');
    expect(text).not.toContain('192.168.1.255');
    expect(text).not.toContain('accept');
    expect(text).not.toContain('ab12cd');
    expect(learner.tasks.goals.map((g) => g.id)).toEqual(['netz', 'wahl']);
    expect(learner.tasks.exam).toMatchObject({ id: 'P-TEST', variant: '1', minutes: 45 });
    expect(learner.tasks.exam?.raster).toEqual([
      { label: 'Adressen', points: 2 },
      { label: 'Verbindungen', points: 4 },
      { label: 'Fragen', points: 2 },
      { label: 'Dokumentation', points: 6 },
    ]);
    expect(learner.tasks.exam?.unlock).toBe(await hashCode('AB12CD'));
    const parsed = parseProject(text);
    expect(parsed.ok && parsed.tasks?.exam?.id).toBe('P-TEST');
    // Schlüssel: Datei lesen, Variante zur Abgabe finden, auswerten.
    const k = parseExamKey(serializeExamKey(key), readTasks);
    expect(k.ok).toBe(true);
    if (!k.ok || !parsed.ok) return;
    const submission = { ...parsed.tasks!, answers: { netz: '192.168.1.0/24' } };
    const variant = keyVariantFor(k.key, submission)!;
    expect(variant.tasks.goals).toHaveLength(6);
    const results = evaluateTasks(n.topology, { ...variant.tasks, answers: submission.answers });
    expect(results.find((r) => r.id === 'netz')!.passed).toBe(true);
    expect(keyVariantFor(k.key, { ...submission, exam: { ...submission.exam!, id: 'ANDERE' } })).toBeNull();
  });

  it('mehrere Varianten: Platz wählen übernimmt Aufgabe und Startnetz', async () => {
    const a = net().n.topology;
    const b = unwrap(setDhcpServer(net().n.topology, net().n.topology.devices[0]!.id, { start: '192.168.1.100', end: '192.168.1.110', leaseTime: 3600 }));
    const { learner } = await buildExam({
      id: 'P-2',
      title: 'Fehlersuche',
      description: 'Wähle deinen Platz.',
      code: 'X',
      totalLabel: 'Total',
      variants: [
        { id: '01', tasks: { ...tasks, title: 'Platz 1' }, topology: a, prebuilt: true },
        { id: '02', tasks: { ...tasks, title: 'Platz 2' }, topology: b, prebuilt: true },
      ],
    });
    expect(learner.tasks.exam?.variants).toHaveLength(2);
    expect(learner.topology.devices).toHaveLength(0);
    const parsed = parseProject(serializeProject(learner.topology, learner.tasks));
    if (!parsed.ok) throw new Error('parse');
    const chosen = chooseVariant(parsed.tasks!, '02')!;
    expect(chosen.tasks.title).toBe('Platz 2');
    expect(chosen.tasks.exam?.variant).toBe('02');
    expect(chosen.tasks.exam?.variants).toBeUndefined();
    expect(chosen.topology?.devices[0]?.dhcpServer?.start).toBe('192.168.1.100');
    expect(learnerGoals(tasks)[1]!.check).toEqual({ type: 'answer', kind: 'choice', options: ['Switch', 'Router'] });
  });

  it('Code: ohne verwechselbare Zeichen, Prüfwert unabhängig von Gross/klein', async () => {
    expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await hashCode('k7q 2mx')).toBe(await hashCode('K7Q2MX'));
    expect(await hashCode('K7Q2MX')).not.toBe(await hashCode('K7Q2MY'));
  });
});
