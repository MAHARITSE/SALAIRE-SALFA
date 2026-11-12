import React, { useEffect, useState, useCallback } from 'react';
import { CompteUtilisateur, UserSession } from '../types';
import {
  fetchUtilisateurs,
  creerUtilisateur,
  modifierUtilisateur,
  changerMotDePasseUtilisateur,
  toggleActifUtilisateur,
  supprimerUtilisateur,
} from '../api';
import { WAMP } from '../runtime';
import {
  X,
  UserPlus,
  KeyRound,
  ShieldCheck,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Power,
  Trash2,
  Save,
  Settings,
} from 'lucide-react';

interface Props {
  currentUser: UserSession;
  onClose: () => void;
  onCurrentUserUpdated?: (user: UserSession) => void;
}

export const UsersSettingsModal: React.FC<Props> = ({
  currentUser,
  onClose,
  onCurrentUserUpdated,
}) => {
  const minPwdLen = WAMP ? 6 : 4;
  const [users, setUsers] = useState<CompteUtilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Formulaire : changement de mot de passe d'un utilisateur ciblé
  const [pwdTargetId, setPwdTargetId] = useState<number | null>(currentUser.id);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // Formulaire : ajout d'un nouvel utilisateur
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{
    username: string;
    nom_complet: string;
    role: 'Administrateur' | 'Comptable';
    password: string;
    confirm: string;
  }>({
    username: '',
    nom_complet: '',
    role: 'Comptable',
    password: '',
    confirm: '',
  });
  const [showAddPwd, setShowAddPwd] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);

  // Formulaire : édition d'un compte existant
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    username: string;
    nom_complet: string;
    role: 'Administrateur' | 'Comptable';
  }>({
    username: '',
    nom_complet: '',
    role: 'Comptable',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchUtilisateurs();
      setUsers(list);
    } catch (e: any) {
      setFeedback({ type: 'err', text: e?.message || 'Impossible de charger les utilisateurs.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const handleSavePassword = async (e: React.FormEvent, userId: number) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.length < minPwdLen) {
      setFeedback({
        type: 'err',
        text: `Le nouveau mot de passe doit contenir au moins ${minPwdLen} caractères.`,
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'err',
        text: 'La confirmation du mot de passe ne correspond pas.',
      });
      return;
    }
    setSavingPwd(true);
    const res = await changerMotDePasseUtilisateur(userId, newPassword);
    setSavingPwd(false);
    if (res.success) {
      const target = users.find((u) => u.id === userId);
      setNewPassword('');
      setConfirmPassword('');
      setPwdTargetId(null);
      setFeedback({
        type: 'ok',
        text: `Mot de passe mis à jour avec succès pour « ${target?.username || 'utilisateur'} ».`,
      });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Échec du changement de mot de passe.' });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (addForm.password.length < minPwdLen) {
      setFeedback({
        type: 'err',
        text: `Le mot de passe doit contenir au moins ${minPwdLen} caractères.`,
      });
      return;
    }
    if (addForm.password !== addForm.confirm) {
      setFeedback({
        type: 'err',
        text: 'La confirmation du mot de passe ne correspond pas.',
      });
      return;
    }
    setSavingAdd(true);
    const res = await creerUtilisateur({
      username: addForm.username,
      nom_complet: addForm.nom_complet,
      role: addForm.role,
      password: addForm.password,
    });
    setSavingAdd(false);
    if (res.success) {
      setAddForm({ username: '', nom_complet: '', role: 'Comptable', password: '', confirm: '' });
      setShowAddForm(false);
      await charger();
      setFeedback({
        type: 'ok',
        text: `Utilisateur « ${res.user?.username} » (${res.user?.role}) créé avec succès.`,
      });
    } else {
      setFeedback({ type: 'err', text: res.message || "Impossible d'ajouter cet utilisateur." });
    }
  };

  const handleStartEdit = (u: CompteUtilisateur) => {
    setPwdTargetId(null);
    setEditUserId(u.id);
    setEditForm({
      username: u.username,
      nom_complet: u.nom_complet,
      role: u.role,
    });
    setFeedback(null);
  };

  const handleSaveEdit = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    setFeedback(null);
    setSavingEdit(true);
    const res = await modifierUtilisateur(id, editForm);
    setSavingEdit(false);
    if (res.success && res.user) {
      setEditUserId(null);
      await charger();
      if (id === currentUser.id && onCurrentUserUpdated) {
        onCurrentUserUpdated({
          ...currentUser,
          username: res.user.username,
          nom_complet: res.user.nom_complet,
          role: res.user.role,
        });
      }
      setFeedback({
        type: 'ok',
        text: `Compte « ${res.user.username} » modifié avec succès.`,
      });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Modification impossible.' });
    }
  };

  const handleToggle = async (u: CompteUtilisateur) => {
    setFeedback(null);
    const nextActif = u.actif !== 1;
    if (
      !window.confirm(
        `${nextActif ? 'Réactiver' : 'Désactiver'} le compte utilisateur « ${u.username} » ?`
      )
    ) {
      return;
    }
    const res = await toggleActifUtilisateur(u.id, nextActif);
    if (res.success) {
      await charger();
      setFeedback({
        type: 'ok',
        text: `Compte « ${u.username} » ${nextActif ? 'réactivé' : 'désactivé'}.`,
      });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Action impossible.' });
    }
  };

  const handleDelete = async (u: CompteUtilisateur) => {
    setFeedback(null);
    if (
      !window.confirm(
        `Supprimer définitivement le compte utilisateur « ${u.username} » (${u.nom_complet}) ?`
      )
    ) {
      return;
    }
    const res = await supprimerUtilisateur(u.id);
    if (res.success) {
      await charger();
      setFeedback({ type: 'ok', text: `Compte « ${u.username} » supprimé.` });
    } else {
      setFeedback({ type: 'err', text: res.message || 'Suppression impossible.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="caisse-card bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        {/* En-tête */}
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-sky-300 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">
                Paramètres — Utilisateurs &amp; Mots de passe
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                Gérez les comptes d'accès (Administrateur / Comptable) et modifiez les mots de passe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white shrink-0 ml-2"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto thin-scrollbar flex-1">
          {feedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-900/25 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Barre supérieure : rappel des rôles + bouton Ajouter un utilisateur */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
              <div>
                <b className="text-emerald-700 dark:text-emerald-300">Administrateur :</b> accès complet (Paie, État, Bulletins, Rapports, Import &amp; Congés)
              </div>
              <div>
                <b className="text-sky-700 dark:text-sky-300">Comptable :</b> accès uniquement aux Permissions &amp; Congés
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddForm((v) => !v);
                setPwdTargetId(null);
                setEditUserId(null);
                setFeedback(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 bg-salfa-dark hover:bg-salfa-teal text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>{showAddForm ? 'Fermer le formulaire' : 'Ajouter un utilisateur'}</span>
            </button>
          </div>

          {/* Formulaire d'ajout d'un nouvel utilisateur */}
          {showAddForm && (
            <form
              onSubmit={handleCreateUser}
              className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/25 p-4 space-y-3"
            >
              <div className="text-xs font-extrabold uppercase text-salfa-teal dark:text-sky-300 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                <span>Nouveau compte utilisateur</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-slate-700 dark:text-slate-300">
                    Identifiant de connexion *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: comptable2 ou rh_salfa"
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-slate-700 dark:text-slate-300">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Comptable Adjoint SALFA"
                    value={addForm.nom_complet}
                    onChange={(e) => setAddForm({ ...addForm, nom_complet: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase mb-1 text-slate-700 dark:text-slate-300">
                    Rôle et droits d'accès *
                  </label>
                  <select
                    value={addForm.role}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        role: e.target.value === 'Administrateur' ? 'Administrateur' : 'Comptable',
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-semibold"
                  >
                    <option value="Comptable">Comptable — Permissions &amp; Congés uniquement</option>
                    <option value="Administrateur">Administrateur — Accès complet (Paie &amp; Congés)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-slate-700 dark:text-slate-300">
                    Mot de passe * (min. {minPwdLen} caract.)
                  </label>
                  <div className="relative">
                    <input
                      type={showAddPwd ? 'text' : 'password'}
                      required
                      minLength={minPwdLen}
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white pl-3 pr-9 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddPwd((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showAddPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1 text-slate-700 dark:text-slate-300">
                    Confirmer le mot de passe *
                  </label>
                  <input
                    type={showAddPwd ? 'text' : 'password'}
                    required
                    minLength={minPwdLen}
                    value={addForm.confirm}
                    onChange={(e) => setAddForm({ ...addForm, confirm: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{savingAdd ? 'Création…' : 'Créer le compte'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Liste des utilisateurs existants */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Comptes enregistrés ({users.length})
            </div>

            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">Chargement des comptes…</div>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isAdmin = u.role === 'Administrateur';
                const isChangingPwd = pwdTargetId === u.id;
                const isEditing = editUserId === u.id;

                return (
                  <div
                    key={u.id}
                    className={`rounded-xl border p-3.5 transition ${
                      u.actif === 1
                        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-75'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isAdmin
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                              {u.username}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isAdmin
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300'
                              }`}
                            >
                              {u.role}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                                Session active
                              </span>
                            )}
                            {u.actif !== 1 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                                Désactivé
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {u.nom_complet}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditUserId(null);
                            setNewPassword('');
                            setConfirmPassword('');
                            setPwdTargetId(isChangingPwd ? null : u.id);
                            setFeedback(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                            isChangingPwd
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Changer mot de passe</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditUserId(null) : handleStartEdit(u))}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                          title="Modifier l'identifiant, le nom ou le rôle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {!isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggle(u)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-600 dark:text-slate-300"
                              title={u.actif === 1 ? 'Désactiver le compte' : 'Réactiver le compte'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(u)}
                              className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400"
                              title="Supprimer le compte"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Sous-formulaire : Changement de mot de passe */}
                    {isChangingPwd && (
                      <form
                        onSubmit={(e) => handleSavePassword(e, u.id)}
                        className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                      >
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300">
                            Nouveau mot de passe pour « {u.username} »
                          </label>
                          <div className="relative">
                            <input
                              type={showPwd ? 'text' : 'password'}
                              required
                              minLength={minPwdLen}
                              placeholder={`Min. ${minPwdLen} caractères`}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white pl-3 pr-9 py-1.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPwd((v) => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              tabIndex={-1}
                            >
                              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300">
                            Confirmer
                          </label>
                          <input
                            type={showPwd ? 'text' : 'password'}
                            required
                            minLength={minPwdLen}
                            placeholder="Répéter le mot de passe"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-1.5 text-sm"
                          />
                        </div>

                        <div className="sm:col-span-3 flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setPwdTargetId(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            disabled={savingPwd}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingPwd ? '…' : 'Valider'}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Sous-formulaire : Modification identifiant / nom / rôle */}
                    {isEditing && (
                      <form
                        onSubmit={(e) => handleSaveEdit(e, u.id)}
                        className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                      >
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300">
                            Identifiant
                          </label>
                          <input
                            type="text"
                            required
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-sm"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300">
                            Nom complet
                          </label>
                          <input
                            type="text"
                            required
                            value={editForm.nom_complet}
                            onChange={(e) => setEditForm({ ...editForm, nom_complet: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-sm"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold uppercase mb-1 text-slate-600 dark:text-slate-300">
                            Rôle
                          </label>
                          <select
                            value={editForm.role}
                            disabled={isSelf}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                role: e.target.value === 'Administrateur' ? 'Administrateur' : 'Comptable',
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2.5 py-1.5 text-sm disabled:opacity-60"
                          >
                            <option value="Comptable">Comptable</option>
                            <option value="Administrateur">Administrateur</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2 flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditUserId(null)}
                            className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold"
                          >
                            ✕
                          </button>
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-salfa-dark hover:bg-salfa-teal text-white text-xs font-bold"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>OK</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pied de modale */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-salfa-dark hover:bg-salfa-teal text-white text-xs font-bold shadow-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
export default UsersSettingsModal;
