import { describe, expect, it } from 'vitest';
import { formatCode } from './codeInput';

describe('Code-Eingabe', () => {
  it('setzt den Bindestrich nach vier Zeichen', () => {
    expect(formatCode('abc')).toBe('ABC');
    expect(formatCode('abcd')).toBe('ABCD-');
    expect(formatCode('abcd2')).toBe('ABCD-2');
    expect(formatCode('ab cd 23 45 99')).toBe('ABCD-2345');
  });
  it('hängt beim Löschen keinen Bindestrich an', () => {
    expect(formatCode('ABCD', true)).toBe('ABCD');
  });
});
