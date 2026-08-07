// ==============================================================================
// SERVEUR NODE : ROUTES API REST EXPRESS - SALFA TANAMBAO (MODE JSON PUR)
// ==============================================================================

import { Router, Request, Response } from 'express';
import { getStore, saveStore, nextEmployeId, nextPaieId } from './db';
import { calculerPaieEmploye, calculerAnciennete } from './calcul';
import crypto from 'crypto';

export const apiRouter = Router();

// Hachage mot de passe salé (identique à l'ancienne version SQLite)
function hashPassword(pwd: string): string {
  const salt = "salfa_tanambao_2026_salt_";
  return crypto.createHash("sha256").update(salt + pwd).digest("hex");
}

// ------------------------------------------------------------------------------
// AUTHENTIFICATION (via JSON store)
// ------------------------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiants requis" });
  }
  const store = await getStore();
  const hash = hashPassword(password);
  const user = (store.utilisateurs || []).find(
    (u: any) => String(u.username).trim() === String(username).trim() && u.password_hash === hash && Number(u.actif) === 1
  );
  if (!user) {
    return res.status(401).json({ error: "Nom d'utilisateur ou mot de passe incorrect." });
  }
  // Ne jamais exposer le hash
  const safeUser = { id: user.id, username: user.username, nom_complet: user.nom_complet, role: user.role, actif: user.actif };
  res.json({ user: safeUser });
});

// ------------------------------------------------------------------------------
// EMPLOYÉS (SALARIÉS) - JSON
// ------------------------------------------------------------------------------
apiRouter.get('/employes', async (req: Request, res: Response) => {
  const store = await getStore();
  const actifsOnly = req.query.actifs_seulement === 'true';
  const search = String(req.query.search || '').trim().toLowerCase();

  let employes = [...(store.employes || [])];

  if (actifsOnly) {
    employes = employes.filter((e: any) => Number(e.actif) === 1);
  }
  if (search) {
    employes = employes.filter((e: any) =>
      String(e.nom_prenoms || '').toLowerCase().includes(search) ||
      String(e.jobs || '').toLowerCase().includes(search) ||
      String(e.categorie || '').toLowerCase().includes(search) ||
      String(e.numero_matricule || '').includes(search)
    );
  }

  employes.sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));

  res.json({ employes });
});

apiRouter.get('/employes/:id/paies', async (req: Request, res: Response) => {
  const store = await getStore();
  const id = Number(req.params.id);
  const paies = (store.paies || [])
    .filter((p: any) => Number(p.employe_id) === id)
    .sort((a: any, b: any) => Number(a.annee) - Number(b.annee) || String(a.mois).localeCompare(String(b.mois)) || Number(a.id) - Number(b.id));
  res.json({ paies });
});

apiRouter.post('/employes', async (req: Request, res: Response) => {
  try {
    const store = await getStore();
    const d = req.body;
    const dateEmb = String(d.date_embauche || '').trim();
    const annees = calculerAnciennete(dateEmb, 2026);

    // Vérifier unicité matricule
    const mat = Number(d.numero_matricule);
    if (store.employes.some((e: any) => Number(e.numero_matricule) === mat)) {
      return res.status(400).json({ error: `Matricule ${mat} déjà utilisé.` });
    }

    const newEmp = {
      id: nextEmployeId(),
      numero_matricule: mat,
      nom_prenoms: String(d.nom_prenoms || '').trim(),
      numero_cnaps: String(d.numero_cnaps || '').trim(),
      categorie: String(d.categorie || '').trim(),
      jobs: String(d.jobs || '').trim(),
      date_embauche: dateEmb,
      nombre_annees: annees,
      enfant_a_charge: Number(d.enfant_a_charge || 0),
      base_aj: Number(d.base_aj || 0),
      logement_transport: Number(d.logement_transport || 0),
      rendement: Number(d.rendement || 0),
      responsabilite_representation: Number(d.responsabilite_representation || 0),
      rib: String(d.rib || '').trim(),
      mode_paiement: String(d.mode_paiement || 'ESPECES').toUpperCase(),
      actif: 1,
      conge_maternite: d.conge_maternite ? 1 : 0,
      date_creation: new Date().toISOString().slice(0, 19).replace('T',' ')
    };

    store.employes.push(newEmp);
    saveStore();
    res.json({ success: true, employe: newEmp });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Erreur de création" });
  }
});

apiRouter.put('/employes/:id', async (req: Request, res: Response) => {
  try {
    const store = await getStore();
    const id = Number(req.params.id);
    const d = req.body;
    const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
    if (idx === -1) return res.status(404).json({ error: "Employé introuvable" });

    const dateEmb = String(d.date_embauche || '').trim();
    const annees = calculerAnciennete(dateEmb, 2026);

    const mat = Number(d.numero_matricule);
    // Vérifier unicité matricule sauf pour soi-même
    if (store.employes.some((e: any) => Number(e.numero_matricule) === mat && Number(e.id) !== id)) {
      return res.status(400).json({ error: `Matricule ${mat} déjà utilisé par un autre salarié.` });
    }

    const updated = {
      ...store.employes[idx],
      numero_matricule: mat,
      nom_prenoms: String(d.nom_prenoms || '').trim(),
      numero_cnaps: String(d.numero_cnaps || '').trim(),
      categorie: String(d.categorie || '').trim(),
      jobs: String(d.jobs || '').trim(),
      date_embauche: dateEmb,
      nombre_annees: annees,
      enfant_a_charge: Number(d.enfant_a_charge || 0),
      base_aj: Number(d.base_aj || 0),
      logement_transport: Number(d.logement_transport || 0),
      rendement: Number(d.rendement || 0),
      responsabilite_representation: Number(d.responsabilite_representation || 0),
      rib: String(d.rib || '').trim(),
      mode_paiement: String(d.mode_paiement || 'ESPECES').toUpperCase(),
      actif: d.actif !== undefined ? Number(d.actif) : store.employes[idx].actif,
      conge_maternite: d.conge_maternite !== undefined ? (d.conge_maternite ? 1 : 0) : store.employes[idx].conge_maternite
    };

    store.employes[idx] = updated;
    saveStore();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Erreur de mise à jour" });
  }
});

apiRouter.patch('/employes/:id/actif', async (req: Request, res: Response) => {
  const store = await getStore();
  const id = Number(req.params.id);
  const { actif } = req.body;
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return res.status(404).json({ error: "Employé introuvable" });
  store.employes[idx].actif = actif ? 1 : 0;
  saveStore();
  res.json({ success: true });
});

// ------------------------------------------------------------------------------
// PAIES MENSUELLES (BULLETINS) - JSON
// ------------------------------------------------------------------------------
async function estMoisVerrouille(annee: number, mois: string): Promise<boolean> {
  const store = await getStore();
  return (store.paies || []).some((p: any) => Number(p.annee) === annee && String(p.mois).toUpperCase() === mois.toUpperCase() && Number(p.verrouille) === 1);
}

apiRouter.get('/paies', async (req: Request, res: Response) => {
  const store = await getStore();
  const annee = Number(req.query.annee || 2026);
  const mois = String(req.query.mois || 'JANVIER').toUpperCase();

  const employes = (store.paies || [])
    .filter((p: any) => Number(p.annee) === annee && String(p.mois).toUpperCase() === mois)
    .sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));

  const verrouille = employes.some((p: any) => Number(p.verrouille) === 1);

  // Calcul des totaux mensuels à la volée (plus fiable que SQL sum)
  const totaux: any = {
    count_employes: employes.length,
    total_enfant_a_charge: 0,
    total_base_aj: 0,
    total_logt_trsp: 0,
    total_rendement: 0,
    total_resp_repres: 0,
    total_salaire_brut: 0,
    total_cnaps: 0,
    total_patronal: 0,
    total_salaire_imposable: 0,
    total_irsa: 0,
    total_salaire_net: 0,
    total_augmentation_divers: 0,
    total_prime_de_garde: 0,
    total_anciennete2: 0,
    total_risque: 0,
    total_repr_rec: 0,
    total_accessoir: 0,
    total_brut: 0,
    total_avance: 0,
    total_med: 0,
    total_net: 0,
    total_virement: 0,
    total_especes: 0
  };

  for (const p of employes) {
    totaux.total_enfant_a_charge += Number(p.enfant_a_charge || 0);
    totaux.total_base_aj += Number(p.base_aj || 0);
    totaux.total_logt_trsp += Number(p.logt_trsp || 0);
    totaux.total_rendement += Number(p.rendement || 0);
    totaux.total_resp_repres += Number(p.resp_repres || 0);
    totaux.total_salaire_brut += Number(p.salaire_brut || 0);
    totaux.total_cnaps += Number(p.cnaps || 0);
    totaux.total_patronal += Number(p.patronal || 0);
    totaux.total_salaire_imposable += Number(p.salaire_imposable || 0);
    totaux.total_irsa += Number(p.irsa || 0);
    totaux.total_salaire_net += Number(p.salaire_net || 0);
    totaux.total_augmentation_divers += Number(p.augmentation_divers || 0);
    totaux.total_prime_de_garde += Number(p.prime_de_garde || 0);
    totaux.total_anciennete2 += Number(p.anciennete2 || 0);
    totaux.total_risque += Number(p.risque || 0);
    totaux.total_repr_rec += Number(p.repr_rec || 0);
    totaux.total_accessoir += Number(p.accessoir || 0);
    totaux.total_brut += Number(p.brut || 0);
    totaux.total_avance += Number(p.avance || 0);
    totaux.total_med += Number(p.med || 0);
    totaux.total_net += Number(p.net || 0);
    totaux.total_virement += Number(p.virement || 0);
    totaux.total_especes += Number(p.especes || 0);
  }

  res.json({ employes, verrouille, totaux });
});

apiRouter.post('/paies/initialiser', async (req: Request, res: Response) => {
  const store = await getStore();
  const { annee = 2026, mois = 'JANVIER' } = req.body;
  const aInt = Number(annee);
  const mStr = String(mois).toUpperCase();

  const employesActifs = (store.employes || []).filter((e: any) => Number(e.actif) === 1).sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));
  let count = 0;

  for (const emp of employesActifs) {
    const exist = (store.paies || []).some((p: any) => Number(p.employe_id) === Number(emp.id) && Number(p.annee) === aInt && String(p.mois).toUpperCase() === mStr);
    if (exist) continue;

    const annees = calculerAnciennete(emp.date_embauche, aInt);
    const empCalc = {
      base_aj: emp.base_aj,
      logement_transport: emp.logement_transport,
      rendement: emp.rendement,
      responsabilite_representation: emp.responsabilite_representation,
      enfant_a_charge: emp.enfant_a_charge,
      rib: emp.rib,
      rap: true,
      conge_maternite: emp.conge_maternite
    };
    const r = calculerPaieEmploye(empCalc, 0, 0, {});

    const newPaie = {
      id: nextPaieId(),
      employe_id: emp.id,
      numero_matricule: emp.numero_matricule,
      annee: aInt,
      mois: mStr,
      nom_prenoms: emp.nom_prenoms,
      numero_cnaps: emp.numero_cnaps || '',
      categorie: emp.categorie || '',
      jobs: emp.jobs || '',
      date_embauche: emp.date_embauche || '',
      nombre_annees: annees,
      enfant_a_charge: emp.enfant_a_charge || 0,
      base_aj: emp.base_aj || 0,
      logt_trsp: emp.logement_transport || 0,
      rendement: emp.rendement || 0,
      resp_repres: emp.responsabilite_representation || 0,
      salaire_brut: r.salaire_brut,
      cnaps: r.cnaps,
      patronal: r.patronal,
      salaire_imposable: r.salaire_imposable,
      irsa: r.irsa,
      salaire_net: r.salaire_net,
      augmentation_divers: 0,
      prime_de_garde: 0,
      anciennete2: 0,
      risque: 0,
      repr_rec: 0,
      accessoir: 0,
      brut: r.brut,
      avance: 0,
      med: 0,
      net: r.net,
      virement: r.virement,
      especes: r.especes,
      rap: 1,
      rib: emp.rib || '',
      verrouille: 0,
      conge_maternite: emp.conge_maternite || 0,
      date_modification: new Date().toISOString().slice(0, 19).replace('T',' ')
    };

    store.paies.push(newPaie);
    count++;
  }

  if (count > 0) saveStore();
  res.json({ success: true, initializedCount: count });
});

apiRouter.patch('/paies/:id', async (req: Request, res: Response) => {
  const store = await getStore();
  const id = Number(req.params.id);
  const { avance, med, accessoires } = req.body;

  const idx = store.paies.findIndex((p: any) => Number(p.id) === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Bulletin introuvable" });
  }
  const row = store.paies[idx];
  if (Number(row.verrouille) === 1) {
    return res.status(400).json({ error: "Ce mois est clôturé et verrouillé. Déverrouillez avant modification." });
  }

  const acc = accessoires || {
    augmentation_divers: row.augmentation_divers,
    prime_de_garde: row.prime_de_garde,
    anciennete2: row.anciennete2,
    risque: row.risque,
    repr_rec: row.repr_rec
  };

  // Merger le congé maternité si présent dans la paie ou dans les accessoires
  const rowWithMaternite = { ...row, conge_maternite: row.conge_maternite };
  const r = calculerPaieEmploye(rowWithMaternite, Number(avance || 0), Number(med || 0), acc);

  const updated = {
    ...row,
    salaire_brut: r.salaire_brut,
    cnaps: r.cnaps,
    patronal: r.patronal,
    salaire_imposable: r.salaire_imposable,
    irsa: r.irsa,
    salaire_net: r.salaire_net,
    augmentation_divers: r.augmentation_divers,
    prime_de_garde: r.prime_de_garde,
    anciennete2: r.anciennete2,
    risque: r.risque,
    repr_rec: r.repr_rec,
    accessoir: r.accessoir,
    brut: r.brut,
    avance: r.avance,
    med: r.med,
    net: r.net,
    virement: r.virement,
    especes: r.especes,
    date_modification: new Date().toISOString().slice(0, 19).replace('T',' ')
  };

  store.paies[idx] = updated;
  saveStore();
  res.json({ success: true, updated: r });
});

apiRouter.post('/paies/cloturer', async (req: Request, res: Response) => {
  const store = await getStore();
  const { annee, mois } = req.body;
  const aInt = Number(annee);
  const mStr = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === aInt && String(p.mois).toUpperCase() === mStr) {
      p.verrouille = 1;
      p.date_modification = new Date().toISOString().slice(0, 19).replace('T',' ');
      touched++;
    }
  }
  if (touched) saveStore();
  res.json({ success: true, count: touched });
});

apiRouter.post('/paies/deverrouiller', async (req: Request, res: Response) => {
  const store = await getStore();
  const { annee, mois, userRole } = req.body;
  if (userRole !== 'Administrateur') {
    return res.status(403).json({ error: "Action réservée aux comptes Administrateur." });
  }
  const aInt = Number(annee);
  const mStr = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === aInt && String(p.mois).toUpperCase() === mStr) {
      p.verrouille = 0;
      p.date_modification = new Date().toISOString().slice(0, 19).replace('T',' ');
      touched++;
    }
  }
  if (touched) saveStore();
  res.json({ success: true, count: touched });
});

// ------------------------------------------------------------------------------
// RAPPORTS & COMPARAISONS - JSON
// ------------------------------------------------------------------------------
apiRouter.get('/rapports/comparaison', async (req: Request, res: Response) => {
  const store = await getStore();
  const annee = Number(req.query.annee || 2026);
  const moisActuel = String(req.query.mois_actuel || 'FEVRIER').toUpperCase();
  const moisAvant = String(req.query.mois_avant || 'JANVIER').toUpperCase();
  const useHist = req.query.use_hist === 'true';

  let data: any[] = [];
  if (useHist) {
    // Historique figé Feuil3 (depuis migration SQLite)
    data = [...(store.comparaison_net || [])].sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));
  } else {
    // Construction dynamique à partir des paies JSON
    const paiesActuel = (store.paies || []).filter((p: any) => Number(p.annee) === annee && String(p.mois).toUpperCase() === moisActuel);
    const paiesAvantMap: Record<number, any> = {};
    for (const p of (store.paies || []).filter((p: any) => Number(p.annee) === annee && String(p.mois).toUpperCase() === moisAvant)) {
      paiesAvantMap[Number(p.employe_id)] = p;
    }

    for (const p1 of paiesActuel.sort((a: any,b: any)=> Number(a.numero_matricule)-Number(b.numero_matricule))) {
      const p2 = paiesAvantMap[Number(p1.employe_id)];
      const netAvant = p2 ? Number(p2.net || 0) : 0;
      const netActuel = Number(p1.net || 0);
      data.push({
        numero_matricule: p1.numero_matricule,
        nom_prenoms: p1.nom_prenoms,
        categorie: p1.categorie,
        jobs: p1.jobs,
        net_actuel: netActuel,
        net_avant: netAvant,
        ecart: Math.round((netActuel - netAvant) * 100) / 100
      });
    }
  }

  res.json({ comparaison: data });
});
