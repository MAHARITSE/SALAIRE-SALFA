# Clinique SALFA TANAMBAO — Logiciel de Paie Mensuelle

> **Variante réseau WAMP / MySQL :** voir [wamp/GUIDE-WAMP.md](wamp/GUIDE-WAMP.md). Elle démarre avec une base vide, ou chargée des données Excel en important [wamp/sql/salfa_donnees_excel_2022-2026.sql](wamp/sql/salfa_donnees_excel_2022-2026.sql) dans MySQL (phpMyAdmin), et reste à valider sur Windows avant toute utilisation réelle. La description ci-dessous concerne la version locale dans le navigateur.

Application **100 % locale** (client-side / React + Vite + TypeScript), déployable en tant que
**site statique** sur **Cloudflare Pages**. Il n'y a **plus aucun serveur Node/Express ni base
de données distante** : toutes les données sont stockées dans le `localStorage` du navigateur,
initialisées à partir du fichier embarqué `src/data/salfa_data.json`.

## Audit et vérifications

Voir le [rapport technique du 31 octobre 2026](docs/AUDIT-2026-10-31.md) : correctifs,
écarts historiques non corrigés automatiquement et limites de validation WAMP.

```sh
npm ci
npm run typecheck
npm test
npm run test:sql
# Avec PHP installé :
php wamp/test-validation.php
```

**État connu :** `npm test` signale encore la divergence de ventilation du matricule
28 en octobre 2026 entre le classeur et les données initiales (15 suites sur 16
réussissent). `npm audit` signale encore la dépendance Excel `xlsx`. Ces alertes
ne doivent pas être ignorées ou présentées comme des vérifications réussies.

**Confidentialité :** la variante locale embarque des données nominatives de paie.
Ne pas la publier sur un site accessible au public pour y protéger des salaires
par les seuls comptes locaux. Préférer le mode WAMP avec serveur, comptes dédiés,
HTTPS et restrictions réseau après recette.

---

## 🚀 Déploiement sur Cloudflare

Deux méthodes de déploiement sont possibles selon votre choix :

### Option A — Cloudflare Pages (recommandé pour site statique)

1. Rendez-vous sur <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Sélectionnez ce dépôt Git.
3. Configurez les réglages de build :

   | Réglage                | Valeur          |
   |------------------------|-----------------|
   | Framework preset       | `Vite`          |
   | **Build command**      | `npm run build` |
   | **Build output directory** | `dist`      |

   > ⚠️ **Important :** Dans les réglages Cloudflare Pages, la commande de build doit être `npm run build` et **non** `wrangler deploy` ou `npm run deploy`. Cloudflare Pages publie automatiquement le dossier `dist`.

4. Cliquez sur **Save and Deploy**. Cloudflare fournit votre URL `*.pages.dev`.

### Option B — Cloudflare Workers (Static Assets / CLI)

Grâce à la configuration `wrangler.toml` avec `[assets]`, vous pouvez déployer directement en tant que Worker avec assets statiques :

```bash
npm install
npm run build
npx wrangler login
npx wrangler deploy
```

Ou pour un déploiement Pages direct en CLI :
```bash
npx wrangler pages deploy dist --project-name salfa-web-paie
```

---

## 🔧 Résolution de l'erreur `Workers-specific command in a Pages project`

Si vous avez rencontré l'erreur :
```text
✘ [ERROR] It looks like you've run a Workers-specific command in a Pages project.
For Pages, please run wrangler pages deploy instead.
```

Voici les causes et solutions :

1. **Sur Cloudflare Pages (Dashboard CI/CD) :**
   - **Cause :** La commande de build dans le tableau de bord Cloudflare Pages était définie sur `npm run deploy` ou `wrangler deploy`.
   - **Solution :** Allez dans **Cloudflare Dashboard** → **Workers & Pages** → Votre projet Pages → **Settings** → **Builds & deployments** → Modifiez **Build command** en `npm run build` et **Build output directory** en `dist`.

2. **En ligne de commande :**
   - **Solution Pages :** Lancez `npx wrangler pages deploy dist --project-name salfa-web-paie` (ou `npm run deploy:pages`).
   - **Solution Workers :** Le fichier `wrangler.toml` a été mis à jour avec `[assets] directory = "./dist"` et Wrangler a été mis à niveau vers la v4, ce qui permet à `wrangler deploy` de fonctionner directement.

---

## 🧑‍💻 Développement local

```bash
npm install
npm run dev            # Vite dev server (aucun backend requis)
npm run build          # build statique dans dist/
npm run preview        # prévisualise le build
```

---

## 🔐 Comptes par défaut & Droits d'accès

| Rôle           | Identifiant | Mot de passe   | Accès autorisé                                                      |
|----------------|-------------|----------------|---------------------------------------------------------------------|
| Administrateur | `admin`     | `admin123`     | **Accès complet** à toutes les fonctionnalités (Paie, États, Bulletins, Rapports, Administration & Congés) |
| Comptable      | `comptable` | `comptable123` | **Permissions & Congés uniquement** (fiches d'absence, visas, suivi et état de contrôle des congés) |

> 🔒 **Page de connexion :** ces identifiants ne sont **plus affichés sur la page
> de connexion** (aucune liste de comptes, aucun pré-remplissage, aucun exemple
> dans les champs), dans la version locale comme dans la version WAMP. En mode
> WAMP, seuls les comptes créés sur le serveur (`setup.php` / `CREER-COMPTE.php`)
> fonctionnent ; les comptes de démonstration ci-dessus n'y sont pas créés.

---

## 🗂️ Architecture

```
src/
  local/
    store.ts      # Store 100% navigateur (localStorage), données initiales embarquées
    calcul.ts     # Moteur de calcul de paie (IRSA, ancienneté, CNaPS…)
    hash.ts       # Hachage SHA-256 via Web Crypto (connexion)
    users.ts      # Comptes par défaut
  data/
    salfa_data.json  # Données initiales embarquées (au premier lancement)
  api.ts          # API locale : même interface que l'ancienne API REST, mais sans réseau
  components/…    # Interface React
```

---

## 👤 Liste de personnel et affichage des montants

Les fiches salariés peuvent être complétées depuis **`LISTE DE PERSONNEL.xlsx`** :
état civil, CIN, filiation, adresse, service d'affectation, diplôme, statut,
nature de contrat et informations professionnelles. Le rapprochement est
conservateur : seuls les champs vides sont remplis, les saisies existantes ne
sont pas écrasées et aucun montant de paie n'est modifié. Les personnes non
retrouvées et les divergences entre feuilles sont listées dans
**Administration → Liste de personnel**. Ces données personnelles sont masquées
au rôle Comptable.

Pour régénérer le rapprochement depuis le classeur :

```sh
npm run personnel:completer
```

L'affichage comptable est unifié : les montants sont **alignés à droite** et une
valeur nulle s'affiche **`-`** au lieu de `0,00`, dans les tableaux, bulletins,
contrats et exports Excel.

## 📥 Importer votre classeur Excel (ancien ou récent : personnel + états de paie)

L'application lit directement vos fichiers **`SALAIRE_SALFA_….xlsm` / `.xlsx` / `.xls` / `.xlsb` / `.csv`**
(100 % dans le navigateur, aucune donnée envoyée sur Internet) avec une **analyse préalable des colonnes** :

1. Connectez-vous en tant qu'**Administrateur**, puis ouvrez le menu **Administration ▾** (en haut à droite, avec *Déconnexion*).
2. Cliquez sur **« Importer Excel (Ancien / Récent) »**.
3. Déposez le classeur (ancien exercice ou classeur actuel).
4. **Onglet 1 — Analyse des champs** : inspectez comment chaque colonne du fichier est associée à sa rubrique SALFA (avec échantillons de valeurs, niveau de confiance et vérification arithmétique Base / Accessoires / Brut / Net), et réaffectez manuellement n'importe quelle colonne avant import si nécessaire.
5. **Onglet 2 — Feuilles & Périodes** : incluez/excluez chaque feuille et corrigez si besoin son type (Personnel / État mensuel), son mois ou son année (`1995..`).
6. Choisissez le mode :
   - **Fusionner** (avec option **Archive historique** activée automatiquement pour les années antérieures afin de conserver vos barèmes actuels et marquer les anciens salariés sortis en *Inactif*) ;
   - **Remplacer tout** : recharge tout depuis le fichier (les mois clôturés restent protégés).
7. Cliquez sur **Importer**.

Le lecteur reconnaît automatiquement :

- les feuilles de **personnel** (colonnes `MATRICULE` / `N° MAT`, `NOM ET PRENOMS`, `N° CNAPS`, `CAT`, `JOB`, `DATE EMB`, `BASE AJ`…) ;
- les feuilles d'**état mensuel** (le mois est lu dans le nom de la feuille ou dans le titre,
  p. ex. « PAIE JANVIER 2026 ») et toutes leurs colonnes : `BASE AJ`, `LOGT/TRSP`, `RENDEMENT`,
  `RESP/REPRES`, `SALAIRE BRUT`, `CNaPS`, `PATRONAL`, `SAL IMPOSABLE`, `IRSA`, `SALAIRE NET`,
  `AUGMENTATION DIVERS`, `PRIME DE GARDE`, `ANC 2`, `RISQUE`, `REPR/REC`, `ACCESSOIR`, `BRUT`,
  `AVANCE`, `MED`, `NET`, `VIREMENT`, `ESPECES`, `RAP` ;
- les lignes **TOTAL / TOTAUX** sont ignorées ;
- les montants écrits à la française (`1 234,56`) et les dates (`23/08/2024`, date Excel).

> Les données importées sont conservées dans le navigateur (localStorage).
> Les données sont propres à chaque navigateur ; exportez régulièrement une sauvegarde JSON.

---

## 📄 État de paie mensuel (onglet 2)

Reproduction du classeur Excel, en plein écran et imprimable :

- 32 colonnes regroupées en 5 blocs (Identification, Salaire de base, Cotisations & impôt,
  Accessoires, Retenues & règlement) + ligne **TOTAUX** ;
- sélecteur de période (les mois réellement présents dans l'application) ;
- recherche par matricule / nom / fonction ;
- **Impression A4 paysage en deux pages** : salaire de base et charges sur la première, accessoires et net sur la seconde ;
- **Export Excel** au même format ;
- les salariés actifs sans bulletin apparaissent avec un bouton **« Créer »**
  directement dans l'onglet *Salariés*.

---

## 📝 Contrats de travail

Réservé à l'**Administrateur**, dans **1. Salariés, Saisie & État de paie** :

- bouton **« Contrats de travail »** pour choisir un salarié (actif ou inactif) ;
- icône **contrat** sur chaque ligne de l'état de paie pour ouvrir directement le contrat du salarié ;
- préremplissage depuis la fiche : nom, fonction, classification, salaire de base et indemnité de rendement ;
- les champs absents de la fiche (état civil, CIN, service, nature/durée du contrat, lieux, date d'effet, signature…) restent à compléter dans l'éditeur ;
- les rubriques groupées **logement/transport** et **responsabilité/représentation** ne sont pas ventilées automatiquement vers les indemnités séparées du contrat ;
- aperçu du contrat, **impression A4 portrait**, export **PDF** et **Word (.docx)** ;
- un contrat incomplet reste signalé dans l’éditeur et par le nom du fichier exporté ; le document affiche **`-`** pour chaque information manquante, sans mention de projet ;
- les compléments saisis dans l'éditeur ne modifient ni la fiche salarié ni la paie et ne sont pas conservés après fermeture : téléchargez le contrat pour le garder.

Le modèle Word est dérivé de `CONTRAT DE TRAVAIL SALFA.docx` sans réécrire les clauses.
Pour le régénérer après modification du document source : `npm run contrat:modele`.
Vérification dédiée : `node scripts/test-contrat.cjs`.

---

## ✨ Fonctionnalités

- Authentification locale (`admin` / `comptable`)
- Gestion des salariés (fiches, matricules, ancienneté, congé maternité)
- **Import intelligent des classeurs Excel anciens et récents** (`.xlsx`, `.xlsm`, `.xls`, `.xlsb`, `.csv`) avec analyse préalable et placement interactif de chaque champ
- **État de paie mensuel** complet (32 colonnes + totaux), impression A4 en deux pages et export Excel
- **Saisie indépendante** des **Avances** d'un côté et des **Médicaments** de l'autre (saisie directe par volet ou saisie en lot dédiée, sans champs côte à côte), clôture et déverrouillage des mois
- Bulletins de paie (2 exemplaires, export PDF via jsPDF)
- **Contrats de travail** depuis la fiche salarié : édition des champs manquants, aperçu, impression A4 portrait, export PDF et Word (`.docx`) à partir du modèle fourni
- Rapports & comparaisons, exports Excel (xlsx) et JSON
- Conformité CGI Madagascar (IRSA) et calcul CNaPS

### Calcul de l’ancienneté

L’ancienneté augmente au **mois anniversaire de l’embauche**, et non en janvier.
Le jour d’embauche n’intervient pas dans ce calcul mensuel : une embauche le
15 décembre 2020 donne 5 ans de janvier à novembre 2026, puis 6 ans en décembre.
Le calcul utilise le mois et l’année du bulletin ; la fiche salarié utilise la
période courante. Le barème de revalorisation suit ce nombre d’années, mais reste
informatif : il ne remplace pas le montant saisi ou importé dans `anciennete2`.
Les données historiques importées explicitement et les bulletins verrouillés ne
sont pas recalculés automatiquement.

Les lignes dont l’ancienneté augmente au cours du mois affiché sont repérées
par un **bleu ciel soutenu**, avec un badge « Ancienneté +1 an ». Si l’indice du
barème change aussi, le badge indique **« Nouveau palier »**. Le calcul du repère
utilise la date d’embauche et la période affichée, pas la date du poste ni une
ancienneté historique importée. Il ne modifie aucun montant de paie. La sélection
d’une ligne reste ambre et le badge demeure visible.

Les en-têtes marqués **↕** permettent un tri croissant, puis décroissant, puis
le retour à l’ordre initial : état de paie, historique salarié, saisie en lot,
rapports et comparaisons, suivi des congés et fiches d’absence. Le tri utilise
les montants bruts et les dates réelles, sans modifier les données enregistrées.
L’état détaillé des congés trie les **blocs salariés** par identité, soldes annuels
ou soldes restants ; les lignes internes restent chronologiques. Les exports
Excel de l’état de paie et des rapports suivent le tri affiché.

Vérifications : `node scripts/test-anciennete.cjs` et
`node scripts/test-reperes-tri.cjs`.

## Données du classeur fourni

Les données initiales proviennent de `SALAIRE SALFA 2026.xlsm` : 48 salariés
présents dans **LISTE SALARIE**, deux salariés supplémentaires retrouvés uniquement
sur des états anciens (marqués inactifs), et 470 lignes des feuilles mensuelles de
janvier à octobre 2026. Les montants sont les valeurs enregistrées dans Excel,
sans recalcul. Les fiches utilisent les informations du dernier mois disponible.
Les feuilles annexes (SOCIAL, états anciens, primes…) ne sont pas utilisées comme
liste du personnel : certaines ont une numérotation différente des matricules.

**À vérifier :** la feuille nommée `OCTOBRE` porte encore le titre « SEPTEMBRE
2026 ». L'application la classe en octobre selon son nom ; confirmez la période
avant utilisation. Le titre de certaines autres feuilles indique 2025 alors que
leur mois indique 2026 ; c'est l'année associée au mois qui a été retenue.

Sur un navigateur ayant déjà des données, les salariés et lignes manquants sont
ajoutés une seule fois, sans remplacer les fiches et paies existantes et sans
compléter les mois verrouillés. Les données déjà enregistrées ne sont pas remplacées automatiquement ; exportez
une sauvegarde JSON avant toute opération de remplacement des données. Les valeurs de paie doivent être vérifiées
avant tout paiement. Pour régénérer les données embarquées à partir du classeur,
installer `openpyxl` puis exécuter `python scripts/extract_salfa.py`.

**Confidentialité :** les données embarquées dans le site statique peuvent être
consultées par toute personne ayant accès aux fichiers du site, indépendamment de
la connexion locale. Ne publiez pas cette version sur un site public sans mettre
en place un véritable contrôle d'accès côté serveur et protéger le classeur.

### Année et bulletins individuels

L'année de paie est commune aux onglets et vaut l'année en cours à l'ouverture.
Vous pouvez sélectionner un autre exercice sans écraser les paies des années
précédentes. L'initialisation reste **mensuelle** : elle crée uniquement les
bulletins de la période choisie, sans remplacer les bulletins existants.

L'aperçu, l'impression et le PDF individuel reprennent les rubriques de la feuille
`BULLETIN` du classeur (deux exemplaires A4 paysage). Comme dans cette feuille,
le net du bulletin correspond au total des gains moins les retenues. L'état de
paie mensuel peut contenir un net enregistré différent, notamment à cause de
l'arrondi : cet écart est indiqué sur le bulletin, sans modifier les données.
Les montants doivent être contrôlés avant paiement.

### Saisie en lot des avances et médicaments

Dans **Salariés & Saisie**, choisissez le mois et l'année, puis cliquez sur
**Saisie en lot AVANCE / MED**. Recherchez chaque salarié par nom ou matricule,
saisissez l'avance et/ou le montant médicament, puis ajoutez-le à la liste.
Vous pouvez modifier ou retirer une ligne avant **Enregistrer le lot**. Un champ
vide laisse l'ancien montant inchangé ; `0` le remet à zéro. Les montants saisis
remplacent les valeurs existantes, ils ne s'y additionnent pas.

La saisie porte uniquement sur les bulletins déjà créés du mois sélectionné.
Un salarié sans bulletin est signalé dans la recherche : créez son bulletin
ou initialisez le mois avant de saisir. Une période clôturée doit d'abord être
déverrouillée. À la validation, le net est recalculé depuis le brut déjà
présent et l'arrondi configuré, sans recalculer les gains ou les cotisations
importés ; la ventilation existante entre espèces et virement est conservée
lorsqu'elle est connue. Vérifiez les montants et les règlements avant paiement.

### Entête et reliure des bulletins

Dans **Bulletins**, le bouton **Entête** permet de remplacer l'image complète ou
bien de personnaliser séparément les sept lignes de texte et les deux logos.
Choisissez des images PNG ou JPEG de 1 Mo maximum, puis cliquez sur **Enregistrer**.
Le bouton **Restaurer l'entête fourni** remet le modèle d'origine dans l'éditeur ;
il faut ensuite l'enregistrer. Chaque mode conserve ses réglages lors du passage
à l'autre. L'entête est stocké dans le navigateur de cet appareil : il n'est pas
inclus dans les sauvegardes JSON des paies et doit être reconfiguré sur un autre
navigateur ou après effacement des données locales.

Cet entête s'applique à l'aperçu, à l'impression et aux PDF, individuels ou en
lot. Les pages de bulletins conservent deux exemplaires en A4 paysage avec une
marge de reliure de 3 cm à gauche. Pour l'impression depuis le navigateur, gardez
le format A4 paysage et l'échelle 100 % / par défaut (sans marges supplémentaires
ni ajustement automatique), afin de préserver cette marge. La page de couverture
et les états de paie ne sont pas modifiés.

### Gestion des congés, permissions et fiches d'absence (onglet 5)

Accessible au **Comptable** (et à l'Administrateur), l'onglet **5. Congés & Permissions**
reprend fidèlement :

- la **`FICHE D'ABSENCE 2026.docx`** (libellés malgaches, motifs 1* à 5* et droits du
  *Fitsipika Anatiny* : permissions de 10 j/an, congés de 30 j/an plafonnés à 90 j,
  examens médicaux sur justificatif médical, soldes *sisa ambiny* / *Titre-Année* /
  *sisa tavela*, et circuit de visas *Ny mpangataka → Chef de Service → Médecin Chef → Gestionnaire*) ;
- la **règle de consommation FIFO** : chaque exercice ouvre au maximum 30 jours; un congé
  validé est imputé **d'abord sur l'ancien solde** (exercices antérieurs non prescrits),
  puis sur l'exercice suivant quand celui-ci est épuisé. Ex. soldes 2024 = 0, 2025 = 27,
  2026 = 30 j et un congé de 20 j en novembre 2026 : 2025 passe à 7 j et 2026 reste à 30 j
  (titre actif = 2025, cumul restant = 37 j) ;
- la **portée de l'exercice** : un état porte sur les 3 derniers exercices
  (`anneesSuccessives`) et ne tient compte que des fiches **de son année ou antérieures**.
  Une fiche validée sur un exercice futur (ex. 2027 saisi dès 2026) ne modifie donc pas
  l'état 2026 : elle s'impute à partir de 2027 et son imputation reste FIFO sur l'historique
  du salarié (un reliquat 2024 non prescrit est consommé avant 2025). Ajouter l'année 2027
  ne provoque aucune erreur de calcul ; la fenêtre affichée devient 2025-2027 et 2024
  sort simplement de l'état 2027 ;
- le **`CONTROLE CONGE A JOUR SALFA 2026.xlsx`** contient les soldes restants par salarié
  pour **2024, 2025 et 2026** (43 salariés; les cellules vides valent 0). Le SQL WAMP
  (**`wamp/sql/salfa_conges_excel.sql`**, régénérable via `npm run sql:conges`) importe
  ces 129 soldes comme ajustements d'ouverture et conserve 83 fiches historiques pour
  d'anciens salariés. Le classeur 2026 ne contient pas les dates des congés; l'ancien
  classeur détaillé `.xlsb` reste accepté par le lecteur historique. L'import SQL dédié
  ne supprime pas les bulletins de paie existants.

