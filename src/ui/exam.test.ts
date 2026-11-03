import { describe, expect, it } from 'vitest';
import { emptyTopology, evaluateTasks, parseProject, scoreOf, serializeProject, swissGrade } from '../core';
import { setLocale } from '../i18n';
import { HOLZER } from './catalogM117';
import { EXAM_POINTS, buildExamSolution, buildExamTasks, checkExamSpec, randomExam, siteFacts, type ExamSpec } from './exam';

const SPECS: ExamSpec[] = [HOLZER, ...[1, 2, 3, 4].map((seed) => randomExam(seed, String(seed)))];

setLocale('de');

describe('Prüfungen «Firmennetz mit drei Standorten»', () => {
  for (const spec of SPECS) {
    it(`Variante ${spec.id} (${spec.company}): Vorgabe gültig, Musterlösung erreicht ${EXAM_POINTS.total} Punkte`, () => {
      expect(checkExamSpec(spec)).toBeNull();
      const tasks = buildExamTasks(spec);
      expect(tasks.goals.reduce((s, g) => s + (g.points ?? 1), 0)).toBe(EXAM_POINTS.total);
      const solution = buildExamSolution(spec);
      const results = evaluateTasks(solution, tasks);
      const failed = results.filter((r) => !r.passed).map((r) => `${r.id}: ${JSON.stringify(r.reason)}`);
      expect(failed).toEqual([]);
      expect(scoreOf(tasks, results)).toEqual({ points: 75, max: 75 });
      // Projektdatei mit Aufgabe lässt sich wieder öffnen.
      const reopened = parseProject(serializeProject(solution, tasks));
      expect(reopened.ok && reopened.tasks?.goals.length).toBe(tasks.goals.length);
    });
  }

  it('leere Abgabe gibt 0 Punkte und Note 1', () => {
    const tasks = buildExamTasks(SPECS[0]!);
    const score = scoreOf(tasks, evaluateTasks(emptyTopology(), tasks));
    expect(score.points).toBe(0);
    expect(swissGrade(score.points, score.max)).toBe(1);
  });

  it('Teilleistung: falsche Farbe und fehlender DNS-Eintrag kosten Punkte, falsche Router-Adresse nur einmal', () => {
    const spec = randomExam(11, 'T');
    const tasks = buildExamTasks(spec);
    let solution = buildExamSolution({ ...spec, sites: [spec.sites[0], spec.sites[1], { ...spec.sites[2], color: 'gray' }] });
    const name = siteFacts(spec.sites[1]).serverName;
    const server = solution.devices.find((d) => d.name === name)!;
    solution = { ...solution, devices: solution.devices.map((d) => (d.id === server.id ? { ...d, dnsServer: { records: [] } } : d)) };
    const results = evaluateTasks(solution, tasks);
    expect(results.filter((r) => !r.passed).map((r) => r.id)).toEqual(['s3-area', 'd-dns-2', 'd-http-2']);
    const score = scoreOf(tasks, results);
    expect(score.points).toBe(75 - 1 - 1 - 1);
    expect(swissGrade(score.points, 75)).toBe(5.8);
  });

  it('Folgefehler: Router mit falscher Adresse, Server und DHCP zeigen konsequent darauf', () => {
    const spec = randomExam(12, 'T');
    const tasks = buildExamTasks(spec);
    const f = siteFacts(spec.sites[0]);
    // Router .2 statt .1, Gateway von Server und DHCP ebenfalls .2: nur die Router-Adresse ist falsch.
    const wrong = f.router.replace(/\d+$/, (x) => String(Number(x) + 1));
    const json = JSON.stringify(buildExamSolution(spec)).split(`"${f.router}"`).join(`"${wrong}"`);
    const results = evaluateTasks(JSON.parse(json), tasks);
    expect(results.filter((r) => !r.passed).map((r) => r.id)).toEqual(['s1-router-ip']);
  });

  it('Varianten unterscheiden sich in Netzen, Präfixen und Namen', () => {
    const prefixes = new Set(SPECS.flatMap((s) => s.sites.map((x) => siteFacts(x).prefix)));
    expect(prefixes.size).toBeGreaterThanOrEqual(6);
    expect(new Set(SPECS.map((s) => s.sites[0].network)).size).toBe(5);
  });

  it('zufällige Varianten sind gültig, wiederholbar und lösbar', () => {
    expect(randomExam(42)).toEqual(randomExam(42));
    for (const seed of [1, 7, 99, 2026]) {
      const spec = randomExam(seed);
      expect(checkExamSpec(spec)).toBeNull();
      const tasks = buildExamTasks(spec);
      const results = evaluateTasks(buildExamSolution(spec), tasks);
      expect(results.filter((r) => !r.passed)).toEqual([]);
    }
  });

  it('meldet Fehler in einer angepassten Vorgabe', () => {
    const spec = randomExam(3);
    expect(checkExamSpec({ ...spec, transfers: ['172.16.255.0/29', spec.transfers[1], spec.transfers[2]] })).toMatchObject({ code: 'transfer' });
    expect(checkExamSpec({ ...spec, sites: [{ ...spec.sites[0], dhcpStart: '192.0.2.5' }, spec.sites[1], spec.sites[2]] })).toMatchObject({ code: 'outside' });
    expect(checkExamSpec({ ...spec, sites: [spec.sites[0], { ...spec.sites[1], network: spec.sites[0].network }, spec.sites[2]] })).toMatchObject({ code: 'overlap' });
    expect(checkExamSpec({ ...spec, intranet: { ...spec.intranet, domain: 'bern.ch' } })).toMatchObject({ code: 'domain' });
  });
});
