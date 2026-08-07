// ==============================================================================
// COMPOSANT HEADER - SALFA TANAMBAO - RESPONSIVE + DARKMODE
// ==============================================================================
import React from 'react';
import { UserSession } from '../types';
import { User, LogOut, ShieldCheck, Building2, RefreshCw, Moon, Sun } from 'lucide-react';
import { ThemeMode } from '../local/theme';

interface HeaderProps {
  user: UserSession;
  onLogout: () => void;
  onOpenAdminModal?: () => void;
  onResetData?: () => void;
  theme: ThemeMode;
  toggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, onOpenAdminModal, onResetData, theme, toggleTheme }) => {
  return (
    <header className="bg-salfa-dark dark:bg-slate-800 text-white shadow-lg border-b-4 border-salfa-teal dark:border-slate-600 no-print w-full max-w-[100vw] overflow-hidden transition-colors">
      <div className="w-full max-w-[1920px] mx-auto px-2 xs:px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-4">
          
          <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
            <div className="text-[9px] xs:text-[10px] sm:text-xs uppercase tracking-wider text-salfa-light dark:text-slate-300 font-semibold flex items-center gap-1 sm:gap-1.5 truncate">
              <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-salfa-teal dark:text-sky-300 shrink-0" />
              <span className="truncate">Fiangonana Loterana Malagasy — Sampan'asa Loterana Momba ny Fahasalamana</span>
            </div>
            <h1 className="text-[13px] xs:text-sm sm:text-lg md:text-xl font-extrabold tracking-tight text-white leading-tight">
              <span className="hidden sm:inline">DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA</span>
              <span className="sm:hidden">DISPENSAIRE TANAMBAO - TOLIARA</span>
            </h1>
            <p className="text-[9px] xs:text-[10px] sm:text-xs text-slate-300 dark:text-slate-400 font-mono truncate">
              <span className="hidden sm:inline">NIF: 5000767080 | STAT: 851 125 120 120 001 36 | E-mail: salfa.tulear@gmail.com</span>
              <span className="sm:hidden">NIF: 5000767080 | salfa.tulear@gmail.com</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
            {/* Bouton DarkMode - comme RECEPTION-SALFA */}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1 sm:gap-1.5 bg-slate-700/80 dark:bg-slate-600 hover:bg-slate-600 dark:hover:bg-slate-500 text-white border border-slate-600 dark:border-slate-500 text-[10px] xs:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition shadow-md whitespace-nowrap"
              title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
            </button>

            {user.role === 'Administrateur' && onOpenAdminModal && (
              <button
                onClick={onOpenAdminModal}
                className="flex items-center gap-1 sm:gap-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-[10px] xs:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition shadow-md whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xs:inline">Admin : Formules & Colonnes</span>
                <span className="xs:hidden">Admin</span>
              </button>
            )}

            {user.role === 'Administrateur' && onResetData && (
              <button
                onClick={onResetData}
                className="flex items-center gap-1 sm:gap-1.5 bg-slate-700 dark:bg-slate-600 hover:bg-slate-600 dark:hover:bg-slate-500 text-white text-[10px] xs:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition shadow-md whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">Réinit. données</span>
                <span className="sm:hidden">Réinit</span>
              </button>
            )}

            <div className="flex items-center gap-2 sm:gap-3 bg-slate-800/60 dark:bg-slate-900/60 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-slate-700 dark:border-slate-600 min-w-0 flex-1 xs:flex-initial">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {user.role === 'Administrateur' ? <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" /> : <User className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />}
                <div className="text-left min-w-0">
                  <div className="text-[9px] sm:text-xs text-slate-300 leading-none hidden sm:block">Session Active</div>
                  <div className="text-xs sm:text-sm font-semibold leading-tight text-white flex items-center gap-1 truncate">
                    <span className="truncate max-w-[90px] xs:max-w-[120px] sm:max-w-none">{user.nom_complet}</span>
                    <span className="text-[8px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded bg-salfa-teal/50 text-sky-200 uppercase font-mono shrink-0">{user.role}</span>
                  </div>
                </div>
              </div>
              <button onClick={onLogout} className="flex items-center gap-1 bg-salfa-teal hover:bg-blue-600 active:bg-blue-700 text-white text-[10px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded transition shadow-sm shrink-0 ml-auto xs:ml-0">
                <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Changer</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
