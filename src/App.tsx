// ==============================================================================
// COMPOSANT PRINCIPAL REACT - SALFA TANAMBAO - RESPONSIVE + DARKMODE
// Droits d'accès par rôle :
// - Administrateur : accès complet à toutes les fonctionnalités (Paie & Congés)
//                    + sous-menu Administration (Paramètres, Sauvegarde/restauration SQL, Déconnexion)
// - Comptable      : accès exclusif aux Permissions & Congés (fiches d'absence)
// ==============================================================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserSession } from './types';
import { LoginModal } from './components/LoginModal';
import { ApplicationHeader, PageHeading } from './components/ApplicationHeader';
import { ControlesFlottants } from './components/ControlesFlottants';
import { AdminModal, AdminTabKey } from './components/AdminModal';
import { SauvegardeSqlModal } from './components/SauvegardeSqlModal';
import { UsersSettingsModal } from './components/UsersSettingsModal';
import { InactifsModal } from './components/InactifsModal';
import { SalariesSaisieTab } from './components/tabs/SalariesSaisieTab';
import { BulletinsTab } from './components/tabs/BulletinsTab';
import { RapportsTab } from './components/tabs/RapportsTab';
import { CongesTab } from './components/tabs/CongesTab';
import { getStoredTheme, getSystemPrefersDark, applyThemeClass, storeTheme, ThemeMode } from './local/theme';
import { loadConfig } from './local/config';
import { applyAppFavicon } from './local/favicon';
import { apiLogout, apiRestoreSession, apiVerifySession, apiForgetSession } from './api';
import { CLE_SESSION_PRESENCE, INTERVALLE_PRESENCE_MS, lirePresenceLocale } from './local/session';
import { WAMP } from './runtime';
import {
  Users, FileText, BarChart3, CheckCircle2, LogOut,
  CalendarCheck2, Bell, ShieldCheck, ChevronDown, Database, Settings, Sliders, UserX, Image as ImageIcon,
} from 'lucide-react';
import { AppTab, estRoleAdmin } from './local/roles';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [annee, setAnnee] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<AppTab>('salaries');
  const [showLogin, setShowLogin] = useState(true);
  const [verificationSession, setVerificationSession] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTabKey>('formules');
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showInactifsModal, setShowInactifsModal] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  // Lire la préférence dès le premier rendu : un effet initial « light » ne doit
  // pas écraser le thème sombre, notamment lors du double montage StrictMode.
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme() ?? (getSystemPrefersDark() ? 'dark' : 'light'));
  const menuRef = useRef<HTMLDivElement | null>(null);

  const estAdmin = estRoleAdmin(user?.role);

  useEffect(() => {
    applyAppFavicon();
  }, []);

  useEffect(() => {
    if (user) {
      const cfg = loadConfig();
      if (cfg.iconeApp) applyAppFavicon(cfg.iconeApp);
      else applyAppFavicon();
    }
  }, [user, refreshKey]);

  useEffect(() => {
    applyThemeClass(theme);
    storeTheme(theme);
  }, [theme]);

  // Fermer le sous-menu Administration au clic extérieur ou touche Échap
  useEffect(() => {
    if (!showAdminMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          !(e.target instanceof Element && e.target.closest('[aria-controls="administration-menu"]'))) {
        setShowAdminMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdminMenu(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAdminMenu]);

  // Garantit qu'un non-administrateur ne peut jamais rester sur un onglet ou outil de paie
  useEffect(() => {
    if (user && user.role !== 'Administrateur') {
      if (activeTab !== 'conges') setActiveTab('conges');
      if (showAdminModal) setShowAdminModal(false);
      if (showUsersModal) setShowUsersModal(false);
      if (showSqlModal) setShowSqlModal(false);
    }
  }, [user, activeTab, showAdminModal, showUsersModal, showSqlModal]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLoginSuccess = useCallback((usr: UserSession) => {
    setUser(usr);
    setShowAdminMenu(false);
    setShowAdminModal(false);
    setShowUsersModal(false);
    setShowSqlModal(false);
    setActiveTab(usr.role === 'Administrateur' ? 'salaries' : 'conges');
    setShowInactifsModal(false);
    setShowLogin(false);
  }, []);

  const revenirConnexion = useCallback(() => {
    // Invalider ce poste n'envoie pas de logout : un autre onglet a pu changer de compte.
    apiForgetSession();
    setUser(null);
    setShowAdminMenu(false);
    setShowAdminModal(false);
    setShowUsersModal(false);
    setShowInactifsModal(false);
    setShowSqlModal(false);
    setActiveTab('salaries');
    setShowLogin(true);
  }, []);

  useEffect(() => {
    let actif = true;
    apiRestoreSession()
      .then(usr => { if (actif) { if (usr) handleLoginSuccess(usr); else revenirConnexion(); } })
      .catch(() => { if (actif) revenirConnexion(); })
      .finally(() => { if (actif) setVerificationSession(false); });
    return () => { actif = false; };
  }, [handleLoginSuccess, revenirConnexion]);

  // Comme CAISSE-SALFA : chaque onglet ouvert renouvelle la présence toutes les
  // 15 s. Vérifier aussi au retour sur un onglet suspendu, sans ressusciter la session.
  useEffect(() => {
    if (!user || verificationSession) return;
    let actif = true;
    let enCours = false;
    const verifier = async () => {
      if (enCours) return;
      enCours = true;
      try {
        const etat = await apiVerifySession(user);
        if (actif && !etat) revenirConnexion();
      } catch { /* Une panne réseau n'est pas une déconnexion confirmée. */ }
      finally { enCours = false; }
    };
    const timer = window.setInterval(() => { void verifier(); }, INTERVALLE_PRESENCE_MS);
    const reprise = () => { if (document.visibilityState === 'visible') void verifier(); };
    const changementSession = (event: StorageEvent) => {
      if (WAMP || (event.key !== CLE_SESSION_PRESENCE && event.key !== null)) return;
      // Ne pas réécrire chaque heartbeat reçu : cela créerait un écho entre onglets.
      const presence = lirePresenceLocale();
      if (!presence || presence.id !== user.id) revenirConnexion();
    };
    document.addEventListener('visibilitychange', reprise);
    window.addEventListener('focus', reprise);
    window.addEventListener('storage', changementSession);
    return () => {
      actif = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', reprise);
      window.removeEventListener('focus', reprise);
      window.removeEventListener('storage', changementSession);
    };
  }, [user?.id, user?.role, verificationSession, revenirConnexion]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setShowAdminMenu(false);
    setLoggingOut(true);
    try {
      await apiLogout();
      revenirConnexion();
    } catch {
      window.alert('Déconnexion non confirmée par le serveur. Vérifiez la connexion et réessayez.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className={`${user && !loggingOut ? 'theme-caisse' : ''} min-h-screen min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 w-full max-w-[100vw] overflow-x-hidden transition-colors`}>
      {verificationSession && (
        <div role="status" className="min-h-screen flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">Vérification de la session…</div>
      )}
      {showLogin && !verificationSession && (
        <LoginModal
          onSuccess={handleLoginSuccess}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}

      {showAdminModal && estAdmin && (
        <AdminModal
          initialTab={adminInitialTab}
          onClose={() => {
            setShowAdminModal(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showUsersModal && estAdmin && user && (
        <UsersSettingsModal
          currentUser={user}
          onClose={() => setShowUsersModal(false)}
          onCurrentUserUpdated={(updated) => setUser(updated)}
        />
      )}

      {showInactifsModal && estAdmin && (
        <InactifsModal
          onClose={() => setShowInactifsModal(false)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showSqlModal && estAdmin && (
        <SauvegardeSqlModal onClose={() => setShowSqlModal(false)} />
      )}

      {user && !loggingOut && (
        <>
          <a href="#contenu-principal" className="caisse-skip-link no-print">Aller au contenu principal</a>
          <ApplicationHeader
            navigation={(
              <nav aria-label="Navigation principale" className="caisse-navigation no-scrollbar">
                {estAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab('salaries')}
                      aria-current={activeTab === 'salaries' ? 'page' : undefined}
                      className={`caisse-nav-link ${
                        activeTab === 'salaries'
                          ? 'caisse-nav-active'
                          : ''
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="hidden md:inline">1. Salariés, Saisie &amp; État de paie</span>
                      <span className="md:hidden">1. État &amp; Saisie</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('bulletins')}
                      aria-current={activeTab === 'bulletins' ? 'page' : undefined}
                      className={`caisse-nav-link ${
                        activeTab === 'bulletins'
                          ? 'caisse-nav-active'
                          : ''
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="hidden lg:inline">2. Bulletins de Paie (2 Ex. sur A4)</span>
                      <span className="lg:hidden">2. Bulletins</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('rapports')}
                      aria-current={activeTab === 'rapports' ? 'page' : undefined}
                      className={`caisse-nav-link ${
                        activeTab === 'rapports'
                          ? 'caisse-nav-active'
                          : ''
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 shrink-0" />
                      <span className="hidden lg:inline">3. Rapports &amp; Exports Excel / JSON</span>
                      <span className="lg:hidden">3. Rapports</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setActiveTab('conges')}
                  aria-current={activeTab === 'conges' ? 'page' : undefined}
                  className={`caisse-nav-link ${
                    activeTab === 'conges' || !estAdmin
                      ? 'caisse-nav-active'
                      : ''
                  }`}
                >
                  <CalendarCheck2 className="w-4 h-4 shrink-0" />
                  {estAdmin ? (
                    <>
                      <span className="hidden lg:inline">4. Congés &amp; Permissions (fiches d'absence)</span>
                      <span className="lg:hidden">4. Congés</span>
                    </>
                  ) : (
                    <span>Congés &amp; Permissions (Fiches d'absence)</span>
                  )}
                </button>
              </nav>
            )}
            actions={(
              <div className="caisse-toolbar flex shrink-0 items-center">
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAdminMenu((v) => !v)}
                    aria-expanded={showAdminMenu}
                    aria-haspopup="menu"
                    aria-label={estAdmin ? 'Administration' : 'Compte Comptable'}
                    aria-controls="administration-menu"
                    className="caisse-administration-button flex shrink-0 items-center gap-1.5 rounded-xl bg-[#1e3a5f] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#284b76]"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
                    <span>{estAdmin ? 'Administration' : 'Comptable'}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>

                  {showAdminMenu && (
                    <div
                      role="menu"
                      id="administration-menu"
                      aria-label="Compte et administration"
                      className="administration-menu absolute rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl py-1.5 z-50"
                    >
                      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-700">
                        <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
                          {user.nom_complet || user.username}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {estAdmin ? 'Rôle : Administrateur (Accès complet)' : 'Rôle : Comptable (Congés & Permissions)'}
                        </div>
                      </div>

                      {estAdmin && (
                        <div className="py-1 border-b border-slate-100 dark:border-slate-700">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setShowUsersModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-salfa-teal dark:hover:text-sky-300 flex items-center gap-2.5 transition"
                          >
                            <Settings className="w-4 h-4 text-salfa-teal dark:text-sky-400 shrink-0" />
                            <div>
                              <div>Paramètres</div>
                              <div className="text-[10px] font-normal text-slate-400">Changer les mots de passe &amp; ajouter des utilisateurs</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setShowInactifsModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-2.5 transition"
                          >
                            <UserX className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                            <div>
                              <div>Personnes inactives</div>
                              <div className="text-[10px] font-normal text-slate-400">Liste &amp; date de mise en inactif</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setAdminInitialTab('formules');
                              setShowAdminModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-2.5 transition"
                          >
                            <Sliders className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <div>
                              <div>Formules, IRSA &amp; Colonnes</div>
                              <div className="text-[10px] font-normal text-slate-400">CNaPS, IRSA, ancienneté &amp; droits congés</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setAdminInitialTab('icone');
                              setShowAdminModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-2.5 transition"
                          >
                            <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <div>
                              <div>Icône de l'application</div>
                              <div className="text-[10px] font-normal text-slate-400">Remplacer l'icône de l'onglet navigateur</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setShowSqlModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-2.5 transition"
                          >
                            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div>
                              <div>Sauvegarde et restauration SQL</div>
                              <div className="text-[10px] font-normal text-slate-400">Exporter et restaurer une sauvegarde complète</div>
                            </div>
                          </button>
                        </div>
                      )}

                      <div className="pt-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          disabled={loggingOut}
                          aria-label="Déconnexion"
                          className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition disabled:opacity-50"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Déconnexion</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          />

          <ControlesFlottants theme={theme} toggleTheme={toggleTheme} actions={(
            <button type="button" className="controle-rond" aria-label="Compte et administration" title="Compte et administration"
              aria-controls="administration-menu" aria-haspopup="menu" aria-expanded={showAdminMenu}
              onClick={() => setShowAdminMenu(v => !v)}>
              <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          )} />

          <main id="contenu-principal" tabIndex={-1} className="caisse-main flex-1 w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 overflow-x-hidden">
            <PageHeading onglet={estAdmin ? activeTab : 'conges'} />
            <div className="w-full max-w-full overflow-x-hidden">
              {estAdmin ? (
                <>
                  {activeTab === 'salaries' && (
                    <SalariesSaisieTab
                      userRole={user.role}
                      annee={annee}
                      setAnnee={setAnnee}
                      refreshKey={refreshKey}
                    />
                  )}
                  {activeTab === 'bulletins' && <BulletinsTab key={`bul-${refreshKey}`} annee={annee} setAnnee={setAnnee} />}
                  {activeTab === 'rapports' && <RapportsTab key={`rap-${refreshKey}`} annee={annee} setAnnee={setAnnee} />}
                  {activeTab === 'conges' && <CongesTab key={`cng-${refreshKey}`} annee={annee} setAnnee={setAnnee} user={user} />}
                </>
              ) : (
                <CongesTab key={`cng-${refreshKey}`} annee={annee} setAnnee={setAnnee} user={user} />
              )}
            </div>
          </main>

          <footer className="caisse-footer bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-2.5 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 no-print w-full max-w-[100vw] overflow-hidden transition-colors">
            <div className="w-full max-w-[1920px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 font-medium text-center sm:text-left">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  {estAdmin
                    ? 'Logiciel de Paie & Congés SALFA TANAMBAO — Toby Betela Toliara'
                    : 'Gestion des Congés & Permissions SALFA TANAMBAO — Toby Betela Toliara'}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 text-slate-400 dark:text-slate-500 flex-wrap justify-center">
                <span className="hidden md:inline">
                  {estAdmin
                    ? 'Accès Administrateur complet (Paie, IRSA, CNaPS & Congés)'
                    : 'Accès Comptable : Permissions & Congés uniquement'}
                </span>
                <span className="hidden sm:inline">•</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};
export default App;
