/**
 * Anleitung (Prompt) für eine KI, die Aufgaben oder Prüfungen im Austauschformat schreibt
 * (src/core/tasks/aiExchange.ts). Die Anleitung enthält die Regeln, das vollständige Schema
 * mit allen Prüfbausteinen (aus CHECK_FIELDS, damit nichts veraltet) und die aktuelle Aufgabe
 * als Beispiel. Die Lehrperson kopiert sie in eine KI ihrer Wahl; leyoNET selbst stellt keine
 * Verbindung her (keine externen Ressourcen, siehe docs/datenschutz.md).
 */
import { AI_DEVICE_TYPES, AI_FORMAT, AI_FORMAT_VERSION, AI_LIMITS, CHECK_TYPES, MAX_GOAL_POINTS, MEDIA, type AiExchange } from '../core';
import { t, type Locale } from '../i18n';
import { CHECK_FIELDS, PROTOCOLS, type FieldSpec } from './taskForm';

const TEXT = {
  de: {
    title: 'Anleitung für eine KI: Aufgaben für leyoNET schreiben',
    role: 'Du schreibst Übungs- oder Prüfungsaufgaben für leyoNET, einen Netzwerk-Simulator für den Informatik-Unterricht (Berufsfachschule bis Fachhochschule, Module wie M117, M129, M145). Die Lernenden bauen das Netz im Simulator; leyoNET prüft die Lösung automatisch mit den Prüfbausteinen unten.',
    wish: 'Wunsch der Lehrperson',
    noWish: '(keine Angabe – schreibe eine neue Aufgabe in der Art des Beispiels, mit anderen Namen und Adressen)',
    rules: 'Regeln',
    ruleList: [
      'Antworte mit genau einem JSON-Objekt in einem Codeblock ```json … ```. Kein weiterer Text im Codeblock, keine Kommentare im JSON.',
      `Das Objekt hat "format": "${AI_FORMAT}" und "version": ${AI_FORMAT_VERSION}.`,
      'Verwende nur private Adressen (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) oder Dokumentationsadressen (RFC 5737). Domains enden auf .example (RFC 2606). Keine echten Firmen, Personen oder E-Mail-Adressen.',
      'Gerätenamen sind eindeutig, höchstens 40 Zeichen, nur Buchstaben, Ziffern, Bindestrich und Unterstrich. In den Prüfbausteinen steht genau derselbe Name.',
      'Prüfbausteine mit Geräten beziehen sich auf Geräte, die im Startnetz stehen oder die die Lernenden laut Auftrag selbst hinzufügen (dann mit Baustein "device" prüfen).',
      `Höchstens ${AI_LIMITS.devices} Geräte, ${AI_LIMITS.links} Kabel und ${AI_LIMITS.goals} Prüfziele. Punkte je Ziel 0–${MAX_GOAL_POINTS}.`,
      'Bei einer Prüfung: "grading": true, Punkte je Ziel und "section" für die Teile des Punkterasters (z.B. «Adressierung», «Routing»).',
      'Das Startnetz enthält, was die Lernenden vorfinden. Was sie selbst einstellen sollen, gehört nicht ins Startnetz (sonst ist die Aufgabe schon gelöst).',
      'Der Auftrag ("description") ist für Lernende verständlich, nennt alle nötigen Angaben (Netze, Adressbereiche, Namen) und verrät die Lösung nicht.',
      'Jedes Ziel hat einen kurzen "text" (was erreicht sein muss) und darf einen "hint" haben (Tipp, wenn das Ziel nicht erfüllt ist).',
    ],
    schema: 'Schema',
    top: 'Oberste Ebene',
    deviceHead: 'Gerät (start.devices[])',
    linkHead: 'Kabel (start.links[])',
    goalHead: 'Prüfziel (goals[])',
    checks: 'Prüfbausteine (goals[].check)',
    checksNote: 'Jeder Baustein hat "type" und die genannten Felder; «optional» darf fehlen. Bausteine mit ⚡ prüfen in einer Simulation, ob es wirklich funktioniert.',
    optional: 'optional',
    example: 'Beispiel (aktuelle Aufgabe in leyoNET)',
    exampleEmpty: 'Beispiel',
    answer: 'Antworte jetzt mit dem JSON-Objekt.',
    fields: {
      title: 'Titel der Aufgabe (höchstens 120 Zeichen)',
      description: 'Auftrag für die Lernenden (Text, Zeilenumbrüche mit \\n)',
      difficulty: 'Schwierigkeit 1–5 (optional)',
      grading: 'true = Prüfung mit Note (optional)',
      start: 'Startnetz: { "devices": [...], "links": [...] }',
      goals: 'Liste der Prüfziele (mindestens eines)',
      name: 'eindeutiger Name',
      type: 'Gerätetyp',
      xy: 'Position in Pixeln (−10000 bis 10000, optional; Abstand etwa 150)',
      ports: 'Anzahl Ethernet-Anschlüsse (optional)',
      addresses: 'feste Adressen: [{ "port": 0, "ip": "192.168.1.1", "mask": "255.255.255.0" }] (optional; Endgeräte höchstens eine)',
      host: 'nur Endgeräte (pc, notebook, server): "gateway", "dns" oder "dhcp": true (optional)',
      ab: 'Gerätenamen der beiden Enden',
      medium: 'Medium (optional, Standard tp)',
      portsAb: 'Anschlussnummer ab 0 (optional, sonst der nächste freie)',
      text: 'was erreicht sein muss',
      check: 'Prüfbaustein (siehe unten)',
      points: `Punkte 0–${MAX_GOAL_POINTS} (optional, Standard 1)`,
      section: 'Teil der Prüfung (optional, höchstens 80 Zeichen)',
      hint: 'Tipp bei nicht erfülltem Ziel (optional)',
    },
    kinds: {
      device: 'Gerätename',
      devices: 'Liste von Gerätenamen',
      text: 'Text',
      number: 'ganze Zahl',
      deviceType: 'Gerätetyp',
      protocol: 'Protokoll',
      choice: 'eines von',
      pairs: 'Liste von Paaren [["Von", "Nach"], …]',
      values: 'Liste von Texten, die in der Notiz stehen müssen',
      alternatives: 'Liste von Texten',
      numbers: 'Liste ganzer Zahlen',
    },
  },
  en: {
    title: 'Instructions for an AI: writing tasks for leyoNET',
    role: 'You write practice or exam tasks for leyoNET, a network simulator for teaching computer science (vocational school to university of applied sciences, modules such as M117, M129, M145). Learners build the network in the simulator; leyoNET checks the solution automatically with the checks listed below.',
    wish: 'What the teacher wants',
    noWish: '(not specified – write a new task similar to the example, with different names and addresses)',
    rules: 'Rules',
    ruleList: [
      'Reply with exactly one JSON object in a code block ```json … ```. No other text inside the code block, no comments in the JSON.',
      `The object has "format": "${AI_FORMAT}" and "version": ${AI_FORMAT_VERSION}.`,
      'Use private addresses only (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or documentation addresses (RFC 5737). Domains end in .example (RFC 2606). No real companies, people or e-mail addresses.',
      'Device names are unique, at most 40 characters, letters, digits, hyphen and underscore only. Checks use exactly the same name.',
      'Checks refer to devices in the start network or to devices the learners add themselves as instructed (check those with the "device" check).',
      `At most ${AI_LIMITS.devices} devices, ${AI_LIMITS.links} cables and ${AI_LIMITS.goals} goals. Points per goal 0–${MAX_GOAL_POINTS}.`,
      'For an exam: "grading": true, points per goal and "section" for the parts of the marking scheme (e.g. "Addressing", "Routing").',
      'The start network contains what the learners find. What they are supposed to configure does not belong in it (otherwise the task is already solved).',
      'The assignment ("description") is understandable for learners, gives all required details (networks, address ranges, names) and does not give away the solution.',
      'Each goal has a short "text" (what must be achieved) and may have a "hint" (shown if the goal is not met).',
    ],
    schema: 'Schema',
    top: 'Top level',
    deviceHead: 'Device (start.devices[])',
    linkHead: 'Cable (start.links[])',
    goalHead: 'Goal (goals[])',
    checks: 'Checks (goals[].check)',
    checksNote: 'Each check has "type" and the listed fields; "optional" may be omitted. Checks marked ⚡ run a simulation to verify it really works.',
    optional: 'optional',
    example: 'Example (current task in leyoNET)',
    exampleEmpty: 'Example',
    answer: 'Now reply with the JSON object.',
    fields: {
      title: 'title of the task (at most 120 characters)',
      description: 'assignment for the learners (text, line breaks as \\n)',
      difficulty: 'difficulty 1–5 (optional)',
      grading: 'true = graded exam (optional)',
      start: 'start network: { "devices": [...], "links": [...] }',
      goals: 'list of goals (at least one)',
      name: 'unique name',
      type: 'device type',
      xy: 'position in pixels (−10000 bis 10000, optional; spacing about 150)',
      ports: 'number of Ethernet ports (optional)',
      addresses: 'static addresses: [{ "port": 0, "ip": "192.168.1.1", "mask": "255.255.255.0" }] (optional; at most one for end devices)',
      host: 'end devices only (pc, notebook, server): "gateway", "dns" or "dhcp": true (optional)',
      ab: 'device names of both ends',
      medium: 'medium (optional, default tp)',
      portsAb: 'port number from 0 (optional, otherwise the next free one)',
      text: 'what must be achieved',
      check: 'check (see below)',
      points: `points 0–${MAX_GOAL_POINTS} (optional, default 1)`,
      section: 'part of the exam (optional, at most 80 characters)',
      hint: 'tip if the goal is not met (optional)',
    },
    kinds: {
      device: 'device name',
      devices: 'list of device names',
      text: 'text',
      number: 'integer',
      deviceType: 'device type',
      protocol: 'protocol',
      choice: 'one of',
      pairs: 'list of pairs [["From", "To"], …]',
      values: 'list of texts that must appear in the note',
      alternatives: 'list of texts',
      numbers: 'list of integers',
    },
  },
} as const;

/** Ein kleines Beispiel, falls noch keine Aufgabe offen ist. */
const fallback = (en: boolean): AiExchange => ({
  format: AI_FORMAT,
  version: AI_FORMAT_VERSION,
  title: en ? 'Office with a router' : 'Büro mit Router',
  description: en
    ? 'Connect PC1 (network 192.168.10.0/24) and PC2 (network 192.168.20.0/24) via R1. The router uses the first address in each network.'
    : 'Verbinde PC1 (Netz 192.168.10.0/24) und PC2 (Netz 192.168.20.0/24) über R1. Der Router hat jeweils die erste Adresse.',
  difficulty: 2,
  start: {
    devices: [
      { name: 'PC1', type: 'pc', x: 120, y: 160 },
      { name: 'R1', type: 'router', x: 320, y: 160 },
      { name: 'PC2', type: 'pc', x: 520, y: 160 },
    ],
    links: [
      { a: 'PC1', b: 'R1' },
      { a: 'R1', b: 'PC2' },
    ],
  },
  goals: [
    { text: en ? 'R1 has the address 192.168.10.1/24.' : 'R1 hat die Adresse 192.168.10.1/24.', check: { type: 'address', device: 'R1', address: '192.168.10.1/24' }, points: 2 },
    { text: en ? 'PC1 is in the network 192.168.10.0/24.' : 'PC1 liegt im Netz 192.168.10.0/24.', check: { type: 'inNetwork', device: 'PC1', network: '192.168.10.0/24' } },
    { text: en ? 'PC1 reaches PC2.' : 'PC1 erreicht PC2.', check: { type: 'ping', from: 'PC1', to: 'PC2' }, points: 3, hint: en ? 'Set the gateway on both PCs.' : 'Gateway auf beiden PCs eintragen.' },
  ],
});

function fieldLine(f: FieldSpec, k: (typeof TEXT)[Locale]['kinds'], optional: string): string {
  let kind: string = k[f.kind];
  if (f.kind === 'choice') kind += ' ' + (f.options ?? []).map((o) => `"${o}"`).join(', ');
  if (f.kind === 'deviceType') kind += ' (' + AI_DEVICE_TYPES.join(', ') + ')';
  if (f.kind === 'protocol') kind += ' (' + PROTOCOLS.join(', ') + ')';
  return `"${f.key}": ${kind}${f.optional ? ` (${optional})` : ''}`;
}

/** Vollständige Anleitung als Markdown. */
export function buildAiPrompt(lang: Locale, exchange: AiExchange | null, wish: string): string {
  const x = TEXT[lang === 'en' ? 'en' : 'de'];
  const f = x.fields;
  const example = exchange && exchange.goals.length ? exchange : fallback(lang === 'en');
  const checks = CHECK_TYPES.map((type) => {
    const fields = CHECK_FIELDS[type].map((s) => fieldLine(s, x.kinds, x.optional));
    return `- \`${type}\` – ${t(`taskForm.type.${type}`)}${fields.length ? ': ' + fields.join('; ') : ''}`;
  });
  return [
    `# ${x.title}`,
    '',
    x.role,
    '',
    `## ${x.wish}`,
    '',
    wish.trim() || x.noWish,
    '',
    `## ${x.rules}`,
    '',
    ...x.ruleList.map((r, i) => `${i + 1}. ${r}`),
    '',
    `## ${x.schema}`,
    '',
    `### ${x.top}`,
    '',
    `- "format": "${AI_FORMAT}", "version": ${AI_FORMAT_VERSION}`,
    `- "title": ${f.title}`,
    `- "description": ${f.description}`,
    `- "difficulty": ${f.difficulty}`,
    `- "grading": ${f.grading}`,
    `- "start": ${f.start}`,
    `- "goals": ${f.goals}`,
    '',
    `### ${x.deviceHead}`,
    '',
    `- "name": ${f.name}`,
    `- "type": ${f.type}: ${AI_DEVICE_TYPES.join(', ')}`,
    `- "x", "y": ${f.xy}`,
    `- "ports": ${f.ports}`,
    `- "addresses": ${f.addresses}`,
    `- ${f.host}`,
    '',
    `### ${x.linkHead}`,
    '',
    `- "a", "b": ${f.ab}`,
    `- "medium": ${f.medium}: ${MEDIA.join(', ')}`,
    `- "aPort", "bPort": ${f.portsAb}`,
    '',
    `### ${x.goalHead}`,
    '',
    `- "text": ${f.text}`,
    `- "check": ${f.check}`,
    `- "points": ${f.points}`,
    `- "section": ${f.section}`,
    `- "hint": ${f.hint}`,
    '',
    `### ${x.checks}`,
    '',
    x.checksNote,
    '',
    ...checks,
    '',
    `## ${exchange && exchange.goals.length ? x.example : x.exampleEmpty}`,
    '',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    '',
    x.answer,
    '',
  ].join('\n');
}
