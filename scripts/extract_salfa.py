"""Extrait les valeurs enregistrées du classeur SALFA 2026 (pip install openpyxl)."""
import json
from datetime import datetime, date
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
MONTHS = 'JANVIER FEVRIER MARS AVRIL MAI JUIN JUILLET AOUT SEPTEMBRE OCTOBRE'.split()
FIELDS = ['numero_matricule','nom_prenoms','numero_cnaps','categorie','jobs','date_embauche','nombre_annees','enfant_a_charge','base_aj','logt_trsp','rendement','resp_repres','salaire_brut','cnaps','patronal','salaire_imposable','irsa','salaire_net','augmentation_divers','prime_de_garde','anciennete2','risque','repr_rec','accessoir','brut','avance','med','net','virement','especes','rap','rib']
TEXT = {'nom_prenoms','numero_cnaps','categorie','jobs','rib'}

def convert(key, val):
    if key == 'date_embauche':
        return val.strftime('%Y-%m-%d') if isinstance(val, (date, datetime)) else ''
    if key in TEXT:
        return '' if val is None else str(val).strip()
    if key in ('virement','especes') and val is None:
        return None
    if key == 'rap':
        return int(bool(val))
    return val if isinstance(val, (int, float)) else 0

wb = openpyxl.load_workbook(ROOT / 'SALAIRE SALFA 2026.xlsm', data_only=True)
active = {int(r[0].value): str(r[1].value).strip() for r in wb['LISTE SALARIE'].iter_rows(min_row=2, max_col=2) if isinstance(r[0].value, (int,float)) and isinstance(r[1].value, str) and r[1].value.strip()}
paies, latest = [], {}
for month in MONTHS:
    s = wb[month]
    for row in s.iter_rows(min_row=3, max_col=32):
        if not isinstance(row[0].value, (int,float)) or not isinstance(row[1].value, str) or not row[1].value.strip():
            continue
        p = {key: convert(key, c.value) for key, c in zip(FIELDS, row)}
        # En juin, l'intitulé JOBS est vide mais les valeurs restent en colonne E.
        p.update(annee=2026, mois=month, verrouille=0)
        latest[p['numero_matricule']] = p
        paies.append(p)

# La liste du personnel fait foi pour le statut courant ; les anciens salariés restent consultables.
all_mats = sorted(set(active) | set(latest))
employes = []
for idx, mat in enumerate(all_mats, 1):
    p = latest.get(mat, {})
    e = dict(id=idx, numero_matricule=mat, nom_prenoms=active.get(mat, p.get('nom_prenoms','')),
        numero_cnaps=p.get('numero_cnaps',''), categorie=p.get('categorie',''), jobs=p.get('jobs',''),
        date_embauche=p.get('date_embauche',''), nombre_annees=p.get('nombre_annees',0), enfant_a_charge=p.get('enfant_a_charge',0),
        base_aj=p.get('base_aj',0), logement_transport=p.get('logt_trsp',0), rendement=p.get('rendement',0),
        responsabilite_representation=p.get('resp_repres',0), rib=p.get('rib',''),
        mode_paiement='VIREMENT' if p.get('rib') else 'ESPECES', actif=int(mat in active), conge_maternite=0)
    employes.append(e)
ids = {e['numero_matricule']:e['id'] for e in employes}
for idx, p in enumerate(paies,1):
    p.update(id=idx, employe_id=ids[p['numero_matricule']])
path = ROOT / 'src/data/salfa_data.json'
data = json.loads(path.read_text())
data['meta'].update(source_file='SALAIRE SALFA 2026.xlsm', annee=2026, mois_disponibles=MONTHS, source_version='classeur-2026-10')
data['employes'] = employes
data['paies'] = paies
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(f'{len(employes)} salariés ({len(active)} actifs), {len(paies)} lignes de paie')
