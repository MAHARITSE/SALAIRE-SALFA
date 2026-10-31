// ADMIN MODAL - CALCUL ÉDITABLE DANS L'ADMIN + DARKMODE
import React, { useState, useMemo } from 'react';
import { WAMP } from '../runtime';
import { remoteSaveSetting } from '../wampClient';
import {
  ShieldCheck, X, Plus, Trash2, HeartHandshake, CheckCircle2, Info,
  Sliders, Layers, Calculator, Award, RotateCcw, Save, CalendarCheck2, Image as ImageIcon, Upload,
} from 'lucide-react';
import { CongesConfig, DEFAULT_CONGES_CONFIG, MOTIFS_ABSENCE, LIBELLES_CATEGORIE } from '../local/conges';
import { loadConfig, saveConfig, PaieConfig, BaremeAncienneteConfig, TrancheIrsaConfig, DEFAULT_CONFIG, DEFAULT_BAREME_ANCIENNETE, DEFAULT_BAREME_IRSA, resetConfig } from '../local/config';
import { detailIrsaAvecConfig, obtenirIndiceAncienneteAvecBareme } from '../local/calcul';
import { DEFAULT_APP_ICON, PRESET_APP_ICONS, applyAppFavicon, prepareFaviconDataUrl } from '../local/favicon';

export type AdminTabKey = 'formules' | 'irsa' | 'anciennete' | 'colonnes' | 'conges' | 'icone';

interface AdminModalProps {
  onClose: () => void;
  initialTab?: AdminTabKey;
}

type TabKey = AdminTabKey;

export const AdminModal: React.FC<AdminModalProps> = ({ onClose, initialTab = 'formules' }) => {
  const initial = loadConfig();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Icône personnalisée de l'onglet navigateur (remplace l'icône WampServer)
  const [iconeApp, setIconeApp] = useState<string>(() => initial.iconeApp || '');
  const [iconeMsg, setIconeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingIcone, setSavingIcone] = useState(false);

  // Formules générales
  const [tauxMaternite, setTauxMaternite] = useState<number>(initial.tauxMaternite);
  const [dureeMaternite, setDureeMaternite] = useState<number>(initial.dureeMaterniteMois);
  const [cnapsSalariale, setCnapsSalariale] = useState<number>(initial.cnapsSalariale);
  const [cnapsPatronale, setCnapsPatronale] = useState<number>(initial.cnapsPatronale);
  const [deductionEnfant, setDeductionEnfant] = useState<number>(initial.deductionEnfant);
  const [minIrsa, setMinIrsa] = useState<number>(initial.minIrsa);
  const [arrondiIrsaBase, setArrondiIrsaBase] = useState<number>(initial.arrondiIrsaBase);
  const [arrondiNet, setArrondiNet] = useState<number>(initial.arrondiNet);
  const [plafondEspeces, setPlafondEspeces] = useState<number>(initial.plafondEspeces);

  // Barèmes éditables
  const [baremeIrsa, setBaremeIrsa] = useState<TrancheIrsaConfig[]>(() => initial.baremeIrsa.map(t => ({ ...t })));
  const [baremeAnciennete, setBaremeAnciennete] = useState<BaremeAncienneteConfig[]>(() => initial.baremeAnciennete.map(b => ({ ...b })));

  // Droits de congé, permission et examens médicaux (module Congés & Permissions)
  const [congies, setCongies] = useState<CongesConfig>(() => ({ ...(initial.congies || DEFAULT_CONGES_CONFIG) }));
  const majConges = <K extends keyof CongesConfig>(cle: K, valeur: CongesConfig[K]) =>
    setCongies((prev) => {
      const next = { ...prev, [cle]: valeur, reportAutorise: false };
      const jpa = Math.max(0, Math.min(30, Number(next.joursCongeParAn) || 0));
      next.joursCongeParAn = jpa;
      next.plafondCumulConge = jpa;
      if (cle === 'nbAnneesCumul') {
        next.nbAnneesCumul = Math.max(1, Math.min(10, Math.round(Number(next.nbAnneesCumul) || 3)));
      }
      return next;
    });

  const handleUploadIcone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIconeMsg(null);
    try {
      const dataUrl = await prepareFaviconDataUrl(file, 64);
      setIconeApp(dataUrl);
      applyAppFavicon(dataUrl);
      setIconeMsg({
        type: 'ok',
        text: `Icône « ${file.name} » chargée en aperçu sur l’onglet. Cliquez sur « Enregistrer l’icône » pour la sauvegarder.`,
      });
    } catch (err: any) {
      setIconeMsg({ type: 'err', text: err?.message || 'Fichier icône invalide.' });
    }
  };

  const handleSaveIconeOnly = async (nextIcon?: string) => {
    const val = nextIcon !== undefined ? nextIcon : iconeApp;
    setSavingIcone(true);
    setIconeMsg(null);
    try {
      const cfg = saveConfig({ iconeApp: val });
      if (WAMP) {
        await remoteSaveSetting('config', cfg);
      }
      applyAppFavicon(cfg.iconeApp || '');
      setIconeApp(cfg.iconeApp || '');
      setIconeMsg({
        type: 'ok',
        text: val
          ? 'Icône personnalisée enregistrée et appliquée sur l’onglet du navigateur.'
          : 'Logo SALFA par défaut rétabli sur l’onglet du navigateur.',
      });
    } catch (err: any) {
      setIconeMsg({ type: 'err', text: err?.message || 'Impossible de sauvegarder l’icône.' });
    } finally {
      setSavingIcone(false);
    }
  };

  // Simulateurs
  const [salaireEssai, setSalaireEssai] = useState<number>(500000);
  const [enfantsEssai, setEnfantsEssai] = useState<number>(2);
  const [baseEssai, setBaseEssai] = useState<number>(306500);
  const [anneesEssai, setAnneesEssai] = useState<number>(5);

  // Colonnes (UI seulement)
  const [colonnes, setColonnes] = useState([
    { id: 'base_aj', nom: 'Base (Salaire de base)', type: 'Gain de base', permanent: true },
    { id: 'logt_trsp', nom: 'Indemnité Logement & Transport', type: 'Gain de base', permanent: true },
    { id: 'rendement', nom: 'Prime de Rendement', type: 'Gain de base', permanent: true },
    { id: 'resp_repres', nom: 'RESP REPRES', type: 'Gain de base', permanent: true },
    { id: 'augmentation_divers', nom: 'AUGMENTATION DIVERS', type: 'Accessoire', permanent: false },
    { id: 'prime_de_garde', nom: 'Prime de garde', type: 'Accessoire', permanent: false },
    { id: 'anciennete2', nom: "Prime d'Ancienneté / Majoration", type: 'Accessoire', permanent: false },
    { id: 'risque', nom: 'Prime de RISQUE', type: 'Accessoire', permanent: false },
    { id: 'repr_rec', nom: 'Repr° réc° (Représentation)', type: 'Accessoire', permanent: false },
    { id: 'avance', nom: 'AVANCE sur salaire / Prêt', type: 'Retenue', permanent: false },
    { id: 'med', nom: 'MED / Pharmacie & Médicaments', type: 'Retenue', permanent: false },
  ]);
  const [newColNom, setNewColNom] = useState('');
  const [newColType, setNewColType] = useState('Accessoire');

  // Config live pour prévisualisation
  const cfgLive: PaieConfig = useMemo(() => ({
    ...initial,
    tauxMaternite: Number(tauxMaternite),
    dureeMaterniteMois: Number(dureeMaternite) || 3,
    cnapsSalariale: Number(cnapsSalariale) || 0,
    cnapsPatronale: Number(cnapsPatronale) || 0,
    deductionEnfant: Number(deductionEnfant) || 0,
    minIrsa: Number(minIrsa) || 0,
    arrondiIrsaBase: Number(arrondiIrsaBase) || 0,
    arrondiNet: Number(arrondiNet) || 0,
    plafondEspeces: Number(plafondEspeces) || 0,
    baremeIrsa: [...baremeIrsa].sort((a, b) => a.min - b.min),
    baremeAnciennete: [...baremeAnciennete].sort((a, b) => a.min - b.min),
  }), [tauxMaternite, dureeMaternite, cnapsSalariale, cnapsPatronale, deductionEnfant, minIrsa, arrondiIrsaBase, arrondiNet, plafondEspeces, baremeIrsa, baremeAnciennete, initial]);

  const detail = useMemo(() => {
    try {
      return detailIrsaAvecConfig(salaireEssai, enfantsEssai, cfgLive);
    } catch {
      return detailIrsaAvecConfig(salaireEssai, enfantsEssai, initial);
    }
  }, [salaireEssai, enfantsEssai, cfgLive, initial]);

  const indicePreview = useMemo(() => {
    try {
      return obtenirIndiceAncienneteAvecBareme(anneesEssai, cfgLive.baremeAnciennete);
    } catch {
      return 1;
    }
  }, [anneesEssai, cfgLive.baremeAnciennete]);

  // -------- Handlers colonnes --------
  const handleAddColonne = (e: React.FormEvent) => {
    e.preventDefault(); if (!newColNom.trim()) return;
    const id = newColNom.toLowerCase().replace(/[^a-z0-9]/g, '_');
    setColonnes([...colonnes, { id, nom: newColNom.trim(), type: newColType, permanent: false }]);
    setNewColNom('');
  };
  const handleRemoveColonne = (index: number) => {
    if (colonnes[index].permanent) { alert("Colonne officielle."); return; }
    setColonnes(colonnes.filter((_, i) => i !== index));
  };

  // -------- Handlers IRSA --------
  const updateIrsaTranche = (idx: number, field: 'min' | 'max' | 'taux', value: string) => {
    setBaremeIrsa(prev => {
      const copy = [...prev];
      const cur = { ...copy[idx] };
      if (field === 'min') {
        cur.min = Math.max(0, parseInt(value.replace(/\D/g, '') || '0', 10));
      } else if (field === 'max') {
        if (value === '' || value.toLowerCase() === 'inf' || value === '∞') cur.max = null;
        else {
          const v = parseInt(value.replace(/\D/g, '') || '0', 10);
          cur.max = v > 0 ? v : null;
        }
      } else {
        cur.taux = Math.min(100, Math.max(0, parseFloat(value) || 0));
      }
      copy[idx] = cur;
      return copy;
    });
  };
  const addIrsaTranche = () => {
    setBaremeIrsa(prev => {
      const sorted = [...prev].sort((a, b) => a.min - b.min);
      const last = sorted[sorted.length - 1];
      const newMin = last?.max ? last.max : (last ? last.min + 100000 : 0);
      // si derniere était infinie, on la ferme à newMin et on ajoute une nouvelle infinie
      let working = [...prev];
      if (last && last.max === null) {
        working = working.map((t, i) => i === prev.length - 1 ? { ...t, max: newMin } : t);
      }
      return [...working, { min: newMin, max: null, taux: 20 }];
    });
  };
  const removeIrsaTranche = (idx: number) => {
    if (baremeIrsa.length <= 1) { alert('Il faut au moins une tranche.'); return; }
    setBaremeIrsa(prev => prev.filter((_, i) => i !== idx));
  };
  const sortIrsa = () => setBaremeIrsa(prev => [...prev].sort((a, b) => a.min - b.min));

  // -------- Handlers Ancienneté --------
  const updateAnc = (idx: number, field: 'min' | 'max' | 'indice', value: string) => {
    setBaremeAnciennete(prev => {
      const copy = [...prev];
      const cur = { ...copy[idx] };
      if (field === 'min') cur.min = Math.max(0, parseInt(value.replace(/\D/g, '') || '0', 10));
      else if (field === 'max') cur.max = Math.max(cur.min, parseInt(value.replace(/\D/g, '') || '0', 10));
      else cur.indice = Math.max(0, parseFloat(value) || 0);
      copy[idx] = cur;
      return copy;
    });
  };
  const addAnc = () => {
    setBaremeAnciennete(prev => {
      const sorted = [...prev].sort((a, b) => a.max - b.max);
      const last = sorted[sorted.length - 1];
      const newMin = last ? last.max + 1 : 0;
      const newMax = newMin + 1;
      return [...prev, { min: newMin, max: newMax, indice: last ? Math.round((last.indice + 0.05) * 100) / 100 : 1 }];
    });
  };
  const removeAnc = (idx: number) => {
    if (baremeAnciennete.length <= 1) { alert('Il faut au moins une ligne.'); return; }
    setBaremeAnciennete(prev => prev.filter((_, i) => i !== idx));
  };
  const sortAnc = () => setBaremeAnciennete(prev => [...prev].sort((a, b) => a.min - b.min));

  // -------- Sauvegarde --------
  const handleSaveConfig = async () => {
    // validation légère
    if (baremeIrsa.some(t => t.max !== null && t.max <= t.min)) {
      alert('Barème IRSA invalide : une tranche a un max <= min.');
      return;
    }
    if (baremeAnciennete.some(b => b.max < b.min)) {
      alert('Barème ancienneté invalide : max < min.');
      return;
    }
    let cfg: PaieConfig;
    try { cfg = saveConfig({
      tauxMaternite: Number(tauxMaternite),
      dureeMaterniteMois: Number(dureeMaternite) || 3,
      cnapsSalariale: Number(cnapsSalariale) || 0,
      cnapsPatronale: Number(cnapsPatronale) || 0,
      deductionEnfant: Number(deductionEnfant) || 0,
      minIrsa: Number(minIrsa) || 0,
      arrondiIrsaBase: Number(arrondiIrsaBase) || 0,
      arrondiNet: Number(arrondiNet) || 0,
      plafondEspeces: Number(plafondEspeces) || 0,
      baremeIrsa: [...baremeIrsa].sort((a, b) => a.min - b.min),
      baremeAnciennete: [...baremeAnciennete].sort((a, b) => a.min - b.min),
      congies: { ...congies, reportAutorise: false },
      iconeApp,
    }); } catch (e) { alert(e instanceof Error ? e.message : 'Sauvegarde impossible.'); return; }
    if (WAMP) { try { await remoteSaveSetting('config', cfg); } catch (e) { alert(e instanceof Error ? e.message : 'Sauvegarde serveur impossible.'); window.location.reload(); return; } }
    applyAppFavicon(cfg.iconeApp || '');
    setTauxMaternite(cfg.tauxMaternite);
    setDureeMaternite(cfg.dureeMaterniteMois);
    setCnapsSalariale(cfg.cnapsSalariale);
    setCnapsPatronale(cfg.cnapsPatronale);
    setDeductionEnfant(cfg.deductionEnfant);
    setMinIrsa(cfg.minIrsa);
    setArrondiIrsaBase(cfg.arrondiIrsaBase);
    setArrondiNet(cfg.arrondiNet);
    setPlafondEspeces(cfg.plafondEspeces);
    setBaremeIrsa(cfg.baremeIrsa.map(t => ({ ...t })));
    setBaremeAnciennete(cfg.baremeAnciennete.map(b => ({ ...b })));
    setCongies({ ...cfg.congies });
    alert("Paramètres de calcul enregistrés ! Les nouveaux bulletins utiliseront ces formules.");
    onClose();
    // petit reload pour être sûr que tous les onglets recalculent, mais conserve localStorage
    window.location.reload();
  };

  const handleReset = async () => {
    if (!window.confirm("Réinitialiser tous les paramètres de calcul aux valeurs par défaut (Loi Madagascar) ?")) return;
    let def: PaieConfig;
    try { def = resetConfig(); } catch (e) { alert(e instanceof Error ? e.message : 'Réinitialisation impossible.'); return; }
    if (WAMP) { try { await remoteSaveSetting('config', def); } catch (e) { alert(e instanceof Error ? e.message : 'Sauvegarde serveur impossible.'); window.location.reload(); return; } }
    setTauxMaternite(def.tauxMaternite);
    setDureeMaternite(def.dureeMaterniteMois);
    setCnapsSalariale(def.cnapsSalariale);
    setCnapsPatronale(def.cnapsPatronale);
    setDeductionEnfant(def.deductionEnfant);
    setMinIrsa(def.minIrsa);
    setArrondiIrsaBase(def.arrondiIrsaBase);
    setArrondiNet(def.arrondiNet);
    setPlafondEspeces(def.plafondEspeces);
    setBaremeIrsa(def.baremeIrsa.map(t => ({ ...t })));
    setBaremeAnciennete(def.baremeAnciennete.map(b => ({ ...b })));
    setCongies({ ...DEFAULT_CONGES_CONFIG });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 dark:border-slate-700 modal-mobile max-h-[95dvh] flex flex-col">
        <div className="bg-salfa-dark dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">Administration : Formules & Calculs éditables</h3>
              <p className="text-[10px] sm:text-xs text-slate-300 hidden sm:block">CGI Madagascar — tous les calculs sont modifiables et sauvegardés localement</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 px-2 sm:px-4 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'formules' as TabKey, label: '1. Formules & Règles', short: 'Formules', icon: Sliders },
            { id: 'irsa' as TabKey, label: '2. Barème IRSA', short: 'IRSA', icon: Calculator },
            { id: 'anciennete' as TabKey, label: '3. Ancienneté', short: 'Anc.', icon: Award },
            { id: 'colonnes' as TabKey, label: '4. Colonnes', short: 'Cols', icon: Layers },
            { id: 'conges' as TabKey, label: '5. Congés & permissions', short: 'Congés', icon: CalendarCheck2 },
            { id: 'icone' as TabKey, label: '6. Icône application', short: 'Icône', icon: ImageIcon },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-2.5 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap shrink-0 ${activeTab === tab.id ? 'border-salfa-teal dark:border-sky-400 text-salfa-dark dark:text-white bg-white dark:bg-slate-800' : 'border-transparent text-slate-600 dark:text-slate-300'}`}>
              <tab.icon className="w-4 h-4 text-salfa-teal dark:text-sky-300" />
              <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>

        <div className="p-3 sm:p-5 overflow-y-auto thin-scrollbar flex-1">
          {activeTab === 'formules' && (
            <div className="space-y-5">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-[11px] sm:text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span><b>Édition autorisée :</b> tous les calculs (IRSA, CNaPS, maternité, ancienneté, arrondis) sont éditables ici. Les modifications sont stockées en <code>localStorage</code> et s'appliquent immédiatement aux nouveaux bulletins. Le bouton <b>Réinitialiser</b> restaure la loi malgache par défaut.</span>
              </div>

              {/* Maternité */}
              <div className="bg-pink-50/70 dark:bg-pink-900/20 border-2 border-pink-200 dark:border-pink-800 rounded-xl p-3 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600 dark:text-pink-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase">Congé de Maternité</h4>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">Base brute réduite pendant la durée du congé. Formule configurable.</p>
                    </div>
                  </div>
                  <span className="px-2 sm:px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 text-[10px] sm:text-xs font-extrabold uppercase shrink-0">{dureeMaternite} mois × {tauxMaternite}%</span>
                </div>
                <div className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-pink-200 dark:border-pink-800">
                  <div className="font-bold text-pink-900 dark:text-pink-300 mb-1 flex items-center gap-1.5"><Calculator className="w-4 h-4" />Formule :</div>
                  <code className="block bg-slate-100 dark:bg-slate-700 p-2 rounded font-mono text-salfa-dark dark:text-slate-200 text-[11px] sm:text-xs overflow-x-auto">Salaire Brut = (Base + Logt Trsp + Rendement + RESP) × {tauxMaternite}% si maternité sinon 100%</code>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] sm:text-xs font-bold dark:text-slate-300">Coefficient maternité :</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} value={tauxMaternite} onChange={(e) => setTauxMaternite(Number(e.target.value))} className="w-20 rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-1.5 text-sm font-bold text-center" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">%</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] sm:text-xs font-bold dark:text-slate-300">Durée du congé :</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={12} value={dureeMaternite} onChange={(e) => setDureeMaternite(Number(e.target.value))} className="w-20 rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-1.5 text-sm font-bold text-center" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">mois</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CNaPS & règles */}
              <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-5 space-y-4">
                <h4 className="text-[11px] sm:text-xs font-extrabold text-salfa-dark dark:text-white uppercase tracking-wider border-b dark:border-slate-600 pb-2 flex items-center gap-2"><Sliders className="w-4 h-4 text-salfa-teal" />CNaPS, IRSA & Règles de paie</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">CNaPS Salariale (%)</label><input type="number" step="0.1" value={cnapsSalariale} onChange={(e) => setCnapsSalariale(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">CNaPS Patronale (%)</label><input type="number" step="0.1" value={cnapsPatronale} onChange={(e) => setCnapsPatronale(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Déduction IRSA / enfant</label><input type="number" value={deductionEnfant} onChange={(e) => setDeductionEnfant(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Minimum IRSA</label><input type="number" value={minIrsa} onChange={(e) => setMinIrsa(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Arrondi base imposable (Ar)</label><input type="number" value={arrondiIrsaBase} onChange={(e) => setArrondiIrsaBase(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /><span className="text-[10px] text-slate-500">0 = pas d'arrondi, 100 = centaine inf.</span></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Arrondi NET à payer (Ar)</label><input type="number" value={arrondiNet} onChange={(e) => setArrondiNet(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /><span className="text-[10px] text-slate-500">100 par défaut (100 Ar inf.)</span></div>
                  <div><label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Plafond espèces avec RIB (Ar)</label><input type="number" value={plafondEspeces} onChange={(e) => setPlafondEspeces(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /><span className="text-[10px] text-slate-500">Ex: 5000 si virement partiel</span></div>
                </div>

                <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div><span className="font-bold text-salfa-teal dark:text-sky-300">Formule brute :</span> <code className="font-mono">salaire_brut = (Base + Logt + Rnd + RESP) × coeff_maternité</code></div>
                  <div><span className="font-bold text-salfa-teal dark:text-sky-300">CNaPS :</span> <code className="font-mono">cnaps = brut × {cnapsSalariale}% — imposable = brut - cnaps</code></div>
                  <div><span className="font-bold text-salfa-teal dark:text-sky-300">IRSA :</span> <code className="font-mono">irsa = Σ((min(max,base)-min) × taux) - enfants×{deductionEnfant} puis max({minIrsa}, ...)</code></div>
                  <div><span className="font-bold text-salfa-teal dark:text-sky-300">NET :</span> <code className="font-mono">net = floor((net_base + accessoires - avance - med)/{arrondiNet})*{arrondiNet}</code></div>
                  <div><span className="font-bold text-salfa-teal dark:text-sky-300">Règlement :</span> <code className="font-mono">si RIB≥5 alors espèces = min({plafondEspeces}, net), virement = net - espèces sinon espèces = net</code></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'irsa' && (
            <div className="space-y-5">
              <div className="bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-200 dark:border-sky-800 rounded-xl p-3 sm:p-5">
                <h4 className="text-xs sm:text-sm font-extrabold text-salfa-dark dark:text-white uppercase mb-3 flex items-center gap-2"><Calculator className="w-5 h-5 text-salfa-teal dark:text-sky-300" />Barème IRSA progressif — Éditable</h4>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mb-3">Le barème est appliqué sur la base imposable arrondie à <b>{arrondiIrsaBase || 0} Ar</b> inférieur. Chaque ligne représente une tranche : de <i>min</i> (inclus) à <i>max</i> (exclus, vide = infini) avec un taux. Les tranches sont triées automatiquement.</p>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <div><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Déduction / enfant</label><input type="number" value={deductionEnfant} onChange={(e) => setDeductionEnfant(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                    <div><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Minimum IRSA</label><input type="number" value={minIrsa} onChange={(e) => setMinIrsa(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                    <div><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Arrondi base</label><input type="number" value={arrondiIrsaBase} onChange={(e) => setArrondiIrsaBase(Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto thin-scrollbar">
                    <table className="w-full text-xs sm:text-sm min-w-[500px]">
                      <thead className="bg-slate-100 dark:bg-slate-700 text-[11px] uppercase font-bold text-slate-600 dark:text-slate-300">
                        <tr><th className="px-3 py-2 text-left">De (Ar)</th><th className="px-3 py-2 text-left">À (Ar) — vide = ∞</th><th className="px-3 py-2 text-center">Taux %</th><th className="px-3 py-2 text-center">Action</th></tr>
                      </thead>
                      <tbody className="divide-y dark:divide-slate-700">
                        {baremeIrsa.map((t, idx) => (
                          <tr key={idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-700/50">
                            <td className="px-2 py-1.5"><input type="text" inputMode="numeric" value={t.min} onChange={(e) => updateIrsaTranche(idx, 'min', e.target.value)} className="w-full rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono font-bold" /></td>
                            <td className="px-2 py-1.5"><input type="text" inputMode="numeric" placeholder="∞" value={t.max === null ? '' : t.max} onChange={(e) => updateIrsaTranche(idx, 'max', e.target.value)} className="w-full rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono" /></td>
                            <td className="px-2 py-1.5"><input type="number" step="0.5" min={0} max={100} value={t.taux} onChange={(e) => updateIrsaTranche(idx, 'taux', e.target.value)} className="w-24 rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono font-bold text-center mx-auto block" /></td>
                            <td className="px-2 py-1.5 text-center"><button onClick={() => removeIrsaTranche(idx)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 sm:p-3 bg-slate-50 dark:bg-slate-700/50 flex flex-wrap gap-2">
                    <button onClick={addIrsaTranche} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-salfa-dark dark:bg-slate-600 text-white text-xs font-bold hover:bg-salfa-teal"><Plus className="w-4 h-4" />Ajouter tranche</button>
                    <button onClick={sortIrsa} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border dark:border-slate-600 text-xs font-bold">Trier</button>
                    <button onClick={() => setBaremeIrsa(DEFAULT_BAREME_IRSA.map(t => ({ ...t })))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-bold"><RotateCcw className="w-4 h-4" />Restaurer Loi Madagascar</button>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Formule actuelle : <code className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">IRSA = max({minIrsa}, Σ(tranches) - {deductionEnfant} × enfants)</code> — base arrondie = floor(imposable/{arrondiIrsaBase || 1})*{arrondiIrsaBase || 1}</div>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-5">
                <h5 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Info className="w-4 h-4 text-salfa-teal dark:text-sky-300" />Simulateur IRSA (avec barème édité)</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Salaire imposable (Ar)</label>
                    <input type="number" value={salaireEssai} onChange={(e) => setSalaireEssai(Number(e.target.value) || 0)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Enfants à charge</label>
                    <input type="number" min={0} value={enfantsEssai} onChange={(e) => setEnfantsEssai(Number(e.target.value) || 0)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" />
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg border dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-[11px] sm:text-xs">
                    <tbody className="divide-y dark:divide-slate-700">
                      <tr><td className="px-3 py-2 text-slate-600 dark:text-slate-300">Base arrondie ({arrondiIrsaBase || 'pas'} Ar inf.)</td><td className="px-3 py-2 text-right font-mono font-bold">{detail.baseArrondie.toLocaleString('fr-FR')} Ar</td></tr>
                      {detail.tranches.map((t: any, i: number) => (
                        <tr key={i}><td className="px-3 py-2 text-slate-600 dark:text-slate-300">{t.libelle} — base taxable {t.baseTaxable.toLocaleString('fr-FR')} Ar</td><td className="px-3 py-2 text-right font-mono">{t.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Ar</td></tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-700 font-bold"><td className="px-3 py-2">IRSA brut</td><td className="px-3 py-2 text-right font-mono">{detail.irsaBrut.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Ar</td></tr>
                      <tr><td className="px-3 py-2 text-slate-600 dark:text-slate-300">− Réduction famille ({enfantsEssai} × {deductionEnfant.toLocaleString('fr-FR')})</td><td className="px-3 py-2 text-right font-mono text-red-600">−{detail.deductionFamille.toLocaleString('fr-FR')} Ar</td></tr>
                      <tr><td className="px-3 py-2 text-slate-600 dark:text-slate-300">Avant minimum</td><td className="px-3 py-2 text-right font-mono">{detail.avantMin.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Ar</td></tr>
                      {detail.avantMin < detail.minIrsa && (
                        <tr><td className="px-3 py-2 text-amber-700 dark:text-amber-300 font-semibold">Minimum de perception appliqué</td><td className="px-3 py-2 text-right font-mono text-amber-700 dark:text-amber-300">{detail.minIrsa.toLocaleString('fr-FR')} Ar</td></tr>
                      )}
                      <tr className="bg-salfa-dark dark:bg-slate-900 text-white font-extrabold"><td className="px-3 py-2.5">IRSA À RETENIR</td><td className="px-3 py-2.5 text-right font-mono text-base">{detail.irsaFinal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Ar</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'anciennete' && (
            <div className="space-y-5">
              <div className="bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 sm:p-5">
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase mb-2 flex items-center gap-2"><Award className="w-5 h-5 text-amber-600 dark:text-amber-300" />Barème d'ancienneté — Éditable</h4>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">L'indice est appliqué sur la Base (salaire de base) selon le nombre d'années d'ancienneté. La base revalorisée est informative (évaluation). Modifiez les tranches puis enregistrez.</p>
                <div className="mt-3 p-2.5 rounded bg-white dark:bg-slate-800 border dark:border-slate-700 text-[11px] font-mono"><span className="font-bold">Formule :</span> base_revalorisée = Base × indice(années) — indice trouvé dans la tranche [min,max]</div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full text-xs sm:text-sm min-w-[520px]">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-[11px] uppercase font-bold text-slate-600 dark:text-slate-300">
                      <tr><th className="px-3 py-2 text-left">Min années</th><th className="px-3 py-2 text-left">Max années</th><th className="px-3 py-2 text-center">Indice (×)</th><th className="px-3 py-2 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                      {baremeAnciennete.map((b, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/50 dark:hover:bg-slate-700/50">
                          <td className="px-2 py-1.5"><input type="number" min={0} value={b.min} onChange={(e) => updateAnc(idx, 'min', e.target.value)} className="w-full rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono font-bold" /></td>
                          <td className="px-2 py-1.5"><input type="number" min={0} value={b.max} onChange={(e) => updateAnc(idx, 'max', e.target.value)} className="w-full rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono font-bold" /></td>
                          <td className="px-2 py-1.5"><input type="number" step="0.01" min={0} value={b.indice} onChange={(e) => updateAnc(idx, 'indice', e.target.value)} className="w-24 rounded border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-2 py-1.5 font-mono font-bold text-center mx-auto block" /></td>
                          <td className="px-2 py-1.5 text-center"><button onClick={() => removeAnc(idx)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-2 sm:p-3 bg-slate-50 dark:bg-slate-700/50 flex flex-wrap gap-2">
                  <button onClick={addAnc} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-salfa-dark dark:bg-slate-600 text-white text-xs font-bold hover:bg-salfa-teal"><Plus className="w-4 h-4" />Ajouter tranche</button>
                  <button onClick={sortAnc} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border dark:border-slate-600 text-xs font-bold">Trier</button>
                  <button onClick={() => setBaremeAnciennete(DEFAULT_BAREME_ANCIENNETE.map(b => ({ ...b })))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-bold"><RotateCcw className="w-4 h-4" />Restaurer défaut SALFA</button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-5">
                <h5 className="text-xs sm:text-sm font-extrabold mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-amber-600" />Simulateur ancienneté</h5>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div><label className="block text-[11px] font-bold mb-1 dark:text-slate-300">Base (Ar)</label><input type="number" value={baseEssai} onChange={(e) => setBaseEssai(Number(e.target.value) || 0)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Années ancienneté</label><input type="number" min={0} value={anneesEssai} onChange={(e) => setAnneesEssai(Number(e.target.value) || 0)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" /></div>
                  <div className="flex flex-col justify-end"><div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5 text-xs">Indice trouvé : <b className="font-mono text-base">{indicePreview.toFixed(2)}×</b><br />Base revalorisée : <b className="font-mono">{Math.round(baseEssai * indicePreview).toLocaleString('fr-FR')} Ar</b></div></div>
                </div>
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-700 font-bold"><tr><th className="px-3 py-1.5 text-left">Années</th><th className="px-3 py-1.5 text-center">Indice</th><th className="px-3 py-1.5 text-right">Base × indice</th></tr></thead>
                    <tbody className="divide-y dark:divide-slate-700">
                      {Array.from({ length: 26 }, (_, i) => i).map(an => {
                        const ind = obtenirIndiceAncienneteAvecBareme(an, cfgLive.baremeAnciennete);
                        const isCurrent = an === anneesEssai;
                        return <tr key={an} className={isCurrent ? 'bg-amber-100 dark:bg-amber-900/30 font-bold' : ''}><td className="px-3 py-1">{an} an(s)</td><td className="px-3 py-1 text-center font-mono">{ind.toFixed(2)}×</td><td className="px-3 py-1 text-right font-mono">{Math.round(baseEssai * ind).toLocaleString('fr-FR')} Ar</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'colonnes' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 sm:p-4 text-[11px] sm:text-xs dark:text-slate-300"><div className="font-extrabold text-salfa-dark dark:text-white">Gestion des Colonnes et Rubriques</div><div>Ajoutez des primes exceptionnelles, indemnités. (Stockage local UI, ne modifie pas le calcul central).</div></div>
              <form onSubmit={handleAddColonne} className="bg-slate-50 dark:bg-slate-700/30 border dark:border-slate-700 rounded-xl p-3 sm:p-4 flex flex-col gap-3"><div className="flex flex-col sm:flex-row gap-3"><div className="flex-1"><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Nom nouvelle colonne</label><input type="text" value={newColNom} onChange={(e) => setNewColNom(e.target.value)} placeholder="ex: Prime Bilinguisme..." className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm" /></div><div className="w-full sm:w-auto"><label className="block text-[11px] font-bold uppercase mb-1 dark:text-slate-300">Type</label><select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-bold"><option value="Accessoire">Accessoire (+)</option><option value="Gain de base">Gain de base (+)</option><option value="Retenue">Retenue (-)</option></select></div></div><button type="submit" className="w-full sm:w-auto bg-salfa-dark dark:bg-slate-600 hover:bg-salfa-teal text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 shadow"><Plus className="w-4 h-4" /><span>Ajouter la Colonne</span></button></form>
              <div className="block sm:hidden space-y-2">{colonnes.map((col, idx) => (<div key={idx} className="border dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-700 flex justify-between items-center gap-2"><div className="min-w-0"><div className="font-bold text-sm truncate dark:text-white">{col.nom}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">{col.id} • {col.type}</div></div><div className="flex items-center gap-2 shrink-0">{col.permanent ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-bold">Officiel</span> : <><span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold">Perso</span><button onClick={() => handleRemoveColonne(idx)} className="p-1.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button></>}</div></div>))}</div>
              <div className="hidden sm:block border dark:border-slate-700 rounded-xl overflow-hidden"><div className="overflow-x-auto thin-scrollbar"><table className="w-full text-left border-collapse text-xs min-w-[600px] dark:text-slate-200"><thead><tr className="bg-slate-100 dark:bg-slate-700 border-b dark:border-slate-600 font-bold uppercase text-slate-600 dark:text-slate-300"><th className="py-2.5 px-4">ID SQL</th><th className="py-2.5 px-4">Nom Colonne</th><th className="py-2.5 px-4">Type</th><th className="py-2.5 px-4 text-center">Statut</th><th className="py-2.5 px-4 text-center">Action</th></tr></thead><tbody className="divide-y dark:divide-slate-700">{colonnes.map((col, idx) => (<tr key={idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-600/50"><td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">{col.id}</td><td className="py-2.5 px-4 font-bold">{col.nom}</td><td className="py-2.5 px-4 font-semibold text-salfa-teal dark:text-sky-300">{col.type}</td><td className="py-2.5 px-4 text-center">{col.permanent ? <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 font-bold text-[11px]">Officiel</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">Personnalisé</span>}</td><td className="py-2.5 px-4 text-center">{!col.permanent && <button onClick={() => handleRemoveColonne(idx)} className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>}</td></tr>))}</tbody></table></div></div>
            </div>
          )}
          {activeTab === 'conges' && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-[11px] sm:text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Ces réglages alimentent l'onglet <b>Congés & Permissions</b> (comptable) :{' '}
                  <b>congé bloqué à 30 jours maximum tous les ans</b> et <b>géré indépendamment année par année</b> (aucun report ni cumul d'une année sur l'autre sur 2024, 2025, 2026…), permission de 10 jours par an, examens médicaux sur justificatif du médecin.
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 space-y-3">
                <h4 className="text-[11px] sm:text-xs font-extrabold text-salfa-dark dark:text-white uppercase tracking-wider border-b dark:border-slate-600 pb-2 flex items-center gap-2">
                  <CalendarCheck2 className="w-4 h-4 text-salfa-teal" />Droits annuels indépendants (plafond 30 j / an)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Congé par an (max 30 j)</label>
                    <input type="number" min={0} max={30} step="0.5" value={congies.joursCongeParAn} onChange={(e) => majConges('joursCongeParAn', Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" />
                    <span className="text-[10px] text-slate-500">Bloqué à 30 jours / an</span>
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Colonnes d'années affichées</label>
                    <input type="number" min={1} max={10} step={1} value={congies.nbAnneesCumul ?? 3} onChange={(e) => majConges('nbAnneesCumul', Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" />
                    <span className="text-[10px] text-slate-500">Ex. 3 colonnes (2024, 2025, 2026)</span>
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Plafond par année (jours)</label>
                    <input type="number" readOnly value={Math.min(30, congies.joursCongeParAn)} className="w-full rounded-lg border dark:border-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 px-3 py-2 text-sm font-mono font-bold" />
                    <span className="text-[10px] text-slate-500">Chaque année est indépendante (max 30 j)</span>
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Permission par an (jours)</label>
                    <input type="number" min={0} step="0.5" value={congies.joursPermissionParAn} onChange={(e) => majConges('joursPermissionParAn', Number(e.target.value))} className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono font-bold" />
                    <span className="text-[10px] text-slate-500">« 10 andro isan-taona »</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="flex items-start gap-2 text-[11px] sm:text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span><b>Gestion indépendante activée :</b> chaque année repart à 30 j maximum sans report de l'année précédente.</span>
                  </div>
                  <label className="flex items-start gap-2 text-[11px] sm:text-xs cursor-pointer"><input type="checkbox" className="mt-0.5 rounded" checked={congies.examenSurPermission} onChange={(e) => majConges('examenSurPermission', e.target.checked)} /><span>Un <b>examen médical</b> décompte aussi la permission.</span></label>
                  <label className="flex items-start gap-2 text-[11px] sm:text-xs cursor-pointer"><input type="checkbox" className="mt-0.5 rounded" checked={congies.bloquerDepassement} onChange={(e) => majConges('bloquerDepassement', e.target.checked)} /><span><b>Bloquer</b> une demande validée dépassant le plafond de 30 j de l'année (sinon simple rappel).</span></label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold cursor-pointer"><input type="checkbox" className="rounded" checked={congies.exclureDimanche} onChange={(e) => majConges('exclureDimanche', e.target.checked)} />Dimanche</label>
                    <label className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold cursor-pointer"><input type="checkbox" className="rounded" checked={congies.exclureSamedi} onChange={(e) => majConges('exclureSamedi', e.target.checked)} />Samedi</label>
                    <span className="text-[10px] text-slate-500">jours non décomptés d'une absence</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] sm:text-xs font-bold mb-1 dark:text-slate-300">Jours fériés non décomptés</label>
                  <input type="text" value={congies.joursFeries} onChange={(e) => majConges('joursFeries', e.target.value)} placeholder="2026-03-08 2026-06-26 2026-08-15 2026-11-01 2026-12-25" className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white px-3 py-2 text-sm font-mono" />
                  <span className="text-[10px] text-slate-500">Dates AAAA-MM-JJ séparées par des espaces. Le 1er mars (Insurrection) et le 26 juin (Indépendance) sont d'usage à Madagascar.</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
                  <h4 className="text-[11px] sm:text-xs font-extrabold text-salfa-dark dark:text-white uppercase tracking-wider">Motifs prévus par le règlement intérieur</h4>
                  <span className="text-[10px] text-slate-500">colonne « Voalazan'ny FITSIPIKA ANATINY manan-kery » de la fiche d'absence</span>
                </div>
                <div className="table-responsive thin-scrollbar max-h-[38vh]">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700 uppercase text-[9px] text-slate-600 dark:text-slate-200">
                      <tr>
                        <th className="px-2 py-2">Catégorie</th>
                        <th className="px-2 py-2">Motif (fiche)</th>
                        <th className="px-2 py-2">Lecture française</th>
                        <th className="px-2 py-2 text-right">Jours dus</th>
                        <th className="px-2 py-2 text-center">Visa médecin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 dark:text-slate-200">
                      {MOTIFS_ABSENCE.map((m) => (
                        <tr key={m.code}>
                          <td className="px-2 py-1.5 font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{LIBELLES_CATEGORIE[m.categorie]}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] whitespace-normal">{m.libelleDocx}</td>
                          <td className="px-2 py-1.5 whitespace-normal">{m.libelleFr}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold">{m.jours > 0 ? `${String(m.jours).padStart(2, '0')} andro` : '—'}</td>
                          <td className="px-2 py-1.5 text-center">{m.avisMedecin ? '✔' : '·'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-200 dark:border-slate-700">
                  Le référentiel des motifs est fixé par la fiche d'absence de la société ; sa structure (libellés malgaches, nombre de jours) est reprise à l'identique
                  sur les fiches imprimées et dans l'état de contrôle. Pour un changement de règlement, demandez une mise à jour de l'application.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'icone' && (
            <div className="space-y-5">
              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3.5 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2.5">
                <ImageIcon className="w-5 h-5 text-salfa-teal dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold uppercase mb-0.5">Icône de l'application (Onglet du navigateur)</div>
                  <p className="text-[11px] sm:text-xs leading-relaxed">
                    Remplace l'icône rose par défaut de WampServer dans l'onglet du navigateur (<code>Clinique SALFA TANAMBAO…</code>) par le logo SALFA ou par une icône personnalisée de votre choix (PNG, ICO, SVG, JPG, WebP).
                  </p>
                </div>
              </div>

              {iconeMsg && (
                <div
                  role="status"
                  className={`rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm flex items-center gap-2 ${
                    iconeMsg.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-900/25 border-red-300 dark:border-red-700 text-red-700 dark:text-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{iconeMsg.text}</span>
                </div>
              )}

              {/* Aperçu réaliste de l'onglet du navigateur */}
              <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
                  Aperçu en direct de l'onglet du navigateur
                </div>
                <div className="bg-[#dce6f7] dark:bg-slate-800 rounded-xl p-2.5 inline-flex items-center max-w-full">
                  <div className="bg-white dark:bg-slate-700 rounded-lg px-3 py-2 shadow-sm border border-slate-200/80 dark:border-slate-600 flex items-center gap-2.5 max-w-[280px]">
                    <img
                      src={iconeApp || DEFAULT_APP_ICON}
                      alt="Icône onglet"
                      className="w-5 h-5 object-contain shrink-0 rounded-sm"
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                      Clinique SALFA TANAMBAO
                    </span>
                    <span className="text-slate-400 text-xs font-bold ml-1">×</span>
                  </div>
                </div>
              </div>

              {/* Champ d'import et modèles prédéfinis */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center p-2 shrink-0">
                      <img
                        src={iconeApp || DEFAULT_APP_ICON}
                        alt="Aperçu icône 64×64"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">
                        {iconeApp ? 'Icône personnalisée sélectionnée' : 'Logo SALFA par défaut actif'}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Formats acceptés : <b>.png, .ico, .svg, .jpg, .webp</b> (redimensionné automatiquement en 64×64 px).
                      </p>
                    </div>
                  </div>

                  <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-salfa-dark hover:bg-salfa-teal text-white text-xs sm:text-sm font-bold shadow transition shrink-0">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span>Choisir une icône…</span>
                    <input
                      type="file"
                      accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/jpeg,image/webp,.ico,.png,.svg,.jpg,.jpeg,.webp"
                      onChange={handleUploadIcone}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">Modèles intégrés :</span>
                  {PRESET_APP_ICONS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setIconeApp(preset.src);
                        applyAppFavicon(preset.src);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-salfa-teal bg-slate-50 dark:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                    >
                      <img src={preset.src} alt="" className="w-4 h-4 object-contain" />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                  {iconeApp && (
                    <button
                      type="button"
                      onClick={() => handleSaveIconeOnly('')}
                      disabled={savingIcone}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 text-amber-800 dark:text-amber-200 text-xs font-bold transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rétablir logo SALFA par défaut</span>
                    </button>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveIconeOnly()}
                    disabled={savingIcone}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow transition disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingIcone ? 'Enregistrement…' : 'Enregistrer l’icône'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-700/50 border-t dark:border-slate-700 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Toutes les formules sont éditables. Sauvegarde locale.</span>
            <button onClick={handleReset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 text-amber-800 dark:text-amber-200 text-[11px] font-bold"><RotateCcw className="w-3.5 h-3.5" />Réinitialiser défauts</button>
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button onClick={onClose} className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-sm font-semibold">Fermer</button>
            <button onClick={handleSaveConfig} className="flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow flex items-center justify-center gap-2"><Save className="w-4 h-4" /><span>Appliquer & Recharger</span><CheckCircle2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
