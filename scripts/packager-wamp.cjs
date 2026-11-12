// Prépare uniquement le dossier généré du dépôt, jamais une installation serveur.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { zipSync, unzipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const destination = path.join(root, 'wamp/Salaire_salfa');
const archive = path.join(root, 'wamp/Salaire_salfa.zip');
require('./verifier-build-wamp.cjs');
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Compilation WAMP requise.');
const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-package-wamp-'));
const stage = path.join(temporaire, 'Salaire_salfa');
function fichiers(dossier, prefixe = '') {
  return fs.readdirSync(dossier, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Aucun lien symbolique dans le paquet.');
    const nom = prefixe + entry.name;
    return entry.isDirectory() ? fichiers(path.join(dossier, entry.name), nom + '/') : [nom];
  });
}
try {
  fs.cpSync(dist, stage, { recursive: true });
  // Liste explicite : aucun fichier de configuration réelle ni sauvegarde SQL.
  fs.mkdirSync(path.join(stage, 'api'));
  for (const nom of ['index.php', 'schema.php', 'validation.php', 'sqlRestore.php']) {
    fs.copyFileSync(path.join(root, 'wamp/api', nom), path.join(stage, 'api', nom));
  }
  for (const nom of ['.htaccess', '.user.ini']) fs.copyFileSync(path.join(root, 'wamp', nom), path.join(stage, nom));
  const liste = fichiers(stage);
  for (const nom of liste) assert.ok(!/(?:salfa-config\.php|\.env|\.sql$|backups\/|node_modules\/)/i.test(nom), `Fichier interdit : ${nom}`);
  const empreintes = Object.fromEntries(liste.map(nom => [nom, crypto.createHash('sha256').update(fs.readFileSync(path.join(stage, nom))).digest('hex')]));
  fs.writeFileSync(path.join(stage, 'VERSION-WAMP.json'), JSON.stringify({
    application: 'SALFA — Paie et Congé', version: require('../package.json').version,
    construitLe: new Date().toISOString(), backend: 'wamp',
    contactSessionSecondes: 15, expirationSansContactSecondes: 3600,
    fichiers: empreintes,
  }, null, 2) + '\n');
  const contenus = Object.fromEntries(fichiers(stage).map(nom => [`Salaire_salfa/${nom}`, new Uint8Array(fs.readFileSync(path.join(stage, nom)))]));
  const zip = zipSync(contenus, { level: 6 });
  // Vérifier l'archive avant de remplacer le précédent paquet du dépôt.
  const extraits = unzipSync(zip);
  assert.equal(Object.keys(extraits).length, Object.keys(contenus).length);
  for (const [nom, octets] of Object.entries(contenus)) assert.deepEqual(extraits[nom], octets, `ZIP incohérent : ${nom}`);
  // destination constante et réservée aux fichiers générés ; aucun accès à C:\wamp64.
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(stage, destination, { recursive: true });
  fs.writeFileSync(archive, zip);
  console.log(`Paquet WAMP actualisé : wamp/Salaire_salfa (${Object.keys(contenus).length} fichiers) et wamp/Salaire_salfa.zip (${zip.length} octets).`);
} finally { fs.rmSync(temporaire, { recursive: true, force: true }); }
