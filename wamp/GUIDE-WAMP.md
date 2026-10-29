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

## 1. Sur l'ordinateur serveur

1. Installer WampServer 64 bits dans `C:\wamp64`, avec Apache, PHP 8.1 ou plus
   récent et MySQL (ou MariaDB compatible InnoDB). Activer `pdo_mysql` et
   `mbstring` si nécessaire. Démarrer WampServer et vérifier Apache et MySQL.
2. Installer Node.js LTS et npm sur le serveur, puis copier le projet complet
   sur cet ordinateur, hors de `www`. Double-cliquer sur
   `wamp\INSTALLER-SERVEUR.bat` : il installe les dépendances, compile le site
   spécifique WAMP et copie le site et l'API dans `C:\wamp64\www\salfa`.
   Le script ne crée pas la base et ne démarre pas WampServer.
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
8. Depuis le serveur, ouvrir `http://127.0.0.1/salfa/` pour vérifier l'accès,
   puis tester depuis un poste autorisé. L'API de diagnostic
   `/salfa/api/index.php?action=health` ne renvoie que l'identité du service.

## 2. Importer les données Excel dans MySQL (fichier SQL)

Le fichier **`wamp/sql/salfa_donnees_excel_2022-2026.sql`** contient les données
des classeurs Excel `SALAIRE SALFA 2022.xlsx` à `SALAIRE SALFA 2026.xlsm`
(états mensuels : années complètes 2022, 2023, 2024 ; janvier à mai 2025 —
le classeur 2025 ne contient que ces feuilles ; janvier à octobre 2026), plus
le contrôle des congés, au format réellement lu par l'API WAMP (ligne unique
`salfa_state`, colonne `store_json`). Soit **2 390 lignes de paie** (2022 : 558,
2023 : 576, 2024 : 556, 2025 : 230, 2026 : 470) et **70 salariés** : les
50 salariés de 2026 plus 20 salariés uniquement présents dans les anciens
classeurs, ajoutés en *Inactif* (archive, fiche de leur dernier mois connu).
Un doublon du classeur 2023 (septembre, matricule 39, ligne recopiée) a été
écarté. Il est régénérable après une nouvelle extraction des classeurs avec
`python3 scripts/extract_historique.py && python3 scripts/generer_sql_wamp.py`.

Import, au choix :

- **phpMyAdmin :** démarrer WampServer → ouvrir phpMyAdmin → sélectionner la
  base `salfa_paie` → onglet **Importer** → choisir
  `wamp\sql\salfa_donnees_excel_2022-2026.sql` → **Exécuter**. Les deux dernières
  requêtes du fichier vérifient le résultat : `json_valide = 1`, puis
  `employes = 70`, `paies = 2390`, `conges = 489`.
- **Ligne de commande (sur le serveur) :**
  `mysql -u salfa_app -p salfa_paie < wamp\sql\salfa_donnees_excel_2022-2026.sql`
  (le mot de passe MySQL est demandé, il n'est pas écrit dans la commande).

Ordre avec `setup.php` : l'import peut se faire **avant ou après** `setup.php`.
`setup.php` n'écrase jamais les données importées ; l'import SQL, lui,
**remplace** les données de paie existantes, remet la révision à `0` (les
postes connectés doivent recharger la page) et réinitialise les paramètres
communs et l'en-tête des bulletins aux valeurs par défaut. **Sauvegardez la
base avant tout import sur une base déjà utilisée.** Les comptes utilisateurs
(`salfa_users`) ne sont ni créés ni modifiés par ce fichier, et **aucun mot de
passe n'y figure** : créez les comptes avec `setup.php` puis
`CREER-COMPTE.php` (§ 1, étapes 5 et 6). Ne copiez jamais ce fichier SQL dans
`C:\wamp64\www` : il contient des données de paie confidentielles.

## 3. Sur chaque poste client Windows

Copier `LANCER.bat` **et** `chercher-serveur.ps1` dans un même dossier puis
lancer `LANCER.bat`. Il vérifie l'adresse mémorisée et l'ordinateur local, puis
sonde le port HTTP 80 du sous-réseau IPv4 `/24` de chaque carte privée. Si
plusieurs serveurs répondent, choisissez-en un ; sinon entrez l'adresse complète
à la demande. La détection ne couvre pas les autres sous-réseaux, les ports
personnalisés ou HTTPS : dans ces cas saisir manuellement une adresse comme
`https://serveur.exemple:443/salfa/`. Le poste et le serveur doivent pouvoir se
joindre ; WampServer ne démarre pas sur un poste client. L'adresse retenue est
stockée dans `serveur.local.txt` à côté du BAT. Supprimer ce fichier pour
rechercher à nouveau. Le certificat HTTPS doit déjà être approuvé par Windows.

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
