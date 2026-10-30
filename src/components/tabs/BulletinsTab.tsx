import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { PaieMensuelle } from '../../types';
import { fetchPaiesMois } from '../../api';
import { Calendar, Printer, Download, FileText, Eye, Settings2, ChevronDown, User, Users } from 'lucide-react';
import { downloadPayrollBookletPDF, downloadSingleBulletinPDF } from '../../pdf/bulletinsPdf';
import { YearProps, YearSelect } from '../YearSelect';
import {
  construireBulletin,
  formatCnapsBulletin,
  formatCongesRestantsBulletin,
  formatEmbaucheBulletin,
  formatMontant,
  formatMontantBulletin,
  montantEnLettresBulletin,
} from '../../bulletin/model';
import { loadBulletinHeader, setRemoteHeader } from '../../bulletin/header';
import { WAMP } from '../../runtime';
import { BulletinHeaderModal } from '../BulletinHeaderModal';

const MOIS = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'];

export const BulletinsTab: React.FC<YearProps> = ({ annee, setAnnee }) => {
  const [mois, setMois] = useState(() => MOIS[new Date().getMonth()]);
  const [paies, setPaies] = useState<PaieMensuelle[]>([]);
  const [selectedPaie, setSelectedPaie] = useState<PaieMensuelle | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState(loadBulletinHeader);
  const [headerOpen, setHeaderOpen] = useState(false);

  // Mode d'impression : 'un_seul' (bulletin actif sélectionné) ou 'tous' (tous les bulletins affichés)
  const [printMode, setPrintMode] = useState<'un_seul' | 'tous'>('un_seul');
  const [openMenu, setOpenMenu] = useState<'print' | 'pdf' | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => setHeader(loadBulletinHeader());
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Ne jamais afficher ni imprimer un bulletin d'une autre période pendant le chargement.
    setSelectedPaie(null);
    fetchPaiesMois(annee, mois).then(d => {
      if (!active) return;
      const list = d.employes || [];
      setPaies(list);
      if (WAMP) setHeader(loadBulletinHeader());
      setSelectedPaie(list[0] || null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [mois, annee]);

  const filtered = paies.filter(p => {
    const q = search.trim().toLowerCase();
    return String(p.numero_matricule).includes(q) || p.nom_prenoms.toLowerCase().includes(q) || (p.jobs || '').toLowerCase().includes(q);
  });

  const lancerImpression = (mode: 'un_seul' | 'tous') => {
    flushSync(() => {
      setOpenMenu(null);
      setPrintMode(mode);
    });
    window.requestAnimationFrame(() => window.print());
  };

  const bulletinsImprimes: PaieMensuelle[] =
    printMode === 'tous' ? filtered : selectedPaie ? [selectedPaie] : [];

  return (
    <div className="bulletin-root w-full">
      <div className="no-print space-y-3 sm:space-y-6 w-full">
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl border dark:border-slate-700 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-salfa-teal" />
          <span className="font-bold text-xs">Période :</span>
          <select aria-label="Mois de paie" value={mois} onChange={e => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-bold">
            {MOIS.map(m => <option key={m}>{m}</option>)}
          </select>
          <YearSelect annee={annee} setAnnee={setAnnee} />
        </div>

        <div ref={actionsRef} className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={() => setHeaderOpen(true)}
            className="flex-1 sm:flex-initial min-h-9 justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center"
          >
            <Settings2 className="w-4 h-4" />Entête
          </button>

          {/* Menu PDF : Un seul actif OU Tous */}
          <div className="relative flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'pdf' ? null : 'pdf'))}
              disabled={(!selectedPaie && filtered.length === 0) || loading}
              className="w-full min-h-9 justify-center bg-salfa-dark hover:bg-salfa-teal disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>PDF 2 ex.</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {openMenu === 'pdf' && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-40">
                <button
                  type="button"
                  disabled={!selectedPaie}
                  onClick={() => {
                    setOpenMenu(null);
                    if (selectedPaie) downloadSingleBulletinPDF(selectedPaie);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-sky-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-40"
                >
                  <User className="w-4 h-4 text-salfa-teal shrink-0" />
                  <div>
                    <div>Un seul (bulletin actif)</div>
                    {selectedPaie && <div className="text-[10px] font-normal text-slate-400 truncate max-w-[190px]">Mat {selectedPaie.numero_matricule} — {selectedPaie.nom_prenoms}</div>}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={filtered.length === 0}
                  onClick={() => {
                    setOpenMenu(null);
                    downloadPayrollBookletPDF(filtered, mois, annee);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-sky-50 dark:hover:bg-slate-700 flex items-center gap-2.5 border-t border-slate-100 dark:border-slate-700 disabled:opacity-40"
                >
                  <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div>Tous les bulletins ({filtered.length})</div>
                    <div className="text-[10px] font-normal text-slate-400">Livret complet {mois} {annee}</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Menu Imprimer : Un seul actif OU Tous */}
          <div className="relative flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'print' ? null : 'print'))}
              disabled={(!selectedPaie && filtered.length === 0) || loading}
              className="w-full min-h-9 justify-center bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {openMenu === 'print' && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 z-40">
                <button
                  type="button"
                  disabled={!selectedPaie}
                  onClick={() => lancerImpression('un_seul')}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-slate-700 flex items-center gap-2.5 disabled:opacity-40"
                >
                  <User className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div>Imprimer uniquement ce bulletin actif</div>
                    {selectedPaie && <div className="text-[10px] font-normal text-slate-400 truncate max-w-[190px]">Mat {selectedPaie.numero_matricule} — {selectedPaie.nom_prenoms}</div>}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={filtered.length === 0}
                  onClick={() => lancerImpression('tous')}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-slate-700 flex items-center gap-2.5 border-t border-slate-100 dark:border-slate-700 disabled:opacity-40"
                >
                  <Users className="w-4 h-4 text-salfa-teal shrink-0" />
                  <div>
                    <div>Imprimer tous les bulletins ({filtered.length})</div>
                    <div className="text-[10px] font-normal text-slate-400">2 exemplaires par page A4 paysage</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl p-3 space-y-2 max-h-[70vh] flex flex-col">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher matricule, nom, fonction..."
            className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm"
          />
          <div className="overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-sm text-slate-500 p-2">Chargement…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-500 p-2">Aucun bulletin pour {mois} {annee}.</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPaie(p)}
                  className={`w-full text-left p-2.5 rounded-lg border text-sm transition ${
                    selectedPaie?.id === p.id
                      ? 'bg-salfa-dark text-white border-salfa-dark shadow-sm'
                      : 'bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                >
                  <b>Mat {p.numero_matricule}</b> — {p.nom_prenoms}
                  <div className={`text-xs mt-0.5 ${selectedPaie?.id === p.id ? 'text-sky-200' : 'text-slate-500 dark:text-slate-300'}`}>
                    Net état : {formatMontant(p.net)} · Vir : {formatMontant(p.virement)} · Esp : {formatMontant(p.especes)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-3 sm:p-5 overflow-x-auto">
          {!selectedPaie ? (
            <div className="text-center p-10 text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2" />Aucun bulletin sélectionné.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs mb-3 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />Aperçu fidèle à la feuille <b>BULLETIN</b> — deux exemplaires côte à côte à l'impression.
                </span>
              </div>
              <div className="max-w-[600px] mx-auto">
                <BulletinCard paie={selectedPaie} header={header.image} />
              </div>
            </>
          )}
        </div>
      </div>

      {headerOpen && (
        <BulletinHeaderModal
          onClose={() => setHeaderOpen(false)}
          onSaved={cfg => {
            if (WAMP) setRemoteHeader(cfg);
            setHeader(cfg);
            setHeaderOpen(false);
          }}
        />
      )}
      </div>

      {!loading && bulletinsImprimes.length > 0 && (
        <div className="bulletin-print">
          {bulletinsImprimes.map((p) => (
            <div key={p.id} className="bulletin-print-sheet">
              <BulletinCard paie={p} header={header.image} />
              <BulletinCard paie={p} header={header.image} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BulletinCard: React.FC<{ paie: PaieMensuelle; header: string }> = ({ paie, header }) => {
  const bulletin = construireBulletin(paie);
  return (
    <div className="bulletin-card">
      <img className="bulletin-header-image" src={header} alt="Entête de l’établissement" />
      <div className="bulletin-heading">
        <strong>BULLETIN DE PAIE</strong>
        <div>Mois de : {paie.mois} {paie.annee}</div>
      </div>

      {/* Bloc identité conforme au modèle Excel : titres soulignés et deux-points parfaitement alignés */}
      <div className="bul-identity">
        <div className="bul-id-row">
          <span className="bul-id-lbl">
            <span className="bul-id-lbl-txt">Employé</span>
            <span className="bul-id-colon">:</span>
          </span>
          <span className="bul-id-val">{paie.nom_prenoms}</span>
        </div>
        <div className="bul-id-row">
          <span className="bul-id-lbl">
            <span className="bul-id-lbl-txt">Fonction</span>
            <span className="bul-id-colon">:</span>
          </span>
          <span className="bul-id-val">{paie.jobs || '—'}</span>
        </div>
        <div className="bul-id-row">
          <span className="bul-id-lbl">
            <span className="bul-id-lbl-txt">N° Matricule</span>
            <span className="bul-id-colon">:</span>
          </span>
          <span className="bul-id-val">{paie.numero_matricule}</span>
        </div>
        <div className="bul-id-row">
          <span className="bul-id-lbl">
            <span className="bul-id-lbl-txt">Embauche</span>
            <span className="bul-id-colon">:</span>
          </span>
          <span className="bul-id-val">{formatEmbaucheBulletin(paie.date_embauche)}</span>
        </div>
        <div className="bul-id-row bul-id-row-class">
          <span className="bul-id-lbl">
            <span className="bul-id-lbl-txt">Classification</span>
            <span className="bul-id-colon">:</span>
          </span>
          <span className="bul-id-cat">{paie.categorie || '—'}</span>
          <span className="bul-id-cnaps-lbl">N° CNaPS :</span>
          <span className="bul-id-val">{formatCnapsBulletin(paie.numero_cnaps)}</span>
        </div>
      </div>

      {/* Tableau encadré conforme à l'image (sans lignes horizontales internes sauf sous-total GAINS) */}
      <table className="bul-box-table">
        <colgroup>
          <col style={{ width: '54%' }} />
          <col style={{ width: '23%' }} />
          <col style={{ width: '23%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>RUBRIQUES DE PAIE</th>
            <th>GAINS</th>
            <th>RETENUES</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bul-row-first">
            <td>Salaire de base</td>
            <td className={Number(paie.base_aj || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.base_aj)}</td>
            <td />
          </tr>
          <tr>
            <td>Indemnités de Transp et Logement</td>
            <td className={Number(paie.logt_trsp || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.logt_trsp)}</td>
            <td />
          </tr>
          <tr>
            <td>Indemnité de Rendement</td>
            <td className={Number(paie.rendement || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.rendement)}</td>
            <td />
          </tr>
          <tr className="bul-before-sub">
            <td>Indemnité de Responsabilité</td>
            <td className={Number(paie.resp_repres || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.resp_repres)}</td>
            <td />
          </tr>
          <tr className="bul-sub-row">
            <td className="bul-sub-lbl">TOTAL :</td>
            <td className="bul-sub-val">{formatMontant(bulletin.base)}</td>
            <td />
          </tr>
          <tr>
            <td>Cotisation CNaPS</td>
            <td />
            <td className={Number(paie.cnaps || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.cnaps)}</td>
          </tr>
          <tr>
            <td>Retenue IRSA</td>
            <td />
            <td className={Number(paie.irsa || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.irsa)}</td>
          </tr>
          <tr>
            <td>Avance sur salaire / Prêt</td>
            <td />
            <td className={Number(paie.avance || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.avance)}</td>
          </tr>
          <tr>
            <td>Medicament</td>
            <td />
            <td className={Number(paie.med || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.med)}</td>
          </tr>
          <tr className="bul-row-last">
            <td>Primes divers</td>
            <td className={Number(paie.accessoir || 0) === 0 ? 'bul-zero' : 'bul-amt'}>{formatMontantBulletin(paie.accessoir)}</td>
            <td />
          </tr>
        </tbody>
        <tfoot>
          <tr className="bul-tot-row">
            <td className="bul-tot-lbl">TOTAL ......</td>
            <td className="bul-tot-box">{formatMontant(bulletin.gains)}</td>
            <td className="bul-tot-box">{formatMontant(bulletin.retenues)}</td>
          </tr>
          <tr className="bul-net-row">
            <td colSpan={2} className="bul-net-lbl-cell">
              <div className="bul-net-lbl-inner">NET à PAYER :</div>
            </td>
            <td className="bul-net-box">{formatMontant(bulletin.net)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="bul-words">
        Arrêtée à la somme de : {montantEnLettresBulletin(bulletin.net)}
      </div>

      <div className="bul-pay-grid">
        <span className="bul-pay-title">Paiement :</span>
        <span className="bul-pay-mode">Virement</span>
        <span className="bul-pay-amt">{formatMontant(paie.virement)}</span>

        <span />
        <span className="bul-pay-mode">Espece</span>
        <span className="bul-pay-amt">{formatMontant(paie.especes)}</span>
      </div>

      <div className="bul-conges">
        <span className="bul-conges-lbl">NB CONGES RESTANTS:</span>
        <span className="bul-conges-val">{formatCongesRestantsBulletin(paie.conge_restant)} &nbsp;jrs</span>
      </div>

      <div className="bul-date">
        <span>Tulear le,</span>
        <span>{new Date().toLocaleDateString('fr-FR')}</span>
      </div>
    </div>
  );
};
