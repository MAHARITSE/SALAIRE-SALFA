# Application prête à copier (sans Node.js)

Le dossier **`wamp/Salaire_salfa/`** contient l'application **déjà compilée**
(`index.html` + `assets/`) et l'API (`api/index.php`, `api/validation.php`).
Aucun Node.js / npm n'est nécessaire sur le serveur.

## Installation sur le serveur WampServer

1. Démarrer WampServer (icône verte).
2. Copier le dossier **`Salaire_salfa`** (celui qui contient `index.html`)
   dans **`C:\wamp64\www\`** → on obtient `C:\wamp64\www\Salaire_salfa\index.html`.
   - Variante : décompresser **`wamp/Salaire_salfa.zip`** dans `C:\wamp64\www\`.
   - Si un dossier `C:\wamp64\www\salfa` ou `C:\wamp64\www\Salaire_salfa`
     affiche une liste de fichiers (« Index of »), le supprimer d'abord :
     il contient les fichiers sources, pas l'application.
3. Ouvrir **http://127.0.0.1/Salaire_salfa/** :
   - Sur un WampServer standard (`MySQL 127.0.0.1`, port `3306`/`3307`/`3308`, utilisateur `root` sans mot de passe), l'API crée **automatiquement** la base `salfa_paie`, le fichier `C:\wamp64\salfa-config.php` (hors `www`), les tables MySQL et les comptes initiaux :
     - **Administrateur** : `admin` / `admin123`
     - **Comptable** : `comptable` / `comptable123`
   - Si votre MySQL WampServer utilise un mot de passe personnalisé, un formulaire **Configuration MySQL WampServer** s'affiche directement dans la fenêtre de connexion pour l'enregistrer en un clic.
4. Importer les données historiques dans phpMyAdmin (base `salfa_paie`, onglet *Importer*) :
   - `wamp/sql/salfa_donnees_excel_2022-2026.sql` (base complète : 70 salariés + paies 2022–2026 + 129 soldes annuels 2024–2026 + 83 fiches historiques). **Tous les bulletins fournis sont déjà clôturés à l’import** (`verrouille = 1` : 2 390 bulletins, 51 mois, toutes années confondues), **ou**
   - `wamp/sql/salfa_conges_excel.sql` (soldes annuels + historique de congés seuls, sans écraser les paies existantes).

Le SQL complet est un **import initial qui remplace les données des tables métier**,
pas un simple script de clôture d’une base existante. Sauvegardez votre base avant
son import ; ne le réimportez pas sur une base de travail pour seulement clôturer
les mois, car les saisies postérieures seraient remplacées. Les montants du fichier
fourni restent inchangés. Le SQL dédié aux congés ne touche pas au statut des paies.
Les futurs mois créés dans l’application restent ouverts jusqu’à leur clôture normale.

Ne copiez dans `www` **que** le dossier `Salaire_salfa` prêt à l'emploi :
jamais le dossier `wamp\` complet, ni le fichier SQL, ni `salfa-config.php`.

## Mise à jour du 6 novembre 2026

Le dossier `Salaire_salfa` et son ZIP prêts à copier incluent désormais les corrections de la partie Congés :

- la fiche de congé / permission affiche uniquement **Annuler** et **Enregistrer** ; le bouton **Enregistrer** sauvegarde, valide et lance l’impression de la fiche ;
- l’impression des fiches d’absence et de permission conserve le format d’origine, avec un saut de page uniquement entre les fiches (aucune page blanche après la dernière).

Aucune modification SQL ni réimportation n’est nécessaire. Pour mettre à jour une installation existante, remplacez les fichiers de l’application comme décrit ci-dessous, conservez la base MySQL et la configuration, puis actualisez avec **Ctrl+F5**.

## Mise à jour du 4 novembre 2026

Le dossier et le ZIP prêts à copier incluent désormais :

- les **congés** : un congé validé se déduit **d'abord de l'ancien solde**, puis
  de l'exercice suivant quand celui-ci est épuisé. Avec les soldes 2024 = 0 j,
  2025 = 27 j, 2026 = 30 j, une fiche de 20 jours en novembre 2026 donne
  **2025 = 7 j** et **2026 = 30 j** (titre actif 2025, cumul restant 37 j) ;
- le **titre actif** affiché est le reliquat le plus ancien encore disponible et
  les colonnes « Cumul (3 ans) » / « Congé Restant » totalisent les exercices
  successifs (plafond inchangé : 30 j par exercice) ;
- les libellés de l'écran Congés & Permissions, de l'état et de la fiche
  d'absence reprennent cette règle ;
- **exercice futur** : un état ne tient compte que des fiches de son année ou
  antérieures. Une fiche 2027 validée ne modifie donc pas les soldes 2026, et son
  imputation remonte l'historique du salarié (reliquat 2024 consommé avant 2025).
  Passer l'application en 2027 ne provoque aucune erreur : la fenêtre devient
  2025-2027 et 2024 sort de l'état 2027.

Aucune réimportation SQL n'est nécessaire : la règle est appliquée par
l'application. Copiez le nouveau dossier (ou décompressez le ZIP), puis
actualisez avec **Ctrl+F5**. Les soldes et fiches déjà saisis dans MySQL sont
conservés.

## Mise à jour du 2 novembre 2026

Le dossier et le ZIP prêts à copier incluent désormais :

- les corrections du contrat : la signature utilise la place disponible à l'impression et les balises HTML ne s'affichent plus dans le PDF ;
- les boutons **Imprimer, PDF et Word** des contrats visibles en haut sur ordinateur et mobile, avec leurs menus corrigés ;
- les **contrats de travail** : depuis l'onglet *Salariés, Saisie & État de paie*,
  l'administrateur peut ouvrir un contrat prérempli depuis la fiche salarié,
  compléter les champs manquants, l'imprimer en A4 portrait ou l'exporter en
  PDF / Word. Les informations manquantes affichent **`-`** dans l'aperçu et les
  exports ; les contrats incomplets restent signalés dans l’éditeur et le nom du fichier ;
- le complément des fiches salariés depuis **LISTE DE PERSONNEL.xlsx** via
  **Administration → Liste de personnel**. Les colonnes MySQL manquantes sont
  ajoutées automatiquement au démarrage ; aucune réimportation SQL n'est
  nécessaire. Les données personnelles sont masquées au rôle Comptable ;
- l'affichage comptable unifié : montants **alignés à droite** et zéro affiché
  **`-`** au lieu de `0,00` (tableaux, bulletins, contrats, exports Excel).

## Mise à jour du 31 octobre 2026

Le dossier et le ZIP prêts à copier incluent désormais :

- la pagination du livret s’arrête sur la **dernière fiche de décharge**, sans
  saut de page forcé après celle-ci ; la page blanche de reliure **avant** la
  décharge est conservée ;
- l’ancienneté calculée au **mois anniversaire** de l’embauche ;
- un **bleu ciel soutenu** sur les lignes des salariés atteignant leur anniversaire
  d’ancienneté pendant le mois affiché, avec un badge **« Nouveau palier »** lorsque
  l’indice du barème change (aucune prime n’est modifiée automatiquement) ;
- le **tri par clic sur les en-têtes ↕** dans les tableaux de paie, historique,
  saisie en lot, rapports/comparaisons et suivi des congés : croissant, décroissant,
  puis retour à l’ordre initial. Dans l’état détaillé des congés, les blocs salariés
  sont triables sans déplacer leurs lignes chronologiques internes.

Aucune migration ni réimportation SQL n’est nécessaire. Les bulletins verrouillés
et les montants existants sont conservés.

## Mettre à jour une installation existante

1. Faire une sauvegarde de la base MySQL et conserver le fichier de configuration
   existant (normalement `C:\wamp64\salfa-config.php`).
2. Copier le contenu du dossier `wamp\Salaire_salfa\` mis à jour dans
   `C:\wamp64\www\Salaire_salfa\`, en acceptant le remplacement des fichiers.
   On peut aussi extraire `wamp\Salaire_salfa.zip` dans un dossier temporaire
   puis copier le contenu de `Salaire_salfa` au même endroit.
3. Ne pas réimporter les fichiers SQL et ne pas relancer l'installation initiale :
   ces opérations ne sont pas nécessaires pour une mise à jour de l'application.
   Actualiser ensuite le navigateur avec **Ctrl+F5**.

La base MySQL et la configuration du serveur ne sont pas contenues dans le ZIP.

## Régénérer le dossier après une modification du code (poste de développement)

```bat
npx vite build --mode wamp
xcopy /E /I /Y dist\* wamp\Salaire_salfa\
xcopy /E /I /Y wamp\api\* wamp\Salaire_salfa\api\
```

(ou relancer `wamp/INSTALLER-SERVEUR.bat` sur un poste où Node.js est installé :
il déploie directement dans `C:\wamp64\www\Salaire_salfa`.)
