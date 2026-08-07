// ==============================================================================
// COMPOSANT REACT : DIALOGUE D'AUTHENTIFICATION - SALFA TANAMBAO (JSON PUR)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { UserSession } from '../types';
import { apiLogin, checkHealth } from '../api';
import { Lock, UserCheck, Shield, AlertCircle, WifiOff, Server } from 'lucide-react';

interface LoginModalProps {
  onSuccess: (user: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  // Ping health au montage pour diagnostiquer rapidement "serveur inaccessible"
  useEffect(() => {
    checkHealth().then(ok => setServerOk(ok));
    const id = setInterval(() => checkHealth().then(ok => setServerOk(ok)), 5000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await apiLogin(username, password);
      if (user) {
        onSuccess(user);
      } else {
        setError("Identifiants incorrects. Vérifiez votre saisie (admin / admin123 ou comptable / comptable123).");
      }
    } catch (err: any) {
      setError(err?.message || "Serveur inaccessible. Vérifiez que 'npm run dev' est lancé (port 3000).");
    } finally {
      setLoading(false);
    }
  };

  const selectPreset = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        
        {/* En-tête */}
        <div className="bg-salfa-dark p-6 text-white text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-salfa-teal/30 mb-3">
            <Lock className="w-6 h-6 text-sky-300" />
          </div>
          <h2 className="text-xl font-bold">CLINIQUE SALFA TANAMBAO</h2>
          <p className="text-xs text-slate-300 mt-1">
            Logiciel de Paie Mensuelle — Authentification <span className="text-sky-300">(JSON)</span>
          </p>
        </div>

        {/* Corps du formulaire */}
        <div className="p-6">
          
          {/* Indicateur santé serveur */}
          {serverOk === false && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <div className="font-bold">Serveur JSON inaccessible</div>
                <div className="text-amber-800/80 mt-0.5">
                  Lancez <code className="bg-white px-1 py-0.5 rounded border">npm run dev</code> à la racine du projet et assurez-vous que le port <b>3000</b> est ouvert (0.0.0.0). Vérifiez <code>/api/health</code>.
                </div>
              </div>
            </div>
          )}
          {serverOk === true && (
            <div className="mb-3 flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
              <Server className="w-3.5 h-3.5" />
              <span className="font-semibold">Serveur JSON connecté</span>
              <span className="text-emerald-600">— salfa_data.json prêt</span>
            </div>
          )}

          {/* Astuces comptes par défaut */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-5 text-xs text-salfa-dark">
            <div className="font-semibold mb-1.5 flex items-center gap-1.5 text-salfa-teal">
              <UserCheck className="w-4 h-4" />
              Comptes de test par défaut (cliquez pour remplir) :
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectPreset('admin', 'admin123')}
                className="flex-1 bg-white hover:bg-sky-100 border border-sky-300 rounded px-2 py-1 text-center font-medium transition"
              >
                <Shield className="w-3 h-3 inline mr-1 text-emerald-600" />
                admin / admin123
              </button>
              <button
                type="button"
                onClick={() => selectPreset('comptable', 'comptable123')}
                className="flex-1 bg-white hover:bg-sky-100 border border-sky-300 rounded px-2 py-1 text-center font-medium transition"
              >
                comptable / comptable123
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Stockage: <b>salfa_data.json</b> (plus de SQLite / paie_salfa.db)
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Nom d'utilisateur
              </label>
              <select
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal focus:outline-none"
              >
                <option value="admin">admin (Administrateur)</option>
                <option value="comptable">comptable (Comptable)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-salfa-teal focus:outline-none"
                required
                placeholder="admin123 ou comptable123"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-salfa-dark hover:bg-salfa-teal text-white font-bold py-2.5 px-4 rounded-lg transition duration-200 shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? "Connexion..." : "Se connecter"}</span>
            </button>
            <div className="text-[11px] text-center text-slate-400 mt-2">
              Astuce dépannage : si la connexion échoue, ouvrez <code className="bg-slate-100 px-1 rounded">/api/health</code> dans le navigateur — vous devez voir <code>{"{"}"status":"ok"{"}"}</code>.
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
