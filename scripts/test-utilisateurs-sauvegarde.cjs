// Vérifie qu'un échec de localStorage ne laisse aucune modification de compte en mémoire.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-users-'));
  try {
    const storage = new Map();
    let fail = false;
    global.localStorage = {
      getItem: k => storage.get(k) || null,
      setItem: (k, v) => { if (fail) throw new Error('quota'); storage.set(k, v); },
      removeItem: k => storage.delete(k),
    };
    const output = path.join(tmp, 'api.cjs');
    esbuild.buildSync({ stdin: { contents: "export * from './src/api-local'; export { getStore } from './src/local/store';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: output, loader: { '.png': 'dataurl' }, logLevel: 'silent' });
    const api = require(output);
    assert.ok(await api.apiLogin('admin', 'admin123'));
    const store = api.getStore();
    const before = JSON.stringify(store.utilisateurs);
    const saved = new Map(storage);
    fail = true;
    const operations = [
      () => api.creerUtilisateur({ username: 'nouveau', nom_complet: 'Nouveau', role: 'Comptable', password: 'test123' }),
      () => api.modifierUtilisateur(2, { username: 'modifie', nom_complet: 'Modifié', role: 'Administrateur' }),
      () => api.changerMotDePasseUtilisateur(2, 'nouveau123'),
      () => api.toggleActifUtilisateur(2, false),
      () => api.supprimerUtilisateur(2),
    ];
    for (const operation of operations) {
      const result = await operation();
      assert.equal(result.success, false);
      assert.match(result.message, /Sauvegarde locale impossible/);
      assert.equal(JSON.stringify(store.utilisateurs), before, 'La mémoire doit être restaurée');
      assert.deepEqual(storage, saved, 'Le stockage durable doit rester inchangé');
    }
    fail = false;
    assert.equal((await api.creerUtilisateur({ username: 'nouveau', nom_complet: 'Nouveau', role: 'Comptable', password: 'test123' })).success, true);
    assert.ok((await api.fetchUtilisateurs()).some(u => u.username === 'nouveau'));
    console.log('Sauvegarde des comptes : rollback et nouvelle tentative vérifiés.');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
