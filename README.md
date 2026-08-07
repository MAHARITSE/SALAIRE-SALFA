# Clinique SALFA TANAMBAO — Logiciel de Paie Mensuelle

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
