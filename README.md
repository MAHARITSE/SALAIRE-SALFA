# Clinique SALFA TANAMBAO — Logiciel de Paie Mensuelle

Application **100 % locale** (client-side / React + Vite + TypeScript), déployable en tant que
**site statique** sur **Cloudflare Pages**. Il n'y a **plus aucun serveur Node/Express ni base
de données distante** : toutes les données sont stockées dans le `localStorage` du navigateur,
initialisées à partir du fichier embarqué `src/data/salfa_data.json`.

---

## 🚀 Déployer sur Cloudflare Dashboard

1. Rendez-vous sur <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages**.
2. Choisissez **Connect to Git** (recommandé) puis sélectionnez ce dépôt, **ou** **Upload assets**
   (glissez le contenu du dossier `dist/` après avoir lancé `npm run build`).
3. Configurez les réglages de build (en cas de connexion Git) :

   | Réglage          | Valeur        |
   |------------------|---------------|
   | Framework preset | `Vite`        |
   | Build command    | `npm run build` |
   | Build output     | `dist`        |

4. Cliquez **Deploy and continue**. Cloudflare vous fournit une URL `*.pages.dev`.

> ⚠️ **Données :** étant 100 % local, chaque navigateur possède son propre jeu de données
> (stocké dans son `localStorage`). Il n'y a pas de base partagée entre utilisateurs/machines.
> Pour **réinitialiser** les données, videz le `localStorage` du site dans les outils
> développeur, ou utilisez le bouton de réinitialisation ajouté dans l'application.

### Alternative en ligne de commande (Wrangler)

```bash
npm install
npm run build          # génère dist/
npx wrangler login
npx wrangler pages deploy dist --project-name salfa-web-paie
```

---

## 🧑‍💻 Développement local

```bash
npm install
npm run dev            # Vite dev server (aucun backend requis)
npm run build          # build statique dans dist/
npm run preview        # prévisualise le build
```

---

## 🔐 Comptes par défaut

| Rôle          | Identifiant | Mot de passe    |
|---------------|-------------|-----------------|
| Administrateur | `admin`     | `admin123`      |
| Comptable     | `comptable` | `comptable123`  |

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

## ✨ Fonctionnalités

- Authentification locale (`admin` / `comptable`)
- Gestion des salariés (fiches, matricules, ancienneté, congé maternité)
- Saisie mensuelle (AVANCE / MED), clôture et déverrouillage des mois
- Bulletins de paie (2 exemplaires, export PDF via jsPDF)
- Rapports & comparaisons, exports Excel (xlsx) et JSON
- Conformité CGI Madagascar (IRSA) et calcul CNaPS
