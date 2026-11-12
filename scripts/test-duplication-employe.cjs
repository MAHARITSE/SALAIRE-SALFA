const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-duplication-'));
const storage = new Map();
global.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: k => storage.delete(k),
};

(async () => {
  try {
    const outfile = path.join(tmp, 'test.cjs');
    esbuild.buildSync({
      stdin: { contents: `
        export * from './src/local/duplicationEmploye';
        export * as api from './src/api-local';
        export { DuplicationEmployeModal, QuestionsDuplication } from './src/components/DuplicationEmployeModal';
        export { EmployeModalForm } from './src/components/EmployeModalForm';
        export { renderToStaticMarkup } from 'react-dom/server';
        export { createElement } from 'react';`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent', loader: { '.png': 'dataurl' },
      define: { 'import.meta.env.VITE_BACKEND': '"local"' },
    });
    const m = require(outfile);
    const source = {
      id: 77, numero_matricule: 90, nom_prenoms: 'SOURCE TEST', numero_cnaps: 'CNAPS-TEST',
      categorie: '3A', jobs: 'FONCTION TEST', date_embauche: '2020-02-15', nombre_annees: 6,
      enfant_a_charge: 2, base_aj: 400000, logement_transport: 10000, rendement: 20000,
      responsabilite_representation: 30000, rib: 'RIB-TEST', mode_paiement: 'VIREMENT',
      actif: 0, date_inactif: '2025-01-01', conge_maternite: 1, date_debut_maternite: '2024-01-01',
      cin: 'CIN-TEST', date_cin: '2010-01-01', lieu_cin: 'TEST', adresse: 'ADRESSE TEST',
      service: 'SERVICE TEST', diplome: 'DIPLOME TEST', nature_contrat: 'CDI',
      date_creation: 'ne pas copier', paies: [{ id: 1 }], conges: [{ id: 2 }],
    };
    const avant = JSON.stringify(source);
    const employes = [source, { ...source, id: 78, numero_matricule: 100, actif: 1 }];
    const copie = m.preparerDuplicationEmploye(source, employes);
    assert.equal(copie.numero_matricule, 101, 'inclut les matricules des inactifs');
    for (const champ of ['categorie', 'jobs', 'date_embauche', 'enfant_a_charge', 'base_aj', 'logement_transport', 'rendement', 'responsabilite_representation', 'mode_paiement', 'adresse', 'service', 'diplome', 'nature_contrat']) {
      assert.equal(copie[champ], source[champ], `préremplissage de ${champ}`);
    }
    for (const champ of ['nom_prenoms', 'numero_cnaps', 'cin', 'date_cin', 'lieu_cin', 'rib', 'date_inactif', 'date_debut_maternite']) assert.equal(copie[champ], '');
    for (const champ of ['id', 'nombre_annees', 'date_creation', 'paies', 'conges']) assert.equal(champ in copie, false);
    assert.equal(copie.actif, 1);
    assert.equal(copie.conge_maternite, 0);
    assert.equal(JSON.stringify(source), avant, 'aucune mutation de la source');
    assert.equal(m.preparerDuplicationEmploye(source, []).numero_matricule, 1);
    assert.equal(m.preparerDuplicationEmploye(source, [{ numero_matricule: Number.MAX_SAFE_INTEGER }, { numero_matricule: 1 }]).numero_matricule, 2);

    const render = (Component, props) => m.renderToStaticMarkup(m.createElement(Component, props));
    const selection = render(m.DuplicationEmployeModal, { employes, initialEmployeId: 77, onClose() {}, onSelect() {} });
    assert.match(selection, /Étape 1 sur 2/);
    assert.match(selection, /Copier et modifier/);
    assert.match(selection, /checked=""/);
    assert.match(selection, /Inactif/);
    assert.match(selection, /Deux questions de confirmation/);
    for (const question of [1, 2]) {
      let oui = 0;
      let non = 0;
      const props = { source, question, onOui() { oui++; }, onNon() { non++; } };
      const html = render(m.QuestionsDuplication, props);
      assert.match(html, new RegExp(`Question ${question} sur 2`));
      assert.match(html, /Non, annuler/);
      if (question === 1) {
        assert.match(html, /Voulez-vous dupliquer la fiche de 90 — SOURCE TEST/);
        assert.match(html, /Oui, continuer/);
        assert.doesNotMatch(html, /Oui, ouvrir la modification/);
      } else {
        assert.match(html, /Voulez-vous ouvrir la copie/);
        assert.match(html, /Oui, ouvrir la modification/);
        assert.match(html, /Aucune fiche ne sera créée avant/);
      }
      const panneau = m.QuestionsDuplication(props);
      const footer = panneau.props.children.find(c => c.type === 'footer');
      const boutons = footer.props.children;
      assert.equal(oui, 0, 'afficher une question ne la confirme pas');
      assert.equal(non, 0);
      boutons[0].props.onClick();
      assert.equal(non, 1, 'le refus appelle l’annulation');
      assert.equal(oui, 0, 'un refus ne poursuit pas la duplication');
      boutons[1].props.onClick();
      assert.equal(oui, 1, 'seul le oui poursuit le parcours');
    }
    const vide = render(m.DuplicationEmployeModal, { employes: [], initialEmployeId: null, onClose() {}, onSelect() {} });
    assert.match(vide, /Aucune fiche disponible/);
    assert.match(vide, /disabled=""/);
    const form = render(m.EmployeModalForm, { employe: null, duplication: { source, valeurs: copie }, onClose() {}, onSaved() {} });
    assert.match(form, /Étape 2 sur 2/);
    assert.match(form, /FONCTION TEST/);
    assert.match(form, /Enregistrer le nouveau salarié/);
    assert.doesNotMatch(form, /RIB-TEST|CNAPS-TEST|CIN-TEST/);
    const edition = render(m.EmployeModalForm, { employe: source, onClose() {}, onSaved() {} });
    assert.match(edition, /Modifier les informations/);
    assert.match(edition, /RIB-TEST/);
    assert.doesNotMatch(edition, /Étape 2 sur 2/);

    await m.api.apiLogin('admin', 'admin123');
    const existants = await m.api.fetchEmployes(false);
    const original = existants[0];
    const originalAvant = JSON.stringify(original);
    const paiesAvant = JSON.stringify(await m.api.fetchEmployePaies(original.id));
    const brouillon = m.preparerDuplicationEmploye(original, existants);
    assert.equal((await m.api.fetchEmployes(false)).length, existants.length, 'ouvrir/annuler le brouillon ne crée rien');
    assert.equal(await m.api.createEmploye(brouillon), false, 'nouveau nom obligatoire');
    brouillon.nom_prenoms = 'NOUVELLE PERSONNE TEST';
    brouillon.jobs = 'FONCTION MODIFIEE';
    assert.equal(await m.api.createEmploye(brouillon), true);
    const apres = await m.api.fetchEmployes(false);
    assert.equal(apres.length, existants.length + 1);
    const nouveau = apres.find(e => e.numero_matricule === brouillon.numero_matricule);
    assert.notEqual(nouveau.id, original.id);
    assert.equal(nouveau.jobs, 'FONCTION MODIFIEE');
    assert.equal(JSON.stringify(apres.find(e => e.id === original.id)), originalAvant);
    assert.equal(JSON.stringify(await m.api.fetchEmployePaies(original.id)), paiesAvant);
    assert.deepEqual(await m.api.fetchEmployePaies(nouveau.id), [], 'aucun ancien bulletin copié');
    assert.equal(await m.api.createEmploye(brouillon), false, 'collision matricule refusée');
    await m.api.apiLogin('comptable', 'comptable123');
    await assert.rejects(() => m.api.createEmploye({ ...brouillon, numero_matricule: brouillon.numero_matricule + 1 }), /Accès refusé/);
    console.log('Duplication salarié : brouillon sans effet, 2 étapes avec 2 questions de confirmation, préremplissage, identifiants réinitialisés, création distincte et protection de la source : OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
