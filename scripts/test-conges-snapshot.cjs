// Vérifie l'import des soldes du dernier classeur de congés SALFA 2026.
// npm install ; node scripts/test-conges-snapshot.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { lireSnapshotConges } = require('./controle_conges_snapshot.cjs');

function valeursTupleSql(line) {
  const body = line.trim()
    .replace(/^\(\s*(?:@base_conge_id \+ \d+|\d+),\s*/, '')
    .replace(/\)[,;]?$/, '');
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quoted) {
      if (char === "'" && body[i + 1] === "'") {
        value += "'";
        i++;
      } else if (char === "'") {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === "'") {
      quoted = true;
    } else if (char === ',') {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  assert.equal(quoted, false, 'chaque chaîne SQL doit être fermée');
  return values;
}

const ROOT = path.resolve(__dirname, '..');
const source = path.join(ROOT, 'CONTROLE CONGE A JOUR SALFA 2026.xlsx');
const sourceName = path.basename(source);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/salfa_data.json'), 'utf8'));
const dataHist = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/salfa_historique.json'), 'utf8'));

const entry = path.join(ROOT, 'src/local/conges.ts');
const compiled = esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['xlsx'],
  logLevel: 'silent',
}).outputFiles[0].text;
const compiledModule = new Module(entry);
compiledModule.paths = Module._nodeModulePaths(ROOT);
compiledModule._compile(compiled, entry);
const C = compiledModule.exports;

const allEmployees = [...data.employes];
const byMat = new Map(allEmployees.map((e) => [Number(e.numero_matricule), e]));
let nextId = Math.max(...allEmployees.map((e) => Number(e.id) || 0));
for (const old of dataHist.employes || []) {
  const mat = Number(old.numero_matricule);
  if (byMat.has(mat)) continue;
  const emp = { ...old, id: ++nextId, numero_matricule: mat, actif: 0 };
  byMat.set(mat, emp);
  allEmployees.push(emp);
}

const snapshot = lireSnapshotConges(fs.readFileSync(source), sourceName, allEmployees, C.retrouverEmploye);
assert.ok(snapshot, 'le classeur doit être reconnu au format des soldes annuels');
assert.equal(snapshot.feuille, 'Feuil1');
assert.deepEqual(snapshot.annees, [2024, 2025, 2026]);
assert.equal(snapshot.lignes.length, 43, '43 salariés avec un solde dans le classeur');
assert.equal(snapshot.lignes.reduce((n, row) => n + row.soldes.length, 0), 129, '43 × 3 soldes annuels');
assert.equal(snapshot.lignes.flatMap((row) => row.soldes).filter((x) => x.jours === 0).length, 29, 'cases vides ramenées à 0 jour');

const soldeParMat = new Map(snapshot.lignes.map((row) => [Number(row.employe.numero_matricule), row.soldes.map((x) => x.jours)]));
assert.deepEqual(soldeParMat.get(1), [0, 0, 26], 'TSIAMBANY JOELSON — cases 2024/2025 vides, 26 j en 2026');
assert.deepEqual(soldeParMat.get(20), [9, 30, 30], 'VAZISON FANOMEZANTSOA — 9/30/30 j');
assert.deepEqual(soldeParMat.get(34), [0, 30, 30], 'FANOMEZANTSOA VOLA NIRINA — 0/30/30 j');
assert.deepEqual(soldeParMat.get(63), [0, 0, 28], 'FITAMBELO PATIENCE — 0/0/28 j');

const fiches = data.conges;
assert.equal(fiches.length, 129, 'le store embarqué contient les 129 ouvertures annuelles');
assert.ok(fiches.every((c) => c.categorie === 'AJUSTEMENT' && c.ajustement_type === 'OUVERTURE'), 'les soldes sont des ajustements d’ouverture, pas des absences datées');
assert.ok(fiches.every((c) => c.saisie_par === 'Import Excel' && c.statut === 'VALIDE'), 'les soldes importés sont marqués comme tels');
assert.ok(fiches.every((c) => c.observations.includes('cases vides') && c.observations.includes('0 jour')));

// Les soldes calculés par l'application doivent être identiques aux valeurs source, année par année.
const etat = C.construireEtat(allEmployees, fiches, C.DEFAULT_CONGES_CONFIG, { annee: 2026, nbAnnees: 3 });
for (const row of snapshot.lignes) {
  const p = etat.parcours.find((x) => x.numero_matricule === Number(row.employe.numero_matricule));
  assert.ok(p, `matricule ${row.employe.numero_matricule} présent dans l’état`);
  for (const solde of row.soldes) {
    assert.equal(p.bilans[solde.annee].fin, solde.jours, `mat ${p.numero_matricule}, année ${solde.annee}`);
  }
}

// Le SQL dédié doit être actualisé à partir du nouveau classeur et remplacer seulement les lignes importées.
const sql = fs.readFileSync(path.join(ROOT, 'wamp/sql/salfa_conges_excel.sql'), 'utf8');
assert.ok(sql.includes(`Fichier source : ${sourceName}`));
assert.ok(sql.includes('controle-solde-2026-10-30'));
assert.ok(sql.includes('129 soldes annuels (cases vides = 0)'));
assert.ok(sql.includes("DELETE FROM `salfa_conges` WHERE `saisie_par` = 'Import Excel';"));
assert.ok(sql.includes("'AJUSTEMENT'"));
assert.ok(sql.includes("'OUVERTURE'"));
assert.ok(!sql.includes('store_json') && !sql.includes('JSON_SET'));
const lignesSql = sql.match(/^\s*\(@base_conge_id \+ \d+,.*$/gm) || [];
assert.equal(lignesSql.length, 212, '129 soldes + 83 fiches historiques sont insérés');
let indexSoldeSql = 0;
for (const row of snapshot.lignes) {
  for (const solde of row.soldes) {
    const values = valeursTupleSql(lignesSql[indexSoldeSql++]);
    assert.equal(values[0], String(row.employe.id), `employe_id SQL mat ${row.employe.numero_matricule}`);
    assert.equal(values[1], String(row.employe.numero_matricule), 'matricule SQL exact');
    assert.equal(values[2], row.employe.nom_prenoms, 'nom du salarié SQL exact');
    assert.equal(values[6], 'AJUSTEMENT', 'un solde est enregistré comme ajustement');
    assert.equal(values[10], String(solde.annee), `année SQL mat ${row.employe.numero_matricule}`);
    assert.equal(values[17], String(solde.jours), `solde SQL mat ${row.employe.numero_matricule}, année ${solde.annee}`);
    assert.equal(values[31], 'OUVERTURE', 'le solde est importé comme ouverture annuelle');
    assert.equal(values[32], 'Import Excel', 'le marqueur de source SQL est conservé');
  }
}
assert.equal(indexSoldeSql, 129, 'chaque valeur du classeur est rapprochée à sa ligne SQL');

const sqlComplet = fs.readFileSync(path.join(ROOT, 'wamp/sql/salfa_donnees_excel_2022-2026.sql'), 'utf8');
assert.ok(sqlComplet.includes('212 fiches de congé/permission'));
assert.ok(sqlComplet.includes('`conges_version` VARCHAR(60) NOT NULL DEFAULT \'controle-solde-2026-10-30\''));
const debutBlocComplet = sqlComplet.indexOf('-- 6. Fiches de congés et permissions');
const finBlocComplet = sqlComplet.indexOf('COMMIT;', debutBlocComplet);
assert.ok(debutBlocComplet >= 0 && finBlocComplet > debutBlocComplet, 'bloc des congés présent dans le SQL complet');
const lignesCompletes = sqlComplet
  .slice(debutBlocComplet, finBlocComplet)
  .match(/^\s*\(\d+,\s*\d+,\s*\d+,.*$/gm) || [];
assert.equal(lignesCompletes.length, 212, 'le SQL complet contient 212 lignes de congés');
let indexSoldeComplet = 0;
for (const row of snapshot.lignes) {
  for (const solde of row.soldes) {
    const values = valeursTupleSql(lignesCompletes[indexSoldeComplet++]);
    assert.equal(values[0], String(row.employe.id), `employe_id du SQL complet mat ${row.employe.numero_matricule}`);
    assert.equal(values[1], String(row.employe.numero_matricule), 'matricule du SQL complet exact');
    assert.equal(values[2], row.employe.nom_prenoms, 'nom du salarié du SQL complet exact');
    assert.equal(values[6], 'AJUSTEMENT', 'ajustement annuel dans le SQL complet');
    assert.equal(values[10], String(solde.annee), `année du SQL complet mat ${row.employe.numero_matricule}`);
    assert.equal(values[17], String(solde.jours), `solde du SQL complet mat ${row.employe.numero_matricule}, année ${solde.annee}`);
    assert.equal(values[31], 'OUVERTURE', 'ouverture annuelle dans le SQL complet');
  }
}
assert.equal(indexSoldeComplet, 129, 'les 129 soldes source sont exacts dans le SQL complet');
console.log('OK — 43 salariés, 129 soldes annuels exacts, 29 cellules vides à 0 jour, SQL dédié et SQL complet vérifiés.');
