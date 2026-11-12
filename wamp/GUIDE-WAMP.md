# Version WampServer / MySQL — installation sur réseau local

Cette variante est distincte de la version navigateur. Les salariés et les paies
sont enregistrés dans MySQL sur le serveur, pas dans le localStorage des postes.
Les paramètres de calcul et l'entête des bulletins sont aussi communs et
stockés dans MySQL. Au choix, elle peut démarrer :

- avec une **base de paie vide** (comportement historique, via `setup.php`) ;
- ou **chargée avec les données des classeurs Excel** en important le fichier
  SQL fourni `wamp/sql/salfa_donnees_excel_2022-2026.sql` (voir § 2 ci-dessous) :
  70 salariés et 2 390 lignes de paie (années 2022 à 2026), 48 comparaisons
  de net et 489 fiches d'absence/congés.

Les données préexistantes de la version navigateur ne sont ni effacées ni
importées automatiquement. L'export JSON de l'onglet Rapports est un export de
la vue courante, pas une sauvegarde complète de la base.

**Page de connexion :** elle n'affiche plus aucune indication d'utilisateur ou
de mot de passe (ni liste de comptes, ni identifiant pré-rempli, ni exemple).
Chaque utilisateur saisit les identifiants du compte créé sur le serveur.

## Sécurité et limites importantes

- L'installation décrite ci-dessous ouvre un accès sur le réseau local. **HTTP
  ne chiffre ni les mots de passe ni les données de paie.** Avant une utilisation
  réelle, configurer HTTPS avec un certificat approuvé sur tous les postes,
  limiter Apache et le pare-feu au réseau autorisé et faire vérifier la sécurité
  et les sauvegardes par un administrateur. Ne pas exposer à Internet.
- L'API exige une session, un jeton CSRF et un compte créé sur le serveur.
- Version finale : la page de connexion ne présente aucun compte de démonstration. Le panneau et ses accès locaux sont exclus du JavaScript WAMP (`npm run test:wamp-build` pour le contrôler).
- Présence de session : mécanisme CAISSE-SALFA, délai réglé à une heure : contact par onglet toutes les 15 secondes, expiration après 1 heure sans contact. Une session récente est reprise au rechargement ; une panne réseau n'est pas assimilée à une déconnexion confirmée. Voir [les règles et tests](../docs/SESSION-ET-RECHERCHE.md).
  L'ouverture des périodes verrouillées et la modification des paramètres sont
  réservées à l'administrateur. Cette version doit toutefois être considérée
  comme un **prototype à valider** : les calculs et une partie des contrôles
  métier restent exécutés dans le navigateur, et une personne authentifiée
  capable de fabriquer des requêtes peut modifier les données non verrouillées.
  Ne pas l'utiliser pour la paie réelle sans audit et validation préalable.
- Les changements utilisent une révision globale dans une transaction MySQL :
  si un autre poste écrit entre la lecture et la sauvegarde, l'écriture est
  refusée. Rechargez la page et revérifiez les valeurs avant de recommencer.
  Si une coupure survient pendant l'écriture, le résultat peut être incertain :
  rechargez et vérifiez avant de refaire l'opération.
- Les sauvegardes SQL contiennent des données très confidentielles et les
  empreintes des mots de passe. Chiffrez-les et limitez leur accès.

## Mise à jour du paquet prêt à copier

Les fichiers `wamp/Salaire_salfa` et `wamp/Salaire_salfa.zip` sont régénérés par
`npm run package:wamp` (compilation, contrôle du bundle, copie de l’API complète,
création et vérification du ZIP). Voir
[COPIER-DANS-WWW.md](COPIER-DANS-WWW.md#mise-à-jour-du-12-novembre-2026) pour mettre
à jour une installation existante **sans réimporter de SQL ni effacer la base,
la configuration ou les sauvegardes**. Le paquet ne contient aucun secret MySQL.

## 1. Sur l'ordinateur serveur

1. Installer WampServer 64 bits dans `C:\wamp64`, avec Apache, PHP 8.1 ou plus
   récent et MySQL (ou MariaDB compatible InnoDB). Activer `pdo_mysql` et
   `mbstring` si nécessaire. Démarrer WampServer et vérifier Apache et MySQL.
2. Installer Node.js LTS et npm sur le serveur, puis copier le projet complet
   sur cet ordinateur, hors de `www`. Double-cliquer sur
   `wamp\INSTALLER-SERVEUR.bat` : il installe les dépendances, compile le site
   spécifique WAMP et copie le site et l'API dans **`C:\wamp64\www\Salaire_salfa`**.
   Le dossier `Salaire_salfa` doit alors contenir `index.html`, `assets` et
   `api`. Le script ne crée pas la base et ne démarre pas WampServer.
   **Ne copiez jamais le contenu du dossier `wamp\` dans `www`** : ce sont les
   fichiers sources d'installation (`.bat`, `.php`, guide…), pas l'application.
   Si le navigateur affiche « Index of /… » avec la liste de ces fichiers,
   c'est que cette erreur a été faite : voir le dépannage plus bas.
   **Sans Node.js sur le serveur** (ou si le `.bat` échoue, par exemple lancé
   depuis un partage réseau `\\tsclient\…` que CMD ne peut pas utiliser) :
   copiez directement le dossier prêt à l'emploi **`wamp\Salaire_salfa`**
   (application déjà compilée + `api`) dans `C:\wamp64\www\`, ou décompressez
   `wamp\Salaire_salfa.zip` dans `C:\wamp64\www\` — voir
   `wamp/COPIER-DANS-WWW.md` — puis passez à l'étape 3.
3. Dans phpMyAdmin, créer une base vide `salfa_paie` en `utf8mb4` et un compte
   MySQL dédié, limité à cette base, avec les droits nécessaires (`CREATE`,
   `SELECT`, `INSERT`, `UPDATE`). Utiliser un mot de passe fort. Ne pas ouvrir
   le port MySQL aux postes clients : seul PHP sur le serveur y accède.
4. Copier `wamp\config.example.php` en **`C:\wamp64\salfa-config.php`**,
   hors du dossier `www`, puis renseigner hôte `127.0.0.1`, port MySQL, nom de
   base, utilisateur et mot de passe. Protéger ce fichier avec les droits NTFS.
   Ne jamais le publier, le copier dans `www` ou le transmettre aux postes.
5. Dans une invite de commandes sur le serveur, exécuter `setup.php` avec le
   `php.exe` fourni par WampServer. Adapter le nom exact du dossier PHP :

   ```bat
   "C:\wamp64\bin\php\php8.x.x\php.exe" "C:\CHEMIN\DU\PROJET\wamp\setup.php" "C:\wamp64\salfa-config.php"
   ```

   Le programme crée les tables (sans écraser des données déjà importées par
   le fichier SQL du § 2) et un premier compte administrateur. Choisir
   un identifiant et un mot de passe d'au moins 12 caractères. **La saisie du
   mot de passe est visible dans cette console**. Si des comptes existent déjà,
   relancer le programme ne modifie ni les données ni les comptes. À la fin,
   il indique le nombre de salariés et de lignes de paie présents dans la base.
6. Créer des comptes supplémentaires au besoin, depuis le serveur uniquement :

   ```bat
   "C:\wamp64\bin\php\php8.x.x\php.exe" "C:\CHEMIN\DU\PROJET\wamp\CREER-COMPTE.php" "C:\wamp64\salfa-config.php"
   ```

   Choisir `Administrateur` ou `Comptable`. Ne pas utiliser les anciens comptes
   de démonstration : ils ne sont pas créés dans la version WAMP.
7. Configurer Apache pour autoriser uniquement les adresses IP du réseau de
   confiance, puis ouvrir le port web correspondant dans le pare-feu Windows
   uniquement pour ce réseau. Les configurations WampServer courantes utilisent
   `Require local` par défaut ; elles doivent être adaptées explicitement par
   l'administrateur. Configurer HTTPS avant d'utiliser de vraies données.
8. Depuis le serveur, ouvrir `http://127.0.0.1/Salaire_salfa/` pour vérifier
   l'accès, puis tester depuis un poste autorisé. L'API de diagnostic
   `/Salaire_salfa/api/index.php?action=health` ne renvoie que l'identité du service.

## 2. Importer les données Excel dans MySQL (fichiers SQL)

Deux scripts SQL prêts à l'emploi sont fournis dans **`wamp/sql/`** :

### 2.1 Import complet (Salaires 2022–2026 + Congés & Permissions)

Le fichier **`wamp/sql/salfa_donnees_excel_2022-2026.sql`** crée et alimente
toutes les **tables relationnelles MySQL** en colonnes et lignes (aucun stockage
JSON dans MySQL) à partir des classeurs de paie `SALAIRE SALFA 2022.xlsx` à
`SALAIRE SALFA 2026.xlsm` et du dernier relevé de soldes
`CONTROLE CONGE A JOUR SALFA 2026.xlsx` :

- **`salfa_users`** : comptes par défaut inclus (`admin` / `admin123` en
  *Administrateur*, `comptable` / `comptable123` en *Comptable*, via `INSERT IGNORE`).
- **`salfa_employes`** : **70 salariés** (50 salariés 2026 + 20 archivés 2022–2025).
- **`salfa_paies`** : **2 390 bulletins mensuels** (2022 : 558, 2023 : 576,
  2024 : 556, 2025 : 230, 2026 : 470).
- **`salfa_conges`** : **212 lignes** — 129 soldes restants annuels (43 salariés ×
  2024–2026; cases vides = 0), plus 83 fiches historiques d'anciens salariés.
  Le relevé 2026 ne contient pas les dates des demandes : il fournit les soldes annuels.
- **`salfa_comparaison_net`** : **48 lignes** de comparaison des salaires nets.
- **`salfa_config`**, **`salfa_bareme_anciennete`**, **`salfa_bareme_irsa`**,
  **`salfa_entete`**, **`salfa_revision`** : paramètres et barèmes en colonnes et lignes.
- Supprime automatiquement l'ancienne table JSON `salfa_state` si elle existait.

Il est régénérable après une nouvelle extraction des classeurs avec
`node scripts/generer_sql_conges_wamp.cjs && python3 scripts/generer_sql_wamp.py`.

Import, au choix :

- **phpMyAdmin :** démarrer WampServer → ouvrir phpMyAdmin → sélectionner la
  base `salfa_paie` → onglet **Importer** → choisir
  `wamp\sql\salfa_donnees_excel_2022-2026.sql` → **Exécuter**.
- **Ligne de commande (sur le serveur) :**
  `mysql -u root -p salfa_paie < wamp\sql\salfa_donnees_excel_2022-2026.sql`

### 2.2 Import dédié des Congés & Permissions seuls (`salfa_conges_excel.sql`)

Si votre base `salfa_paie` contient déjà vos bulletins de paie (`salfa_paies`),
vos paramètres ou vos en-têtes personnalisés et que vous souhaitez **uniquement
importer ou mettre à jour les congés** depuis
`CONTROLE CONGE A JOUR SALFA 2026.xlsx`, utilisez le fichier dédié :

- **`wamp/sql/salfa_conges_excel.sql`** : **212 lignes** dans `salfa_conges`, dont
  **129 soldes restants annuels** (43 salariés × 2024–2026; cases vides = 0) et
  **83 fiches historiques** (anciens salariés, années 2021–2026). Les soldes sont
  enregistrés comme ajustements d'ouverture afin que l'état affiche les chiffres
  du classeur; celui-ci ne fournit pas les dates détaillées des congés.

Garanties de ce fichier :

- **100 % relationnel (colonnes et lignes)** : aucun stockage JSON dans MySQL ;
  supprime également toute ancienne table `salfa_state` si présente.
- **Inclut les utilisateurs par défaut** dans `salfa_users` (`admin` / `admin123`
  et `comptable` / `comptable123` via `INSERT IGNORE`).
- **Ne supprime ni n'écrase jamais** vos bulletins de paie (`salfa_paies`), vos
  comparaisons (`salfa_comparaison_net`), vos paramètres (`salfa_config`), votre
  en-tête de bulletin (`salfa_entete`) ni vos comptes utilisateurs existants.
- Rattache chaque ligne au bon salarié via son **numéro de matricule** (`INNER
  JOIN salfa_employes`) et ajoute uniquement les éventuelles fiches salariés
  manquantes (ex. anciens salariés 2022–2025).
- Incrémente automatiquement `salfa_revision.revision` afin que les postes
  connectés rechargent les congés mis à jour.

Import, au choix :

- **phpMyAdmin :** sélectionner la base `salfa_paie` → onglet **Importer** →
  choisir `wamp\sql\salfa_conges_excel.sql` → **Exécuter**.
- **Ligne de commande :**
  `mysql -u root -p --default-character-set=utf8mb4 salfa_paie < wamp\sql\salfa_conges_excel.sql`

Pour régénérer ce fichier SQL après une mise à jour du relevé annuel :

```bash
npm run sql:conges
# Par défaut, lit CONTROLE CONGE A JOUR SALFA 2026.xlsx.
# L'ancien classeur détaillé .xlsb reste lisible avec un chemin explicite :
node scripts/generer_sql_conges_wamp.cjs "CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb"
```

Le relevé annuel remplace les précédentes lignes issues de l'import Excel, mais
les saisies manuelles restent conservées.

### 2.3 Règle de consommation des congés (version du 4 novembre 2026)

Un congé validé est imputé **d'abord sur l'ancien solde** (exercices antérieurs
non prescrits), puis sur l'exercice suivant quand celui-ci est épuisé. Exemple
avec les soldes 2024 = 0 j, 2025 = 27 j, 2026 = 30 j et une fiche de 20 jours en
novembre 2026 : **2025 passe à 7 j et 2026 reste à 30 j** (titre actif = 2025,
cumul restant = 37 j).

Chaque état porte sur les 3 derniers exercices et n'intègre que les fiches de son
année ou antérieures : une fiche saisie sur un exercice futur (par exemple 2027)
ne modifie pas les soldes de l'année en cours, et l'imputation FIFO remonte
l'historique complet du salarié (un reliquat 2024 est consommé avant 2025).
Ajouter l'année 2027 dans l'application ne provoque donc aucune erreur : la
fenêtre affichée devient 2025-2027 et 2024 sort simplement de l'état 2027.

Cette règle est calculée **par l'application** (le navigateur), pas par MySQL :
**aucun import SQL n'est nécessaire** pour en bénéficier. Après avoir copié le
nouveau dossier `Salaire_salfa`, actualisez le navigateur avec **Ctrl+F5**.

## 3. Sur chaque poste client Windows

Copier `LANCER.bat` **et** `chercher-serveur.ps1` dans un même dossier puis
lancer `LANCER.bat`. Il vérifie l'adresse mémorisée et l'ordinateur local, puis
sonde le port HTTP 80 du sous-réseau IPv4 `/24` de chaque carte privée. Si
plusieurs serveurs répondent, choisissez-en un ; sinon entrez l'adresse complète
à la demande. La détection ne couvre pas les autres sous-réseaux, les ports
personnalisés ou HTTPS : dans ces cas saisir manuellement une adresse comme
`https://serveur.exemple:443/Salaire_salfa/`. Le poste et le serveur doivent pouvoir se
joindre ; WampServer ne démarre pas sur un poste client. L'adresse retenue est
stockée dans `serveur.local.txt` à côté du BAT. Supprimer ce fichier pour
rechercher à nouveau. Le certificat HTTPS doit déjà être approuvé par Windows.

## Dépannage : « Index of /Salaire_salfa/ » au lieu de l'application

Si le navigateur affiche une liste de fichiers (`CREER-COMPTE.php`,
`GUIDE-WAMP.md`, `INSTALLER-SERVEUR.bat`, `setup.php`…) au lieu de la page de
connexion, Apache ne trouve pas de `index.html` : le contenu du dossier
`wamp\` du projet a été copié dans `www`, au lieu de l'application compilée.
Pour corriger, sur le serveur :

1. Supprimer le dossier copié par erreur dans `C:\wamp64\www` (l'ancien
   `C:\wamp64\www\salfa` et/ou `C:\wamp64\www\Salaire_salfa` s'il contient ces
   fichiers sources). La configuration `C:\wamp64\salfa-config.php` et la base
   MySQL sont ailleurs et ne sont pas touchées.
2. Mettre l'application compilée en place, au choix :
   - copier le dossier prêt à l'emploi `wamp\Salaire_salfa` du projet dans
     `C:\wamp64\www\` (ou décompresser `wamp\Salaire_salfa.zip` dans
     `C:\wamp64\www\`) — aucun Node.js requis ;
   - ou, depuis le dossier du projet **sur un disque local** (pas un partage
     `\\tsclient\…`), double-cliquer sur `wamp\INSTALLER-SERVEUR.bat` et le
     laisser terminer : il compile l'application et la copie dans
     `C:\wamp64\www\Salaire_salfa`, puis affiche l'adresse à ouvrir.
3. Vérifier que `C:\wamp64\www\Salaire_salfa` contient `index.html`, `assets`
   et `api` (et rien d'autre).
4. Ouvrir `http://127.0.0.1/Salaire_salfa/`. Si la page de connexion s'affiche
   mais annonce un serveur non configuré ou une base indisponible, reprendre
   les étapes 3 à 5 du § 1 (fichier `salfa-config.php`, `setup.php`, import
   éventuel du SQL).
5. Sur les postes clients, supprimer l'ancien `serveur.local.txt` à côté de
   `LANCER.bat` (il peut encore pointer sur `/salfa/`), puis relancer
   `LANCER.bat`.

## Sauvegarde et restauration

Effectuer régulièrement une sauvegarde MySQL complète sur le serveur avec
`mysqldump --single-transaction -u salfa_app -p salfa_paie` et rediriger la
sortie vers un emplacement protégé ; l'option `-p` demande le mot de passe sans
l'inscrire dans la commande. Conserver plusieurs copies chiffrées hors du
serveur et tester la restauration sur une base séparée avant toute opération
sur la base réelle. Sauvegarder également le fichier de configuration hors
`www` dans un coffre approprié. Une restauration écrase la base cible : arrêter
les accès des utilisateurs et vérifier la cible avant de la lancer.

## Validation de cette version

Les builds et les contrôles côté navigateur ont été exécutés dans un environnement
Linux avec un serveur simulé ; la syntaxe PHP a été vérifiée. Le fonctionnement
avec **WampServer, Apache, MySQL et les fichiers BAT sous Windows n'a pas encore
été testé de bout en bout**. Le fichier SQL a été vérifié par aller-retour
(reconstruction du JSON et comparaison aux données extraites du classeur),
mais son import n'a pas été exécuté sur un MySQL Windows. Procéder à une
recette sur une base de test avant toute utilisation réelle : import du SQL,
connexion (sans aucune indication d'identifiant sur la page), création de
salarié, saisie, export, conflit entre deux postes, sauvegarde/restauration
et indisponibilité du serveur.

## Administration : sauvegarder et restaurer SQL

L’entrée « Importer Excel » est remplacée par **Sauvegarde et restauration SQL**.
Le téléchargement exporte la base relationnelle et la conserve aussi sur le
serveur si le dossier de sauvegardes est accessible en écriture. L’historique
permet de récupérer les sauvegardes serveur.

Pour restaurer, utiliser uniquement un export **complet SALFA**, `.sql` non vide,
10 Mo maximum. Cochez l’accord de remplacement puis saisissez `RESTAURER`.
Prévenez les autres utilisateurs et arrêtez les saisies avant cette opération.
Les données de paie, les périodes clôturées, les congés, les paramètres et les
en-têtes sont remplacés. Les utilisateurs et mots de passe actuels restent
inchangés ; la restauration ne crée pas les comptes d’un autre serveur.

Le serveur exige une session Administrateur et le jeton CSRF. Il verrouille la
révision et refuse un état périmé (409). Une sauvegarde de sécurité doit être
effectivement enregistrée sur disque avant les modifications. Les instructions
du fichier ne sont jamais exécutées directement : seuls les littéraux des
INSERT sur les tables SALFA autorisées sont réinsérés via PDO préparé. DDL,
changement de base et paramètres SQL du fichier ne sont pas exécutés. Les scripts
arbitraires, fichiers tronqués/partiels et colonnes incompatibles sont refusés.
Une erreur annule la transaction. Après succès, cliquez sur **Recharger
l’application** ; les autres postes doivent également recharger.

Tests sans serveur MySQL : `php wamp/test-sql-restore.php` (parseur et écritures
préparées/rollback via PDO SQLite) et `php wamp/test-validation.php`.
Une recette sur WAMP/MySQL réel reste nécessaire avant usage en production.
