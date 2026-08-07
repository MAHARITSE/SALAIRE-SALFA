// ==============================================================================
// COMPOSANT PRINCIPAL REACT (.TSX) - CLINIQUE SALFA TANAMBAO
// ==============================================================================
import React, { useState } from 'react';
import { UserSession } from './types';
import { Header } from './components/Header';
import { LoginModal } from './components/LoginModal';
import { AdminModal } from './components/AdminModal';
import { EmployesTab } from './components/tabs/EmployesTab';
import { SaisieTab } from './components/tabs/SaisieTab';
import { BulletinsTab } from './components/tabs/BulletinsTab';
import { RapportsTab } from './components/tabs/RapportsTab';
import { resetStore } from './local/store';
import {
  Users, Calendar, FileText, BarChart3, ShieldCheck, CheckCircle2
} from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [activeTab, setActiveTab] = useState<'employes' | 'saisie' | 'bulletins' | 'rapports'>('employes');
  const [showLogin, setShowLogin] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);

  const handleLoginSuccess = (usr: UserSession) => {
    setUser(usr);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setUser(null);
    setShowLogin(true);
  };

  const handleResetData = () => {
    if (!window.confirm(
      "Réinitialiser toutes les données locales de cette application ?\n\n" +
      "Les modifications enregistrées dans ce navigateur (employés, paies, avances, MED, clôtures) seront perdues " +
      "et remplacées par les données initiales embarquées."
    )) return;
    resetStore();
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-sans text-slate-900">
      
      {/* Modal d'authentification */}
      {showLogin && (
        <LoginModal
          onSuccess={handleLoginSuccess}
        />
      )}

      {/* Modal d'administration avancé (Formules, Congés Maternité, Colonnes) */}
      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}

      {/* En-tête officiel de la clinique sans image */}
      {user && (
        <>
          <Header
            user={user}
            onLogout={handleLogout}
            onOpenAdminModal={() => setShowAdminModal(true)}
            onResetData={handleResetData}
          />

          {/* Bandeau de navigation par onglets */}
          <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30 no-print">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <nav className="flex space-x-2 sm:space-x-6 overflow-x-auto py-2">
                
                <button
                  onClick={() => setActiveTab('employes')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                    activeTab === 'employes'
                      ? 'bg-salfa-dark text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>1. Salariés & Fiches</span>
                </button>

                <button
                  onClick={() => setActiveTab('saisie')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                    activeTab === 'saisie'
                      ? 'bg-salfa-dark text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>2. Saisie Mensuelle (AVANCE / MED)</span>
                </button>

                <button
                  onClick={() => setActiveTab('bulletins')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                    activeTab === 'bulletins'
                      ? 'bg-salfa-dark text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>3. Bulletins de Paie (2 Ex. sur A4)</span>
                </button>

                <button
                  onClick={() => setActiveTab('rapports')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                    activeTab === 'rapports'
                      ? 'bg-salfa-dark text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>4. Rapports & Exports Excel / JSON</span>
                </button>

              </nav>
            </div>
          </div>

          {/* Contenu principal */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {activeTab === 'employes' && (
              <EmployesTab onOpenAdmin={() => setShowAdminModal(true)} userRole={user.role} />
            )}
            {activeTab === 'saisie' && (
              <SaisieTab userRole={user.role} onOpenAdmin={() => setShowAdminModal(true)} />
            )}
            {activeTab === 'bulletins' && <BulletinsTab />}
            {activeTab === 'rapports' && <RapportsTab />}
          </main>

          {/* Pied de page / Statut */}
          <footer className="bg-white border-t border-slate-200 py-3 px-4 text-xs text-slate-500 no-print">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Logiciel de Paie SALFA TANAMBAO — Toby Betela Toliara (Madagascar)</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>Conformité CGI Madagascar (IRSA) & Congé Maternité</span>
                <span>•</span>
                <span>100% local : données stockées dans le navigateur</span>
                <span>•</span>
                <span>2026</span>
              </div>
            </div>
          </footer>
        </>
      )}

    </div>
  );
};
export default App;
