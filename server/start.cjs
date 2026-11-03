'use strict';
// Startdatei der Webversion (in Plesk als «Anwendungsstartdatei» eintragen).
// Siehe docs/plesk.md. Phusion Passenger fängt listen() ab; der Port ist dann egal.
const { createServer, ADMIN_PASSWORD } = require('./app.cjs');

const port = Number(process.env.PORT) || 3000;
if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) console.warn('Warnung: ADMIN_PASSWORD ist kürzer als 12 Zeichen. Bitte ein langes, zufälliges Passwort setzen.');
createServer().listen(port, () => {
  console.log(`leyoNET läuft auf Port ${port}${ADMIN_PASSWORD ? '' : ' (Admin gesperrt: ADMIN_PASSWORD fehlt)'}`);
});
