import React, { useState, useEffect } from 'react';
import { PaieMensuelle } from '../../types';
import { fetchPaiesMois } from '../../api';
import { Calendar, Printer, Download, FileText, Eye, Settings2 } from 'lucide-react';
import { downloadSingleBulletinPDF } from '../../pdf/bulletinsPdf';
import { YearProps, YearSelect } from '../YearSelect';
import { construireBulletin, formatDate, formatMontant, montantEnLettres } from '../../bulletin/model';
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

  useEffect(() => {
    const update = () => setHeader(loadBulletinHeader());
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

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
  return <div className="bulletin-root space-y-3 sm:space-y-6 w-full">
    <div className="no-print bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-xl border dark:border-slate-700 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-salfa-teal" /><span className="font-bold text-xs">Période :</span>
      <select aria-label="Mois de paie" value={mois} onChange={e => setMois(e.target.value)} className="rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-bold">{MOIS.map(m => <option key={m}>{m}</option>)}</select>
      <YearSelect annee={annee} setAnnee={setAnnee} />
      </div>
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
      <button onClick={() => setHeaderOpen(true)} className="flex-1 sm:flex-initial min-h-9 justify-center bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center"><Settings2 className="w-4 h-4" />Entête</button>
      <button onClick={() => selectedPaie && downloadSingleBulletinPDF(selectedPaie)} disabled={!selectedPaie || loading} className="flex-1 sm:flex-initial min-h-9 justify-center bg-salfa-dark hover:bg-salfa-teal disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center"><Download className="w-4 h-4" />PDF 2 ex.</button>
      <button onClick={() => window.print()} disabled={!selectedPaie || loading} className="flex-1 sm:flex-initial min-h-9 justify-center bg-slate-100 dark:bg-slate-700 disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-bold flex gap-1.5 items-center"><Printer className="w-4 h-4" />Imprimer</button>
      </div>
    </div>
    <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl p-3 space-y-2 max-h-[65vh] flex flex-col">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full rounded-lg border dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-sm" />
        <div className="overflow-y-auto space-y-1">{loading ? <p>Chargement…</p> : filtered.length === 0 ? <p className="text-sm text-slate-500">Aucun bulletin pour {mois} {annee}.</p> : filtered.map(p => <button key={p.id} onClick={() => setSelectedPaie(p)} className={`w-full text-left p-2 rounded-lg border text-sm ${selectedPaie?.id === p.id ? 'bg-salfa-dark text-white' : 'dark:bg-slate-700'}`}><b>Mat {p.numero_matricule}</b> — {p.nom_prenoms}<div className="text-xs">Net enregistré : {formatMontant(p.net)}</div></button>)}</div>
      </div>
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-3 sm:p-5 overflow-x-auto">
        {!selectedPaie ? <div className="text-center p-10 text-slate-500"><FileText className="w-8 h-8 mx-auto" />Aucun bulletin sélectionné.</div> : <>
          <div className="flex items-center gap-2 text-xs mb-3 text-slate-600 dark:text-slate-300"><Eye className="w-4 h-4" />Aperçu du bulletin Excel — deux exemplaires à l'impression.</div>
          <BulletinCard paie={selectedPaie} header={header.image} />
        </>}
      </div>
    </div>
    {headerOpen && <BulletinHeaderModal onClose={() => setHeaderOpen(false)} onSaved={cfg => { if (WAMP) setRemoteHeader(cfg); setHeader(cfg); setHeaderOpen(false); }} />}
    {selectedPaie && !loading && <div className="bulletin-print"><BulletinCard paie={selectedPaie} header={header.image} /><BulletinCard paie={selectedPaie} header={header.image} /></div>}
  </div>;
};

const BulletinCard: React.FC<{ paie: PaieMensuelle; header: string }> = ({ paie, header }) => {
  const bulletin = construireBulletin(paie);
  return <div className="bulletin-card">
    <img className="bulletin-header-image" src={header} alt="Entête de l’établissement" />
    <div className="bulletin-heading"><strong>BULLETIN DE PAIE</strong><div>Mois de : {paie.mois} {paie.annee}</div></div>
    <div className="bulletin-identity">
      <div><b>Employé :</b> {paie.nom_prenoms}</div>
      <div><b>Fonction :</b> {paie.jobs || '—'}</div>
      <div><b>N° Matricule :</b> {paie.numero_matricule}</div>
      <div><b>Embauche :</b> {formatDate(paie.date_embauche)}</div>
      <div><b>Classification :</b> {paie.categorie || '—'} <span className="bulletin-cnaps"><b>N° CNaPS :</b> {paie.numero_cnaps || '—'}</span></div>
    </div>
    <table className="bulletin-table"><colgroup><col style={{width:'54%'}} /><col style={{width:'23%'}} /><col style={{width:'23%'}} /></colgroup>
      <thead><tr><th>RUBRIQUES DE PAIE</th><th>GAINS</th><th>RETENUES</th></tr></thead>
      <tbody>{bulletin.lignes.map((r, i) => <tr key={i} className={r.total ? 'bulletin-total' : ''}><td>{r.libelle}</td><td>{r.gain === undefined ? '' : formatMontant(r.gain)}</td><td>{r.retenue === undefined ? '' : formatMontant(r.retenue)}</td></tr>)}</tbody>
    </table>
    <div className="bulletin-net"><b>NET à PAYER :</b> <b>{formatMontant(bulletin.net)}</b></div>
    <div className="bulletin-words">Arrêtée à la somme de : {montantEnLettres(bulletin.net)}</div>
    <div className="bulletin-payment"><span>Paiement :</span><span>Virement : {formatMontant(paie.virement)}<br />Espèce : {formatMontant(paie.especes)}</span></div>
    {bulletin.ecartNet && <div className="bulletin-note">Net enregistré dans l'état : {formatMontant(bulletin.netEnregistre)} (différent du net calculé ci-dessus).</div>}
    <div>NB CONGÉS RESTANTS : ……… jrs</div>
    <div className="bulletin-date">Tulear le, {new Date().toLocaleDateString('fr-FR')}</div>
  </div>;
};
