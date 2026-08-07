// ==============================================================================
// SERVEUR NODE : ROUTES API REST EXPRESS - SALFA TANAMBAO
// ==============================================================================
import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execWrite } from './db';
import { calculerPaieEmploye, calculerAnciennete } from './calcul';
import crypto from 'crypto';

export const apiRouter = Router();

// Hachage mot de passe salé
function hashPassword(pwd: string): string {
  const salt = "salfa_tanambao_2026_salt_";
  return crypto.createHash("sha256").update(salt + pwd).digest("hex");
}

// ------------------------------------------------------------------------------
// AUTHENTIFICATION
// ------------------------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiants requis" });
  }
  const hash = hashPassword(password);
  const user = await queryOne(
    "SELECT id, username, nom_complet, role, actif FROM utilisateurs WHERE username = ? AND password_hash = ? AND actif = 1",
    [String(username).trim(), hash]
  );
  if (!user) {
    return res.status(401).json({ error: "Nom d'utilisateur ou mot de passe incorrect." });
  }
  res.json({ user });
});

// ------------------------------------------------------------------------------
// EMPLOYÉS (SALARIÉS)
// ------------------------------------------------------------------------------
apiRouter.get('/employes', async (req: Request, res: Response) => {
  const actifsOnly = req.query.actifs_seulement === 'true';
  const search = String(req.query.search || '').trim();

  let sql = "SELECT * FROM employes WHERE 1=1";
  const params: any[] = [];
  if (actifsOnly) {
    sql += " AND actif = 1";
  }
  if (search) {
    sql += " AND (nom_prenoms LIKE ? OR jobs LIKE ? OR categorie LIKE ? OR CAST(numero_matricule AS TEXT) LIKE ?)";
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }
  sql += " ORDER BY numero_matricule ASC";

  const employes = await queryAll(sql, params);
  res.json({ employes });
});

apiRouter.get('/employes/:id/paies', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const paies = await queryAll(
    "SELECT * FROM paie_mensuelle WHERE employe_id = ? ORDER BY annee ASC, id ASC",
    [id]
  );
  res.json({ paies });
});

apiRouter.post('/employes', async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const dateEmb = String(d.date_embauche || '').trim();
    const annees = calculerAnciennete(dateEmb, 2026);
    
    await execWrite(`
      INSERT INTO employes (
        numero_matricule, nom_prenoms, numero_cnaps, categorie, jobs,
        date_embauche, nombre_annees, enfant_a_charge, base_aj,
        logement_transport, rendement, responsabilite_representation,
        rib, mode_paiement, actif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      Number(d.numero_matricule),
      String(d.nom_prenoms).trim(),
      String(d.numero_cnaps || '').trim(),
      String(d.categorie || '').trim(),
      String(d.jobs || '').trim(),
      dateEmb,
      annees,
      Number(d.enfant_a_charge || 0),
      Number(d.base_aj || 0),
      Number(d.logement_transport || 0),
      Number(d.rendement || 0),
      Number(d.responsabilite_representation || 0),
      String(d.rib || '').trim(),
      String(d.mode_paiement || 'ESPECES').toUpperCase()
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Erreur de création" });
  }
});

apiRouter.put('/employes/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    const dateEmb = String(d.date_embauche || '').trim();
    const annees = calculerAnciennete(dateEmb, 2026);

    await execWrite(`
      UPDATE employes SET
        numero_matricule = ?, nom_prenoms = ?, numero_cnaps = ?, categorie = ?,
        jobs = ?, date_embauche = ?, nombre_annees = ?, enfant_a_charge = ?,
        base_aj = ?, logement_transport = ?, rendement = ?,
        responsabilite_representation = ?, rib = ?, mode_paiement = ?, actif = ?
      WHERE id = ?
    `, [
      Number(d.numero_matricule),
      String(d.nom_prenoms).trim(),
      String(d.numero_cnaps || '').trim(),
      String(d.categorie || '').trim(),
      String(d.jobs || '').trim(),
      dateEmb,
      annees,
      Number(d.enfant_a_charge || 0),
      Number(d.base_aj || 0),
      Number(d.logement_transport || 0),
      Number(d.rendement || 0),
      Number(d.responsabilite_representation || 0),
      String(d.rib || '').trim(),
      String(d.mode_paiement || 'ESPECES').toUpperCase(),
      d.actif !== undefined ? Number(d.actif) : 1,
      id
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Erreur de mise à jour" });
  }
});

apiRouter.patch('/employes/:id/actif', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { actif } = req.body;
  await execWrite("UPDATE employes SET actif = ? WHERE id = ?", [actif ? 1 : 0, id]);
  res.json({ success: true });
});

// ------------------------------------------------------------------------------
// PAIES MENSUELLES (BULLETINS)
// ------------------------------------------------------------------------------
async function estMoisVerrouille(annee: number, mois: string): Promise<boolean> {
  const row = await queryOne(
    "SELECT sum(verrouille) as nb_verrouille FROM paie_mensuelle WHERE annee = ? AND mois = ?",
    [annee, mois.toUpperCase()]
  );
  return (row?.nb_verrouille || 0) > 0;
}

apiRouter.get('/paies', async (req: Request, res: Response) => {
  const annee = Number(req.query.annee || 2026);
  const mois = String(req.query.mois || 'JANVIER').toUpperCase();

  const employes = await queryAll(
    "SELECT * FROM paie_mensuelle WHERE annee = ? AND mois = ? ORDER BY numero_matricule ASC",
    [annee, mois]
  );
  const verrouille = await estMoisVerrouille(annee, mois);

  // Totaux mensuels
  const totaux = await queryOne(`
    SELECT 
      count(*) as count_employes,
      sum(enfant_a_charge) as total_enfant_a_charge,
      sum(base_aj) as total_base_aj,
      sum(logt_trsp) as total_logt_trsp,
      sum(rendement) as total_rendement,
      sum(resp_repres) as total_resp_repres,
      sum(salaire_brut) as total_salaire_brut,
      sum(cnaps) as total_cnaps,
      sum(patronal) as total_patronal,
      sum(salaire_imposable) as total_salaire_imposable,
      sum(irsa) as total_irsa,
      sum(salaire_net) as total_salaire_net,
      sum(augmentation_divers) as total_augmentation_divers,
      sum(prime_de_garde) as total_prime_de_garde,
      sum(anciennete2) as total_anciennete2,
      sum(risque) as total_risque,
      sum(repr_rec) as total_repr_rec,
      sum(accessoir) as total_accessoir,
      sum(brut) as total_brut,
      sum(avance) as total_avance,
      sum(med) as total_med,
      sum(net) as total_net,
      sum(virement) as total_virement,
      sum(especes) as total_especes
    FROM paie_mensuelle
    WHERE annee = ? AND mois = ?
  `, [annee, mois]);

  res.json({ employes, verrouille, totaux: totaux || {} });
});

apiRouter.post('/paies/initialiser', async (req: Request, res: Response) => {
  const { annee = 2026, mois = 'JANVIER' } = req.body;
  const aInt = Number(annee);
  const mStr = String(mois).toUpperCase();

  const employes = await queryAll("SELECT * FROM employes WHERE actif = 1 ORDER BY numero_matricule ASC");
  let count = 0;

  for (const emp of employes) {
    const exist = await queryOne(
      "SELECT id FROM paie_mensuelle WHERE employe_id = ? AND annee = ? AND mois = ?",
      [emp.id, aInt, mStr]
    );
    if (exist) continue;

    const annees = calculerAnciennete(emp.date_embauche, aInt);
    const empCalc = {
      base_aj: emp.base_aj,
      logt_trsp: emp.logement_transport,
      rendement: emp.rendement,
      resp_repres: emp.responsabilite_representation,
      enfant_a_charge: emp.enfant_a_charge,
      rib: emp.rib,
      rap: true
    };
    const r = calculerPaieEmploye(empCalc, 0, 0, {});

    await execWrite(`
      INSERT INTO paie_mensuelle (
        employe_id, numero_matricule, annee, mois, nom_prenoms, numero_cnaps, categorie, jobs,
        date_embauche, nombre_annees, enfant_a_charge, base_aj, logt_trsp, rendement, resp_repres,
        salaire_brut, cnaps, patronal, salaire_imposable, irsa, salaire_net, augmentation_divers,
        prime_de_garde, anciennete2, risque, repr_rec, accessoir, brut, avance, med, net,
        virement, especes, rap, rib, verrouille
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0
      )
    `, [
      emp.id, emp.numero_matricule, aInt, mStr, emp.nom_prenoms, emp.numero_cnaps || '',
      emp.categorie || '', emp.jobs || '', emp.date_embauche || '', annees, emp.enfant_a_charge || 0,
      emp.base_aj || 0, emp.logement_transport || 0, emp.rendement || 0, emp.responsabilite_representation || 0,
      r.salaire_brut, r.cnaps, r.patronal, r.salaire_imposable, r.irsa, r.salaire_net,
      0, 0, 0, 0, 0, 0, r.brut, 0, 0, r.net, r.virement, r.especes, 1, emp.rib || ''
    ]);
    count++;
  }

  res.json({ success: true, initializedCount: count });
});

apiRouter.patch('/paies/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { avance, med, accessoires } = req.body;

  const row = await queryOne("SELECT * FROM paie_mensuelle WHERE id = ?", [id]);
  if (!row) {
    return res.status(404).json({ error: "Bulletin introuvable" });
  }
  if (row.verrouille === 1) {
    return res.status(400).json({ error: "Ce mois est clôturé et verrouillé. Déverrouillez avant modification." });
  }

  const acc = accessoires || {
    augmentation_divers: row.augmentation_divers,
    prime_de_garde: row.prime_de_garde,
    anciennete2: row.anciennete2,
    risque: row.risque,
    repr_rec: row.repr_rec
  };

  const r = calculerPaieEmploye(row, Number(avance || 0), Number(med || 0), acc);

  await execWrite(`
    UPDATE paie_mensuelle SET
      salaire_brut = ?, cnaps = ?, patronal = ?, salaire_imposable = ?, irsa = ?, salaire_net = ?,
      augmentation_divers = ?, prime_de_garde = ?, anciennete2 = ?, risque = ?, repr_rec = ?,
      accessoir = ?, brut = ?, avance = ?, med = ?, net = ?, virement = ?, especes = ?,
      date_modification = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    r.salaire_brut, r.cnaps, r.patronal, r.salaire_imposable, r.irsa, r.salaire_net,
    r.augmentation_divers, r.prime_de_garde, r.anciennete2, r.risque, r.repr_rec,
    r.accessoir, r.brut, r.avance, r.med, r.net, r.virement, r.especes, id
  ]);

  res.json({ success: true, updated: r });
});

apiRouter.post('/paies/cloturer', async (req: Request, res: Response) => {
  const { annee, mois } = req.body;
  await execWrite(
    "UPDATE paie_mensuelle SET verrouille = 1, date_modification = CURRENT_TIMESTAMP WHERE annee = ? AND mois = ?",
    [Number(annee), String(mois).toUpperCase()]
  );
  res.json({ success: true });
});

apiRouter.post('/paies/deverrouiller', async (req: Request, res: Response) => {
  const { annee, mois, userRole } = req.body;
  if (userRole !== 'Administrateur') {
    return res.status(403).json({ error: "Action réservée aux comptes Administrateur." });
  }
  await execWrite(
    "UPDATE paie_mensuelle SET verrouille = 0, date_modification = CURRENT_TIMESTAMP WHERE annee = ? AND mois = ?",
    [Number(annee), String(mois).toUpperCase()]
  );
  res.json({ success: true });
});

// ------------------------------------------------------------------------------
// RAPPORTS & COMPARAISONS
// ------------------------------------------------------------------------------
apiRouter.get('/rapports/comparaison', async (req: Request, res: Response) => {
  const annee = Number(req.query.annee || 2026);
  const moisActuel = String(req.query.mois_actuel || 'FEVRIER').toUpperCase();
  const moisAvant = String(req.query.mois_avant || 'JANVIER').toUpperCase();
  const useHist = req.query.use_hist === 'true';

  let data: any[] = [];
  if (useHist) {
    data = await queryAll("SELECT * FROM comparaison_net ORDER BY numero_matricule ASC");
  } else {
    data = await queryAll(`
      SELECT 
        p1.numero_matricule,
        p1.nom_prenoms,
        p1.categorie,
        p1.jobs,
        p1.net as net_actuel,
        COALESCE(p2.net, 0.0) as net_avant,
        (p1.net - COALESCE(p2.net, 0.0)) as ecart
      FROM paie_mensuelle p1
      LEFT JOIN paie_mensuelle p2 
        ON p1.employe_id = p2.employe_id 
        AND p2.annee = ? AND p2.mois = ?
      WHERE p1.annee = ? AND p1.mois = ?
      ORDER BY p1.numero_matricule ASC
    `, [annee, moisAvant, annee, moisActuel]);
  }

  res.json({ comparaison: data });
});
