#!/usr/bin/env node
/**
 * Lecteur du classeur de soldes annuels « CONTROLE CONGE A JOUR SALFA 2026.xlsx ».
 * Ce format contient un nom par ligne et une colonne de solde restant par année;
 * les cases vides sont interprétées comme zéro jour.
 */
const XLSX = require('xlsx');

function normaliserEntete(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function anneeExcel(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1990 && value <= 2100) return value;
  const s = String(value ?? '').trim();
  return /^\d{4}$/.test(s) && Number(s) >= 1990 && Number(s) <= 2100 ? Number(s) : 0;
}

function joursExcel(value, contexte) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  let n;
  if (typeof value === 'number') n = value;
  else {
    const s = String(value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    n = Number(s);
  }
  if (!Number.isFinite(n)) throw new Error(`${contexte}: nombre de jours illisible (${String(value)}).`);
  n = Math.round(n * 100) / 100;
  if (n < 0 || n > 30) throw new Error(`${contexte}: solde ${n} hors limites (0–30 jours).`);
  return n;
}

/**
 * Lit le tableau des soldes et rapproche strictement chaque nom d'un salarié.
 * Renvoie null si le classeur n'est pas au format compact « ANNEE / années ».
 * Les noms non reconnus ou les doublons font échouer l'import plutôt que de
 * produire silencieusement un SQL incomplet ou rattaché au mauvais salarié.
 */
function lireSnapshotConges(buffer, fileName, employes, retrouverEmploye) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellText: false });

  for (const nomFeuille of wb.SheetNames) {
    const ws = wb.Sheets[nomFeuille];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    let indexEntete = -1;
    for (let r = 0; r < rows.length; r++) {
      if ((rows[r] || []).some((cell) => normaliserEntete(cell) === 'ANNEE')) {
        indexEntete = r;
        break;
      }
    }
    if (indexEntete < 0) continue;

    const ligneAnnees = rows[indexEntete + 1] || [];
    const colonnesAnnees = ligneAnnees
      .map((cell, col) => ({ col, annee: anneeExcel(cell) }))
      .filter((x) => x.annee > 0);
    if (!colonnesAnnees.length) {
      throw new Error(`${nomFeuille}: l’en-tête « ANNEE » est présent, mais aucune année (1990–2100) n’a été trouvée sur la ligne suivante.`);
    }
    const anneesUniq = new Set(colonnesAnnees.map((x) => x.annee));
    if (anneesUniq.size !== colonnesAnnees.length) {
      throw new Error(`${nomFeuille}: une année apparaît plusieurs fois dans l’en-tête.`);
    }
    colonnesAnnees.sort((a, b) => a.annee - b.annee);

    const premiereColAnnee = Math.min(...colonnesAnnees.map((x) => x.col));
    const debutDonnees = indexEntete + 2;
    let colonneNom = -1;
    let meilleurScore = 0;
    for (let col = 0; col < premiereColAnnee; col++) {
      let score = 0;
      for (let r = debutDonnees; r < rows.length; r++) {
        const texte = String((rows[r] || [])[col] ?? '').trim();
        if (texte && !/^(TOTAL|TOTAUX|TOTAL GENERAL)$/i.test(normaliserEntete(texte))) score++;
      }
      if (score > meilleurScore) {
        meilleurScore = score;
        colonneNom = col;
      }
    }
    if (colonneNom < 0) {
      throw new Error(`${nomFeuille}: impossible d’identifier la colonne des noms de salariés.`);
    }

    const employesLus = new Set();
    const lignes = [];
    const nonTrouves = [];
    for (let r = debutDonnees; r < rows.length; r++) {
      const row = rows[r] || [];
      const nom = String(row[colonneNom] ?? '').trim();
      if (!nom || /^(TOTAL|TOTAUX|TOTAL GENERAL)$/i.test(normaliserEntete(nom))) continue;

      const employe = retrouverEmploye(nom, employes);
      if (!employe) {
        nonTrouves.push(`ligne ${r + 1}: « ${nom} »`);
        continue;
      }
      const cle = Number(employe.numero_matricule);
      if (employesLus.has(cle)) {
        throw new Error(`${nomFeuille}: le salarié « ${nom} » (matricule ${cle}) apparaît plusieurs fois.`);
      }
      employesLus.add(cle);

      const soldes = colonnesAnnees.map(({ col, annee }) => ({
        annee,
        jours: joursExcel(row[col], `${nomFeuille}, ligne ${r + 1}, ${annee}, ${nom}`),
      }));
      lignes.push({ nomSource: nom, employe, ligneExcel: r + 1, soldes });
    }

    if (nonTrouves.length) {
      throw new Error(`${nomFeuille}: salariés non reconnus — ${nonTrouves.join('; ')}.`);
    }
    if (!lignes.length) throw new Error(`${nomFeuille}: aucun salarié n’a été lu dans le tableau des soldes.`);

    return {
      fichier: fileName,
      feuille: nomFeuille,
      annees: colonnesAnnees.map((x) => x.annee),
      lignes,
      dateModification: wb.Props?.ModifiedDate instanceof Date ? wb.Props.ModifiedDate : null,
    };
  }

  return null;
}

module.exports = { lireSnapshotConges, joursExcel, anneeExcel };
