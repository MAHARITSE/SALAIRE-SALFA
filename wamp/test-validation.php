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
