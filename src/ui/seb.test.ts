import { createDecipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SEB_KEY, randomPassword, sebFile, sha256Hex } from './seb';

/** Unabhängig nachgebaute Entschlüsselung nach der SEB-Dokumentation (Node statt Web Crypto). */
function decrypt(block: Buffer, password: string): Buffer {
  expect([block[0], block[1]]).toEqual([2, 1]);
  const encSalt = block.subarray(2, 10);
  const hmacSalt = block.subarray(10, 18);
  const iv = block.subarray(18, 34);
  const mac = block.subarray(block.length - 32);
  const cipher = block.subarray(34, block.length - 32);
  const hmacKey = pbkdf2Sync(password, hmacSalt, 10_000, 32, 'sha1');
  const ok = timingSafeEqual(createHmac('sha256', hmacKey).update(block.subarray(0, block.length - 32)).digest(), mac);
  if (!ok) throw new Error('hmac');
  const encKey = pbkdf2Sync(password, encSalt, 10_000, 32, 'sha1');
  const d = createDecipheriv('aes-256-cbc', encKey, iv);
  return Buffer.concat([d.update(cipher), d.final()]);
}

const url = 'https://app.leyonet.example/?seb=' + 'a'.repeat(64);

describe('Safe Exam Browser', () => {
  it('Passwort-Hash wie SEB: SHA-256 in Kleinbuchstaben-Hex', async () => {
    expect(await sha256Hex('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('Zufallspasswörter: 3 × 4 Zeichen ohne verwechselbare, jedes Mal anders', () => {
    const a = randomPassword();
    expect(a).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){2}$/);
    expect(new Set(Array.from({ length: 20 }, () => randomPassword())).size).toBe(20);
  });

  it('ohne Konfigurationspasswort: gzip(«plnd» + gzip(Property-List)) mit Start-Adresse und Hashes', async () => {
    const file = Buffer.from(await sebFile({ startUrl: url, adminPassword: 'admin', quitPassword: 'ende' }));
    const outer = gunzipSync(file);
    expect(outer.subarray(0, 4).toString()).toBe('plnd');
    const plist = gunzipSync(outer.subarray(4)).toString('utf8');
    expect(plist).toContain('<key>startURL</key>\n\t<string>https://app.leyonet.example/?seb=' + 'a'.repeat(64) + '</string>');
    expect(plist).toContain(`<key>hashedAdminPassword</key>\n\t<string>${await sha256Hex('admin')}</string>`);
    expect(plist).toContain(`<key>hashedQuitPassword</key>\n\t<string>${await sha256Hex('ende')}</string>`);
    expect(plist).toContain('<key>expression</key>\n\t\t\t<string>app.leyonet.example</string>');
    expect(plist).not.toContain('admin<');
    expect(plist).not.toContain('ende<');
  });

  it('mit Konfigurationspasswort: «pswd», AES-256-CBC, PBKDF2 und HMAC wie SEB; falsches Passwort scheitert', async () => {
    const file = Buffer.from(await sebFile({ startUrl: url, settingsPassword: 'Start-1234', quitPassword: 'ende' }));
    const outer = gunzipSync(file);
    expect(outer.subarray(0, 4).toString()).toBe('pswd');
    const plist = gunzipSync(decrypt(outer.subarray(4), 'Start-1234')).toString('utf8');
    expect(plist).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(plist).toContain('<key>URLFilterEnable</key>\n\t<true/>');
    expect(() => decrypt(outer.subarray(4), 'falsch')).toThrow('hmac');
  });

  it('Sonderzeichen in der Adresse werden für XML maskiert', async () => {
    const plist = gunzipSync(gunzipSync(Buffer.from(await sebFile({ startUrl: 'https://x.example/?a=1&b=<2>' }))).subarray(4)).toString('utf8');
    expect(plist).toContain('?a=1&amp;b=%3C2%3E');
    expect(SEB_KEY.test('a'.repeat(64))).toBe(true);
    expect(SEB_KEY.test('A'.repeat(64))).toBe(false);
  });
});
