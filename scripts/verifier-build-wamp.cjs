// À lancer après le build WAMP (npm run test:wamp-build).
// La garde d'interface seule ne suffit pas : vérifier aussi le code distribué.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '../dist/assets');
assert.ok(fs.existsSync(assets), 'Exécutez npm run build:wamp avant ce contrôle.');
const fichiers = fs.readdirSync(assets).filter(f => f.endsWith('.js'));
assert.ok(fichiers.length > 0);
const code = fichiers.map(f => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
for (const texte of ['admin123', 'comptable123', 'Comptes de démonstration']) {
  assert.equal(code.includes(texte), false, `Le bundle final WAMP ne doit pas contenir : ${texte}`);
}
console.log('Bundle final WAMP : aucun panneau ni accès de démonstration distribué.');
