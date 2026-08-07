// ==============================================================================
// COMPOSANT REACT : EN-TÊTE OFFICIEL DE LA CLINIQUE - SALFA TANAMBAO
// ==============================================================================
import React from 'react';
import { UserSession } from '../types';
import { User, LogOut, ShieldCheck, Building2 } from 'lucide-react';

interface HeaderProps {
  user: UserSession;
  onLogout: () => void;
  onOpenAdminModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, onOpenAdminModal }) => {
  return (
    <header className="bg-salfa-dark text-white shadow-lg border-b-4 border-salfa-teal no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Bandeau Officiel Clinique sans image */}
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-salfa-light font-semibold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-salfa-teal" />
              Fiangonana Loterana Malagasy — Sampan'asa Loterana Momba ny Fahasalamana
            </div>
            <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-white">
              DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA
            </h1>
            <p className="text-xs text-slate-300 font-mono">
              NIF: 5000767080 | STAT: 851 125 120 120 001 36 | E-mail: salfa.tulear@gmail.com
            </p>
          </div>

          {/* Session Utilisateur, Administration & Déconnexion */}
          <div className="flex items-center space-x-3">
            {user.role === 'Administrateur' && onOpenAdminModal && (
              <button
                onClick={onOpenAdminModal}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition shadow-md"
                title="Gérer les colonnes, les rubriques et les formules (Congé Maternité, Cotisations...)"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Admin : Formules & Colonnes</span>
              </button>
            )}

            <div className="flex items-center space-x-3 bg-slate-800/60 px-4 py-2 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-2">
                {user.role === 'Administrateur' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                ) : (
                  <User className="w-5 h-5 text-sky-400" />
                )}
                <div className="text-left">
                  <div className="text-xs text-slate-300 leading-none">Session Active</div>
                  <div className="text-sm font-semibold leading-tight text-white">
                    {user.nom_complet} <span className="text-xs px-1.5 py-0.5 ml-1 rounded bg-salfa-teal/50 text-sky-200 uppercase font-mono">{user.role}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-1 bg-salfa-teal hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded transition shadow-sm"
                title="Changer d'utilisateur ou déconnexion"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Changer</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};
