import { describe, expect, it } from 'vitest';
import { cliHistory, MAX_HISTORY, pastedLines, rememberCommand } from './cli.svelte';

describe('Befehlszeile: Verlauf und Einfügen', () => {
  it('zerlegt eine eingefügte Konfiguration in Zeilen ohne Leerzeilen und Kommentare', () => {
    expect(pastedLines('enable\r\nconf t\n!\n  hostname R1  \n\n interface g0/0\n')).toEqual(['enable', 'conf t', '  hostname R1', ' interface g0/0']);
  });

  it('behält den Verlauf je Gerät, ohne Doppelte und begrenzt', () => {
    rememberCommand('con:x', 'show ip route');
    rememberCommand('con:x', 'enable');
    rememberCommand('con:x', 'show ip route');
    expect(cliHistory('con:x')).toEqual(['enable', 'show ip route']);
    expect(cliHistory('con:y')).toEqual([]);
    for (let i = 0; i < MAX_HISTORY + 10; i++) rememberCommand('con:z', `c${i}`);
    expect(cliHistory('con:z')).toHaveLength(MAX_HISTORY);
  });
});
