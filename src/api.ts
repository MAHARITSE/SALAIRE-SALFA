// API locale ou WAMP : mêmes fonctions de calcul, persistance MySQL transactionnelle en mode WAMP.
import * as local from './api-local';
import { WAMP } from './runtime';
import {
  remoteLogin,
  remoteLogout,
  remoteHealth,
  remoteRead,
  remoteWrite,
  remoteUsersList,
  remoteUsersCreate,
  remoteUsersUpdate,
  remoteUsersPassword,
  remoteUsersToggle,
  remoteUsersDelete,
} from './wampClient';
export type { ImportOptions, ImportRapport, SaisieLot, CongeFiltres, CongeMeta } from './api-local';
export type { CongeImportLigne, CongeImportRapport, AnalyseControleConges } from './local/importConges';
export const apiLogin: typeof local.apiLogin = async (u, p) => {
  const user = WAMP ? await remoteLogin(u, p) : await local.apiLogin(u, p);
  local.setSessionLocale(user);
  return user;
};
export const apiLogout = async (): Promise<void> => {
  if (WAMP) await remoteLogout();
  local.apiLogoutLocal();
};
export const checkHealth: typeof local.checkHealth = () => WAMP ? remoteHealth() : local.checkHealth();
export const fetchEmployes: typeof local.fetchEmployes = (...args) => WAMP ? remoteRead(() => local.fetchEmployes(...args)) : local.fetchEmployes(...args);
export const fetchEmployePaies: typeof local.fetchEmployePaies = (...args) => WAMP ? remoteRead(() => local.fetchEmployePaies(...args)) : local.fetchEmployePaies(...args);
export const fetchPaiesMois: typeof local.fetchPaiesMois = (...args) => WAMP ? remoteRead(() => local.fetchPaiesMois(...args)) : local.fetchPaiesMois(...args);
export const fetchComparaison: typeof local.fetchComparaison = (...args) => WAMP ? remoteRead(() => local.fetchComparaison(...args)) : local.fetchComparaison(...args);
export const fetchPeriodes: typeof local.fetchPeriodes = (...args) => WAMP ? remoteRead(() => local.fetchPeriodes(...args)) : local.fetchPeriodes(...args);
export const createEmploye: typeof local.createEmploye = (...args) => WAMP ? remoteWrite('createEmploye', () => local.createEmploye(...args), false) : local.createEmploye(...args);
export const updateEmploye: typeof local.updateEmploye = (...args) => WAMP ? remoteWrite('updateEmploye', () => local.updateEmploye(...args), false) : local.updateEmploye(...args);
export const toggleActifEmploye: typeof local.toggleActifEmploye = (...args) => WAMP ? remoteWrite('toggleActifEmploye', () => local.toggleActifEmploye(...args), false) : local.toggleActifEmploye(...args);
export const initPaieEmploye: typeof local.initPaieEmploye = (...args) => WAMP ? remoteWrite('initPaieEmploye', () => local.initPaieEmploye(...args), { success: false, created: false }) : local.initPaieEmploye(...args);
export const initMoisPaie: typeof local.initMoisPaie = (...args) => WAMP ? remoteWrite('initMoisPaie', () => local.initMoisPaie(...args), { success: false, initializedCount: 0 }) : local.initMoisPaie(...args);
export const savePaieSaisie: typeof local.savePaieSaisie = (...args) => WAMP ? remoteWrite('savePaieSaisie', () => local.savePaieSaisie(...args), { success: false }) : local.savePaieSaisie(...args);
export const savePaieReglement: typeof local.savePaieReglement = (...args) => WAMP ? remoteWrite('savePaieReglement', () => local.savePaieReglement(...args), { success: false }) : local.savePaieReglement(...args);
export const cloturerMois: typeof local.cloturerMois = (...args) => WAMP ? remoteWrite('cloturerMois', () => local.cloturerMois(...args), false) : local.cloturerMois(...args);
export const deverrouillerMois: typeof local.deverrouillerMois = (...args) => WAMP ? remoteWrite('deverrouillerMois', () => local.deverrouillerMois(...args), false) : local.deverrouillerMois(...args);
export const enregistrerSaisieLot: typeof local.enregistrerSaisieLot = (...args) => WAMP ? remoteWrite('enregistrerSaisieLot', () => local.enregistrerSaisieLot(...args), { success: false, message: 'Sauvegarde non confirmée.' }) : local.enregistrerSaisieLot(...args);
// --- Congés, permissions et examens médicaux ---
export const fetchConges: typeof local.fetchConges = (...a) => WAMP ? remoteRead(() => local.fetchConges(...a)) : local.fetchConges(...a);
export const fetchSituationConges: typeof local.fetchSituationConges = (...a) => WAMP ? remoteRead(() => local.fetchSituationConges(...a)) : local.fetchSituationConges(...a);
export const fetchEtatConges: typeof local.fetchEtatConges = (...a) => WAMP ? remoteRead(() => local.fetchEtatConges(...a)) : local.fetchEtatConges(...a);
export const calculerJoursAbsence: typeof local.calculerJoursAbsence = (...a) => WAMP ? remoteRead(() => local.calculerJoursAbsence(...a)) : local.calculerJoursAbsence(...a);
export const creerConge: typeof local.creerConge = (...a) => WAMP ? remoteWrite('creerConge', () => local.creerConge(...a), { success: false, message: 'Sauvegarde non confirmée.' }) : local.creerConge(...a);
export const modifierConge: typeof local.modifierConge = (...a) => WAMP ? remoteWrite('modifierConge', () => local.modifierConge(...a), { success: false, message: 'Sauvegarde non confirmée.' }) : local.modifierConge(...a);
export const deciderConge: typeof local.deciderConge = (...a) => WAMP ? remoteWrite('deciderConge', () => local.deciderConge(...a), { success: false, message: 'Sauvegarde non confirmée.' }) : local.deciderConge(...a);
export const supprimerConge: typeof local.supprimerConge = (...a) => WAMP ? remoteWrite('supprimerConge', () => local.supprimerConge(...a), { success: false, message: 'Suppression non confirmée.' }) : local.supprimerConge(...a);
export const saisirOuverturePremiereAnnee: typeof local.saisirOuverturePremiereAnnee = (...a) => WAMP ? remoteWrite('saisirSoldeAnnee', () => local.saisirOuverturePremiereAnnee(...a), { success: false, message: 'Sauvegarde non confirmée.' }) : local.saisirOuverturePremiereAnnee(...a);
export const saisirSoldeAnnee: typeof local.saisirSoldeAnnee = (...a) => WAMP ? remoteWrite('saisirSoldeAnnee', () => local.saisirSoldeAnnee(...a), { success: false, message: 'Sauvegarde non confirmée.' }) : local.saisirSoldeAnnee(...a);
export const importerConges: typeof local.importerConges = (...a) => WAMP ? remoteWrite('importerConges', () => local.importerConges(...a), { importees: 0, ignores: 0, ajustements: 0, nonTrouves: [] as string[], messages: ['Import non confirmé.'] }) : local.importerConges(...a);
export const importerClasseur: typeof local.importerClasseur = (...args) => WAMP ? remoteWrite('importerClasseur', () => local.importerClasseur(...args), null as any).then(r => { if (!r) throw new Error('Import non confirmé.'); return r; }) : local.importerClasseur(...args);
// --- Gestion des utilisateurs & mots de passe (Administrateur) ---
export const fetchComptesConnexion: typeof local.fetchComptesConnexion = () => WAMP ? Promise.resolve([]) : local.fetchComptesConnexion();
export const fetchUtilisateurs: typeof local.fetchUtilisateurs = () => WAMP ? remoteUsersList() : local.fetchUtilisateurs();
export const creerUtilisateur: typeof local.creerUtilisateur = (data) => WAMP ? remoteUsersCreate(data) : local.creerUtilisateur(data);
export const modifierUtilisateur: typeof local.modifierUtilisateur = (id, data) => WAMP ? remoteUsersUpdate(id, data) : local.modifierUtilisateur(id, data);
export const changerMotDePasseUtilisateur: typeof local.changerMotDePasseUtilisateur = (id, pwd) => WAMP ? remoteUsersPassword(id, pwd) : local.changerMotDePasseUtilisateur(id, pwd);
export const toggleActifUtilisateur: typeof local.toggleActifUtilisateur = (id, actif) => WAMP ? remoteUsersToggle(id, actif) : local.toggleActifUtilisateur(id, actif);
export const supprimerUtilisateur: typeof local.supprimerUtilisateur = (id) => WAMP ? remoteUsersDelete(id) : local.supprimerUtilisateur(id);
