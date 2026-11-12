const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { unzipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const dossier = path.join(root, 'wamp/Salaire_salfa');
const zip = unzipSync(fs.readFileSync(path.join(root, 'wamp/Salaire_salfa.zip')));
const manifest = JSON.parse(fs.readFileSync(path.join(dossier, 'VERSION-WAMP.json'), 'utf8'));
assert.equal(manifest.backend, 'wamp');
assert.equal(manifest.contactSessionSecondes, 15);
assert.equal(manifest.expirationSansContactSecondes, 3600);
for (const [nom, hash] of Object.entries(manifest.fichiers)) {
  const data = fs.readFileSync(path.join(dossier, nom));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), hash, `Empreinte ${nom}`);
  assert.deepEqual(Buffer.from(zip[`Salaire_salfa/${nom}`] || []), data, `ZIP ${nom}`);
}
assert.equal(Object.keys(zip).length, Object.keys(manifest.fichiers).length + 1);
assert.deepEqual(Buffer.from(zip['Salaire_salfa/VERSION-WAMP.json']), fs.readFileSync(path.join(dossier, 'VERSION-WAMP.json')));
for (const nom of ['index.php', 'schema.php', 'validation.php', 'sqlRestore.php']) {
  assert.deepEqual(fs.readFileSync(path.join(dossier, 'api', nom)), fs.readFileSync(path.join(root, 'wamp/api', nom)), `API à jour : ${nom}`);
}
for (const nom of ['.htaccess', '.user.ini']) assert.deepEqual(fs.readFileSync(path.join(dossier, nom)), fs.readFileSync(path.join(root, 'wamp', nom)));
const html = fs.readFileSync(path.join(dossier, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(dossier, match[1])), `Asset ${match[1]}`);
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, 'URLs relatives pour le sous-dossier WAMP');
const code = Object.keys(manifest.fichiers).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(dossier, f), 'utf8')).join('\n');
assert.match(code, /Connexion à la Paie et Congé/);
assert.match(code, /sql_backup_restore/);
assert.doesNotMatch(code, /Comptes de démonstration|admin123|comptable123|Exporter SQL Congés uniquement|Importer Excel \(Ancien/);
for (const nom of Object.keys(zip)) assert.ok(!/\.sql$|salfa-config\.php|\.env|backups\//i.test(nom), `Aucun secret/sauvegarde : ${nom}`);
console.log('Paquet WAMP : ZIP identique au dossier, API et empreintes à jour, URLs relatives, connexion/menu SQL présents, aucun compte de démo ni secret MySQL.');
