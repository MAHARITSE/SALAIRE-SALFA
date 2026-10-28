import type { JsonStore } from './local/store';
import { setRemoteStore, clearRemoteStore, getStore } from './local/store';
import { setRemoteConfig } from './local/config';
import { setRemoteHeader } from './bulletin/header';
import { UserSession } from './types';

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
  if (!response.ok) throw new Error(result.error || `Erreur serveur (${response.status}).`);
  return result;
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
      revision = saved.revision;
      current = { ...current, revision, store };
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
      revision = saved.revision;
      current = { ...current, revision, [kind]: value };
    } catch (e) { stale = true; throw e; }
  });
}
