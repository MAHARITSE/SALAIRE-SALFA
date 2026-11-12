const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-comptes-demo-'));
const storage = new Map();
global.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
(async () => {
  try {
    const outfile = path.join(tmp, 'demo.cjs');
    esbuild.buildSync({
      stdin: { contents: `export * from './src/local/comptesDemo';
        export { ComptesDemoPanel } from './src/components/ComptesDemoPanel';
        export { apiLogin } from './src/api-local';
        export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, logLevel: 'silent',
    });
    const m = require(outfile);
    const disponibles = m.listerComptesDemoLocaux();
    assert.equal(disponibles.length, 2);
    assert.deepEqual(disponibles.map(c => c.role), ['Administrateur', 'Comptable']);
    for (const compte of disponibles) {
      assert.equal((await m.apiLogin(compte.username, compte.password)).role, compte.role, 'accès affiché réellement utilisable');
    }
    let choisi = null;
    const props = { comptes: disponibles, onChoisir: compte => { choisi = compte; } };
    const html = m.renderToStaticMarkup(m.createElement(m.ComptesDemoPanel, props));
    assert.match(html, /Comptes de démonstration/);
    assert.match(html, /admin123/);
    assert.match(html, /comptable123/);
    assert.doesNotMatch(html, /Caissière|caisse1234|admin1234/);
    assert.equal((html.match(/type="button"/g) || []).length, 2, 'le clic préremplit sans soumettre');
    assert.equal(choisi, null, 'pas de connexion automatique au rendu');
    const panel = m.ComptesDemoPanel(props);
    const buttons = panel.props.children[2].props.children;
    buttons[0].props.onClick();
    assert.strictEqual(choisi, disponibles[0]);
    assert.match(m.renderToStaticMarkup(m.createElement(m.ComptesDemoPanel, { ...props, disabled: true })), /disabled=""/);

    const key = 'salfa_paie_store_v1';
    const original = JSON.parse(storage.get(key));
    const modifie = JSON.parse(JSON.stringify(original));
    const admin = modifie.utilisateurs.find(u => u.username === 'admin');
    admin.password_hash = 'MOT-DE-PASSE-PRIVE-NE-PAS-AFFICHER';
    modifie.utilisateurs.push({ id: 99, username: 'PERSONNE-PRIVEE', nom_complet: 'SECRET', role: 'Administrateur', actif: 1, password_hash: 'HASH-PRIVE' });
    storage.set(key, JSON.stringify(modifie));
    const avant = storage.get(key);
    assert.deepEqual(m.listerComptesDemoLocaux().map(c => c.username), ['comptable'], 'accès modifié masqué, aucun compte privé listé');
    assert.equal(storage.get(key), avant, 'aucun compte ni mot de passe réinitialisé');
    admin.password_hash = original.utilisateurs.find(u => u.username === 'admin').password_hash;
    admin.actif = 0;
    storage.set(key, JSON.stringify(modifie));
    assert.deepEqual(m.listerComptesDemoLocaux().map(c => c.username), ['comptable'], 'accès désactivé masqué');
    admin.actif = 1; admin.role = 'Comptable';
    storage.set(key, JSON.stringify(modifie));
    assert.deepEqual(m.listerComptesDemoLocaux().map(c => c.username), ['comptable'], 'ne pas proposer un rôle trompeur');
    modifie.utilisateurs = [];
    storage.set(key, JSON.stringify(modifie));
    assert.deepEqual(m.listerComptesDemoLocaux(), [], 'ne recrée pas de compte supprimé');
    const ui = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');
    assert.match(ui, /if \(WAMP\) return/);
    assert.match(ui, /!WAMP && comptesDemo.length > 0/);
    console.log('Démo locale : 2 accès publics valides, préremplissage sans soumission, aucun compte privé, accès modifiés/désactivés/supprimés masqués, garde WAMP : OK');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
