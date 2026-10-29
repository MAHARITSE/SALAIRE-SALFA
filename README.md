# Clinique SALFA TANAMBAO — Logiciel de Paie Mensuelle

> **Variante réseau WAMP / MySQL :** voir [wamp/GUIDE-WAMP.md](wamp/GUIDE-WAMP.md). Elle démarre avec une base vide, ou chargée des données Excel en important [wamp/sql/salfa_donnees_excel_2022-2026.sql](wamp/sql/salfa_donnees_excel_2022-2026.sql) dans MySQL (phpMyAdmin), et reste à valider sur Windows avant toute utilisation réelle. La description ci-dessous concerne la version locale dans le navigateur.

Application **100 % locale** (client-side / React + Vite + TypeScript), déployable en tant que
**site statique** sur **Cloudflare Pages**. Il n'y a **plus aucun serveur Node/Express ni base
de données distante** : toutes les données sont stockées dans le `localStorage` du navigateur,
initialisées à partir du fichier embarqué `src/data/salfa_data.json`.

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

## ✨ Fonctionnalités

- Authentification locale (`admin` / `comptable`)
- Gestion des salariés (fiches, matricules, ancienneté, congé maternité)
- **Import intelligent des classeurs Excel anciens et récents** (`.xlsx`, `.xlsm`, `.xls`, `.xlsb`, `.csv`) avec analyse préalable et placement interactif de chaque champ
- **État de paie mensuel** complet (32 colonnes + totaux), impression A4 en deux pages et export Excel
- **Saisie indépendante** des **Avances** d'un côté et des **Médicaments** de l'autre (saisie directe par volet ou saisie en lot dédiée, sans champs côte à côte), clôture et déverrouillage des mois
- Bulletins de paie (2 exemplaires, export PDF via jsPDF)
- Rapports & comparaisons, exports Excel (xlsx) et JSON
- Conformité CGI Madagascar (IRSA) et calcul CNaPS

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
- le **`CONTRÔLE DES CONGÉS ET PERMISSIONS`** (`CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb`) :
  consommation chronologique par **Titre / Année**, état multi-années consultable à l'écran,
  imprimable en A4 paysage, téléchargeable en **PDF** et exportable en **Excel (`.xlsx`)**,
  ainsi que l'import direct d'un contrôle **`.xlsb` / `.xlsx`**.

