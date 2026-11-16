'use strict';
// Startdatei der Webversion (in Plesk als «Anwendungsstartdatei» eintragen).
// Siehe docs/plesk.md. Phusion Passenger fängt listen() ab; der Port ist dann egal.
const path = require('node:path');
const { createServer, ADMIN_PASSWORD, DATA_DIR, ROOT } = require('./app.cjs');

const port = Number(process.env.PORT) || 3000;
if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) console.warn('Warnung: ADMIN_PASSWORD ist kürzer als 12 Zeichen. Bitte ein langes, zufälliges Passwort setzen.');
// Der Datenordner gehört nicht in den Ordner, den der Webserver kennt: Bei einem falsch gesetzten
// Dokumentstamm wären Abgaben sonst abrufbar (die .htaccess im Datenordner wirkt nur mit Apache).
if (!path.relative(ROOT, DATA_DIR).startsWith('..')) console.warn('Hinweis: Der Datenordner liegt im Programmordner. Empfohlen: DATA_DIR auf einen Ordner ausserhalb des Web-Verzeichnisses setzen (siehe docs/plesk.md).');
createServer().listen(port, () => {
  console.log(`leyoNET läuft auf Port ${port}${ADMIN_PASSWORD ? '' : ' (Admin gesperrt: ADMIN_PASSWORD fehlt)'}`);
});
