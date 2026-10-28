// ==============================================================================
// COMPOSANT PRINCIPAL REACT - SALFA TANAMBAO - RESPONSIVE + DARKMODE
// ==============================================================================
import React, { useState, useEffect } from 'react';
import { UserSession } from './types';
import { LoginModal } from './components/LoginModal';
import { AdminModal } from './components/AdminModal';
import { SalariesSaisieTab } from './components/tabs/SalariesSaisieTab';
import { EtatTab } from './components/tabs/EtatTab';
import { BulletinsTab } from './components/tabs/BulletinsTab';
import { RapportsTab } from './components/tabs/RapportsTab';
import { initTheme, applyThemeClass, storeTheme, ThemeMode } from './local/theme';
import { apiLogout } from './api';
import {
  Users, FileText, BarChart3, CheckCircle2, ClipboardList, LogOut
} from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [annee, setAnnee] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'salaries' | 'etat' | 'bulletins' | 'rapports'>('salaries');
  const [showLogin, setShowLogin] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const t = initTheme();
    setTheme(t);
  }, []);

  useEffect(() => {
    applyThemeClass(theme);
    storeTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLoginSuccess = (usr: UserSession) => {
    setUser(usr);
    setShowLogin(false);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiLogout();
      setUser(null);
      setShowAdminModal(false);
      setActiveTab('salaries');
      setShowLogin(true);
    } catch {
      window.alert('Déconnexion non confirmée par le serveur. Vérifiez la connexion et réessayez.');
    } finally { setLoggingOut(false); }
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

      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}

      {user && !loggingOut && (
        <>
          {/* Navigation onglets - responsive + dark */}
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-30 no-print w-full max-w-[100vw] overflow-hidden transition-colors">
            <div className="w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 flex items-center gap-2">
              <nav className="flex-1 min-w-0 flex gap-1.5 sm:gap-3 lg:gap-6 overflow-x-auto no-scrollbar py-2 sm:py-2.5 scroll-smooth snap-x">
                <button
                  onClick={() => setActiveTab('salaries')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                    activeTab === 'salaries'
                      ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">1. Salariés & Saisie (AVANCE / MED)</span>
                  <span className="md:hidden">1. Salariés</span>
                </button>

                <button
                  onClick={() => setActiveTab('etat')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] xs:text-xs sm:text-sm font-bold whitespace-nowrap transition snap-start shrink-0 ${
                    activeTab === 'etat'
                      ? 'bg-salfa-dark dark:bg-slate-700 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-700/50 sm:bg-transparent'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">2. État de paie mensuel (comme le fichier Excel)</span>
                  <span className="md:hidden">2. État</span>
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
                  <span className="hidden lg:inline">3. Bulletins de Paie (2 Ex. sur A4)</span>
                  <span className="lg:hidden">3. Bulletins</span>
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
                  <span className="hidden lg:inline">4. Rapports & Exports Excel / JSON</span>
                  <span className="lg:hidden">4. Rapports</span>
                </button>
              </nav>
              <button type="button" onClick={handleLogout} disabled={loggingOut} className="shrink-0 flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600" aria-label="Déconnexion"><LogOut className="w-4 h-4" /><span>Déconnexion</span></button>
            </div>
          </div>

          <main className="flex-1 w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 overflow-x-hidden">
            <div className="w-full max-w-full overflow-x-hidden">
              {activeTab === 'salaries' && <SalariesSaisieTab onOpenAdmin={() => setShowAdminModal(true)} userRole={user.role} annee={annee} setAnnee={setAnnee} />}
              {activeTab === 'etat' && <EtatTab annee={annee} setAnnee={setAnnee} />}
              {activeTab === 'bulletins' && <BulletinsTab annee={annee} setAnnee={setAnnee} />}
              {activeTab === 'rapports' && <RapportsTab annee={annee} setAnnee={setAnnee} />}
            </div>
          </main>

          <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-2.5 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 no-print w-full max-w-[100vw] overflow-hidden transition-colors">
            <div className="w-full max-w-[1920px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 font-medium text-center sm:text-left">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Logiciel de Paie SALFA TANAMBAO — Toby Betela Toliara</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 text-slate-400 dark:text-slate-500 flex-wrap justify-center">
                <span className="hidden md:inline">Conformité CGI Madagascar (IRSA) & Congé Maternité</span>
                <span className="hidden sm:inline">•</span>
                <span>100% local</span>
                <span>•</span>
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
