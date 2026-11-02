// =============================================================================
// RAPPROCHEMENT « LISTE DE PERSONNEL.xlsx » -> FICHES SALARIÉS
// Complète uniquement les champs absents ; ne modifie ni la paie, ni les
// matricules, ni les montants. Les personnes non retrouvées sont signalées.
// Usage : node scripts/completer-personnel.cjs
// =============================================================================
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_XLSX = path.join(ROOT, 'LISTE DE PERSONNEL.xlsx');
const SOURCE_JSON = path.join(ROOT, 'src/data/salfa_data.json');
const DEST_PERSONNEL = path.join(ROOT, 'src/data/salfa_personnel.json');
const VERSION = 'liste-personnel-2026-11';

const CHAMPS_PERSONNEL = [
  'genre', 'date_naissance', 'lieu_naissance', 'pere', 'mere',
  'cin', 'date_cin', 'lieu_cin', 'situation_matrimoniale', 'adresse',
  'service', 'diplome', 'etablissement', 'statut', 'numero_ordre',
  'nature_contrat', 'duree_contrat', 'lieu_embauche', 'lieu_travail', 'date_effet',
];

function texte(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s || s === 'Ø' || s === 'ø' || s === '-' || s === '—') return '';
  return s;
}

function normaliserNom(v) {
  return texte(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function chiffres(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function dateIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed && parsed.y >= 1900 && parsed.y <= 2100) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return '';
  }
  const s = texte(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function tokens(v) {
  return normaliserNom(v).split(' ').filter(Boolean);
}

function retrouverEmploye(nom, identifiant, employes, champIdentifiant) {
  const n = normaliserNom(nom);
  if (!n) return null;
  const exact = employes.filter(e => normaliserNom(e.nom_prenoms) === n);
  if (exact.length === 1) return exact[0];
  const id = chiffres(identifiant);
  if (id.length >= 6) {
    const parId = employes.filter(e => chiffres(e[champIdentifiant]) === id);
    if (parId.length === 1) return parId[0];
  }
  const ts = new Set(tokens(nom));
  if (ts.size < 2) return null;
  const candidats = employes
    .map(e => {
      const et = tokens(e.nom_prenoms);
      const inter = et.filter(t => ts.has(t)).length;
      return { e, inter, score: inter / Math.max(et.length, ts.size) };
    })
    .filter(x => x.inter >= 2 && x.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  if (candidats.length === 1) return candidats[0].e;
  if (candidats.length > 1 && candidats[0].score > candidats[1].score) return candidats[0].e;
  return null;
}

function lireFeuil1(wb) {
  const ws = wb.Sheets['Feuil1'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  return rows.slice(1).filter(r => texte(r[0])).map(r => ({
    nom: texte(r[0]),
    date_naissance: dateIso(r[1]),
    lieu_naissance: texte(r[2]),
    pere: texte(r[3]),
    mere: texte(r[4]),
    cin: chiffres(r[5]),
    date_cin: dateIso(r[6]),
    lieu_cin: texte(r[7]),
    situation_matrimoniale: texte(r[8]),
    adresse: texte(r[9]),
    service: texte(r[10]),
    jobs: texte(r[11]),
    categorie: texte(r[12]),
  }));
}

function lireListeFinale(wb) {
  const ws = wb.Sheets['LISTE FINALE'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  return rows.slice(4).filter(r => texte(r[0])).map(r => ({
    nom: texte(r[0]),
    date_naissance: dateIso(r[1]),
    genre: texte(r[2]),
    numero_cnaps: chiffres(r[3]),
    diplome: texte(r[4]),
    etablissement: texte(r[5]),
    jobs: texte(r[6]),
    service: texte(r[7]),
    date_embauche: dateIso(r[8]),
    statut: texte(r[9]),
    numero_ordre: texte(r[10]),
    nature_contrat: texte(r[11]),
  }));
}

function champVide(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function rapprocherPersonnel(employes, feuil1, listeFinale) {
  const parMatricule = new Map();
  const nonRapproches = [];
  const conflits = [];

  const enregistrer = (emp, source, champs, feuille) => {
    if (!emp) return false;
    const mat = Number(emp.numero_matricule);
    if (!parMatricule.has(mat)) parMatricule.set(mat, { numero_matricule: mat, nom_prenoms: emp.nom_prenoms, champs: {} });
    const cible = parMatricule.get(mat).champs;
    for (const [cle, valeur] of Object.entries(champs)) {
      if (!valeur) continue;
      if (cible[cle] && cible[cle] !== valeur) {
        conflits.push({ matricule: mat, nom: emp.nom_prenoms, champ: cle, feuilles: [cible[cle], valeur], retenu: cible[cle] });
        continue;
      }
      cible[cle] = valeur;
    }
    return true;
  };

  // Feuille « état civil » : priorité aux données d'état civil.
  for (const r of feuil1) {
    let emp = retrouverEmploye(r.nom, r.cin, employes, 'cin');
    if (!emp) {
      // Certains noms sont abrégés dans Feuil1 (ex. TSIAMBANY). On passe par
      // LISTE FINALE lorsque le nom ou la date de naissance concordent.
      const pont = listeFinale.find(f =>
        normaliserNom(f.nom) === normaliserNom(r.nom)
        || (r.date_naissance && f.date_naissance === r.date_naissance
          && tokens(f.nom).some(t => tokens(r.nom).includes(t)))
      );
      if (pont) emp = retrouverEmploye(pont.nom, pont.numero_cnaps, employes, 'numero_cnaps');
    }
    const ok = enregistrer(emp, r, {
      date_naissance: r.date_naissance,
      lieu_naissance: r.lieu_naissance,
      pere: r.pere,
      mere: r.mere,
      cin: r.cin,
      date_cin: r.date_cin,
      lieu_cin: r.lieu_cin,
      situation_matrimoniale: r.situation_matrimoniale,
      adresse: r.adresse,
      service: r.service,
      jobs: r.jobs,
      categorie: r.categorie,
    }, 'Feuil1');
    if (!ok) nonRapproches.push({ feuille: 'Feuil1', nom: r.nom, identifiant: r.cin });
  }

  // Feuille « LISTE FINALE » : informations professionnelles.
  for (const r of listeFinale) {
    const emp = retrouverEmploye(r.nom, r.numero_cnaps, employes, 'numero_cnaps');
    const ok = enregistrer(emp, r, {
      genre: r.genre,
      date_naissance: r.date_naissance,
      diplome: r.diplome,
      etablissement: r.etablissement,
      service: r.service,
      statut: r.statut,
      numero_ordre: r.numero_ordre,
      nature_contrat: r.nature_contrat,
    }, 'LISTE FINALE');
    if (!ok) nonRapproches.push({ feuille: 'LISTE FINALE', nom: r.nom, identifiant: r.numero_cnaps });
    // Ces champs ne complètent la fiche que si elle est vide.
    if (emp) {
      const cible = parMatricule.get(Number(emp.numero_matricule)).champs;
      if (champVide(emp.numero_cnaps) && r.numero_cnaps) cible.numero_cnaps = r.numero_cnaps;
      if (champVide(emp.jobs) && r.jobs) cible.jobs = r.jobs;
      if (champVide(emp.categorie) && r.categorie) cible.categorie = r.categorie;
      if (champVide(emp.date_embauche) && r.date_embauche) cible.date_embauche = r.date_embauche;
    }
  }

  const entries = [...parMatricule.values()].sort((a, b) => a.numero_matricule - b.numero_matricule);
  return { entries, nonRapproches, conflits };
}

function appliquerAuxFiches(employes, entries) {
  const parMat = new Map(entries.map(e => [Number(e.numero_matricule), e.champs]));
  let fiches = 0;
  let champs = 0;
  for (const emp of employes) {
    const src = parMat.get(Number(emp.numero_matricule));
    if (!src) continue;
    let touche = false;
    for (const [cle, valeur] of Object.entries(src)) {
      if (!valeur) continue;
      if (champVide(emp[cle])) {
        emp[cle] = valeur;
        champs++;
        touche = true;
      }
    }
    if (touche) fiches++;
  }
  return { fiches, champs };
}

function main() {
  if (!fs.existsSync(SOURCE_XLSX)) {
    console.error(`Fichier absent : ${SOURCE_XLSX}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(SOURCE_XLSX, { cellDates: true });
  const data = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8'));
  const feuil1 = lireFeuil1(wb);
  const listeFinale = lireListeFinale(wb);
  const resultat = rapprocherPersonnel(data.employes || [], feuil1, listeFinale);
  const stats = appliquerAuxFiches(data.employes || [], resultat.entries);
  data.meta = { ...(data.meta || {}), personnel_version: VERSION, personnel_source: 'LISTE DE PERSONNEL.xlsx' };
  fs.writeFileSync(SOURCE_JSON, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(DEST_PERSONNEL, JSON.stringify({
    version: VERSION,
    source: 'LISTE DE PERSONNEL.xlsx',
    champs: CHAMPS_PERSONNEL,
    entries: resultat.entries,
    nonRapproches: resultat.nonRapproches,
    conflits: resultat.conflits,
  }, null, 2) + '\n');

  console.log(`Feuil1 : ${feuil1.length} lignes ; LISTE FINALE : ${listeFinale.length} lignes.`);
  console.log(`Fiches complétées : ${stats.fiches} ; champs ajoutés : ${stats.champs}.`);
  console.log(`Personnes rapprochées : ${resultat.entries.length}.`);
  if (resultat.nonRapproches.length) {
    console.log(`Lignes non rapprochées : ${resultat.nonRapproches.length}`);
    for (const x of resultat.nonRapproches) console.log(`  - ${x.feuille} : ${x.nom}`);
  }
  if (resultat.conflits.length) {
    console.log(`Conflits entre feuilles (valeur état civil conservée) : ${resultat.conflits.length}`);
    for (const c of resultat.conflits) console.log(`  - Mat ${c.matricule} ${c.champ} : ${c.feuilles.join(' / ')}`);
  }
}

if (require.main === module) main();

module.exports = {
  CHAMPS_PERSONNEL,
  VERSION,
  texte,
  normaliserNom,
  dateIso,
  lireFeuil1,
  lireListeFinale,
  rapprocherPersonnel,
  appliquerAuxFiches,
};
