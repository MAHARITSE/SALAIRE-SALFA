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
   - `wamp/sql/salfa_donnees_excel_2022-2026.sql` (base complète : 70 salariés + paies 2022–2026 + 129 soldes annuels 2024–2026 + 83 fiches historiques), **ou**
   - `wamp/sql/salfa_conges_excel.sql` (soldes annuels + historique de congés seuls, sans écraser les paies existantes).

Ne copiez dans `www` **que** le dossier `Salaire_salfa` prêt à l'emploi :
jamais le dossier `wamp\` complet, ni le fichier SQL, ni `salfa-config.php`.

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
