# Thème CAISSE-SALFA adapté à la paie

## Référence et périmètre

L’interface connectée reprend les principaux repères visuels du dépôt
[MAHARITSE/CAISSE-SALFA](https://github.com/MAHARITSE/CAISSE-SALFA) :

- vert profond `#0e6351`, déclinaison sombre `#147861` et sélection vert pâle ;
- fond clair `#f5f7f9`, fond sombre `#090e17`, cartes sobres et bordures fines ;
- identité SALFA avec pictogramme médical, exercice affiché, profil et actions ;
- en-tête sur deux niveaux avec navigation horizontale défilante sur mobile ;
- titre et description pour chaque page, lien d’évitement et focus clavier visible.

**La page de connexion reprend désormais elle aussi le style CAISSE-SALFA** :
carte centrée sur fond sobre, identité SALFA, bouton vert et champs à focus vert,
avec contrôle d’affichage/masquage du mot de passe et basculement clair/sombre.
La démonstration locale propose maintenant les deux accès publics de la paie
(Administrateur et Comptable), avec préremplissage par clic uniquement. Un accès
modifié, désactivé ou supprimé est masqué ; aucun compte privé n’est affiché.
La version finale WAMP ne propose aucun compte ni préremplissage et son bundle
ne contient pas le panneau ni les accès publics de démonstration. L’authentification, les messages et la
configuration MySQL WAMP restent disponibles. Les règles de présence/reprise de
session sont décrites dans [SESSION-ET-RECHERCHE.md](SESSION-ET-RECHERCHE.md).
La classe `theme-caisse` reste réservée à l’application connectée ; la connexion
partage sa palette `brand` via des classes Tailwind dédiées (`login-page`,
`login-card`), sans recevoir les styles des documents ou des écrans métier.

Il n’y a pas de nouvelles données ni de nouvelle dépendance de production.
Les calculs de paie, règles de congés, droits d’accès, stockage local/MySQL,
imports, exports, clôtures et parcours de duplication restent inchangés.
Les couleurs métier (erreurs, retenues, maternité, anniversaire d’ancienneté)
ne sont pas remplacées par la palette verte.

## Organisation

- `src/components/ApplicationHeader.tsx` : présentation de l’en-tête et des titres.
  Les boutons de navigation, conditions de rôle et gestionnaires d’action
  restent dans `App.tsx` et lui sont transmis sans changer leur fonctionnement.
- `src/theme-caisse.css` : styles limités à `.theme-caisse` **et à `@media screen`**.
- `caisse-card` : repère explicite des cartes, menus et modales d’interface.
- `tailwind.config.js` : palette `brand` ajoutée, anciennes couleurs `salfa`
  conservées pour les documents et composants existants.
- `src/components/LoginModal.tsx` : carte de connexion autonome, champs libellés
  et aides, visibilité du mot de passe, formulaire MySQL séparé (aucune imbrication).

Les styles d’impression, modèles de bulletin, contrat, fiche d’absence et
exports PDF ne sont pas modifiés. Le titre d’écran utilise une `<section>`
`no-print`, pas un `<div>` direct de `<main>` : les anciens styles d’impression
forcent ces derniers à `display: block` pour dérouler les documents.

## Vérifications

- `node scripts/test-theme-caisse.cjs` : identité, titres, emplacements des
  actions, isolation de la connexion, portée écran des styles et responsive.
- `node scripts/test-login-caisse.cjs` : présentation, champs vides, libellés et
  autocomplétion, bouton de visibilité, absence de préremplissage automatique,
  formulaires local/WAMP et conservation des gestionnaires de connexion.
- `node scripts/test-comptes-demo.cjs` : accès locaux actifs et inchangés, rôles,
  préremplissage sans soumission et absence de comptes personnalisés.
- `npm run test:wamp-build` : compilation finale WAMP puis contrôle de l’absence
  du panneau et des accès de démonstration dans les fichiers JavaScript produits.
- `npm run build` et `npm run build:wamp` : compilation TypeScript et Vite.
- `npm test` : tests métier et interface ; l’échec historique de
  `test-workbook.cjs` (ventilation virement/espèces, matricule 28, octobre 2026)
  est indépendant du thème et ne doit pas être présenté comme résolu.

Contrôles effectués dans Chromium : quatre onglets Administrateur, ouverture
Administration, duplication avec les deux questions puis annulation, connexion
Comptable limitée aux congés, déconnexion, thème sombre conservé au rechargement,
largeur mobile de 390 px sans débordement de la page et bande des mois défilante.
En émulation d’impression de l’état de paie, l’en-tête et le titre d’écran sont
masqués ; retirer la feuille du thème ne modifie ni la largeur, ni la police,
ni la couleur du document contrôlé. Une recette finale sur les imprimantes et
postes Windows/WAMP utilisés par la clinique reste recommandée.

Contrôles supplémentaires de connexion dans Chromium : affichage clair/sombre,
préférence de thème conservée après rechargement (y compris sous StrictMode),
champs vides, erreur d’identifiants, visibilité du mot de passe sans changement
de valeur, soumission par Entrée, rôles Administrateur/Comptable, retour à un
formulaire vide après déconnexion et largeurs mobiles de 320/390 px. Le parcours
MySQL a été contrôlé avec API simulée : configuration autorisée ou refusée,
erreur de configuration, attente pendant l’enregistrement et reconnexion
automatique après succès. Cela ne remplace pas une recette PHP/MySQL réelle
sur WAMP.

Le mode démonstration utilise uniquement les accès locaux publics déjà présents ;
il ne crée aucun utilisateur et ne restaure aucun mot de passe. Le commentaire
de l’export SQL ne répète plus les mots de passe en clair ; les instructions SQL
et les protections `INSERT IGNORE` restent inchangées.

Contrôles Chromium de la démonstration : champs vides au départ, les deux rôles
préremplissent sans soumettre, connexion Comptable limitée aux congés, panneau
lisible à 390 px, et disparition de l’accès Administrateur après modification
du mot de passe stocké, sans réinitialiser celui-ci. Le contrôle du bundle final
WAMP confirme l’absence du panneau et des accès de démonstration dans les JS.

## Bandeau remplacé par les contrôles flottants

Le bandeau supérieur SALFA / exercice / profil / Administration est supprimé.
Les onglets de navigation restent disponibles. En bas à droite, les cinq contrôles
reprennent la seconde capture : cloche, réduction, pourcentage réinitialisable,
augmentation et thème clair/sombre.

La paie n’ayant pas de messagerie, la cloche ouvre le menu **Compte et
administration** (paramètres, imports, déconnexion selon les droits), sans
inventer de notifications ni de son de messages. Ce menu se referme avec Échap
ou un clic extérieur et reste dans la fenêtre à 320 px.

Les boutons −/+ ajustent la taille d’affichage de 13 à 22 px (16 px = 100 %),
comme dans Caisse ; le pourcentage remet à 100 %. La préférence est enregistrée
localement. Le style de taille est limité au média écran et retiré à la
déconnexion : impressions, montants et règles de session ne sont pas modifiés.

Validation : `scripts/test-controles-flottants.cjs` et contrôle Chromium des
bornes, de la persistance, des thèmes, de l’impression à 16 px, du menu mobile et
des droits Administrateur/Comptable.

### Bouton Administration restauré

Le bouton **Administration** est à nouveau visible à droite des onglets, sans
rétablir le grand bandeau identité/profil. Son menu complet reste soumis aux
rôles : le Comptable dispose uniquement de son menu de compte et de déconnexion.
La cloche flottante conserve un raccourci vers ce même menu (pas de duplication
des paramètres). Le menu s’ouvre sous le bouton, se ferme par Échap/clic extérieur
et reste utilisable sur écran mobile. Le zoom et le thème flottants sont conservés.
