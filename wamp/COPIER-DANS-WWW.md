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
3. Ouvrir **http://127.0.0.1/Salaire_salfa/** : la page de connexion s'affiche.
4. Il reste la partie base de données (une seule fois) : créer la base
   `salfa_paie` dans phpMyAdmin, copier `wamp/config.example.php` en
   `C:\wamp64\salfa-config.php` (hors `www`) avec les bons identifiants MySQL,
   créer le premier compte administrateur avec `wamp/setup.php`, et
   éventuellement importer `wamp/sql/salfa_donnees_excel_2022-2026.sql` —
   voir `wamp/GUIDE-WAMP.md` §1 et §2.

Ne copiez dans `www` **que** le dossier `Salaire_salfa` prêt à l'emploi :
jamais le dossier `wamp\` complet, ni le fichier SQL, ni `salfa-config.php`.

## Régénérer le dossier après une modification du code (poste de développement)

```bat
npx vite build --mode wamp
xcopy /E /I /Y dist\* wamp\Salaire_salfa\
xcopy /E /I /Y wamp\api\* wamp\Salaire_salfa\api\
```

(ou relancer `wamp/INSTALLER-SERVEUR.bat` sur un poste où Node.js est installé :
il déploie directement dans `C:\wamp64\www\Salaire_salfa`.)
