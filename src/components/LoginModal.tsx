// ==============================================================================
// LOGIN MODAL - SALFA TANAMBAO - RESPONSIVE + DARKMODE + AUTO-SETUP WAMP
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { UserSession } from '../types';
import { apiLogin } from '../api';
import { remoteSetupDb } from '../wampClient';
import { AlertCircle, Moon, Sun, Database, CheckCircle2, LogIn, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';
import { ThemeMode } from '../local/theme';
import { WAMP } from '../runtime';
import { DEFAULT_APP_ICON, getCachedFavicon } from '../local/favicon';
import { listerComptesDemoLocaux, type CompteDemoLocal } from '../local/comptesDemo';
import { ComptesDemoPanel } from './ComptesDemoPanel';

// Même palette et mêmes champs sobres que CAISSE-SALFA, sans reprendre ses
// comptes métier de la caisse ni changer l'authentification de la paie.
const CHAMP = 'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-950';
const LIBELLE = 'mb-1.5 block text-xs sm:text-[13px] font-semibold text-slate-700 dark:text-slate-300';
const PRIMAIRE = 'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed';

interface LoginModalProps {
  onSuccess: (user: UserSession) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess, theme, toggleTheme }) => {
  // Les champs démarrent vides. En local seulement, les accès publics de démo
  // peuvent être remplis par clic ; aucune liste de comptes en version WAMP.
  const [iconeApp, setIconeApp] = useState(() => getCachedFavicon() || DEFAULT_APP_ICON);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);
  const [error, setError] = useState('');
  const [infoOk, setInfoOk] = useState('');
  const [loading, setLoading] = useState(false);

  // Configuration MySQL interactive (affichée uniquement sur le poste serveur WampServer si MySQL exige un mot de passe spécifique)
  const [needsDbSetup, setNeedsDbSetup] = useState(false);
  const [dbHost, setDbHost] = useState('127.0.0.1');
  const [dbPort, setDbPort] = useState(3306);
  const [dbName, setDbName] = useState('salfa_paie');
  const [dbUser, setDbUser] = useState('root');
  const [dbPassword, setDbPassword] = useState('');
  const [savingDb, setSavingDb] = useState(false);
  const [comptesDemo, setComptesDemo] = useState<CompteDemoLocal[]>([]);

  useEffect(() => {
    if (WAMP) return; // Supprimé du bundle final WAMP, y compris les accès de démo.
    const actualiser = () => setComptesDemo(listerComptesDemoLocaux());
    actualiser();
    const changementComptes = (event: StorageEvent) => {
      if (event.key === 'salfa_paie_store_v1' || event.key === null) actualiser();
    };
    window.addEventListener('storage', changementComptes);
    return () => window.removeEventListener('storage', changementComptes);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoOk('');
    try {
      const user = await apiLogin(username, password);
      if (user) {
        onSuccess(user);
      } else {
        setError('Identifiants ou mot de passe incorrects.');
      }
    } catch (err: any) {
      setError(err?.message || 'Impossible de se connecter.');
      if (WAMP && (err?.code === 'NEEDS_DB_CONFIG' || /non configuré/i.test(String(err?.message || '')))) {
        if (err?.canConfigure !== false) setNeedsDbSetup(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupDb = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDb(true);
    setError('');
    setInfoOk('');
    try {
      await remoteSetupDb({
        host: dbHost.trim() || '127.0.0.1',
        port: Number(dbPort) || 3306,
        database: dbName.trim() || 'salfa_paie',
        user: dbUser.trim() || 'root',
        password: dbPassword,
      });
      setNeedsDbSetup(false);
      if (username.trim() && password) {
        const user = await apiLogin(username, password);
        if (user) {
          onSuccess(user);
          return;
        }
      }
      setInfoOk('Serveur MySQL configuré et initialisé. Vous pouvez maintenant vous connecter.');
    } catch (err: any) {
      setError(err?.message || 'Échec de configuration MySQL.');
    } finally {
      setSavingDb(false);
    }
  };

  return (
    <main aria-labelledby="connexion-title" className="login-page no-print [color-scheme:light] dark:[color-scheme:dark] flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-slate-50 px-4 py-10 text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md">
        <section className="login-card space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-7 shadow-[0_1px_3px_0_rgb(15_23_42/0.025)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={iconeApp}
                alt="Icône de l’application"
                className="h-11 w-11 shrink-0 rounded-xl object-contain"
                onError={() => { if (iconeApp !== DEFAULT_APP_ICON) setIconeApp(DEFAULT_APP_ICON); }}
              />
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-none tracking-tight text-brand-950 dark:text-brand-300">SALFA</p>
                <p className="mt-1 text-[10px] sm:text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">CLINIQUE SALFA TANAMBAO</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Changer le thème clair / sombre"
              aria-label="Changer thème"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <h1 id="connexion-title" className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              <LogIn className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden="true" />
              Connexion à la Paie et Congé
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Ouvrez la session avec votre compte : chaque rôle retrouve ses pages.
            </p>
          </div>

          {infoOk && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{infoOk}</span>
            </div>
          )}

          {WAMP && needsDbSetup ? (
            <form onSubmit={handleSetupDb} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" aria-labelledby="mysql-title" aria-busy={savingDb}>
              <h2 id="mysql-title" className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                Configuration MySQL WampServer
              </h2>
              <p className="text-xs leading-relaxed">
                Indiquez les accès MySQL de votre WampServer. La base <b>salfa_paie</b> sera créée automatiquement.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label htmlFor="db-host" className={LIBELLE}>Hôte MySQL</label>
                  <input id="db-host" type="text" value={dbHost} onChange={e => setDbHost(e.target.value)} className={`${CHAMP} !py-1.5 !text-xs`} spellCheck={false} />
                </div>
                <div>
                  <label htmlFor="db-port" className={LIBELLE}>Port</label>
                  <input id="db-port" type="number" value={dbPort} onChange={e => setDbPort(Number(e.target.value) || 3306)} className={`${CHAMP} !py-1.5 !text-xs`} />
                </div>
              </div>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="db-name" className={LIBELLE}>Base de données</label>
                  <input id="db-name" type="text" value={dbName} onChange={e => setDbName(e.target.value)} className={`${CHAMP} !py-1.5 !text-xs`} spellCheck={false} />
                </div>
                <div>
                  <label htmlFor="db-user" className={LIBELLE}>Utilisateur MySQL</label>
                  <input id="db-user" type="text" value={dbUser} onChange={e => setDbUser(e.target.value)} className={`${CHAMP} !py-1.5 !text-xs`} spellCheck={false} />
                </div>
              </div>
              <div>
                <label htmlFor="db-password" className={LIBELLE}>Mot de passe MySQL (vide si aucun)</label>
                <input id="db-password" type="password" value={dbPassword} onChange={e => setDbPassword(e.target.value)} autoComplete="off" className={`${CHAMP} !py-1.5 !text-xs`} />
              </div>
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-100/80 p-3 text-xs text-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => setNeedsDbSetup(false)} disabled={savingDb} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  Retour
                </button>
                <button type="submit" disabled={savingDb} className={`${PRIMAIRE} flex-1 !text-xs`}>
                  {savingDb ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Database className="h-4 w-4" aria-hidden="true" />}
                  {savingDb ? 'Configuration en cours…' : 'Enregistrer & Connecter MySQL'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
              <div>
                <label htmlFor="login-username" className={LIBELLE}>Identifiant</label>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  className={CHAMP}
                />
              </div>

              <div>
                <label htmlFor="login-password" className={LIBELLE}>Mot de passe</label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={afficherMotDePasse ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    spellCheck={false}
                    required
                    className={`${CHAMP} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setAfficherMotDePasse(v => !v)}
                    aria-label={afficherMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={afficherMotDePasse}
                    aria-controls="login-password"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {afficherMotDePasse ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
                </p>
              )}

              <button type="submit" disabled={loading} className={`${PRIMAIRE} w-full`}>
                {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <KeyRound className="h-[18px] w-[18px]" aria-hidden="true" />}
                {loading ? 'Vérification…' : 'Se connecter'}
              </button>
              {!WAMP && comptesDemo.length > 0 ? (
                <ComptesDemoPanel comptes={comptesDemo} disabled={loading} onChoisir={compte => {
                  setUsername(compte.username);
                  setPassword(compte.password);
                  setAfficherMotDePasse(false);
                  setError('');
                  setInfoOk('');
                }} />
              ) : (
                <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Mot de passe oublié ? Un administrateur peut le réinitialiser depuis les paramètres des utilisateurs.
                </p>
              )}
            </form>
          )}
        </section>

        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {WAMP ? 'Version réseau : données enregistrées sur le serveur MySQL.' : comptesDemo.length > 0 ? 'Mode démonstration : les données restent dans ce navigateur.' : 'Mode local : les données restent dans ce navigateur.'}
          <br />Reconnexion nécessaire après 1 heure sans contact d’aucun onglet.
        </p>
      </div>
    </main>
  );
};
