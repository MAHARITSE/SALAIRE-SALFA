// ==============================================================================
// COMPOSANT PRINCIPAL REACT - SALFA TANAMBAO - RESPONSIVE + DARKMODE
// Droits d'accès par rôle :
// - Administrateur : accès complet à toutes les fonctionnalités (Paie & Congés)
//                    + sous-menu Administration (Paramètres, Import Excel, Déconnexion)
// - Comptable      : accès exclusif aux Permissions & Congés (fiches d'absence)
// ==============================================================================
import React, { useState, useEffect, useRef } from 'react';
import { UserSession } from './types';
import { LoginModal } from './components/LoginModal';
import { AdminModal, AdminTabKey } from './components/AdminModal';
import { ImportExcelModal } from './components/ImportExcelModal';
import { UsersSettingsModal } from './components/UsersSettingsModal';
import { InactifsModal } from './components/InactifsModal';
import { SauvegardeSqlModal } from './components/SauvegardeSqlModal';
import { SalariesSaisieTab } from './components/tabs/SalariesSaisieTab';
import { BulletinsTab } from './components/tabs/BulletinsTab';
import { RapportsTab } from './components/tabs/RapportsTab';
import { CongesTab } from './components/tabs/CongesTab';
import { initTheme, applyThemeClass, storeTheme, ThemeMode } from './local/theme';
import { loadConfig } from './local/config';
import { applyAppFavicon } from './local/favicon';
import { apiLogout } from './api';
import {
  Users, FileText, BarChart3, CheckCircle2, LogOut,
  CalendarCheck2, ShieldCheck, Moon, Sun, Upload, ChevronDown, Settings, Sliders, User, UserX, Database, Image as ImageIcon,
} from 'lucide-react';
import { AppTab, estRoleAdmin } from './local/roles';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [annee, setAnnee] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<AppTab>('salaries');
  const [showLogin, setShowLogin] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTabKey>('formules');
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showInactifsModal, setShowInactifsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSqlBackupModal, setShowSqlBackupModal] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [importedMois, setImportedMois] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const estAdmin = estRoleAdmin(user?.role);

  useEffect(() => {
    const t = initTheme();
    setTheme(t);
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
      if (showImportModal) setShowImportModal(false);
      if (showSqlBackupModal) setShowSqlBackupModal(false);
    }
  }, [user, activeTab, showAdminModal, showUsersModal, showImportModal, showSqlBackupModal]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLoginSuccess = (usr: UserSession) => {
    setUser(usr);
    setShowAdminMenu(false);
    setShowAdminModal(false);
    setShowUsersModal(false);
    setShowImportModal(false);
    setActiveTab(usr.role === 'Administrateur' ? 'salaries' : 'conges');
    setShowLogin(false);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setShowAdminMenu(false);
    setLoggingOut(true);
    try {
      await apiLogout();
      setUser(null);
      setShowAdminModal(false);
      setShowUsersModal(false);
      setShowImportModal(false);
      setActiveTab('salaries');
      setShowLogin(true);
    } catch {
      window.alert('Déconnexion non confirmée par le serveur. Vérifiez la connexion et réessayez.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 w-full max-w-[100vw] overflow-x-hidden transition-colors">
      {showLogin && (
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

      {showSqlBackupModal && estAdmin && (
        <SauvegardeSqlModal onClose={() => setShowSqlBackupModal(false)} />
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

      {showImportModal && estAdmin && (
        <ImportExcelModal
          anneeDefaut={annee}
          onClose={() => {
            setShowImportModal(false);
            setRefreshKey((k) => k + 1);
          }}
          onImported={(rap) => {
            const derniere = rap.periodes[rap.periodes.length - 1];
            if (derniere) {
              setAnnee(derniere.annee);
              setImportedMois(derniere.mois);
            }
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {user && !loggingOut && (
        <>
          {/* Navigation onglets + Sous-menu Administration */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-40 no-print w-full max-w-[100vw] transition-colors">
            <div className="w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 flex items-center gap-2">
              <nav className="flex-1 min-w-0 flex gap-1.5 sm:gap-3 lg:gap-5 overflow-x-auto no-scrollbar py-2 sm:py-2.5 scroll-smooth snap-x">
                {estAdmin && (
                  <>
                    <button
                      onClick={() => setActiveTab('salaries')}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                        activeTab === 'salaries'
                          ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="hidden md:inline">1. Salariés, Saisie &amp; État de paie</span>
                      <span className="md:hidden">1. État &amp; Saisie</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('bulletins')}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                        activeTab === 'bulletins'
                          ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="hidden lg:inline">2. Bulletins de Paie (2 Ex. sur A4)</span>
                      <span className="lg:hidden">2. Bulletins</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('rapports')}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                        activeTab === 'rapports'
                          ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
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
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                    activeTab === 'conges' || !estAdmin
                      ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
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

              {/* Sous-menu Administration (ou Compte) + Thème */}
              <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-2 rounded-xl text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                  title="Changer le thème clair / sombre"
                  aria-label="Changer thème"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAdminMenu((v) => !v)}
                    aria-expanded={showAdminMenu}
                    aria-haspopup="menu"
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold border transition shadow-sm ${
                      estAdmin
                        ? 'bg-salfa-dark dark:bg-slate-700 hover:bg-salfa-teal dark:hover:bg-slate-600 text-white border-transparent'
                        : 'bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800'
                    }`}
                  >
                    {estAdmin ? <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-300" /> : <User className="w-4 h-4 shrink-0" />}
                    <span className="hidden xs:inline">{estAdmin ? 'Administration' : 'Comptable'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showAdminMenu && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-72 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl py-1.5 z-50"
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
                              setShowSqlBackupModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-2.5 transition"
                          >
                            <Database className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                            <div>
                              <div>Sauvegarde SQL</div>
                              <div className="text-[10px] font-normal text-slate-400">Exporter .sql relationnel &amp; sauvegardes clôture</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowAdminMenu(false);
                              setShowImportModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-2.5 transition"
                          >
                            <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div>
                              <div>Importer Excel (Ancien / Récent)</div>
                              <div className="text-[10px] font-normal text-slate-400">Analyse et placement des champs</div>
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
            </div>
          </div>

          <main className="flex-1 w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 overflow-x-hidden">
            <div className="w-full max-w-full overflow-x-hidden">
              {estAdmin ? (
                <>
                  {activeTab === 'salaries' && (
                    <SalariesSaisieTab
                      userRole={user.role}
                      annee={annee}
                      setAnnee={setAnnee}
                      refreshKey={refreshKey}
                      importedMois={importedMois}
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

          <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-2.5 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 no-print w-full max-w-[100vw] overflow-hidden transition-colors">
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
