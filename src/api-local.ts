// ==============================================================================
// CLIENT API LOCALE 100% NAVIGATEUR - SALFA TANAMBAO (.TSX / REACT)
// Plus aucun appel réseau : toutes les fonctions lisent/écrivent dans le
// store local (localStorage) via src/local/*. Compatible Cloudflare Pages
// (site statique).
// ==============================================================================

import { Employe, PaieMensuelle, TotauxMois, ComparaisonNet, UserSession, CompteUtilisateur, CompteConnexionPublic } from './types';
import { getStore, saveStore, storeEstSynchronise, nextEmployeId, nextPaieId, nextCongeId, nextUtilisateurId, nowStamp } from './local/store';
import { calculerPaieEmploye, calculerAnciennete, estEnCongeMaternite } from './local/calcul';
import { hashPassword } from './local/hash';
import { loadConfig } from './local/config';
import { ImportWorkbookResult, ImportedEmploye, ImportedPaie, MOIS_FR } from './local/importExcel';
import {
  CongeAbsence, CongesConfig, CategorieAbsence, ImputationConges, StatutConges,
  normaliserConge, joursDemandesPour, calculerDateFin, calculerDateRetourDepuisFin,
  construireEtat, calculerSoldes, controleSolde, anneesSuccessives, calculerSyntheseCongesPeriode,
  EtatConges, SoldeSaisie, LIBELLES_CATEGORIE, aBesoinMedecin, trouverMotif, estPrisEnCompte,
} from './local/conges';
import { CongeImportLigne, CongeImportRapport } from './local/importConges';

// ------------------------------------------------------------------------------
// AUTHENTIFICATION & CONTRÔLE D'ACCÈS PAR RÔLE (locale)
// Règle métier :
// - Administrateur : accès complet à toutes les fonctionnalités (Paie & Congés)
// - Comptable      : accès exclusif aux Permissions & Congés
// ------------------------------------------------------------------------------
let sessionActive: UserSession | null = null;

export function setSessionLocale(user: UserSession | null): void {
  sessionActive = user ? { ...user } : null;
}

export function getSessionLocale(): UserSession | null {
  return sessionActive ? { ...sessionActive } : null;
}

export function apiLogoutLocal(): void {
  sessionActive = null;
}

function exigerAdmin(): void {
  if (sessionActive && sessionActive.role !== 'Administrateur') {
    throw new Error(
      'Accès refusé : seul l’Administrateur a accès à cette fonctionnalité (le Comptable a uniquement accès aux Permissions et Congés).'
    );
  }
}

export async function apiLogin(username: string, password: string): Promise<UserSession | null> {
  const store = getStore();
  const hash = await hashPassword(password);
  const cible = String(username || '').trim().toLowerCase();
  const user = (store.utilisateurs || []).find(
    (u: any) =>
      String(u.username || '').trim().toLowerCase() === cible &&
      u.password_hash === hash &&
      Number(u.actif) === 1
  );
  if (!user) return null;
  const session: UserSession = {
    id: Number(user.id),
    username: String(user.username),
    nom_complet: String(user.nom_complet || user.username),
    role: user.role === 'Administrateur' ? 'Administrateur' : 'Comptable',
    actif: Number(user.actif),
  };
  sessionActive = { ...session };
  return session;
}

export async function checkHealth(): Promise<boolean> {
  return true;
}

// ------------------------------------------------------------------------------
// GESTION DES UTILISATEURS & MOTS DE PASSE (réservée à l'Administrateur)
// ------------------------------------------------------------------------------
/**
 * Liste publique des comptes actifs, SANS aucun mot de passe ni indice de
 * connexion : aucun mot de passe (même de démonstration) ne doit être exposé
 * côté page de connexion ou dans le navigateur.
 */
export async function fetchComptesConnexion(): Promise<CompteConnexionPublic[]> {
  const store = getStore();
  return (store.utilisateurs || [])
    .filter((u: any) => Number(u.actif) === 1)
    .map((u: any) => {
      const uname = String(u.username || '').trim();
      return {
        id: Number(u.id),
        username: uname,
        nom_complet: String(u.nom_complet || uname),
        role: u.role === 'Administrateur' ? ('Administrateur' as const) : ('Comptable' as const),
      };
    });
}

export async function fetchUtilisateurs(): Promise<CompteUtilisateur[]> {
  exigerAdmin();
  const store = getStore();
  return (store.utilisateurs || []).map((u: any) => ({
    id: Number(u.id),
    username: String(u.username || ''),
    nom_complet: String(u.nom_complet || u.username || ''),
    role: u.role === 'Administrateur' ? ('Administrateur' as const) : ('Comptable' as const),
    actif: Number(u.actif) === 1 ? 1 : 0,
  }));
}

export async function creerUtilisateur(data: {
  username: string;
  nom_complet: string;
  role: 'Administrateur' | 'Comptable';
  password: string;
}): Promise<{ success: boolean; message?: string; user?: CompteUtilisateur }> {
  exigerAdmin();
  const username = String(data.username || '').trim();
  const nom_complet = String(data.nom_complet || '').trim() || username;
  const role: 'Administrateur' | 'Comptable' = data.role === 'Administrateur' ? 'Administrateur' : 'Comptable';
  const password = String(data.password || '');

  if (!/^[A-Za-z0-9_.-]{3,60}$/.test(username)) {
    return {
      success: false,
      message: "L'identifiant doit contenir 3 à 60 caractères (lettres, chiffres, point, tiret ou underscore, sans espaces).",
    };
  }
  if (password.length < 4) {
    return { success: false, message: 'Le mot de passe doit contenir au moins 4 caractères.' };
  }

  const store = getStore();
  if (!Array.isArray(store.utilisateurs)) store.utilisateurs = [];
  const doublon = store.utilisateurs.some(
    (u: any) => String(u.username || '').trim().toLowerCase() === username.toLowerCase()
  );
  if (doublon) {
    return { success: false, message: `L'identifiant « ${username} » est déjà utilisé.` };
  }

  const password_hash = await hashPassword(password);
  const id = nextUtilisateurId();
  const record = { id, username, nom_complet, role, actif: 1, password_hash };
  store.utilisateurs.push(record);
  if (!saveStore()) {
    return { success: false, message: 'Sauvegarde locale impossible.' };
  }
  return {
    success: true,
    user: { id, username, nom_complet, role, actif: 1 },
  };
}

export async function modifierUtilisateur(
  id: number,
  data: { username: string; nom_complet: string; role: 'Administrateur' | 'Comptable' }
): Promise<{ success: boolean; message?: string; user?: CompteUtilisateur }> {
  exigerAdmin();
  const store = getStore();
  const idx = (store.utilisateurs || []).findIndex((u: any) => Number(u.id) === Number(id));
  if (idx === -1) return { success: false, message: 'Utilisateur introuvable.' };

  const username = String(data.username || '').trim();
  const nom_complet = String(data.nom_complet || '').trim() || username;
  const role: 'Administrateur' | 'Comptable' = data.role === 'Administrateur' ? 'Administrateur' : 'Comptable';

  if (!/^[A-Za-z0-9_.-]{3,60}$/.test(username)) {
    return {
      success: false,
      message: "L'identifiant doit contenir 3 à 60 caractères (lettres, chiffres, point, tiret ou underscore, sans espaces).",
    };
  }

  const doublon = store.utilisateurs.some(
    (u: any, i: number) => i !== idx && String(u.username || '').trim().toLowerCase() === username.toLowerCase()
  );
  if (doublon) {
    return { success: false, message: `L'identifiant « ${username} » est déjà utilisé.` };
  }

  const cible = store.utilisateurs[idx];
  if (cible.role === 'Administrateur' && role !== 'Administrateur' && Number(cible.actif) === 1) {
    const autresAdminsActifs = store.utilisateurs.filter(
      (u: any, i: number) => i !== idx && u.role === 'Administrateur' && Number(u.actif) === 1
    ).length;
    if (autresAdminsActifs === 0) {
      return {
        success: false,
        message: 'Impossible de retirer le rôle Administrateur au dernier administrateur actif.',
      };
    }
    if (sessionActive && Number(sessionActive.id) === Number(id)) {
      return {
        success: false,
        message: 'Vous ne pouvez pas retirer votre propre rôle Administrateur pendant votre session.',
      };
    }
  }

  cible.username = username;
  cible.nom_complet = nom_complet;
  cible.role = role;
  if (!saveStore()) return { success: false, message: 'Sauvegarde locale impossible.' };

  if (sessionActive && Number(sessionActive.id) === Number(id)) {
    sessionActive = { ...sessionActive, username, nom_complet, role };
  }

  return {
    success: true,
    user: { id: Number(cible.id), username, nom_complet, role, actif: Number(cible.actif) === 1 ? 1 : 0 },
  };
}

export async function changerMotDePasseUtilisateur(
  id: number,
  nouveauMotDePasse: string
): Promise<{ success: boolean; message?: string }> {
  exigerAdmin();
  const password = String(nouveauMotDePasse || '');
  if (password.length < 4) {
    return { success: false, message: 'Le mot de passe doit contenir au moins 4 caractères.' };
  }
  const store = getStore();
  const cible = (store.utilisateurs || []).find((u: any) => Number(u.id) === Number(id));
  if (!cible) return { success: false, message: 'Utilisateur introuvable.' };

  cible.password_hash = await hashPassword(password);
  if (!saveStore()) return { success: false, message: 'Sauvegarde locale impossible.' };
  return { success: true };
}

export async function toggleActifUtilisateur(
  id: number,
  actif: boolean
): Promise<{ success: boolean; message?: string }> {
  exigerAdmin();
  const store = getStore();
  const cible = (store.utilisateurs || []).find((u: any) => Number(u.id) === Number(id));
  if (!cible) return { success: false, message: 'Utilisateur introuvable.' };

  if (!actif) {
    if (sessionActive && Number(sessionActive.id) === Number(id)) {
      return { success: false, message: 'Vous ne pouvez pas désactiver votre propre compte en cours de session.' };
    }
    if (cible.role === 'Administrateur') {
      const autresAdmins = store.utilisateurs.filter(
        (u: any) => Number(u.id) !== Number(id) && u.role === 'Administrateur' && Number(u.actif) === 1
      ).length;
      if (autresAdmins === 0) {
        return { success: false, message: 'Impossible de désactiver le dernier compte Administrateur actif.' };
      }
    }
  }

  cible.actif = actif ? 1 : 0;
  if (!saveStore()) return { success: false, message: 'Sauvegarde locale impossible.' };
  return { success: true };
}

export async function supprimerUtilisateur(
  id: number
): Promise<{ success: boolean; message?: string }> {
  exigerAdmin();
  const store = getStore();
  const idx = (store.utilisateurs || []).findIndex((u: any) => Number(u.id) === Number(id));
  if (idx === -1) return { success: false, message: 'Utilisateur introuvable.' };

  const cible = store.utilisateurs[idx];
  if (sessionActive && Number(sessionActive.id) === Number(id)) {
    return { success: false, message: 'Vous ne pouvez pas supprimer votre propre compte en cours de session.' };
  }
  if (cible.role === 'Administrateur' && Number(cible.actif) === 1) {
    const autresAdmins = store.utilisateurs.filter(
      (u: any, i: number) => i !== idx && u.role === 'Administrateur' && Number(u.actif) === 1
    ).length;
    if (autresAdmins === 0) {
      return { success: false, message: 'Impossible de supprimer le dernier compte Administrateur actif.' };
    }
  }

  store.utilisateurs.splice(idx, 1);
  if (!saveStore()) return { success: false, message: 'Sauvegarde locale impossible.' };
  return { success: true };
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

  // Pour un Comptable (accès Congés & Permissions uniquement), ne jamais exposer les montants salariaux ni RIB
  if (sessionActive && sessionActive.role !== 'Administrateur') {
    return employes.map((e: any) => ({
      ...e,
      base_aj: 0,
      logement_transport: 0,
      rendement: 0,
      resp_repres: 0,
      responsabilite_representation: 0,
      rib: '',
      mode_paiement: '',
    }));
  }

  return employes;
}

export async function fetchEmployePaies(id: number): Promise<PaieMensuelle[]> {
  exigerAdmin();
  const store = getStore();
  const cfg = loadConfig().congies;
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(id));
  const cibles = emp ? [emp] : [];
  const lignes = (store.paies || [])
    .filter((p: any) => Number(p.employe_id) === id)
    .sort(
      (a: any, b: any) =>
        Number(a.annee) - Number(b.annee) ||
        (MOIS_ORDRE[String(a.mois).toUpperCase()] ?? 99) - (MOIS_ORDRE[String(b.mois).toUpperCase()] ?? 99) ||
        Number(a.id) - Number(b.id)
    );
  return lignes.map((p: any) => {
    if (!cibles.length) return { ...p };
    const syn = calculerSyntheseCongesPeriode(
      cibles,
      store.conges || [],
      cfg,
      Number(p.annee),
      String(p.mois).toUpperCase()
    ).get(Number(id));
    return syn ? { ...p, ...syn } : { ...p };
  });
}

function retirerPaiesOuvertesDepuisInactif(store: any, employeId: number, dateInactif: string): void {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateInactif || '').trim());
  if (!m || !Array.isArray(store.paies)) return;
  const seuil = Number(m[1]) * 12 + (Number(m[2]) - 1);
  store.paies = store.paies.filter((p: any) => {
    if (Number(p.employe_id) !== Number(employeId)) return true;
    if (Number(p.verrouille) === 1) return true;
    const idxMois = MOIS_ORDRE[String(p.mois).toUpperCase()];
    if (idxMois === undefined) return true;
    return Number(p.annee) * 12 + idxMois < seuil;
  });
}

export async function createEmploye(employe: Partial<Employe>): Promise<boolean> {
  exigerAdmin();
  const store = getStore();
  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();
  const actif = employe.actif !== undefined ? (Number(employe.actif) ? 1 : 0) : 1;
  const dateInactif = actif === 0
    ? (String(employe.date_inactif || '').trim() || new Date().toISOString().slice(0, 10))
    : '';
  const newEmp: any = {
    id: nextEmployeId(),
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, new Date().getFullYear()),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif,
    date_inactif: dateInactif,
    conge_maternite: employe.conge_maternite ? 1 : 0,
    date_debut_maternite: String(employe.date_debut_maternite || '').trim(),
    date_creation: nowStamp(),
  };
  store.employes.push(newEmp);
  saveStore();
  return true;
}

export async function updateEmploye(id: number, employe: Partial<Employe>): Promise<boolean> {
  exigerAdmin();
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;

  const mat = Number(employe.numero_matricule);
  if (store.employes.some((e: any) => Number(e.numero_matricule) === mat && Number(e.id) !== id)) {
    return false;
  }
  const dateEmb = String(employe.date_embauche || '').trim();
  const nouvelActif = employe.actif !== undefined
    ? (Number(employe.actif) ? 1 : 0)
    : Number(store.employes[idx].actif);
  const dateInactif = nouvelActif === 0
    ? (String(employe.date_inactif ?? store.employes[idx].date_inactif ?? '').trim() || new Date().toISOString().slice(0, 10))
    : '';

  const updated = {
    ...store.employes[idx],
    numero_matricule: mat,
    nom_prenoms: String(employe.nom_prenoms || '').trim(),
    numero_cnaps: String(employe.numero_cnaps || '').trim(),
    categorie: String(employe.categorie || '').trim(),
    jobs: String(employe.jobs || '').trim(),
    date_embauche: dateEmb,
    nombre_annees: calculerAnciennete(dateEmb, new Date().getFullYear()),
    enfant_a_charge: Number(employe.enfant_a_charge || 0),
    base_aj: Number(employe.base_aj || 0),
    logement_transport: Number(employe.logement_transport || 0),
    rendement: Number(employe.rendement || 0),
    responsabilite_representation: Number(employe.responsabilite_representation || 0),
    rib: String(employe.rib || '').trim(),
    mode_paiement: String(employe.mode_paiement || 'ESPECES').toUpperCase(),
    actif: nouvelActif,
    date_inactif: dateInactif,
    conge_maternite:
      employe.conge_maternite !== undefined
        ? employe.conge_maternite
          ? 1
          : 0
        : store.employes[idx].conge_maternite,
    date_debut_maternite:
      employe.date_debut_maternite !== undefined
        ? String(employe.date_debut_maternite || '').trim()
        : store.employes[idx].date_debut_maternite,
  };

  store.employes[idx] = updated;
  if (nouvelActif === 0) {
    retirerPaiesOuvertesDepuisInactif(store, id, dateInactif);
  }
  saveStore();
  return true;
}

export async function toggleActifEmploye(id: number, actif: boolean, dateInactif?: string): Promise<boolean> {
  exigerAdmin();
  const store = getStore();
  const idx = store.employes.findIndex((e: any) => Number(e.id) === id);
  if (idx === -1) return false;
  store.employes[idx].actif = actif ? 1 : 0;
  if (actif) {
    store.employes[idx].date_inactif = '';
  } else {
    const dt = String(dateInactif ?? store.employes[idx].date_inactif ?? '').trim() || new Date().toISOString().slice(0, 10);
    store.employes[idx].date_inactif = dt;
    retirerPaiesOuvertesDepuisInactif(store, id, dt);
  }
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
  exigerAdmin();
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const cfgConges = loadConfig().congies;
  const syntheseParEmp = calculerSyntheseCongesPeriode(
    store.employes || [],
    store.conges || [],
    cfgConges,
    a,
    m
  );

  const employes: PaieMensuelle[] = (store.paies || [])
    .filter((p: any) => Number(p.annee) === a && String(p.mois).toUpperCase() === m)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule))
    .map((p: any) => {
      const syn = syntheseParEmp.get(Number(p.employe_id));
      return syn ? { ...p, ...syn } : { ...p };
    });

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
    total_conge_pris_mois: 0,
    total_conge_restant: 0,
  };

  const keys: (keyof TotauxMois)[] = [
    'total_enfant_a_charge', 'total_base_aj', 'total_logt_trsp', 'total_rendement',
    'total_resp_repres', 'total_salaire_brut', 'total_cnaps', 'total_patronal',
    'total_salaire_imposable', 'total_irsa', 'total_salaire_net', 'total_augmentation_divers',
    'total_prime_de_garde', 'total_anciennete2', 'total_risque', 'total_repr_rec',
    'total_accessoir', 'total_brut', 'total_avance', 'total_med', 'total_net',
    'total_virement', 'total_especes', 'total_conge_pris_mois', 'total_conge_restant',
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
    total_conge_pris_mois: 'conge_pris_mois',
    total_conge_restant: 'conge_restant',
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

const MOIS_ORDRE: Record<string, number> = {
  JANVIER: 0, FEVRIER: 1, MARS: 2, AVRIL: 3, MAI: 4, JUIN: 5,
  JUILLET: 6, AOUT: 7, SEPTEMBRE: 8, OCTOBRE: 9, NOVEMBRE: 10, DECEMBRE: 11,
};

function indexPaiesParEmploye(store: any): Record<number, any[]> {
  const paiesParEmploye: Record<number, any[]> = {};
  for (const p of store.paies || []) {
    const id = Number(p.employe_id);
    if (!paiesParEmploye[id]) paiesParEmploye[id] = [];
    paiesParEmploye[id].push(p);
  }
  for (const id of Object.keys(paiesParEmploye)) {
    paiesParEmploye[Number(id)].sort((x: any, y: any) => {
      const ix = Number(x.annee) * 12 + (MOIS_ORDRE[String(x.mois).toUpperCase()] ?? 0);
      const iy = Number(y.annee) * 12 + (MOIS_ORDRE[String(y.mois).toUpperCase()] ?? 0);
      return iy - ix;
    });
  }
  return paiesParEmploye;
}

/** Construit (sans l'enregistrer) le bulletin d'un salarié pour une période. */
function construirePaie(
  emp: any,
  a: number,
  m: string,
  paiesParEmploye: Record<number, any[]>
): any {
  const dernier = (paiesParEmploye[Number(emp.id)] || []).find(
    (p: any) => Number(p.annee) * 12 + (MOIS_ORDRE[String(p.mois).toUpperCase()] ?? 0) < a * 12 + (MOIS_ORDRE[m] ?? 0)
  );
  const accessoires = dernier
    ? {
        augmentation_divers: Number(dernier.augmentation_divers || 0),
        prime_de_garde: Number(dernier.prime_de_garde || 0),
        anciennete2: Number(dernier.anciennete2 || 0),
        risque: Number(dernier.risque || 0),
        repr_rec: Number(dernier.repr_rec || 0),
      }
    : {};

  const annees = calculerAnciennete(emp.date_embauche, a);
  const enMaternite = emp.conge_maternite === 1 || estEnCongeMaternite(emp.date_debut_maternite, a, m);
  const empCalc = {
    base_aj: emp.base_aj,
    logement_transport: emp.logement_transport,
    rendement: emp.rendement,
    responsabilite_representation: emp.responsabilite_representation,
    enfant_a_charge: emp.enfant_a_charge,
    rib: emp.rib,
    rap: true,
    conge_maternite: enMaternite ? 1 : 0,
  };
  const r = calculerPaieEmploye(empCalc, 0, 0, accessoires);

  return {
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
    augmentation_divers: r.augmentation_divers,
    prime_de_garde: r.prime_de_garde,
    anciennete2: r.anciennete2,
    risque: r.risque,
    repr_rec: r.repr_rec,
    accessoir: r.accessoir,
    brut: r.brut,
    avance: 0,
    med: 0,
    net: r.net,
    virement: r.virement,
    especes: r.especes,
    rap: 1,
    rib: emp.rib || '',
    verrouille: 0,
    conge_maternite: enMaternite ? 1 : 0,
    date_debut_maternite: emp.date_debut_maternite || '',
    date_modification: nowStamp(),
  };
}

/** Crée le bulletin d'UN seul salarié pour une période (s'il n'existe pas). */
export async function initPaieEmploye(
  employeId: number,
  annee: number,
  mois: string
): Promise<{ success: boolean; created: boolean }> {
  exigerAdmin();
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(employeId));
  if (!emp) return { success: false, created: false };

  const dejaCree = (store.paies || []).some(
    (p: any) =>
      Number(p.employe_id) === Number(employeId) &&
      Number(p.annee) === a &&
      String(p.mois).toUpperCase() === m
  );
  if (dejaCree) return { success: true, created: false };

  const paiesParEmploye = indexPaiesParEmploye(store);
  store.paies.push(construirePaie(emp, a, m, paiesParEmploye));
  saveStore();
  return { success: true, created: true };
}

export async function initMoisPaie(
  annee: number,
  mois: string
): Promise<{ success: boolean; initializedCount: number }> {
  exigerAdmin();
  const store = getStore();
  const a = Number(annee);
  const m = String(mois).toUpperCase();

  const employesActifs = (store.employes || [])
    .filter((e: any) => Number(e.actif) === 1)
    .sort((x: any, y: any) => Number(x.numero_matricule) - Number(y.numero_matricule));

  const paiesParEmploye = indexPaiesParEmploye(store);

  let count = 0;
  for (const emp of employesActifs) {
    const exist = (store.paies || []).some(
      (p: any) =>
        Number(p.employe_id) === Number(emp.id) &&
        Number(p.annee) === a &&
        String(p.mois).toUpperCase() === m
    );
    if (exist) continue;

    store.paies.push(construirePaie(emp, a, m, paiesParEmploye));
    count++;
  }

  if (count > 0) saveStore();
  return { success: true, initializedCount: count };
}

function enrichirLignePaieConges(store: any, paie: any): PaieMensuelle {
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(paie.employe_id));
  if (!emp) return { ...paie };
  const syn = calculerSyntheseCongesPeriode(
    [emp],
    store.conges || [],
    loadConfig().congies,
    Number(paie.annee),
    String(paie.mois).toUpperCase()
  ).get(Number(emp.id));
  return syn ? { ...paie, ...syn } : { ...paie };
}

export async function savePaieSaisie(
  id: number,
  avance: number,
  med: number,
  accessoires?: any
): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  exigerAdmin();
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

  // Préserver le mode de règlement choisi sur le bulletin si l'utilisateur a ajusté Virement / Espèces
  let virement: number | null = r.virement;
  let especes: number | null = r.especes;
  const oldNet = Number(row.net || 0);
  const oldVir = row.virement;
  const oldEsp = row.especes;
  if (oldNet > 0) {
    if ((oldVir === null || Number(oldVir) === 0) && Number(oldEsp || 0) > 0) {
      virement = oldVir === null ? null : 0;
      especes = r.net;
    } else if (Number(oldVir || 0) > 0 && (oldEsp === null || Number(oldEsp) === 0)) {
      virement = r.net;
      especes = 0;
    } else if (Number(oldVir || 0) > 0 && Number(oldEsp || 0) > 0) {
      const partEsp = Math.min(Math.max(0, Number(oldEsp || 0)), r.net);
      especes = Math.round(partEsp * 100) / 100;
      virement = Math.round(Math.max(0, r.net - especes) * 100) / 100;
    }
  }

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
    virement,
    especes,
    date_modification: nowStamp(),
  };

  store.paies[idx] = updated;
  saveStore();
  return { success: true, updated: enrichirLignePaieConges(store, updated) };
}

/**
 * Permet de modifier directement la répartition VIREMENT / ESPÈCES d'un bulletin
 * (ex. changement de mode de paiement en cours d'année) en ajustant automatiquement
 * le complément par rapport au NET À PAYER enregistré.
 */
export async function savePaieReglement(
  id: number,
  champ: 'virement' | 'especes',
  montant: number
): Promise<{ success: boolean; updated?: PaieMensuelle }> {
  exigerAdmin();
  const store = getStore();
  const idx = store.paies.findIndex((p: any) => Number(p.id) === Number(id));
  if (idx === -1) return { success: false };
  const row = store.paies[idx];
  if (Number(row.verrouille) === 1) return { success: false };

  const net = Math.max(0, Number(row.net || 0));
  const val = Math.max(0, Math.round(Number(montant || 0) * 100) / 100);

  let virement: number;
  let especes: number;
  if (champ === 'virement') {
    virement = val;
    especes = val <= net ? Math.round((net - val) * 100) / 100 : 0;
  } else {
    especes = val;
    virement = val <= net ? Math.round((net - val) * 100) / 100 : 0;
  }

  const updated = {
    ...row,
    virement,
    especes,
    date_modification: nowStamp(),
  };
  store.paies[idx] = updated;
  saveStore();
  return { success: true, updated: enrichirLignePaieConges(store, updated) };
}

export async function cloturerMois(annee: number, mois: string): Promise<boolean> {
  exigerAdmin();
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
  exigerAdmin();
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
  exigerAdmin();
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

// ------------------------------------------------------------------------------
// IMPORT D'UN CLASSEUR EXCEL (.xlsx / .xlsm) : PERSONNEL + ÉTATS MENSUELS
// ------------------------------------------------------------------------------
export interface ImportOptions {
  /** « fusion » : complète les données existantes — « remplacement » : repart de zéro. */
  mode: 'fusion' | 'remplacement';
  /** Importer également les états de paie mensuels trouvés dans le classeur. */
  importPaies: boolean;
  /** Écraser les bulletins déjà présents pour une même période (hors périodes clôturées). */
  ecraserPaies: boolean;
  /** Mettre à jour les barèmes des fiches salariés existantes (désactivé pour une archive ancienne). */
  mettreAJourFiches?: boolean;
  /** Marquer les nouveaux salariés découverts comme « Départ / Inactif » (utile pour les anciens exercices). */
  nouveauxCommeInactifs?: boolean;
}

export interface ImportRapport {
  employesAjoutes: number;
  employesMisAJour: number;
  paiesAjoutees: number;
  paiesMisesAJour: number;
  periodes: { annee: number; mois: string }[];
  periodesVerrouilleesIgnorees?: string[];
}

const CHAMPS_TEXTE: (keyof ImportedEmploye)[] = [
  'nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'rib', 'mode_paiement',
];
const CHAMPS_NOMBRE: (keyof ImportedEmploye)[] = [
  'nombre_annees', 'enfant_a_charge', 'base_aj', 'logement_transport', 'rendement',
  'responsabilite_representation',
];

function fusionnerEmploye(base: any, src: ImportedEmploye, ecraserValeurs = true): any {
  const out: any = { ...base };
  for (const k of CHAMPS_TEXTE) {
    const v = String((src as any)[k] || '').trim();
    if (!v) continue;
    if (ecraserValeurs || !String(out[k] || '').trim()) out[k] = v;
  }
  for (const k of CHAMPS_NOMBRE) {
    const v = Number((src as any)[k] || 0);
    if (!(v > 0)) continue;
    if (ecraserValeurs || !(Number(out[k] || 0) > 0)) out[k] = v;
  }
  out.nom_prenoms = out.nom_prenoms || src.nom_prenoms;
  return out;
}

function nouveauEmploye(src: ImportedEmploye, actif: 0 | 1 = 1): any {
  return {
    id: nextEmployeId(),
    numero_matricule: Number(src.numero_matricule),
    nom_prenoms: src.nom_prenoms || `SALARIÉ ${src.numero_matricule}`,
    numero_cnaps: src.numero_cnaps || '',
    categorie: src.categorie || '',
    jobs: src.jobs || '',
    date_embauche: src.date_embauche || '',
    nombre_annees: src.nombre_annees || calculerAnciennete(src.date_embauche, new Date().getFullYear()),
    enfant_a_charge: src.enfant_a_charge || 0,
    base_aj: src.base_aj || 0,
    logement_transport: src.logement_transport || 0,
    rendement: src.rendement || 0,
    responsabilite_representation: src.responsabilite_representation || 0,
    rib: src.rib || '',
    mode_paiement: src.mode_paiement || 'ESPECES',
    actif,
    date_inactif: actif === 0 ? new Date().toISOString().slice(0, 10) : '',
    conge_maternite: src.conge_maternite ? 1 : 0,
    date_debut_maternite: src.date_debut_maternite || '',
    date_creation: nowStamp(),
  };
}

function lignePaie(src: ImportedPaie, employeId: number, id: number): any {
  return {
    id,
    employe_id: employeId,
    numero_matricule: Number(src.numero_matricule),
    annee: Number(src.annee),
    mois: String(src.mois).toUpperCase(),
    nom_prenoms: src.nom_prenoms || '',
    numero_cnaps: src.numero_cnaps || '',
    categorie: src.categorie || '',
    jobs: src.jobs || '',
    date_embauche: src.date_embauche || '',
    nombre_annees: src.nombre_annees || 0,
    enfant_a_charge: src.enfant_a_charge || 0,
    base_aj: src.base_aj || 0,
    logt_trsp: src.logt_trsp || 0,
    rendement: src.rendement || 0,
    resp_repres: src.resp_repres || 0,
    salaire_brut: src.salaire_brut || 0,
    cnaps: src.cnaps || 0,
    patronal: src.patronal || 0,
    salaire_imposable: src.salaire_imposable || 0,
    irsa: src.irsa || 0,
    salaire_net: src.salaire_net || 0,
    augmentation_divers: src.augmentation_divers || 0,
    prime_de_garde: src.prime_de_garde || 0,
    anciennete2: src.anciennete2 || 0,
    risque: src.risque || 0,
    repr_rec: src.repr_rec || 0,
    accessoir: src.accessoir || 0,
    brut: src.brut || 0,
    avance: src.avance || 0,
    med: src.med || 0,
    net: src.net || 0,
    virement: src.virement,
    especes: src.especes,
    rap: src.rap === 0 ? 0 : 1,
    rib: src.rib || '',
    verrouille: 0,
    conge_maternite: 0,
    date_debut_maternite: '',
    date_modification: nowStamp(),
  };
}

export async function importerClasseur(
  result: ImportWorkbookResult,
  options: ImportOptions
): Promise<ImportRapport> {
  exigerAdmin();
  const store = getStore();

  if (options.mode === 'remplacement') {
    store.employes = [];
    store.paies = [];
  }

  const ecraserFiches = options.mettreAJourFiches !== false;
  const statutNouveau: 0 | 1 = options.nouveauxCommeInactifs ? 0 : 1;

  // Périodes déjà clôturées (protégées contre l'écrasement en mode fusion)
  const periodesVerrouillees = new Set<string>();
  for (const p of store.paies || []) {
    if (Number(p.verrouille) === 1) {
      periodesVerrouillees.add(`${Number(p.annee)}|${String(p.mois).toUpperCase()}`);
    }
  }
  const verrouilleesRencontrees = new Set<string>();

  const rapport: ImportRapport = {
    employesAjoutes: 0,
    employesMisAJour: 0,
    paiesAjoutees: 0,
    paiesMisesAJour: 0,
    periodes: [],
    periodesVerrouilleesIgnorees: [],
  };

  // Index matricule -> employé
  const parMatricule = new Map<number, any>();
  for (const e of store.employes) parMatricule.set(Number(e.numero_matricule), e);

  for (const src of result.employes) {
    if (!src.numero_matricule) continue;
    const exist = parMatricule.get(Number(src.numero_matricule));
    if (exist) {
      const merged = fusionnerEmploye(exist, src, ecraserFiches);
      Object.assign(exist, merged);
      rapport.employesMisAJour++;
    } else {
      const created = nouveauEmploye(src, statutNouveau);
      store.employes.push(created);
      parMatricule.set(Number(src.numero_matricule), created);
      rapport.employesAjoutes++;
    }
  }

  // Les bulletins peuvent référencer un matricule absent de la liste du personnel
  for (const p of result.paies) {
    if (!parMatricule.has(Number(p.numero_matricule))) {
      const created = nouveauEmploye(
        {
          numero_matricule: p.numero_matricule,
          nom_prenoms: p.nom_prenoms,
          numero_cnaps: p.numero_cnaps,
          categorie: p.categorie,
          jobs: p.jobs,
          date_embauche: p.date_embauche,
          nombre_annees: p.nombre_annees,
          enfant_a_charge: p.enfant_a_charge,
          base_aj: p.base_aj,
          logement_transport: p.logt_trsp,
          rendement: p.rendement,
          responsabilite_representation: p.resp_repres,
          rib: p.rib,
          mode_paiement: p.rib ? 'VIREMENT' : 'ESPECES',
          conge_maternite: 0,
          date_debut_maternite: '',
        },
        statutNouveau
      );
      store.employes.push(created);
      parMatricule.set(Number(p.numero_matricule), created);
      rapport.employesAjoutes++;
    }
  }

  // En mode remplacement, rattacher les fiches de congé existantes aux nouveaux IDs salariés par matricule
  if (options.mode === 'remplacement' && Array.isArray(store.conges)) {
    const valides: any[] = [];
    for (const c of store.conges) {
      const emp = parMatricule.get(Number(c.numero_matricule));
      if (emp) valides.push({ ...c, employe_id: Number(emp.id) });
    }
    store.conges = valides;
  }

  if (options.importPaies) {
    const periodesImportees = new Map<string, { annee: number; mois: string }>();
    for (const src of result.paies) {
      const emp = parMatricule.get(Number(src.numero_matricule));
      if (!emp) continue;
      const moisUp = String(src.mois).toUpperCase();
      const clePeriode = `${Number(src.annee)}|${moisUp}`;
      if (periodesVerrouillees.has(clePeriode)) {
        verrouilleesRencontrees.add(`${moisUp} ${src.annee}`);
        continue;
      }
      const idx = store.paies.findIndex(
        (p: any) =>
          Number(p.employe_id) === Number(emp.id) &&
          Number(p.annee) === Number(src.annee) &&
          String(p.mois).toUpperCase() === moisUp
      );
      if (idx >= 0) {
        if (!options.ecraserPaies) continue;
        const existing = store.paies[idx];
        if (Number(existing.verrouille) === 1) {
          verrouilleesRencontrees.add(`${moisUp} ${src.annee}`);
          continue;
        }
        store.paies[idx] = {
          ...lignePaie(src, Number(emp.id), Number(existing.id)),
          verrouille: 0,
        };
        rapport.paiesMisesAJour++;
      } else {
        store.paies.push(lignePaie(src, Number(emp.id), nextPaieId()));
        rapport.paiesAjoutees++;
      }
      periodesImportees.set(clePeriode, { annee: Number(src.annee), mois: moisUp });
    }
    rapport.periodes = Array.from(periodesImportees.values()).sort(
      (a, b) => a.annee - b.annee || MOIS_FR.indexOf(a.mois) - MOIS_FR.indexOf(b.mois)
    );
    rapport.periodesVerrouilleesIgnorees = Array.from(verrouilleesRencontrees);
  }

  // Mise à jour de l'en-tête (année / mois disponibles)
  try {
    const annees = Array.from(new Set(store.paies.map((p: any) => Number(p.annee)))).sort();
    if (annees.length) store.meta.annee = annees[annees.length - 1];
    store.meta.mois_disponibles = MOIS_FR.filter((m) =>
      store.paies.some((p: any) => String(p.mois).toUpperCase() === m)
    );
  } catch {
    /* ignore */
  }

  saveStore();
  return rapport;
}

/** Liste des périodes (année + mois) effectivement présentes dans les données. */
export async function fetchPeriodes(): Promise<{ annee: number; mois: string; nb: number }[]> {
  exigerAdmin();
  const store = getStore();
  const map = new Map<string, { annee: number; mois: string; nb: number }>();
  for (const p of store.paies || []) {
    const a = Number(p.annee);
    const m = String(p.mois).toUpperCase();
    const k = `${a}|${m}`;
    const cur = map.get(k);
    if (cur) cur.nb++;
    else map.set(k, { annee: a, mois: m, nb: 1 });
  }
  return Array.from(map.values()).sort(
    (x, y) => x.annee - y.annee || MOIS_FR.indexOf(x.mois) - MOIS_FR.indexOf(y.mois)
  );
}

export interface SaisieLot {
  paieId: number;
  avance?: number;
  med?: number;
  /** Valeurs affichées à l'ouverture, pour éviter d'écraser une autre saisie. */
  avanceInitiale: number;
  medInitial: number;
}

/** Sauvegarde atomique d'un lot pour une seule période, sans recalculer les gains importés. */
export async function enregistrerSaisieLot(annee: number, mois: string, lignes: SaisieLot[]): Promise<{ success: boolean; message?: string; count?: number }> {
  exigerAdmin();
  const store = getStore();
  const periode = (p: any) => Number(p.annee) === Number(annee) && String(p.mois).toUpperCase() === String(mois).toUpperCase();
  if (!lignes.length) return { success: false, message: 'Ajoutez au moins une saisie.' };
  if (!storeEstSynchronise()) return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page avant de saisir à nouveau.' };
  if (store.paies.some((p: any) => periode(p) && Number(p.verrouille) === 1)) return { success: false, message: 'Cette période est clôturée. Déverrouillez-la avant de saisir.' };
  const seen = new Set<number>();
  const updates: { index: number; row: any }[] = [];
  const cfg = loadConfig();
  for (const line of lignes) {
    const id = Number(line.paieId);
    const index = store.paies.findIndex((p: any) => Number(p.id) === id && periode(p));
    if (!Number.isInteger(id) || seen.has(id) || index < 0) return { success: false, message: 'Un bulletin est introuvable ou figure plusieurs fois dans le lot. Rechargez la période.' };
    seen.add(id);
    const p = store.paies[index];
    if (Number(p.verrouille) === 1) return { success: false, message: 'Un bulletin est clôturé. Aucune saisie enregistrée.' };
    if (Number(p.avance || 0) !== line.avanceInitiale || Number(p.med || 0) !== line.medInitial) return { success: false, message: `Les retenues de ${p.nom_prenoms} ont changé depuis l'ouverture. Fermez et rechargez la période.` };
    if (line.avance === undefined && line.med === undefined) return { success: false, message: 'Une ligne ne contient aucun montant.' };
    for (const value of [line.avance, line.med]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) return { success: false, message: 'Les montants doivent être des nombres positifs valides.' };
    }
    const avance = line.avance === undefined ? Number(p.avance || 0) : line.avance;
    const med = line.med === undefined ? Number(p.med || 0) : line.med;
    if (avance === Number(p.avance || 0) && med === Number(p.med || 0)) continue;
    // Même arrondi que le moteur de paie, à partir du BRUT existant de l'état.
    const brutApresRetenues = Math.max(0, Number(p.brut || 0) - avance - med);
    const pas = Number(cfg.arrondiNet) || 0;
    const net = pas > 0 ? Math.floor(brutApresRetenues / pas) * pas : Math.floor(brutApresRetenues);
    let virement = p.virement == null ? null : Number(p.virement);
    let especes = p.especes == null ? null : Number(p.especes);
    // Conserver le mode de règlement de la ligne existante (un RIB ne signifie
    // pas forcément que le salarié a été payé par virement dans le classeur).
    if (virement === null && especes === null) {
      // Pas de ventilation connue : ne pas l'inventer.
    } else if (virement !== null && (virement > 0 || (Number(p.net || 0) === 0 && (especes === null || especes === 0)))) {
      const partEspeces = Math.min(Math.max(0, Number(especes || 0)), net);
      virement = net - partEspeces;
      if (especes !== null) especes = partEspeces;
    } else {
      if (virement !== null) virement = 0;
      especes = net;
    }
    updates.push({ index, row: { ...p, avance, med, net, virement, especes, date_modification: nowStamp() } });
  }
  if (!updates.length) return { success: true, count: 0 };
  const anciens = updates.map(({ index }) => store.paies[index]);
  updates.forEach(({ index, row }) => { store.paies[index] = row; });
  if (!saveStore()) {
    updates.forEach(({ index }, i) => { store.paies[index] = anciens[i]; });
    return { success: false, message: "L'enregistrement a échoué. Vérifiez l'espace de stockage du navigateur." };
  }
  return { success: true, count: updates.length };
}

// ------------------------------------------------------------------------------
// CONGÉS, PERMISSIONS ET EXAMENS MÉDICAUX (module « Congés & Permissions »)
// Les droits et les motifs viennent de la « FICHE D'ABSENCE » de la société ;
// la présentation de l'état reproduit le « CONTRÔLE DES CONGÉS ET PERMISSIONS ».
// ------------------------------------------------------------------------------

export interface CongeFiltres {
  annee?: number;
  mois?: string;
  statut?: StatutConges | 'TOUS';
  categorie?: CategorieAbsence | 'TOUTES';
  employeId?: number;
  recherche?: string;
  inclureRefuses?: boolean;
}

export interface CongeMeta {
  /** Nom de l'utilisateur qui saisit ou vise la fiche (traçabilité). */
  utilisateur: string;
  role: string;
}

function configConges(): CongesConfig {
  return loadConfig().congies;
}

function congesBruts(): CongeAbsence[] {
  const store = getStore();
  const cfg = configConges();
  return (store.conges || []).map((c: any) => normaliserConge(c, cfg));
}

export async function fetchConges(filtres: CongeFiltres = {}): Promise<CongeAbsence[]> {
  let liste = congesBruts();
  const a = Number(filtres.annee);
  if (Number.isFinite(a) && a > 0) liste = liste.filter((c) => Number(c.annee) === a);
  if (filtres.mois) {
    const m = String(filtres.mois).toUpperCase();
    liste = liste.filter((c) => {
      const d = c.date_debut || c.date_demande;
      return d ? MOIS_FR[Number(d.slice(5, 7)) - 1] === m : false;
    });
  }
  if (filtres.employeId) liste = liste.filter((c) => Number(c.employe_id) === Number(filtres.employeId));
  if (filtres.categorie && filtres.categorie !== 'TOUTES') liste = liste.filter((c) => c.categorie === filtres.categorie);
  if (filtres.statut && filtres.statut !== 'TOUS') liste = liste.filter((c) => c.statut === filtres.statut);
  else if (!filtres.inclureRefuses && !filtres.statut) liste = liste.filter((c) => estPrisEnCompte(c));
  const q = String(filtres.recherche || '').trim().toLowerCase();
  if (q) {
    liste = liste.filter((c) =>
      String(c.nom_prenoms || '').toLowerCase().includes(q) ||
      String(c.fonction || '').toLowerCase().includes(q) ||
      String(c.motif_libelle || '').toLowerCase().includes(q) ||
      String(c.numero_matricule || '').includes(q) ||
      String(c.remplacant || '').toLowerCase().includes(q)
    );
  }
  return liste.sort((x, y) =>
    String(y.date_debut || '').localeCompare(String(x.date_debut || '')) ||
    String(y.date_demande || '').localeCompare(String(x.date_demande || '')) ||
    Number(y.id) - Number(x.id)
  );
}

/** Situation des droits de chaque salarié pour une année (tableau de suivi — 3 dernières années). */
export async function fetchSituationConges(annee: number, actifsSeulement = false): Promise<SoldeSaisie[]> {
  const store = getStore();
  const cfg = configConges();
  const employes = (store.employes || []).filter((e: any) => (actifsSeulement ? Number(e.actif) === 1 : true));
  return calculerSoldes(employes, congesBruts(), cfg, Number(annee) || new Date().getFullYear(), { nbAnnees: cfg.nbAnneesCumul });
}

/** État « Contrôle des congés et permissions », tel qu'imprimé et exporté (3 dernières années par défaut). */
export async function fetchEtatConges(
  annee: number,
  options: { nbAnnees?: number; recherche?: string; inclureRefuses?: boolean } = {}
): Promise<EtatConges> {
  const store = getStore();
  const cfg = configConges();
  let employes = [...(store.employes || [])];
  const q = String(options.recherche || '').trim().toLowerCase();
  if (q) {
    employes = employes.filter((e: any) =>
      String(e.nom_prenoms || '').toLowerCase().includes(q) ||
      String(e.jobs || '').toLowerCase().includes(q) ||
      String(e.categorie || '').toLowerCase().includes(q) ||
      String(e.numero_matricule || '').includes(q)
    );
  }
  return construireEtat(employes, congesBruts(), cfg, {
    annee: Number(annee) || new Date().getFullYear(),
    nbAnnees: Number(options.nbAnnees) || cfg.nbAnneesCumul,
    inclureRefuses: options.inclureRefuses === true,
  });
}

/** Jours ouvrables calculés depuis les dates de la fiche (bouton « calculer »). */
export async function calculerJoursAbsence(dateDebut: string, dateFin: string): Promise<number> {
  return joursDemandesPour({ date_debut: dateDebut, date_fin: dateFin }, configConges());
}

interface SanctionConge {
  success: boolean;
  message?: string;
  avertissement?: string;
  id?: number;
}

function nettoyerTexte(v: any, max = 240): string {
  return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function nettoyerDate(v: any): string {
  const s = String(v ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function nettoyerHeure(v: any): string {
  const s = String(v ?? '').trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

function nettoyerJours(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(3650, Math.round(n * 100) / 100);
}

/** Un ajustement de droit est un nombre signé (retrait de jours autorisé). */
function nettoyerJoursSignes(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-3650, Math.min(3650, Math.round(n * 100) / 100));
}

/** Contrôle commun aux créations et aux modifications d'une fiche d'absence. */
async function prepareConge(
  draft: Partial<CongeAbsence>,
  store: any,
  idCourant: number
): Promise<{ erreur?: string; avertissement?: string; ligne?: any }> {
  const cfg = configConges();
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(draft.employe_id));
  if (!emp) return { erreur: 'Choisissez le salarié concerné.' };

  const categorie: CategorieAbsence = (['CONGE', 'PERMISSION', 'EXAMEN_MEDICAL', 'AJUSTEMENT'] as CategorieAbsence[]).includes(
    String(draft.categorie) as CategorieAbsence
  )
    ? (draft.categorie as CategorieAbsence)
    : 'CONGE';
  const motif = trouverMotif(draft.motif_code || '');
  if (categorie !== 'CONGE' && categorie !== 'AJUSTEMENT' && !motif) {
    return { erreur: "Choisissez un motif prévu par la fiche d'absence (règlement intérieur)." };
  }
  const dateDemande = nettoyerDate(draft.date_demande) || new Date().toISOString().slice(0, 10);
  const dateDebut = nettoyerDate(draft.date_debut);
  let dateFin = nettoyerDate(draft.date_fin);
  let dateRetour = nettoyerDate(draft.date_retour);
  let jours = categorie === 'AJUSTEMENT' ? nettoyerJoursSignes(draft.jours_demandes) : nettoyerJours(draft.jours_demandes);

  if (categorie === 'AJUSTEMENT') {
    if (draft.ajustement_type === 'OUVERTURE') {
      const brutOuv = Number(draft.jours_demandes);
      if (!Number.isFinite(brutOuv) || brutOuv < 0 || brutOuv > cfg.joursCongeParAn) {
        return { erreur: `La première case d'année doit être comprise entre 0 et ${cfg.joursCongeParAn} jours.` };
      }
      jours = Math.round(brutOuv * 100) / 100;
    } else if (!jours) {
      return { erreur: "Indiquez le nombre de jours de l'ajustement (positif ou négatif)." };
    }
    if (!Number(draft.annee)) return { erreur: "Précisez l'année concernée par l'ajustement." };
    dateFin = '';
    dateRetour = '';
  } else {
    if (!dateDebut) return { erreur: 'Indiquez la date de départ (Daty handehanana).' };
    if (dateFin && dateFin < dateDebut) return { erreur: 'La date de fin demandée est antérieure à la date de départ.' };
    if (!jours) jours = joursDemandesPour({ date_debut: dateDebut, date_fin: dateFin || dateDebut }, cfg);
    if (!jours) return { erreur: 'Aucun jour ouvrable sur la période indiquée.' };
    if (!dateFin) {
      dateFin = calculerDateFin(dateDebut, jours, cfg);
    }
    if (!dateRetour || dateRetour <= dateFin) {
      dateRetour = calculerDateRetourDepuisFin(dateFin, cfg);
    }
  }

  const imputation: ImputationConges = categorie === 'AJUSTEMENT'
    ? 'AUCUNE'
    : (['CONGE', 'PERMISSION', 'AUCUNE'] as ImputationConges[]).includes(String(draft.imputation) as ImputationConges)
      ? (draft.imputation as ImputationConges)
      : categorie === 'CONGE'
        ? 'CONGE'
        : categorie === 'PERMISSION'
          ? 'PERMISSION'
          : cfg.examenSurPermission ? 'PERMISSION' : 'AUCUNE';

  const joursValidesBrut = draft.jours_valides;
  const joursValides =
    joursValidesBrut === null || joursValidesBrut === undefined || (joursValidesBrut as any) === ''
      ? null
      : nettoyerJours(joursValidesBrut);

  const statutSouhaite: StatutConges = (['SOUMIS', 'AVIS_CHF', 'AVIS_MEDECIN', 'VALIDE', 'REFUSE'] as StatutConges[])
    .includes(String(draft.statut) as StatutConges)
    ? (draft.statut as StatutConges)
    : 'SOUMIS';

  const annee = Number(draft.annee) || Number((dateDebut || dateDemande).slice(0, 4)) || new Date().getFullYear();

  const ligne: any = {
    id: idCourant || nextCongeId(),
    employe_id: Number(emp.id),
    numero_matricule: Number(emp.numero_matricule) || 0,
    nom_prenoms: nettoyerTexte(emp.nom_prenoms, 120),
    fonction: nettoyerTexte(emp.jobs || emp.categorie || '', 80),
    service: nettoyerTexte(draft.service, 120),
    contact: nettoyerTexte(draft.contact, 160),
    categorie,
    motif_code: motif ? motif.code : '',
    motif_libelle: nettoyerTexte(draft.motif_libelle || (motif ? motif.libelle : LIBELLES_CATEGORIE[categorie]), 160),
    imputation,
    annee,
    date_demande: dateDemande,
    date_debut: dateDebut,
    heure_debut: nettoyerHeure(draft.heure_debut),
    date_fin: dateFin,
    date_retour: dateRetour,
    heure_fin: nettoyerHeure(draft.heure_fin),
    jours_demandes: jours,
    jours_valides: joursValides,
    remplacant: nettoyerTexte(draft.remplacant, 120),
    titre_periode: nettoyerTexte(draft.titre_periode, 60),
    justificatif: nettoyerTexte(draft.justificatif, 160),
    observations: nettoyerTexte(draft.observations, 500),
    statut: categorie === 'AJUSTEMENT' ? 'VALIDE' : statutSouhaite,
    visa_chef_par: nettoyerTexte(draft.visa_chef_par, 80),
    visa_chef_le: nettoyerDate(draft.visa_chef_le),
    visa_medecin_par: nettoyerTexte(draft.visa_medecin_par, 80),
    visa_medecin_le: nettoyerDate(draft.visa_medecin_le),
    visa_gestionnaire_par: nettoyerTexte(draft.visa_gestionnaire_par, 80),
    visa_gestionnaire_le: nettoyerDate(draft.visa_gestionnaire_le),
    motif_refus: nettoyerTexte(draft.motif_refus, 240),
    ajustement_type: draft.ajustement_type === 'OUVERTURE' ? 'OUVERTURE' : draft.ajustement_type === 'REPORT' ? 'REPORT' : draft.ajustement_type === 'DROIT' || categorie === 'AJUSTEMENT' ? 'DROIT' : '',
  };

  // Un ajustement est saisi et appliqué par le gestionnaire : pas de circuit de visas.
  if (categorie === 'AJUSTEMENT') {
    ligne.jours_demandes = jours;
    ligne.statut = 'VALIDE';
    ligne.jours_valides = null;
  }

  // Prescription légale (Code du Travail malgache) : seuls les N derniers exercices
  // successifs (par défaut les 3 dernières années : N-2, N-1, N) sont mobilisables.
  if (ligne.imputation === 'CONGE' && ligne.titre_periode) {
    const anneesLoi = anneesSuccessives(ligne.annee, cfg.nbAnneesCumul);
    const anneeMinLoi = anneesLoi[0] ?? ligne.annee;
    const mTitre = /\b(19\d{2}|20\d{2})\b/.exec(String(ligne.titre_periode));
    const anneeTitre = mTitre ? Number(mTitre[1]) : 0;
    if (anneeTitre > 0 && anneeTitre < anneeMinLoi) {
      return {
        erreur: `Loi malgache (Code du Travail) : seuls les ${cfg.nbAnneesCumul} derniers exercices (${anneesLoi.join(', ')}) sont cumulables ; le titre ${anneeTitre} est prescrit.`,
      };
    }
  }

  // Contrôle du solde : bloquant seulement si l'option est cochée, sinon simple rappel.
  let avertissement: string | undefined;
  if (ligne.statut === 'VALIDE' && ligne.imputation !== 'AUCUNE') {
    const controle = controleSolde(store.employes, congesBruts(), cfg, ligne.employe_id, ligne.annee, {
      ...ligne,
      id: ligne.id,
      jours_valides: ligne.jours_demandes,
    });
    if (!controle.suffisant) {
      const texte = controle.titrePrescrit
        ? `Titre prescrit : seuls les ${cfg.nbAnneesCumul} derniers exercices (${(controle.anneesAutorisees || []).join(', ')}) sont autorisés par la loi malgache.`
        : `${ligne.imputation === 'PERMISSION' ? 'Permission' : 'Congé'} dépassé de ${Math.abs(
            controle.apresDemande
          ).toLocaleString('fr-FR')} jour(s) sur ${ligne.annee} (disponible : ${controle.disponible.toLocaleString('fr-FR')}).`;
      if (cfg.bloquerDepassement || controle.titrePrescrit) return { erreur: texte };
      avertissement = texte;
    }
  }
  return { ligne, avertissement };
}

/** Enregistre une nouvelle fiche d'absence. */
export async function creerConge(draft: Partial<CongeAbsence>, meta: CongeMeta): Promise<SanctionConge> {
  const store = getStore();
  if (!storeEstSynchronise()) {
    return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page avant de saisir.' };
  }
  const { erreur, avertissement, ligne } = await prepareConge(draft, store, 0);
  if (erreur || !ligne) return { success: false, message: erreur || 'Fiche invalide.' };
  const liste = store.conges || (store.conges = []);
  if (liste.some((c: any) => Number(c.id) === Number(ligne.id))) {
    return { success: false, message: 'Numéro de fiche occupé. Rechargez la page et recommencez.' };
  }
  ligne.saisie_par = nettoyerTexte(meta?.utilisateur, 60);
  ligne.date_saisie = nowStamp();
  ligne.date_modification = nowStamp();
  liste.push(ligne);
  if (!saveStore()) { liste.pop(); return { success: false, message: "L'enregistrement a échoué (espace de stockage du navigateur)." }; }
  return { success: true, id: ligne.id, avertissement };
}

/** Modifie une fiche d'absence existante. */
export async function modifierConge(id: number, draft: Partial<CongeAbsence>, meta: CongeMeta): Promise<SanctionConge> {
  const store = getStore();
  if (!storeEstSynchronise()) {
    return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page avant de modifier.' };
  }
  const idx = (store.conges || []).findIndex((c: any) => Number(c.id) === Number(id));
  if (idx === -1) return { success: false, message: 'Fiche introuvable.' };
  const cfg = configConges();
  const base = normaliserConge(store.conges[idx], cfg);
  const fusion: Partial<CongeAbsence> = { ...base, ...draft, id: Number(id) };
  if (draft.date_fin === undefined && (draft.jours_demandes !== undefined || draft.date_debut !== undefined)) {
    fusion.date_fin = '';
  }
  if (draft.jours_demandes === undefined && draft.date_fin !== undefined) {
    fusion.jours_demandes = 0;
  }
  if (draft.date_retour === undefined && (draft.date_debut !== undefined || draft.date_fin !== undefined || draft.jours_demandes !== undefined)) {
    fusion.date_retour = '';
  }
  if (draft.jours_valides === undefined && (draft.jours_demandes !== undefined || draft.date_fin !== undefined)) {
    fusion.jours_valides = null;
  }
  const { erreur, avertissement, ligne } = await prepareConge(fusion, store, Number(id));
  if (erreur || !ligne) return { success: false, message: erreur || 'Fiche invalide.' };
  ligne.saisie_par = nettoyerTexte(store.conges[idx].saisie_par || meta?.utilisateur, 60);
  ligne.date_saisie = store.conges[idx].date_saisie || nowStamp();
  ligne.date_modification = nowStamp();
  const avant = store.conges[idx];
  store.conges[idx] = ligne;
  if (!saveStore()) { store.conges[idx] = avant; return { success: false, message: "L'enregistrement a échoué." }; }
  return { success: true, id: ligne.id, avertissement };
}

/** Circuit de signatures : avis, validation, refus, réouverture. */
export async function deciderConge(
  id: number,
  action: 'AVIS_CHF' | 'AVIS_MEDECIN' | 'VALIDE' | 'REFUSE' | 'REOUVRIR',
  meta: CongeMeta & { motif?: string }
): Promise<SanctionConge> {
  const store = getStore();
  if (!storeEstSynchronise()) {
    return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page.' };
  }
  const idx = (store.conges || []).findIndex((c: any) => Number(c.id) === Number(id));
  if (idx === -1) return { success: false, message: 'Fiche introuvable.' };
  const c = normaliserConge(store.conges[idx], configConges());
  const qui = nettoyerTexte(meta?.utilisateur, 60) || '—';
  const ceJour = new Date().toISOString().slice(0, 10);
  const avant = store.conges[idx];
  const maj: any = { ...c, date_modification: nowStamp() };

  if (action === 'REOUVRIR') {
    if (c.statut === 'VALIDE' && meta?.role !== 'Administrateur') {
      return { success: false, message: 'Une fiche validée ne peut être rouverte que par un administrateur.' };
    }
    maj.statut = 'SOUMIS';
    maj.motif_refus = '';
  } else if (action === 'AVIS_CHF') {
    maj.statut = 'AVIS_CHF';
    maj.visa_chef_par = qui;
    maj.visa_chef_le = ceJour;
  } else if (action === 'AVIS_MEDECIN') {
    maj.statut = 'AVIS_MEDECIN';
    maj.visa_medecin_par = qui;
    maj.visa_medecin_le = ceJour;
  } else if (action === 'REFUSE') {
    const motif = nettoyerTexte(meta?.motif, 240);
    if (!motif) return { success: false, message: 'Précisez le motif du refus (report sur la fiche).' };
    maj.statut = 'REFUSE';
    maj.motif_refus = motif;
    maj.visa_gestionnaire_par = qui;
    maj.visa_gestionnaire_le = ceJour;
  } else {
    // Validation par le gestionnaire (le comptable) : le visa du médecin chef est
    // exigé pour les motifs qui le prévoient sur la fiche d'absence.
    if (aBesoinMedecin(c) && !c.visa_medecin_le && c.statut !== 'AVIS_MEDECIN') {
      return { success: false, message: 'Ce motif demande dabord le visa du médecin chef (colonne de droite de la fiche).' };
    }
    maj.statut = 'VALIDE';
    maj.visa_gestionnaire_par = qui;
    maj.visa_gestionnaire_le = ceJour;
    maj.jours_valides = c.jours_valides === null ? c.jours_demandes : c.jours_valides;
    const cfg = configConges();
    const controle = controleSolde(store.employes, congesBruts(), cfg, c.employe_id, c.annee, {
      ...maj,
      statut: 'VALIDE',
      jours_valides: maj.jours_valides,
    });
    if (!controle.suffisant && (cfg.bloquerDepassement || controle.titrePrescrit)) {
      if (controle.titrePrescrit) {
        return {
          success: false,
          message: `Titre prescrit : seuls les ${cfg.nbAnneesCumul} derniers exercices (${(controle.anneesAutorisees || []).join(', ')}) sont cumulables selon le Code du Travail malgache.`,
        };
      }
      return { success: false, message: `Solde insuffisant : il reste ${controle.disponible.toLocaleString('fr-FR')} jour(s) pour ${c.annee}.` };
    }
  }

  store.conges[idx] = maj;
  if (!saveStore()) { store.conges[idx] = avant; return { success: false, message: "L'enregistrement a échoué." }; }
  return { success: true, id: Number(id) };
}

/** Supprime une fiche. Une fiche validée demande un administrateur. */
export async function supprimerConge(id: number, meta: CongeMeta): Promise<SanctionConge> {
  const store = getStore();
  if (!storeEstSynchronise()) return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page.' };
  const idx = (store.conges || []).findIndex((c: any) => Number(c.id) === Number(id));
  if (idx === -1) return { success: false, message: 'Fiche introuvable.' };
  const c = normaliserConge(store.conges[idx], configConges());
  if (c.statut === 'VALIDE' && meta?.role !== 'Administrateur') {
    return { success: false, message: 'Fiche validée : seule une ouverture par un administrateur permet de la supprimer.' };
  }
  const [retire] = store.conges.splice(idx, 1);
  if (!saveStore()) { store.conges.splice(idx, 0, retire); return { success: false, message: 'Suppression non enregistrée.' }; }
  return { success: true };
}

/**
 * Saisie directe du solde dans N'IMPORTE QUELLE colonne d'année (ex. 2024, 2025, 2026…)
 * de l'État « Contrôle des congés et permissions ».
 * - `mode = 'OUVERTURE'` (par défaut) : fixe le solde d'ouverture de l'année `annee`.
 * - `mode = 'SOLDE_FINAL'` : ajuste automatiquement l'ouverture pour que le solde de fin
 *   de l'année `annee` soit exactement égal à `valeur`.
 * - `valeur = null` : supprime la saisie manuelle de cette année et rétablit le calcul automatique.
 * Autorisée au Comptable comme à l'Administrateur, sans plafond restrictif.
 */
export async function saisirOuverturePremiereAnnee(
  employeId: number,
  annee: number,
  valeur: number | null,
  meta?: CongeMeta,
  mode: 'OUVERTURE' | 'SOLDE_FINAL' = 'OUVERTURE'
): Promise<SanctionConge & { ouverture?: number }> {
  const store = getStore();
  if (!storeEstSynchronise()) {
    return { success: false, message: 'Les données ont changé dans un autre onglet. Rechargez la page.' };
  }
  const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(employeId));
  if (!emp) return { success: false, message: 'Salarié introuvable.' };

  const anneeCible = Math.round(Number(annee) || 0);
  if (anneeCible < 1990 || anneeCible > 2100) {
    return { success: false, message: 'Année invalide.' };
  }

  const cfg = configConges();
  if (!Array.isArray(store.conges)) store.conges = [];
  const sauvegarde = store.conges.slice();

  if (valeur === null) {
    store.conges = store.conges.filter(
      (c: any) => !(
        Number(c.employe_id) === Number(emp.id) &&
        Number(c.annee) === anneeCible &&
        c.categorie === 'AJUSTEMENT' &&
        c.ajustement_type === 'OUVERTURE'
      )
    );
    if (!saveStore()) {
      store.conges = sauvegarde;
      return { success: false, message: "L'enregistrement a échoué." };
    }
    return { success: true };
  }

  const num = Number(valeur);
  if (!Number.isFinite(num)) {
    return { success: false, message: 'Veuillez saisir un nombre de jours valide.' };
  }
  if (num < -365 || num > 365) {
    return { success: false, message: 'Le solde saisi doit être compris entre -365 et 365 jours.' };
  }

  let cibleOuverture = Math.round(num * 100) / 100;
  if (mode === 'SOLDE_FINAL') {
    const eventsAnnee = store.conges
      .map((raw: any) => normaliserConge(raw, cfg))
      .filter((c: CongeAbsence) => Number(c.employe_id) === Number(emp.id) && Number(c.annee) === anneeCible);
    const prisAnnee = eventsAnnee
      .filter((c: CongeAbsence) => c.categorie !== 'AJUSTEMENT' && c.statut === 'VALIDE' && c.imputation === 'CONGE')
      .reduce((s: number, c: CongeAbsence) => s + Number(c.jours_valides ?? c.jours_demandes ?? 0), 0);
    const autresAjusts = eventsAnnee
      .filter((c: CongeAbsence) => c.categorie === 'AJUSTEMENT' && c.ajustement_type !== 'OUVERTURE' && c.statut === 'VALIDE')
      .reduce((s: number, c: CongeAbsence) => s + Number(c.jours_valides ?? c.jours_demandes ?? 0), 0);
    cibleOuverture = Math.round((cibleOuverture + prisAnnee - autresAjusts) * 100) / 100;
  }

  const existIdx = store.conges.findIndex(
    (c: any) =>
      Number(c.employe_id) === Number(emp.id) &&
      Number(c.annee) === anneeCible &&
      c.categorie === 'AJUSTEMENT' &&
      c.ajustement_type === 'OUVERTURE'
  );
  const idConserve = existIdx >= 0 ? Number(store.conges[existIdx].id) : nextCongeId();
  const dateSaisieConservee = existIdx >= 0 ? (store.conges[existIdx].date_saisie || nowStamp()) : nowStamp();

  // Supprimer d'éventuels doublons d'OUVERTURE sur le même salarié/année
  store.conges = store.conges.filter(
    (c: any) => !(
      Number(c.employe_id) === Number(emp.id) &&
      Number(c.annee) === anneeCible &&
      c.categorie === 'AJUSTEMENT' &&
      c.ajustement_type === 'OUVERTURE'
    )
  );

  const qui = nettoyerTexte(meta?.utilisateur, 60) || 'comptable';
  const ligne = normaliserConge({
    id: idConserve,
    employe_id: Number(emp.id),
    numero_matricule: Number(emp.numero_matricule) || 0,
    nom_prenoms: nettoyerTexte(emp.nom_prenoms, 120),
    fonction: nettoyerTexte(emp.jobs || emp.categorie || '', 80),
    categorie: 'AJUSTEMENT',
    ajustement_type: 'OUVERTURE',
    imputation: 'AUCUNE',
    annee: anneeCible,
    date_demande: `${anneeCible}-01-01`,
    date_debut: `${anneeCible}-01-01`,
    jours_demandes: cibleOuverture,
    jours_valides: null,
    statut: 'VALIDE',
    motif_libelle: `Solde ${anneeCible} (${cibleOuverture} j)`,
    observations: `Saisie directe (${mode === 'SOLDE_FINAL' ? 'solde final' : 'ouverture'}) dans le tableau de contrôle ${anneeCible}.`,
    saisie_par: qui,
    date_saisie: dateSaisieConservee,
    date_modification: nowStamp(),
  }, cfg);

  store.conges.push(ligne);
  if (!saveStore()) {
    store.conges = sauvegarde;
    return { success: false, message: "L'enregistrement a échoué." };
  }
  return { success: true, id: ligne.id, ouverture: cibleOuverture };
}

export const saisirSoldeAnnee = saisirOuverturePremiereAnnee;

/** Import des fiches d'absence lues dans un « CONTRÔLE DES CONGÉS ET PERMISSIONS ». */
export async function importerConges(
  lignes: CongeImportLigne[],
  options: { mode: 'fusion' | 'remplacement'; ajusterSoldes: boolean }
): Promise<CongeImportRapport> {
  const store = getStore();
  if (!storeEstSynchronise()) {
    return { importees: 0, ignores: 0, ajustements: 0, nonTrouves: [], messages: ['Les données ont changé dans un autre onglet. Rechargez la page.'] };
  }
  if (options.mode === 'remplacement') store.conges = [];
  const liste = store.conges || (store.conges = []);
  const cfgImport = configConges();
  const rapport: CongeImportRapport = { importees: 0, ignores: 0, ajustements: 0, nonTrouves: [], messages: [] };
  const dejaVu = new Set<string>(liste.map((c: any) => `${Number(c.employe_id)}|${c.date_debut}|${c.categorie}|${Number(c.jours_demandes)}`));

  for (const l of lignes) {
    const emp = (store.employes || []).find((e: any) => Number(e.id) === Number(l.employe_id));
    if (!emp) {
      rapport.ignores++;
      if (l.nom && !rapport.nonTrouves.includes(l.nom)) rapport.nonTrouves.push(l.nom);
      continue;
    }
    const cle = `${Number(emp.id)}|${l.date_debut}|${l.categorie}|${Number(l.jours)}`;
    if (options.mode === 'fusion' && dejaVu.has(cle)) { rapport.ignores++; continue; }
    dejaVu.add(cle);
    const anneeMinImport = l.annee - (cfgImport.nbAnneesCumul - 1);
    const titreImport = l.titre_annee ? Math.max(anneeMinImport, l.titre_annee) : null;
    liste.push(normaliserConge({
      id: nextCongeId(),
      employe_id: Number(emp.id),
      numero_matricule: Number(emp.numero_matricule) || 0,
      nom_prenoms: emp.nom_prenoms,
      fonction: emp.jobs || l.fonction || '',
      contact: l.contact || '',
      categorie: l.categorie,
      motif_code: l.motif_code || '',
      motif_libelle: l.motif || LIBELLES_CATEGORIE[l.categorie],
      imputation: l.imputation,
      annee: l.annee,
      titre_periode: titreImport ? `Titre ${titreImport}` : '',
      date_debut: l.date_debut,
      date_demande: l.date_debut,
      jours_demandes: l.jours,
      statut: 'VALIDE',
      observations: 'Reprise du contrôle des congés importé.',
      saisie_par: 'Import Excel',
      date_saisie: nowStamp(),
      date_modification: nowStamp(),
    }, cfgImport));
    rapport.importees++;
  }

  // Option : aligner les soldes finaux (et le Titre/Année actif) dans la limite légale
  // des N dernières années successives (Code du Travail malgache : 3 dernières années = 90 j max).
  if (options.ajusterSoldes) {
    const cfg = configConges();
    const parEmployeFinal = new Map<number, { anneeRef: number; titre: number; reste: number }>();
    for (const l of lignes) {
      if (l.employe_id === null || typeof l.soldeFinalTitre !== 'number' || typeof l.titreFinal !== 'number') continue;
      const anneeRef = Number(l.anneeFeuille) || Number(l.annee) || new Date().getFullYear();
      const exist = parEmployeFinal.get(Number(l.employe_id));
      if (!exist || anneeRef >= exist.anneeRef) {
        parEmployeFinal.set(Number(l.employe_id), { anneeRef, titre: l.titreFinal, reste: l.soldeFinalTitre });
      }
    }

    for (const [idEmp, fin] of parEmployeFinal) {
      const emp = (store.employes || []).find((e: any) => Number(e.id) === idEmp);
      if (!emp) continue;
      // Supprimer tout ancien ajustement d'import sur la même année avant de calculer l'écart légal
      for (let i = liste.length - 1; i >= 0; i--) {
        if (
          Number(liste[i].employe_id) === idEmp &&
          Number(liste[i].annee) === fin.anneeRef &&
          liste[i].categorie === 'AJUSTEMENT' &&
          liste[i].saisie_par === 'Import Excel'
        ) {
          liste.splice(i, 1);
        }
      }
      const [soldeApresPurge] = calculerSoldes([emp], congesBruts(), cfg, fin.anneeRef, { nbAnnees: cfg.nbAnneesCumul });
      const prisEnAnneeRef = soldeApresPurge ? soldeApresPurge.pris : 0;

      // Loi malgache : tout titre antérieur aux N dernières années (ex. < 2024 en 2026) est prescrit.
      const anneeMinLoi = fin.anneeRef - (cfg.nbAnneesCumul - 1);
      const titreRetenu = Math.max(anneeMinLoi, fin.titre);
      const resteRetenu = fin.titre < anneeMinLoi ? cfg.joursCongeParAn : fin.reste;
      const tranchesNonOuvertes = Math.max(0, fin.anneeRef - titreRetenu);
      let cible = resteRetenu + tranchesNonOuvertes * cfg.joursCongeParAn;
      if (cfg.plafondCumulConge > 0) {
        cible = Math.min(cfg.plafondCumulConge, Math.max(0, cfg.plafondCumulConge - prisEnAnneeRef), cible);
      }

      const ecartNet = Math.round((cible - (soldeApresPurge ? soldeApresPurge.restant : 0)) * 100) / 100;
      if (Math.abs(ecartNet) < 0.01) continue;
      liste.push(normaliserConge({
        id: nextCongeId(),
        employe_id: idEmp,
        numero_matricule: Number(emp.numero_matricule) || 0,
        nom_prenoms: emp.nom_prenoms,
        fonction: emp.jobs || '',
        categorie: 'AJUSTEMENT',
        motif_libelle: `Alignement contrôle ${fin.anneeRef} — Titre ${titreRetenu} : ${resteRetenu} j (${ecartNet > 0 ? '+' : ''}${ecartNet} j)`,
        imputation: 'AUCUNE',
        annee: fin.anneeRef,
        date_debut: `${fin.anneeRef}-01-01`,
        jours_demandes: ecartNet,
        statut: 'VALIDE',
        ajustement_type: 'REPORT',
        observations: 'Ajustement automatique d’import plafonné aux 3 dernières années (Code du Travail malgache).',
        saisie_par: 'Import Excel',
        date_saisie: nowStamp(),
        date_modification: nowStamp(),
      }));
      rapport.ajustements++;
    }
  }

  if (!saveStore()) return { ...rapport, importees: 0, ajustements: 0, messages: [...rapport.messages, 'Import non sauvegardé.'] };
  if (rapport.importees) rapport.messages.push(`${rapport.importees} fiche(s) reprise(s). Vérifiez les soldes avant toute décision.`);
  return rapport;
}
