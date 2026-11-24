import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyTopology, serializeProject, type TaskSet } from '../../core';
import { session } from './session.svelte';
import { isLargeTask, taskKey } from './taskView.svelte';

/** Server-Antworten mit wählbarer Verzögerung je Session-Code. */
function fakeServer(delays: Record<string, number>) {
  const project = JSON.parse(serializeProject(emptyTopology(), null, []));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const code = /sessions\/([A-Z0-9-]+)/.exec(url)?.[1] ?? '';
      await new Promise((r) => setTimeout(r, delays[code] ?? 0));
      return new Response(JSON.stringify({ project, updated: 1, connected: true }), { status: 200 });
    }),
  );
}

afterEach(async () => {
  await session.stopWatch();
  vi.unstubAllGlobals();
});

describe('Session ansehen (Lehrperson, Klasse)', () => {
  it('der letzte Klick gewinnt, auch wenn die erste Session später antwortet', async () => {
    fakeServer({ 'AAAA-AAAA': 80, 'BBBB-BBBB': 5 });
    const loaded: string[] = [];
    const a = session.watch('AAAA-AAAA', () => loaded.push('A'), 'token');
    const b = session.watch('BBBB-BBBB', () => loaded.push('B'), 'token');
    expect(await b).toBe(true);
    expect(await a).toBe(false);
    await new Promise((r) => setTimeout(r, 120));
    expect(session.watching?.code).toBe('BBBB-BBBB');
    expect(loaded).toEqual(['B']);
  });

  it('auch wenn die zweite Session langsamer antwortet', async () => {
    fakeServer({ 'AAAA-AAAA': 5, 'BBBB-BBBB': 60 });
    const loaded: string[] = [];
    const a = session.watch('AAAA-AAAA', () => loaded.push('A'), 'token');
    const b = session.watch('BBBB-BBBB', () => loaded.push('B'), 'token');
    await Promise.all([a, b]);
    expect(session.watching?.code).toBe('BBBB-BBBB');
    expect(loaded).toEqual(['B']);
  });

  it('«Beenden» während des Öffnens bricht das Öffnen ab', async () => {
    fakeServer({ 'AAAA-AAAA': 40 });
    const a = session.watch('AAAA-AAAA', () => undefined, 'token');
    await session.stopWatch();
    expect(await a).toBe(false);
    expect(session.watching).toBeNull();
  });
});

describe('Aufgabenfenster', () => {
  it('erkennt dieselbe Aufgabe auch als neues Objekt (kein erneutes Aufspringen)', () => {
    const goals = Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, text: `Ziel ${i}`, check: { type: 'noStorm' } }));
    const first = { title: 'Gross', description: 'x', goals } as unknown as TaskSet;
    const again = JSON.parse(JSON.stringify({ ...first, answers: { g1: 'Antwort' } })) as TaskSet;
    expect(isLargeTask(first)).toBe(true);
    expect(taskKey(again)).toBe(taskKey(first));
    expect(taskKey({ ...first, title: 'Andere' })).not.toBe(taskKey(first));
  });
});
