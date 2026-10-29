import type { JsonStore } from './local/store';
import { setRemoteStore, clearRemoteStore, getStore } from './local/store';
import { setRemoteConfig, loadConfig } from './local/config';
import { setRemoteHeader } from './bulletin/header';
import { UserSession, CompteUtilisateur } from './types';
import {
  buildRelationalSqlBackup,
  buildSqlBackupFilename,
  triggerSqlDownload,
  lireHistoriqueSauvegardesSql,
  enregistrerEntreeHistoriqueSql,
  setDerniereSauvegardeSql,
  readStoredHeaderSnapshot,
  EntreeHistoriqueSql,
  ResultatSauvegardeSql,
  formatSqlStamp,
} from './local/sqlBackup';

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
      if (saved.backup && typeof saved.backup.sql === 'string' && saved.backup.filename) {
        const downloaded = triggerSqlDownload(saved.backup.filename, saved.backup.sql);
        const entree: EntreeHistoriqueSql = {
          id: `${Date.now()}_srv`,
          filename: String(saved.backup.filename),
          created_at: String(saved.backup.created_at || formatSqlStamp().iso),
          motif: String(saved.backup.motif || 'Clôture validée (WAMP MySQL)'),
          type: 'CLOTURE',
          size: Number(saved.backup.size) || saved.backup.sql.length,
          nb_employes: Array.isArray(store.employes) ? store.employes.length : 0,
          nb_paies: Array.isArray(store.paies) ? store.paies.length : 0,
          nb_conges: Array.isArray(store.conges) ? store.conges.length : 0,
          server_saved: true,
        };
        enregistrerEntreeHistoriqueSql(entree);
        setDerniereSauvegardeSql({
          success: true,
          filename: entree.filename,
          sql: saved.backup.sql,
          size: entree.size,
          created_at: entree.created_at,
          motif: entree.motif,
          type: 'CLOTURE',
          downloaded,
          server_saved: true,
        });
      }
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

export async function remoteExportSqlBackup(options: {
  type?: 'CLOTURE' | 'MANUELLE' | 'CONGES';
  periode?: string;
  motif?: string;
  telecharger?: boolean;
} = {}): Promise<ResultatSauvegardeSql> {
  const type = options.type || 'MANUELLE';
  const motif =
    options.motif ||
    (type === 'CLOTURE'
      ? `Clôture validée${options.periode ? ` — ${options.periode}` : ''}`
      : type === 'CONGES'
        ? 'Sauvegarde SQL Congés & Permissions'
        : 'Sauvegarde SQL manuelle (Administration)');
  try {
    const res = await request('sql_backup_export', {
      type,
      periode: options.periode || '',
      motif,
      congesOnly: type === 'CONGES',
    });
    if (res && typeof res.sql === 'string' && res.filename) {
      const downloaded = options.telecharger === false ? false : triggerSqlDownload(res.filename, res.sql);
      const store = current?.store || ({ employes: [], paies: [], conges: [] } as any);
      const entree: EntreeHistoriqueSql = {
        id: `${Date.now()}_wamp`,
        filename: String(res.filename),
        created_at: String(res.created_at || formatSqlStamp().iso),
        motif: String(res.motif || motif),
        type,
        size: Number(res.size) || res.sql.length,
        nb_employes: Number(res.nb_employes ?? (Array.isArray(store.employes) ? store.employes.length : 0)),
        nb_paies: Number(res.nb_paies ?? (type === 'CONGES' ? 0 : Array.isArray(store.paies) ? store.paies.length : 0)),
        nb_conges: Number(res.nb_conges ?? (Array.isArray(store.conges) ? store.conges.length : 0)),
        server_saved: Boolean(res.server_saved),
      };
      enregistrerEntreeHistoriqueSql(entree);
      const out: ResultatSauvegardeSql = {
        success: true,
        filename: entree.filename,
        sql: res.sql,
        size: entree.size,
        created_at: entree.created_at,
        motif: entree.motif,
        type,
        downloaded,
        server_saved: Boolean(res.server_saved),
      };
      setDerniereSauvegardeSql(out);
      return out;
    }
  } catch {
    // Repli local depuis le snapshot courant si le serveur ne répond pas à sql_backup_export
  }
  const store = getStore();
  const cfg = loadConfig();
  const hdr = current?.header || readStoredHeaderSnapshot();
  const dateNow = new Date();
  const { iso } = formatSqlStamp(dateNow);
  const filename = buildSqlBackupFilename({ type, periode: options.periode, date: dateNow });
  const sql = buildRelationalSqlBackup({
    store,
    config: cfg,
    header: hdr,
    motif,
    congesOnly: type === 'CONGES',
    date: dateNow,
  });
  const size = sql.length;
  const downloaded = options.telecharger === false ? false : triggerSqlDownload(filename, sql);
  const entree: EntreeHistoriqueSql = {
    id: `${Date.now()}_fallback`,
    filename,
    created_at: iso,
    motif,
    type,
    size,
    nb_employes: Array.isArray(store.employes) ? store.employes.length : 0,
    nb_paies: type === 'CONGES' ? 0 : (Array.isArray(store.paies) ? store.paies.length : 0),
    nb_conges: Array.isArray(store.conges) ? store.conges.length : 0,
    server_saved: false,
  };
  enregistrerEntreeHistoriqueSql(entree);
  const out: ResultatSauvegardeSql = {
    success: true,
    filename,
    sql,
    size,
    created_at: iso,
    motif,
    type,
    downloaded,
    server_saved: false,
  };
  setDerniereSauvegardeSql(out);
  return out;
}

export async function remoteListSqlBackups(): Promise<EntreeHistoriqueSql[]> {
  const localHist = lireHistoriqueSauvegardesSql();
  try {
    const res = await request('sql_backups_list');
    if (Array.isArray(res?.backups)) {
      const byFile = new Map<string, EntreeHistoriqueSql>();
      for (const b of res.backups) {
        if (!b || !b.filename) continue;
        byFile.set(String(b.filename), {
          id: String(b.filename),
          filename: String(b.filename),
          created_at: String(b.created_at || ''),
          motif: String(b.motif || 'Sauvegarde serveur WAMP'),
          type: String(b.filename).includes('CLOTURE')
            ? 'CLOTURE'
            : String(b.filename).includes('CONGES')
              ? 'CONGES'
              : 'MANUELLE',
          size: Number(b.size) || 0,
          nb_employes: Number(b.nb_employes || 0),
          nb_paies: Number(b.nb_paies || 0),
          nb_conges: Number(b.nb_conges || 0),
          server_saved: true,
        });
      }
      for (const l of localHist) {
        if (!byFile.has(l.filename)) byFile.set(l.filename, l);
      }
      return Array.from(byFile.values()).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
  } catch {
    /* ignore */
  }
  return localHist;
}

export async function remoteDownloadSqlBackupFile(filename: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await request(`sql_backup_download&file=${encodeURIComponent(filename)}`);
    if (res && typeof res.sql === 'string') {
      triggerSqlDownload(res.filename || filename, res.sql);
      return { success: true };
    }
    return { success: false, message: 'Fichier SQL introuvable sur le serveur.' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Téléchargement impossible.' };
  }
}

