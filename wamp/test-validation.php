<?php
declare(strict_types=1);
// php wamp/test-validation.php -- tests sans base de données
require __DIR__ . '/api/validation.php';
function check(bool $ok, string $msg): void { if (!$ok) { fwrite(STDERR, "ECHEC: $msg\n"); exit(1); } }
$store = ['meta'=>[], 'employes'=>[['id'=>1,'numero_matricule'=>1]], 'paies'=>[['id'=>1,'employe_id'=>1,'annee'=>2026,'mois'=>'OCTOBRE','verrouille'=>1,'avance'=>100]], 'comparaison_net'=>[]];
check(validStore($store), 'donnees valides');
$duplicate = $store; $duplicate['paies'][] = $duplicate['paies'][0];
check(!validStore($duplicate), 'doublon bulletin');
$modified = $store; $modified['paies'][0]['avance'] = 500;
check(!lockedSafe($store, $modified, 'savePaieSaisie', 'Administrateur'), 'bulletin verrouille');
$unlocked = $store; $unlocked['paies'][0]['verrouille'] = 0;
check(!lockedSafe($store, $unlocked, 'deverrouillerMois', 'Comptable'), 'deverrouillage comptable');
check(lockedSafe($store, $unlocked, 'deverrouillerMois', 'Administrateur'), 'deverrouillage admin');
$unlocked['paies'][0]['avance'] = 500;
check(!lockedSafe($store, $unlocked, 'deverrouillerMois', 'Administrateur'), 'modification pendant deverrouillage');
echo "Validation serveur et verrouillage : OK\n";

foreach (['INCONNU', 'OCTOBRE '] as $month) {
    $bad = $store; $bad['paies'][0]['mois'] = $month;
    check(!validStore($bad), 'mois invalide');
}
foreach ([0, 1800, 2200, 2026.5] as $year) {
    $bad = $store; $bad['paies'][0]['annee'] = $year;
    check(!validStore($bad), 'annee invalide');
}
$bad = $store; $bad['employes'][0] = null;
check(!validStore($bad), 'ligne salarie malformee');
$bad = $store; $bad['paies'][0]['id'] = 1.5;
check(!validStore($bad), 'id fractionnaire');
$bad = $store; $bad['paies'][0]['net'] = 'pas un montant';
check(!validStore($bad), 'montant non numerique');
$bad = $store; $bad['paies'][0]['net'] = INF;
check(!validStore($bad), 'montant infini');
$user = ['id'=>1, 'role'=>'Administrateur', 'actif'=>1];
check(sessionUserStillAllowed($user, $user), 'session active');
check(!sessionUserStillAllowed($user, false), 'compte supprime');
check(!sessionUserStillAllowed($user, array_merge($user, ['actif'=>0])), 'session desactivee');
check(!sessionUserStillAllowed($user, array_merge($user, ['role'=>'Comptable'])), 'role revoque');
echo "Validation des periodes, montants et revocation de session : OK\n";

check(SALFA_DUREE_SESSION === 3600, 'fenetre configuree a une heure');
check(sessionPresenceValide(1000, 1061), 'aucune expiration a l’ancien delai de 60 secondes');
check(sessionPresenceValide(1000, 4599), 'presence valide juste avant une heure');
check(sessionPresenceValide(1000, 4600), 'presence valide a une heure exacte');
check(!sessionPresenceValide(1000, 4601), 'presence expiree apres une heure sans contact');
check(!sessionPresenceValide(null, 1000), 'horodatage obligatoire');
check(!sessionPresenceValide(1100, 1000), 'horodatage futur refuse');
echo "Fenetre de presence de session (1 heure sans contact) : OK\n";
