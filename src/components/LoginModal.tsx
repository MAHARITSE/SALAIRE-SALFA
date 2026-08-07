// ==============================================================================
// LOGIN MODAL - SALFA TANAMBAO - RESPONSIVE + DARKMODE
// ==============================================================================
import React, { useState } from 'react';
import { UserSession } from '../types';
import { apiLogin } from '../api';
import { Lock, UserCheck, Shield, AlertCircle, Moon, Sun } from 'lucide-react';
import { ThemeMode } from '../local/theme';

interface LoginModalProps {
  onSuccess: (user: UserSession) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess, theme, toggleTheme }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await apiLogin(username, password);
      if (user) onSuccess(user);
      else setError("Identifiants incorrects. (admin / admin123 ou comptable / comptable123)");
    } catch (err: any) {
      setError(err?.message || "Impossible de se connecter.");
    } finally { setLoading(false); }
  };

  const selectPreset = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile transition-colors">
        
        <div className="bg-salfa-dark dark:bg-slate-900 p-4 sm:p-6 text-white text-center relative">
          <button onClick={toggleTheme} className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition" title="Changer thème">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-salfa-teal/30 mb-2 sm:mb-3">
            <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-sky-300" />
          </div>
          <h2 className="text-base sm:text-xl font-bold">CLINIQUE SALFA TANAMBAO</h2>
          <p className="text-[11px] sm:text-xs text-slate-300 mt-1 px-2">Logiciel de Paie Mensuelle — Authentification <span className="text-sky-300">(100% Local)</span></p>
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">Mode 100% local</span>
            <span className="hidden xs:inline text-emerald-600 dark:text-emerald-400">— données dans ce navigateur</span>
          </div>

          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3 mb-4 sm:mb-5 text-xs text-salfa-dark dark:text-slate-200">
            <div className="font-semibold mb-2 flex items-center gap-1.5 text-salfa-teal dark:text-sky-300 text-[11px] sm:text-xs">
              <UserCheck className="w-4 h-4" />Comptes de test (cliquez pour remplir) :
            </div>
            <div className="flex flex-col xs:flex-row gap-2">
              <button type="button" onClick={() => selectPreset('admin', 'admin123')} className="flex-1 bg-white dark:bg-slate-700 hover:bg-sky-100 dark:hover:bg-slate-600 border border-sky-300 dark:border-slate-600 rounded px-2 py-2 sm:py-1 text-center font-medium transition text-xs">
                <Shield className="w-3 h-3 inline mr-1 text-emerald-600" />admin / admin123
              </button>
              <button type="button" onClick={() => selectPreset('comptable', 'comptable123')} className="flex-1 bg-white dark:bg-slate-700 hover:bg-sky-100 dark:hover:bg-slate-600 border border-sky-300 dark:border-slate-600 rounded px-2 py-2 sm:py-1 text-center font-medium transition text-xs">
                comptable / comptable123
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">Nom d'utilisateur</label>
              <select value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-salfa-teal focus:outline-none dark:text-white">
                <option value="admin">admin (Administrateur)</option>
                <option value="comptable">comptable (Comptable)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2.5 sm:py-2 text-sm focus:ring-2 focus:ring-salfa-teal focus:outline-none dark:text-white" required placeholder="admin123 ou comptable123" />
            </div>

            <button type="submit" disabled={loading} className="w-full mt-2 bg-salfa-dark dark:bg-slate-700 hover:bg-salfa-teal dark:hover:bg-slate-600 active:bg-slate-800 text-white font-bold py-3 sm:py-2.5 px-4 rounded-lg transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm">
              <Lock className="w-4 h-4" /><span>{loading ? "Connexion..." : "Se connecter"}</span>
            </button>
            <div className="text-[10px] sm:text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2 leading-snug">
              Application 100% locale : vos données ne quittent jamais votre navigateur.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
