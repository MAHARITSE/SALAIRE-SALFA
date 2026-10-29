import type { JsonStore } from './local/store';
import { setRemoteStore, clearRemoteStore, getStore } from './local/store';
import { setRemoteConfig } from './local/config';
import { setRemoteHeader } from './bulletin/header';
import { UserSession, CompteUtilisateur } from './types';

interface Snapshot { revision: number; store: JsonStore; config: any; header: any }
let revision: number | null = null;
let csrf = '';
let chain: Promise<unknown> = Promise.resolve();
let current: Snapshot | null = null;
let stale = false;

async function request(action: string, payload?: unknown): Promise<any> {
  const response = await fetch(`./api/index.php?action=${encodeURIComponent(action)}`, {
    method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-Salfa-CSRF': csrf },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  let result: any;
  try { result = await response.json(); } catch { throw new Error('Réponse invalide du serveur.'); }
  if (!response.ok) {
    const err: any = new Error(result.error || `Erreur serveur (${response.status}).`);
    if (result.code) err.code = result.code;
    if (result.canConfigure !== undefined) err.canConfigure = Boolean(result.canConfigure);
    throw err;
  }
  return result;
}

export async function remoteSetupDb(cfg: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): Promise<{ success: boolean; message?: string }> {
  const res = await request('setup_db', cfg);
  return { success: Boolean(res?.success), message: res?.message };
}
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = chain.then(operation, operation); chain = next.catch(() => {}); return next;
}
function apply(s: Snapshot) {
  revision = Number(s.revision); current = s;
  setRemoteStore(s.store); setRemoteConfig(s.config); setRemoteHeader(s.header);
}
export async function remoteLogin(username: string, password: string): Promise<UserSession | null> {
  try {
    const login = await request('login', { username, password });
    csrf = login.csrf; stale = false; apply(await request('snapshot')); return login.user;
  } catch (e) {
    if (e instanceof Error && e.message === 'Identifiants incorrects.') return null;
    throw e;
  }
}
export function remoteLogout(): Promise<void> {
  return enqueue(async () => {
    await request('logout', {});
    current = null; revision = null; csrf = ''; stale = false;
    clearRemoteStore(); setRemoteConfig(null); setRemoteHeader(null);
  });
}
export const remoteHealth = async () => { try { return (await request('health')).service === 'salfa-wamp-v1'; } catch { return false; } };
export function remoteRead<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(async () => { const next = await request('snapshot'); if (revision !== null && Number(next.revision) !== revision) stale = true; apply(next); return fn(); });
}
export function remoteWrite<T>(action: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  return enqueue(async () => {
    if (!current || revision === null) throw new Error('Session expirée. Reconnectez-vous.');
    if (stale) { window.alert('Les données ont changé sur un autre poste. Rechargez la page avant toute modification.'); return fallback; }
    const before = JSON.stringify(current.store);
    try {
      const result = await fn();
      const store = getStore();
      if (JSON.stringify(store) === before) return result;
      const saved = await request('save', { revision, action, store });
      const nextRev = Number(saved.revision);
      revision = nextRev;
      current = { ...current, revision: nextRev, store };
      return result;
    } catch (e) {
      stale = true;
      setRemoteStore(JSON.parse(before));
      if (current) current.store = getStore();
      const message = e instanceof Error ? e.message : 'Erreur de sauvegarde.';
      window.alert(`${message}\nLa sauvegarde n’a pas pu être confirmée. Rechargez et vérifiez les données avant de recommencer.`);
      return fallback;
    }
  });
}
export function remoteSaveSetting(kind: 'config' | 'header', value: unknown): Promise<void> {
  return enqueue(async () => {
    if (!current || revision === null) throw new Error('Session expirée. Reconnectez-vous.');
    if (stale) throw new Error('Les données ont changé sur un autre poste. Rechargez la page.');
    try {
      const saved = await request('settings', { revision, kind, value });
      const nextRev = Number(saved.revision);
      revision = nextRev;
      current = { ...current, revision: nextRev, [kind]: value };
    } catch (e) { stale = true; throw e; }
  });
}

export async function remoteUsersList(): Promise<CompteUtilisateur[]> {
  const res = await request('users_list');
  return Array.isArray(res.users) ? res.users : [];
}

export async function remoteUsersCreate(data: {
  username: string;
  nom_complet: string;
  role: 'Administrateur' | 'Comptable';
  password: string;
}): Promise<{ success: boolean; message?: string; user?: CompteUtilisateur }> {
  try {
    const res = await request('users_create', data);
    return { success: true, user: res.user };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Création impossible.' };
  }
}

export async function remoteUsersUpdate(
  id: number,
  data: { username: string; nom_complet: string; role: 'Administrateur' | 'Comptable' }
): Promise<{ success: boolean; message?: string; user?: CompteUtilisateur }> {
  try {
    const res = await request('users_update', { id, ...data });
    return { success: true, user: res.user };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Modification impossible.' };
  }
}

export async function remoteUsersPassword(
  id: number,
  password: string
): Promise<{ success: boolean; message?: string }> {
  try {
    await request('users_password', { id, password });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Changement de mot de passe impossible.' };
  }
}

export async function remoteUsersToggle(
  id: number,
  actif: boolean
): Promise<{ success: boolean; message?: string }> {
  try {
    await request('users_toggle', { id, actif });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Action impossible.' };
  }
}

export async function remoteUsersDelete(
  id: number
): Promise<{ success: boolean; message?: string }> {
  try {
    await request('users_delete', { id });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Suppression impossible.' };
  }
}
