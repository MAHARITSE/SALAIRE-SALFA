# Version WampServer / MySQL — installation sur réseau local

Cette variante est distincte de la version navigateur : elle démarre avec une
**base de paie vide**, sans les données du classeur. Les salariés et les paies
sont enregistrés dans MySQL sur le serveur, pas dans le localStorage des postes.
Les paramètres de calcul et l'entête des bulletins sont aussi communs et
stockés dans MySQL. Les données préexistantes de la version navigateur ne sont
ni effacées ni importées automatiquement. Pour importer le classeur plus tard,
utilisez l'import Excel après sauvegarde. L'export JSON de l'onglet Rapports est
un export de la vue courante, pas une sauvegarde complète de la base.

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

   Le programme crée les tables et un premier compte administrateur. Choisir
   un identifiant et un mot de passe d'au moins 12 caractères. **La saisie du
   mot de passe est visible dans cette console**. Si des comptes existent déjà,
   relancer le programme ne modifie ni les données ni les comptes.
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

## 2. Sur chaque poste client Windows

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
été testé de bout en bout**. Procéder à une recette sur une base de test vide
avant toute utilisation réelle : connexion, création de salarié, saisie, export,
conflit entre deux postes, sauvegarde/restauration et indisponibilité du serveur.
