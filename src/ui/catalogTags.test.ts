import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { matchesSearch, tagsOf } from './catalogTags';

setLocale('de');

describe('Katalog: Tags und Suche', () => {
  it('jede Übung hat mindestens ein Tag; M145 hat VLAN, DHCP und ACL', () => {
    const tags = new Map(CATALOG.map((e) => {
      const { topology, tasks } = e.build();
      return [e.id, tagsOf(e, topology, tasks.goals.map((g) => g.check.type))];
    }));
    for (const [id, list] of tags) expect(list.length, id).toBeGreaterThan(0);
    expect(tags.get('m145-ue04')).toContain('vlan');
    expect(tags.get('m145-ue08')).toContain('dhcp');
    expect(tags.get('m145-ue07b')).toContain('acl');
  });

  it('sucht wortweise, ohne Gross-/Kleinschreibung und Umlaute', () => {
    expect(matchesSearch('UE09 DHCP extern: Zentraler Server mit Relay', 'dhcp relay')).toBe(true);
    expect(matchesSearch('Fehlersuche im Büro', 'buero')).toBe(true);
    expect(matchesSearch('Fehlersuche im Büro', 'büro vlan')).toBe(false);
    expect(matchesSearch('irgendwas', '  ')).toBe(true);
  });
});
