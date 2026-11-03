/**
 * Übergabe an die Auswertung: Die Admin-Konsole legt die Abgaben einer
 * Server-Prüfung (samt Schlüssel) hier ab und öffnet den Auswertungsdialog,
 * der sie sofort automatisch auswertet. Nur im Arbeitsspeicher.
 */
export interface ReviewInput {
  title: string;
  key: string | null;
  files: { name: string; text: string }[];
}

export const reviewInbox: { value: ReviewInput | null } = { value: null };
