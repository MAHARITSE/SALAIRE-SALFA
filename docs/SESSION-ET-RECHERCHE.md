# Recherche des bulletins et présence de session

## Recherche → aperçu → sorties

Dans **Bulletins**, le champ de recherche filtre le matricule, le nom, la
fonction et la catégorie, sans tenir compte de la casse ou des accents.

- La sélection reste sur le salarié choisi tant qu’il figure dans les résultats.
- Si la sélection sort des résultats, le premier bulletin correspondant est
  affiché automatiquement, sans clic supplémentaire.
- Sans résultat, aucun ancien bulletin ne reste visible ou imprimable ; les
  boutons PDF et impression sont désactivés.
- L’état individuel, son PDF et son impression utilisent cette même sélection.
- « Tous les bulletins » reste limité aux résultats de la recherche, ainsi que
  la décharge du livret. Les options avance/médicaments individuelles restent
  distinctes du livret, comme auparavant.
- Un changement de période neutralise immédiatement les anciennes données,
  même avant le démarrage de l’effet de chargement. Un échec de chargement
  affiche un message et ne réutilise pas les anciens bulletins.

Les données de paie et les montants enregistrés ne sont pas modifiés.

## Règle de présence : mécanisme Caisse, fenêtre réglée à une heure

Le délai de présence est porté de 60 secondes à **1 heure** à la demande de
l’utilisateur, en démonstration locale et en WAMP. Ce n’est pas une limite
d’une heure depuis la connexion ni un délai sans clic : un onglet qui continue
à contacter l’application maintient la session, même au-delà d’une heure.

Référence : `src/App.tsx`, `src/utils/utilisateurs.ts` et
`deploy/wamp/api/lib/auth.php` du dépôt
[MAHARITSE/CAISSE-SALFA](https://github.com/MAHARITSE/CAISSE-SALFA).

- **Contact périodique : toutes les 15 secondes par onglet ouvert.**
- **Fenêtre de présence : 1 heure sans contact.**
- Vérification supplémentaire au retour sur un onglet (visibilité/focus).
- Reprise d’une session encore valide lors d’un rechargement ou de l’ouverture
  d’un nouvel onglet du navigateur, sans ressaisir les identifiants.
- Une déconnexion ou un changement de compte invalide les anciennes vues ;
  elles ne doivent jamais réactiver leur ancien compte ni déconnecter le nouveau.

Il ne s’agit **pas d’une heure sans clic ou sans frappe** : la présence est
entretenue tant qu’un onglet peut contacter l’application. Un onglet suspendu
par le navigateur peut donc expirer ; fermer tous les onglets n’implique pas une
déconnexion instantanée, mais la session cesse d’être réutilisable après la
fenêtre de présence. Comme dans Caisse, la page applicative revient sur l’onglet
par défaut du rôle après rechargement (Paie pour l’administrateur, Congés pour le
comptable) ; l’onglet applicatif et le filtre ne sont pas mémorisés.

### Version locale

`src/local/session.ts` conserve un marqueur `{ id, derniereActivite }` dans la
clé **propre à la paie** `salfa_paie_session_v1`. La preuve de session habituelle
est le cookie de navigateur `salfa_paie_presence` (non persistant). En HTTPS,
il est `Secure; SameSite=None; Partitioned` pour fonctionner aussi dans un aperçu
intégré ; sur HTTP local, il conserve `SameSite=Lax`.

Si le navigateur refuse le cookie dès la **connexion explicite**, une preuve
non persistante propre à cet onglet est utilisée (`sessionStorage`, ou mémoire du
document si ce stockage est lui aussi refusé). Cela évite que le premier contact
de 15 secondes ferme une session qui vient d’être ouverte. Ce repli conserve les
mêmes contrôles de compte et la limite d’une heure : **localStorage seul ne
suffit jamais** à restaurer une session. En cas de refus total des cookies, la
reprise après actualisation reste possible dans le même onglet via
`sessionStorage` ; un nouvel onglet sans cette preuve demande la connexion.
Si un cookie avait été accepté puis disparaît, aucun repli automatique ne
ressuscite cette session. Si le stockage local lui-même est refusé, la connexion
affiche immédiatement une erreur plutôt que d’ouvrir une session vouée à échouer
au premier contrôle. Aucun mot de passe ni rôle n’est enregistré dans ces
marqueurs. Les comptes réellement persistés sont revérifiés : compte supprimé,
désactivé ou rôle changé = reconnexion nécessaire pour la vue courante.

La déconnexion est propagée aux autres onglets par l’événement `storage` ; les
simples renouvellements ne sont pas réémis, pour éviter une boucle entre onglets.
Une session ancienne sans horodatage, future ou malformée n’est pas restaurée.

Cela ne transforme pas la version locale en serveur sécurisé : le navigateur
contient déjà les comptes et les paies. Les limites de confidentialité de la
version statique, documentées dans le README, restent applicables.

### Version WAMP

Le serveur PHP garde le compte et le jeton CSRF. `GET api/index.php?action=session`
vérifie le cookie, le compte actuel et la fenêtre de présence de **1 heure**,
puis renouvelle le contact. Le cookie est de session (non persistant), HttpOnly,
SameSite=Strict, et Secure en HTTPS. La version WAMP ne lit ni n’écrit le marqueur
de session local.

Au démarrage, une session valide recharge le snapshot de paie. Les contacts
périodiques ne rechargent **pas** ce snapshot, pour ne pas remplacer une saisie
en cours ni masquer les conflits de révision. Une panne réseau n’est pas prise
pour une déconnexion confirmée ; au retour du réseau, la réponse du serveur
fait foi. Une session expirée/révoquée ou un compte différent ferme la vue
courante, sans envoyer de déconnexion contre le nouveau compte d’un autre onglet.

La page de connexion reprend le style CAISSE-SALFA (carte centrée, palette verte
et affichage/masquage du mot de passe). Les champs sont initialement vides. La démo locale peut préremplir les deux
accès publics sur clic ; WAMP ne propose pas ce panneau. Les comptes,
l’authentification et la règle de présence ci-dessus restent conservés.

## Vérifications

```sh
node scripts/test-bulletins-recherche.cjs
node scripts/test-session-presence.cjs
npm test
npm run build
npm run build:wamp
# Sur un poste avec PHP :
php wamp/test-validation.php
```

Les tests JS vérifient les filtres et sorties, les frontières d’une heure,
le renouvellement, la reprise, les marqueurs invalides, les comptes/rôles
révoqués et l’adaptateur WAMP avec serveur simulé, y compris les pannes réseau
et l’absence de stockage de session local en WAMP.

Contrôles Chromium effectués : recherche JOSOA sans clic sur la ligne,
identité correcte dans l’aperçu, le PDF téléchargé et l’impression interceptée,
aucun résultat et sorties désactivées, montants inchangés, reprise après
rechargement et nouvel onglet, renouvellement périodique réel, déconnexion
multi-onglets, reprise des droits Comptable et expiration simulée à 1 heure et 1 seconde
sans résurrection au rechargement.

PHP/MySQL n’étant pas installés dans l’environnement de développement, les
nouveaux contrôles PHP sont fournis mais restent à exécuter sur WAMP avant
utilisation réelle. L’échec historique de `test-workbook.cjs` (matricule 28,
octobre 2026, ventilation virement/espèces) reste indépendant de ces changements.

### Régression : déconnexion au premier contrôle de 15 secondes

Reproduite dans Chromium en bloquant les cookies avant la connexion. Après
correction : la session reste ouverte pendant plus de 75 secondes sans clic,
avec renouvellements périodiques ; le rechargement dans le même onglet fonctionne.
Après vieillissement du dernier contact de 1 heure et 1 seconde, la session expire et ne
revient pas au rechargement. La déconnexion explicite efface aussi la preuve
locale d’onglet. Ces adaptations concernent uniquement la démonstration locale ;
la session WAMP reste validée par PHP, sans repli sur une preuve locale.

### Fenêtre portée à une heure

Tests avec horloge simulée : plus d’une heure sans clic avec heartbeat actif
reste connectée ; après 61 secondes sans contact, aucune déconnexion ; retour
avant une heure et rechargement autorisés ; au-delà d’une heure sans contact,
reconnexion obligatoire, y compris après rechargement. Vérifié dans Chromium
avec cookies acceptés et bloqués. Les tests JS couvrent deux heures de contacts
simulés et la frontière exacte 3 600 000 / 3 600 001 ms ; les tests PHP couvrent
3 600 / 3 601 secondes sans contact.
