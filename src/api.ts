// ==============================================================================
// CLIENT API LOCALE 100% NAVIGATEUR - SALFA TANAMBAO (.TSX / REACT)
// Plus aucun appel réseau : toutes les fonctions lisent/écrivent dans le
// store local (localStorage) via src/local/*. Compatible Cloudflare Pages
// (site statique).
// ==============================================================================

import { Employe, PaieMensuelle, TotauxMois, ComparaisonNet, UserSession } from './types';
import { getStore, saveStore, nextEmployeId, nextPaieId, nowStamp } from './local/store';
import { calculerPaieEmploye, calculerAnciennete } from './local/calcul';
import { hashPassword } from './local/hash';

// ------------------------------------------------------------------------------
// AUTHENTIFICATION (locale)
// ------------------------------------------------------------------------------
export async function apiLogin(username: string, password: string): Promise<UserSession | null> {
  const store = getStore();
  const hash = await hashPassword(password);
  const user = (store.utilisateurs || []).find(
    (u: any) =>
      String(u.username).trim() === String(username).trim() &&
      u.password_hash === hash &&
      Number(u.actif) === 1
  );
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nom_complet: user.nom_complet,
    role: user.role,
    actif: user.actif,
  };
}

export async function checkHealth(): Promise<boolean> {
  return true;
}

// ------------------------------------------------------------------------------
// EMPLOYÉS (SALARIÉS)
// ------------------------------------------------------------------------------
export async function fetchEmployes(actifsOnly: boolean = false, search: string = ''): Promise<Employe[]> {
  const store = getStore();
  let employes = [...(store.employes || [])];

  if (actifsOnly) {
    employes = employes.filter((e: any) => Number(e.actif) === 1);
  }
  if (search) {
    const q = search.trim().toLowerCase();
    employes = employes.filter((e: any) =>
      String(e.nom_prenoms || '').toLowerCase().includes(q) ||
      String(e.jobs || '').toLowerCase().includes(q) ||
      String(e.categorie || '').toLowerCase().includes(q) ||
      String(e.numero_matricule || '').includes(q)
    );
  }

  employes.sort((a: any, b: any) => Number(a.numero_matricule) - Number(b.numero_matricule));
  return employes;
}

export async function fetchEmployePaies(id: number): Promise<PaieMensuelle[]> {
  const store = getStore();
  return (store.paies || [])
    .filter((p: any) => Number(p.employe_id) === id)
    .sort(
      (a: any, b: any) =>
        Number(a.annee) - Number(b.annee) ||
        String(a.mois).localeCompare(String(b.mois)) ||
        Number(a.id) - Number(b.id)
    );
}

export async function createEmploye(employe: Partial<Employe>): Promise<boolean> {
  const store = getStore();
  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();
  const newEmp: any = {
    id: nextEmployeId(),
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, 2026),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif: 1,
    conge_maternite: employe.conge_maternite ? 1 : 0,
    date_creation: nowStamp(),
  };
  store.employes.push(newEmp);
  saveStore();
  return true;
}

export async function updateEmploye(id: number, employe: Partial<Employe>): Promise<boolean> {
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;

  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat && Number(e.id) !== id)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();

  const updated = {
    ...store.employes[idx],
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, 2026),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif: employe.actif !== undefined ? Number(employe.actif) : store.employes[idx].actif,
    conge_maternite:
      employe.conge_maternite !== undefined
        ? employe.conge_maternite
          ? 1
          : 0
        : store.employes[idx].conge_maternite,
  };

  store.employes[idx] = updated;
  saveStore();
  return true;
}

export async function toggleActifEmploye(id: number, actif: boolean): Promise<boolean> {
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;
  store.employes[idx].actif = actif ? 1 : 0;
  saveStore();
  return true;
}

// ------------------------------------------------------------------------------
// PAIES MENSUELLES (BULLETINS)
// ------------------------------------------------------------------------------
export async function fetchPaiesMois(
  annee: number,
  mois: string
): Promise<{ employes: PaieMensuelle[]; verrouille: boolean; totaux: TotauxMois }> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const employes = (store.paies || [])
    .filter((p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === m)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule));

  const verrouille = employes.some((p: any) => Number(p.verrouille) === 1);

  const totaux: TotauxMois = {
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
    total_especes: 0,
  };

  const keys: (keyof TotauxMois)[] = [
    'total_enfant_a_charge', 'total_base_aj', 'total_logt_trsp', 'total_rendement',
    'total_resp_repres', 'total_salaire_brut', 'total_cnaps', 'total_patronal',
    'total_salaire_imposable', 'total_irsa', 'total_salaire_net', 'total_augmentation_divers',
    'total_prime_de_garde', 'total_anciennete2', 'total_risque', 'total_repr_rec',
    'total_accessoir', 'total_brut', 'total_avance', 'total_med', 'total_net',
    'total_virement', 'total_especes',
  ];
  const srcKeys: Record<keyof TotauxMois, string> = {
    count_employes: 'count_employes',
    total_enfant_a_charge: 'enfant_a_charge',
    total_base_aj: 'base_aj',
    total_logt_trsp: 'logt_trsp',
    total_rendement: 'rendement',
    total_resp_repres: 'resp_repres',
    total_salaire_brut: 'salaire_brut',
    total_cnaps: 'cnaps',
    total_patronal: 'patronal',
    total_salaire_imposable: 'salaire_imposable',
    total_irsa: 'irsa',
    total_salaire_net: 'salaire_net',
    total_augmentation_divers: 'augmentation_divers',
    total_prime_de_garde: 'prime_de_garde',
    total_anciennete2: 'anciennete2',
    total_risque: 'risque',
    total_repr_rec: 'repr_rec',
    total_accessoir: 'accessoir',
    total_brut: 'brut',
    total_avance: 'avance',
    total_med: 'med',
    total_net: 'net',
    total_virement: 'virement',
    total_especes: 'especes',
  };
  for (const key of keys) {
    let sum = 0;
    for (const p of employes) {
      sum += Number((p as any)[srcKeys[key]] || 0);
    }
    (totaux as any)[key] = sum;
  }

  return { employes, verrouille, totaux };
}

export async function initMoisPaie(
  annee: number,
  mois: string
): Promise<{ success: boolean; initializedCount: number }> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const employesActifs = (store.employes || [])
    .filter((e: any) => Number(e.actif) === 1)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule));

  let count = 0;
  for (const emp of employesActifs) {
    const exist = (store.paies || []).some(
      (p: any) =>
        Number(p.employe_id) === Number(emp.id) &&
        Number(p.annee) === a &&
        String(p.mois).toUpperCase() === m
    );
    if (exist) continue;

    const annees = calculerAnciennete(emp.date_embauche, a);
    const empCalc = {
      base_aj: emp.base_aj,
      logement_transport: emp.logement_transport,
      rendement: emp.rendement,
      responsabilite_representation: emp.responsabilite_representation,
      enfant_a_charge: emp.enfant_a_charge,
      rib: emp.rib,
      rap: true,
      conge_maternite: emp.conge_maternite,
    };
    const r = calculerPaieEmploye(empCalc, 0, 0, {});

    const newPaie: any = {
      id: nextPaieId(),
      employe_id: emp.id,
      numero_matricule: emp.numero_matricule,
      annee: a,
      mois: m,
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
      date_modification: nowStamp(),
    };

    store.paies.push(newPaie);
    count++;
  }

  if (count > 0) saveStore();
  return { success: true, initializedCount: count };
}

export async function savePaieSaisie(
  id: number,
  avance: number,
  med: number,
  accessoires?: any
): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  const store = getStore();
  const idx = store.paies.findIndex((p: any) => Number(p.id) === id);
  if (idx === -1) {
    return { success: false };
  }
  const row = store.paies[idx];
  if (Number(row.verrouille) === 1) {
    return { success: false };
  }

  const acc = accessoires || {
    augmentation_divers: row.augmentation_divers,
    prime_de_garde: row.prime_de_garde,
    anciennete2: row.anciennete2,
    risque: row.risque,
    repr_rec: row.repr_rec,
  };

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
    date_modification: nowStamp(),
  };

  store.paies[idx] = updated;
  saveStore();
  return { success: true, updated: r as any };
}

export async function cloturerMois(annee: number, mois: string): Promise<boolean> {
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === a && String(p.mois).toUpperCase() === m) {
      p.verrouille = 1;
      p.date_modification = nowStamp();
      touched++;
    }
  }
  if (touched) saveStore();
  return true;
}

export async function deverrouillerMois(annee: number, mois: string, userRole: string): Promise<boolean> {
  if (userRole !== 'Administrateur') return false;
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  let touched = 0;
  for (const p of store.paies) {
    if (Number(p.annee) === a && String(p.mois).toUpperCase() === m) {
      p.verrouille = 0;
      p.date_modification = nowStamp();
      touched++;
    }
  }
  if (touched) saveStore();
  return true;
}

// ------------------------------------------------------------------------------
// RAPPORTS & COMPARAISONS
// ------------------------------------------------------------------------------
export async function fetchComparaison(
  annee: number,
  moisActuel: string,
  moisAvant: string,
  useHist: boolean
): Promise<ComparaisonNet[]> {
  const store = getStore();
  const a = Number(annee);
  const mActuel = String(moisActuel).toUpperCase();
  const mAvant = String(moisAvant).toUpperCase();

  let data: any[] = [];
  if (useHist) {
    data = [...(store.comparaison_net || [])].sort(
      (x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule)
    );
  } else {
    const paiesActuel = (store.paies || []).filter(
      (p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === mActuel
    );
    const paiesAvantMap: Record<number, any> = {};
    for (const p of (store.paies || []).filter(
      (p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === mAvant
    )) {
      paiesAvantMap[Number(p.employe_id)] = p;
    }

    for (const p1 of paiesActuel.sort(
      (x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule)
    )) {
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
        ecart: Math.round((netActuel - netAvant) * 100) / 100,
      });
    }
  }

  return data;
}
