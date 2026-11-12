const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-session-'));
const storage = new Map();
const cookies = new Map();
const stockageOnglet = new Map();
let cookiesAutorises = true;
global.sessionStorage = { getItem: k => stockageOnglet.get(k) ?? null, setItem: (k, v) => stockageOnglet.set(k, v), removeItem: k => stockageOnglet.delete(k) };
let lectures = 0, ecritures = 0;
global.localStorage = {
  getItem(k) { lectures++; return storage.get(k) ?? null; },
  setItem(k, v) { ecritures++; storage.set(k, v); },
  removeItem(k) { ecritures++; storage.delete(k); },
};
global.document = {};
Object.defineProperty(document, 'cookie', {
  get() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
  set(value) {
    if (!cookiesAutorises) return;
    const [kv] = value.split(';');
    const [k, v] = kv.split('=');
    if (/max-age=0/.test(value)) cookies.delete(k); else cookies.set(k, v);
  },
});
const vraiNow = Date.now;
let now = 1_000_000;
Date.now = () => now;
function bundle(wamp) {
  const outfile = path.join(tmp, wamp ? 'wamp.cjs' : 'local.cjs');
  esbuild.buildSync({
    stdin: { contents: `export * from './src/api'; export * from './src/local/session';
      export { getSessionLocale, setSessionLocale } from './src/api-local';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent', loader: { '.png': 'dataurl' },
    define: { 'import.meta.env.VITE_BACKEND': JSON.stringify(wamp ? 'wamp' : 'local') },
  });
  delete require.cache[require.resolve(outfile)];
  return require(outfile);
}
(async () => {
  try {
    const local = bundle(false);
    assert.equal(local.DUREE_PRESENCE_MS, 3_600_000);
    assert.equal(local.INTERVALLE_PRESENCE_MS, 15_000);
    assert.equal(await local.apiRestoreSession(), null);
    const admin = await local.apiLogin('admin', 'admin123');
    assert.equal(admin.role, 'Administrateur');
    const key = local.CLE_SESSION_PRESENCE;
    assert.deepEqual(JSON.parse(storage.get(key)), { id: admin.id, derniereActivite: now }, 'marqueur sans mot de passe ni rôle');
    local.setSessionLocale(null);
    now += 30_000;
    assert.equal((await local.apiRestoreSession()).id, admin.id, 'rechargement/nouvel onglet');
    for (let i = 0; i < 480; i++) {
      now += 15_000;
      assert.equal((await local.apiVerifySession(admin)).id, admin.id, 'présence entretenue par un onglet, même sans clic');
    }
    const derniere = now;
    assert.ok(local.lirePresenceLocale(derniere + 61_000), 'aucune expiration à l’ancien délai de 60 secondes');
    assert.ok(local.lirePresenceLocale(derniere + 3_599_999), 'valide juste avant une heure');
    assert.ok(local.lirePresenceLocale(derniere + 3_600_000), 'limite exacte d’une heure');
    assert.equal(local.lirePresenceLocale(derniere + 3_600_001), null);
    now += 3_600_001;
    assert.equal(await local.apiRestoreSession(), null);
    assert.equal(local.renouvelerPresenceLocale(admin.id), false, 'ne ressuscite pas après suspension');
    assert.equal(JSON.parse(storage.get(key)).derniereActivite, derniere);

    await local.apiLogin('admin', 'admin123');
    const comptable = await local.apiLogin('comptable', 'comptable123');
    assert.equal(await local.apiVerifySession(admin), null, 'un autre compte dans un autre onglet ferme la vue ancienne');
    local.apiForgetSession();
    assert.equal(local.lirePresenceLocale().id, comptable.id, 'invalider la vue ancienne ne déconnecte pas le nouveau compte');
    assert.equal((await local.apiRestoreSession()).role, 'Comptable');
    const stocke = JSON.parse(storage.get('salfa_paie_store_v1'));
    const compte = stocke.utilisateurs.find(u => u.id === comptable.id);
    compte.actif = 0;
    storage.set('salfa_paie_store_v1', JSON.stringify(stocke));
    assert.equal(await local.apiVerifySession(comptable), null, 'révocation fraîche malgré le cache de paie');
    compte.actif = 1; compte.role = 'Administrateur';
    storage.set('salfa_paie_store_v1', JSON.stringify(stocke));
    assert.equal(await local.apiVerifySession(comptable), null, 'changement de rôle impose une reconnexion');
    await local.apiLogout();
    assert.equal(local.lirePresenceLocale(), null);
    assert.equal(local.getSessionLocale(), null);
    assert.equal(storage.has(key), false);
    assert.equal(local.renouvelerPresenceLocale(comptable.id), false, 'logout jamais annulé par un ancien onglet');

    for (const valeur of ['{', '{}', JSON.stringify({ id: admin.id }), JSON.stringify({ id: admin.id, derniereActivite: now + 1 }), JSON.stringify({ id: -1, derniereActivite: now }), JSON.stringify({ id: admin.id, derniereActivite: '1000' })]) {
      local.memoriserPresenceLocale(admin.id);
      storage.set(key, valeur);
      assert.equal(local.lirePresenceLocale(), null, `refuse le marqueur invalide ${valeur}`);
    }
    local.memoriserPresenceLocale(admin.id);
    cookies.clear();
    assert.equal(local.lirePresenceLocale(), null, 'cookie de navigateur exigé');
    assert.equal(local.renouvelerPresenceLocale(admin.id), false);

    // Régression : le refus des cookies ne doit pas fermer la session au 1er heartbeat.
    cookiesAutorises = false;
    const sansCookie = await local.apiLogin('admin', 'admin123');
    assert.equal(cookies.size, 0);
    assert.ok(stockageOnglet.size > 0, 'preuve non persistante propre à cet onglet');
    for (let i = 0; i < 8; i++) {
      now += 15_000;
      assert.equal((await local.apiVerifySession(sansCookie)).id, sansCookie.id, 'reste connecté sans limite tant que les contacts continuent avec des contacts réguliers');
    }
    const recharge = bundle(false);
    assert.equal((await recharge.apiRestoreSession()).id, sansCookie.id, 'actualisation sans cookie grâce à la preuve de cet onglet');
    const preuve = new Map(stockageOnglet);
    stockageOnglet.clear();
    const autreNavigateur = bundle(false);
    assert.equal(await autreNavigateur.apiRestoreSession(), null, 'localStorage seul ne restaure jamais une session');
    for (const [k, v] of preuve) stockageOnglet.set(k, v);
    now += 3_600_001;
    assert.equal(await recharge.apiVerifySession(sansCookie), null, 'expiration réelle après absence de contact, même sans cookie');
    assert.equal(recharge.renouvelerPresenceLocale(sansCookie.id), false);
    await recharge.apiLogin('admin', 'admin123');
    await recharge.apiLogout();
    assert.equal(stockageOnglet.size, 0, 'logout supprime également la preuve de l’onglet');
    assert.equal(await local.apiVerifySession(sansCookie), null, 'l’ancien document ne peut pas annuler le logout');
    cookiesAutorises = true;
    global.location = { protocol: 'https:' };
    await local.apiLogin('admin', 'admin123');
    assert.equal(stockageOnglet.size, 0, 'cookie accepté : aucun repli qui pourrait le ressusciter');
    cookies.clear();
    assert.equal(await local.apiVerifySession(sansCookie), null, 'cookie accepté puis supprimé : reconnexion imposée');
    delete global.location;
    await local.apiLogout();

    const ecrire = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('Quota / stockage interdit'); };
    await assert.rejects(() => local.apiLogin('admin', 'admin123'), /bloque le stockage de session/, 'pas de connexion fictive vouée à échouer 15 s après');
    assert.equal(local.getSessionLocale(), null);
    global.localStorage.setItem = ecrire;

    // WAMP : état/jeton/snapshot côté serveur seulement, heartbeat léger.
    const distant = bundle(true);
    let user = null, token = '', offline = false, revoque = false, snapshots = 0, sessions = 0, logouts = 0;
    global.fetch = async (url, options) => {
      if (offline) throw new TypeError('Réseau indisponible');
      const action = new URL(url, 'http://test/').searchParams.get('action');
      let status = 200, data;
      if (action === 'login') { user = { ...admin }; token = 'csrf-test'; data = { user, csrf: token }; }
      else if (action === 'session') {
        sessions++;
        if (revoque) { status = 401; data = { error: 'Session expirée.' }; }
        else data = { user, csrf: token };
      } else if (action === 'snapshot') {
        snapshots++;
        data = { revision: 1, store: { meta: {}, employes: [], paies: [], utilisateurs: [], comparaison_net: [], conges: [] }, config: null, header: null };
      } else if (action === 'logout') {
        assert.equal(options.headers['X-Salfa-CSRF'], token); logouts++; user = null; data = { success: true };
      } else throw new Error(`Action inattendue : ${action}`);
      return { ok: status === 200, status, json: async () => data };
    };
    const avantLectures = lectures, avantEcritures = ecritures;
    assert.equal(await distant.apiRestoreSession(), null);
    await distant.apiLogin('test', 'secret-test');
    distant.apiForgetSession();
    assert.equal((await distant.apiRestoreSession()).id, admin.id);
    const snapshotsApresReprise = snapshots;
    assert.equal((await distant.apiVerifySession(admin)).id, admin.id);
    assert.equal(snapshots, snapshotsApresReprise, 'le heartbeat ne recharge pas les données de saisie');
    offline = true;
    await assert.rejects(() => distant.apiVerifySession(admin), /Réseau indisponible/);
    assert.equal(distant.getSessionLocale().id, admin.id, 'panne réseau distincte de la déconnexion');
    offline = false; revoque = true;
    assert.equal(await distant.apiVerifySession(admin), null, '401 confirmé');
    revoque = false; user = { ...comptable };
    assert.equal(await distant.apiVerifySession(admin), null, 'changement de compte serveur');
    distant.apiForgetSession();
    assert.equal(user.id, comptable.id);
    assert.equal(logouts, 0, 'invalidation locale sans logout du nouveau compte serveur');
    assert.equal((await distant.apiRestoreSession()).id, comptable.id);
    await distant.apiLogout();
    assert.equal(logouts, 1);
    assert.equal(await distant.apiRestoreSession(), null);
    assert.ok(sessions >= 7);
    assert.equal(lectures, avantLectures, 'pas de lecture des sessions locales en WAMP');
    assert.equal(ecritures, avantEcritures, 'pas d’écriture des sessions locales en WAMP');

    const php = fs.readFileSync('wamp/api/index.php', 'utf8');
    assert.match(php, /sessionPresenceValide\(\$_SESSION\['last'\] \?\? null, time\(\)\)/);
    assert.match(php, /\$action === 'session'/);
    assert.doesNotMatch(php, /> 3600/);
    const validation = fs.readFileSync('wamp/api/validation.php', 'utf8');
    assert.match(validation, /const SALFA_DUREE_SESSION = 3600;/);
    console.log('Sessions : présence 15 s / expiration 1 h sans contact, reprise, multi-onglets, révocation, horodatages, panne réseau et séparation WAMP/local : OK');
  } finally { Date.now = vraiNow; fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
