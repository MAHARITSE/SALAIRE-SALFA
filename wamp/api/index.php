<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/sqlRestore.php';

function answer(int $status, array $value): void {
    http_response_code($status);
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function normalizeOrigin(string $url): string {
    if ($url === '') return '';
    $p = parse_url($url);
    if (!is_array($p) || empty($p['scheme']) || empty($p['host'])) return '';
    $scheme = strtolower((string)$p['scheme']);
    $host = strtolower((string)$p['host']);
    $port = isset($p['port']) ? (int)$p['port'] : 0;
    $isDefault = $port === 0 || ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443);
    return $scheme . '://' . $host . ($isDefault ? '' : ':' . $port);
}

function isLocalClient(): bool {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return $ip === '127.0.0.1' || $ip === '::1' || $ip === 'localhost';
}

/** Retourne le chemin privilégié hors www pour salfa-config.php ainsi que les emplacements candidats. */
function resolveConfigPaths(): array {
    $candidates = [];
    $envPath = getenv('SALFA_CONFIG');
    if (is_string($envPath) && trim($envPath) !== '') {
        $candidates[] = trim($envPath);
    }
    $preferredTarget = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'salfa-config.php';
    $cur = __DIR__;
    for ($i = 0; $i < 6; $i++) {
        $parent = dirname($cur);
        if ($parent === $cur) break;
        $base = strtolower(basename($cur));
        if ($base === 'www' || $base === 'htdocs' || $base === 'public_html') {
            $outsideWebRoot = $parent . DIRECTORY_SEPARATOR . 'salfa-config.php';
            $preferredTarget = $outsideWebRoot;
            $candidates[] = $outsideWebRoot;
            break;
        }
        $cur = $parent;
    }
    $candidates[] = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'salfa-config.php';
    $candidates[] = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'salfa-config.php';
    return ['target' => $preferredTarget, 'candidates' => array_values(array_unique($candidates))];
}

function writeConfigFile(string $targetPath, array $cfg): bool {
    $export = "<?php\n// Généré automatiquement pour WampServer (hors www).\nreturn " . var_export([
        'host' => (string)$cfg['host'],
        'port' => (int)$cfg['port'],
        'database' => (string)$cfg['database'],
        'user' => (string)$cfg['user'],
        'password' => (string)$cfg['password'],
    ], true) . ";\n";
    return @file_put_contents($targetPath, $export) !== false;
}

/** Ouvre une connexion PDO à MySQL/MariaDB et crée automatiquement la base salfa_paie si elle n'existe pas encore. */
function openPdoWithAutoCreateDb(array $cfg): PDO {
    $host = trim((string)($cfg['host'] ?? '127.0.0.1')) ?: '127.0.0.1';
    $port = (int)($cfg['port'] ?? 3306);
    if ($port <= 0 || $port > 65535) $port = 3306;
    $dbName = trim((string)($cfg['database'] ?? 'salfa_paie')) ?: 'salfa_paie';
    if (!preg_match('/^[A-Za-z0-9_]+$/', $dbName)) {
        throw new RuntimeException('Nom de base de données invalide.');
    }
    $user = (string)($cfg['user'] ?? 'root');
    $pass = (string)($cfg['password'] ?? '');
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 3,
    ];
    try {
        return new PDO("mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4", $user, $pass, $opts);
    } catch (PDOException $e) {
        $msg = $e->getMessage();
        if (strpos($msg, '1049') !== false || stripos($msg, 'Unknown database') !== false) {
            $serverPdo = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, $opts);
            $serverPdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $serverPdo = null;
            return new PDO("mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4", $user, $pass, $opts);
        }
        throw $e;
    }
}

$action = $_GET['action'] ?? '';
if ($action === 'health' && $_SERVER['REQUEST_METHOD'] === 'GET') answer(200, ['service' => 'salfa-wamp-v1']);

ini_set('session.gc_maxlifetime', (string) SALFA_DUREE_SESSION);
session_name('SALFASESSID');
session_set_cookie_params([
    'lifetime' => 0,
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'path' => '/',
]);
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $expectedOrigin = normalizeOrigin($scheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
    $sentOrigin = normalizeOrigin((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($sentOrigin === '') {
        $sentOrigin = normalizeOrigin((string)($_SERVER['HTTP_REFERER'] ?? ''));
    }
    if ($expectedOrigin !== '' && $sentOrigin !== '' && $sentOrigin !== $expectedOrigin) {
        answer(403, ['error' => 'Origine non autorisée.']);
    }
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 32000000) answer(413, ['error' => 'Données trop volumineuses.']);
    $rawBody = (string)file_get_contents('php://input');
    if ($rawBody === '' && $contentLength > 0) {
        answer(413, ['error' => 'Requête tronquée par la limite PHP post_max_size de WampServer. Augmentez post_max_size (ex. 32M).']);
    }
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) answer(415, ['error' => 'Format de requête invalide.']);
    $input = json_decode($rawBody, true);
    if (!is_array($input)) answer(400, ['error' => 'Requête invalide.']);
} else {
    $input = [];
}

if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!empty($_SESSION['user']) && !hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_SALFA_CSRF'] ?? '')) answer(403, ['error' => 'Session invalide.']);
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $params['path'], 'domain' => $params['domain'], 'secure' => $params['secure'], 'httponly' => true, 'samesite' => 'Strict']);
    }
    session_destroy();
    answer(200, ['success' => true]);
}

if ($action === 'session' && $_SERVER['REQUEST_METHOD'] === 'GET' && empty($_SESSION['user'])) {
    answer(200, ['user' => null]);
}

$paths = resolveConfigPaths();
$loadedConfig = null;
foreach ($paths['candidates'] as $candidate) {
    if (is_file($candidate)) {
        $cfg = require $candidate;
        if (is_array($cfg) && ($cfg['password'] ?? '') !== 'A_MODIFIER') {
            $loadedConfig = $cfg;
            break;
        }
    }
}

// Configuration interactive MySQL depuis le poste serveur local (127.0.0.1 / localhost) si nécessaire
if ($action === 'setup_db' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $isAdminSession = (($_SESSION['user']['role'] ?? '') === 'Administrateur');
    if (!isLocalClient() && !$isAdminSession) {
        answer(403, ['error' => 'Configuration MySQL autorisée uniquement depuis le poste serveur WampServer (localhost).']);
    }
    $newCfg = [
        'host' => trim((string)($input['host'] ?? '127.0.0.1')) ?: '127.0.0.1',
        'port' => (int)($input['port'] ?? 3306) ?: 3306,
        'database' => trim((string)($input['database'] ?? 'salfa_paie')) ?: 'salfa_paie',
        'user' => trim((string)($input['user'] ?? 'root')) ?: 'root',
        'password' => (string)($input['password'] ?? ''),
    ];
    if (!preg_match('/^[A-Za-z0-9_]+$/', $newCfg['database'])) {
        answer(400, ['error' => 'Nom de base MySQL invalide (lettres, chiffres et _ uniquement).']);
    }
    try {
        $testDb = openPdoWithAutoCreateDb($newCfg);
        ensureSalfaInitialized($testDb);
        if (!writeConfigFile($paths['target'], $newCfg)) {
            writeConfigFile(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'salfa-config.php', $newCfg);
        }
        answer(200, ['success' => true, 'message' => 'Serveur WAMP et tables relationnelles MySQL configurés avec succès.']);
    } catch (Throwable $e) {
        error_log('SALFA setup_db: ' . $e->getMessage());
        answer(503, [
            'error' => 'Connexion MySQL refusée (' . $newCfg['user'] . '@' . $newCfg['host'] . ':' . $newCfg['port'] . '). Vérifiez que WampServer est vert et vérifiez le mot de passe MySQL.',
            'code' => 'NEEDS_DB_CONFIG',
            'canConfigure' => isLocalClient(),
        ]);
    }
}

$db = null;
if (is_array($loadedConfig)) {
    try {
        $db = openPdoWithAutoCreateDb($loadedConfig);
    } catch (Throwable $e) {
        error_log('SALFA: MySQL config error: ' . $e->getMessage());
    }
}

// Auto-détection transparente pour WampServer / XAMPP par défaut (root sans mot de passe sur 3306 / 3307 / 3308)
if ($db === null) {
    foreach ([3306, 3307, 3308] as $tryPort) {
        $autoCfg = [
            'host' => '127.0.0.1',
            'port' => $tryPort,
            'database' => 'salfa_paie',
            'user' => 'root',
            'password' => '',
        ];
        try {
            $db = openPdoWithAutoCreateDb($autoCfg);
            writeConfigFile($paths['target'], $autoCfg);
            break;
        } catch (Throwable $e) {
            // Essayer le port suivant
        }
    }
}

if ($db === null) {
    $local = isLocalClient();
    answer(503, [
        'error' => $local
            ? 'Connexion MySQL requise : vérifiez que l’icône WampServer est verte ou renseignez vos identifiants MySQL ci-dessous.'
            : 'Serveur MySQL non configuré ou indisponible. Ouvrez l’application sur le poste serveur WampServer (http://127.0.0.1/Salaire_salfa/) pour l’initialiser.',
        'code' => 'NEEDS_DB_CONFIG',
        'canConfigure' => $local,
    ]);
}

try {
    ensureSalfaInitialized($db);
} catch (Throwable $e) {
    error_log('SALFA init error: ' . $e->getMessage());
    answer(503, ['error' => 'Initialisation des tables relationnelles MySQL impossible. Vérifiez les droits MySQL.']);
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $q = $db->prepare('SELECT id, username, nom_complet, role, password_hash FROM salfa_users WHERE username = ? AND actif = 1');
    $q->execute([$username]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        usleep(300000);
        answer(401, ['error' => 'Identifiants incorrects.']);
    }
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'nom_complet' => $user['nom_complet'],
        'role' => $user['role'],
        'actif' => 1,
    ];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['last'] = time();
    answer(200, ['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}

if (empty($_SESSION['user']) || !sessionPresenceValide($_SESSION['last'] ?? null, time())) {
    session_destroy();
    answer(401, ['error' => 'Session expirée. Reconnectez-vous.']);
}
// Vérifier le compte réel, pas uniquement le rôle conservé au moment de la connexion.
$currentUserQuery = $db->prepare('SELECT id, username, nom_complet, role, actif FROM salfa_users WHERE id = ?');
$currentUserQuery->execute([(int)($_SESSION['user']['id'] ?? 0)]);
$currentUser = $currentUserQuery->fetch(PDO::FETCH_ASSOC);
if (!sessionUserStillAllowed($_SESSION['user'], $currentUser)) {
    session_destroy();
    answer(401, ['error' => 'Compte désactivé ou droits modifiés. Reconnectez-vous.']);
}
$_SESSION['last'] = time();
$_SESSION['user']['username'] = $currentUser['username'];
$_SESSION['user']['nom_complet'] = $currentUser['nom_complet'];
if ($action === 'session' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    answer(200, ['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_SALFA_CSRF'] ?? '')) {
    answer(403, ['error' => 'Session invalide. Reconnectez-vous.']);
}

if ($action === 'snapshot' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $snap = loadRelationalSnapshot($db);
    $store = $snap['store'];
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur' && is_array($store)) {
        // Le Comptable n'a accès qu'aux Permissions & Congés : masquer les paies et salaires
        $store['paies'] = [];
        $store['comparaison_net'] = [];
        if (is_array($store['employes'] ?? null)) {
            foreach ($store['employes'] as &$emp) {
                if (!is_array($emp)) continue;
                $emp['base_aj'] = 0;
                $emp['logement_transport'] = 0;
                $emp['rendement'] = 0;
                $emp['responsabilite_representation'] = 0;
                $emp['rib'] = '';
                $emp['mode_paiement'] = '';
                foreach (['genre','date_naissance','lieu_naissance','pere','mere','cin','date_cin','lieu_cin','situation_matrimoniale','adresse','service','diplome','etablissement','statut','numero_ordre','nature_contrat','duree_contrat','lieu_embauche','lieu_travail','date_effet'] as $champPersonnel) {
                    $emp[$champPersonnel] = '';
                }
            }
            unset($emp);
        }
        $snap['store'] = $store;
    }
    answer(200, $snap);
}

if (($action === 'save' || $action === 'settings') && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $revision = $input['revision'] ?? null;
    if (!is_int($revision) || $revision < 0) answer(400, ['error' => 'Révision invalide.']);
    try {
        $db->beginTransaction();
        $row = $db->query('SELECT revision FROM salfa_revision WHERE id = 1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['revision'] !== $revision) {
            $db->rollBack();
            answer(409, ['error' => 'Les données ont changé sur un autre poste. Rechargez la période.']);
        }
        if ($action === 'save') {
            $operation = (string)($input['action'] ?? '');
            $role = (string)($_SESSION['user']['role'] ?? '');
            $congeActions = ['creerConge', 'modifierConge', 'deciderConge', 'supprimerConge', 'saisirOuverturePremiereAnnee', 'saisirSoldeAnnee', 'importerConges', 'ajouterAnnee'];
            $adminActions = ['completerPersonnel', 'createEmploye', 'updateEmploye', 'toggleActifEmploye', 'fusionnerEmployes', 'initPaieEmploye', 'initMoisPaie', 'savePaieSaisie', 'savePaieReglement', 'cloturerMois', 'deverrouillerMois', 'importerClasseur', 'enregistrerSaisieLot'];
            $allowed = array_merge($adminActions, $congeActions);
            if (!in_array($operation, $allowed, true)) { $db->rollBack(); answer(403, ['error' => 'Action non autorisée.']); }
            if ($role !== 'Administrateur' && !in_array($operation, $congeActions, true)) { $db->rollBack(); answer(403, ['error' => 'Action réservée à l’administrateur.']); }

            $new = $input['store'] ?? null;
            $old = loadRelationalStore($db);
            if (!is_array($new) || !is_array($old)) { $db->rollBack(); answer(400, ['error' => 'Données invalides.']); }

            // Un non-administrateur (Comptable) ne peut modifier que la table relationnelle salfa_conges (et salfa_annees lors d'un ajout d'année)
            $storeToSave = ($role === 'Administrateur')
                ? $new
                : array_merge($old, [
                    'conges' => is_array($new['conges'] ?? null) ? $new['conges'] : [],
                    'annees' => is_array($new['annees'] ?? null) ? $new['annees'] : ($old['annees'] ?? []),
                ]);

            if (!validStore($storeToSave) || !lockedSafe($old, $storeToSave, $operation, $role)) {
                $db->rollBack();
                answer(400, ['error' => 'Données invalides ou période clôturée.']);
            }

            if ($operation === 'ajouterAnnee') {
                syncAnneesTable($db, is_array($storeToSave['annees'] ?? null) ? $storeToSave['annees'] : []);
                $stRev = $db->prepare('UPDATE salfa_revision SET revision = ?, date_modification = ? WHERE id = 1');
                $stRev->execute([$revision + 1, date('Y-m-d H:i:s')]);
            } elseif ($role !== 'Administrateur' || in_array($operation, $congeActions, true)) {
                syncCongesTable($db, is_array($storeToSave['conges'] ?? null) ? $storeToSave['conges'] : []);
                $stRev = $db->prepare('UPDATE salfa_revision SET revision = ?, date_modification = ? WHERE id = 1');
                $stRev->execute([$revision + 1, date('Y-m-d H:i:s')]);
            } else {
                if ($operation === 'fusionnerEmployes') {
                    // Lors d'une fusion, le salarié cible existe déjà : rattacher paies & congés d'abord puis supprimer la fiche doublon
                    syncPaiesTable($db, $storeToSave['paies']);
                    syncCongesTable($db, is_array($storeToSave['conges'] ?? null) ? $storeToSave['conges'] : []);
                    syncEmployesTable($db, $storeToSave['employes']);
                } else {
                    syncEmployesTable($db, $storeToSave['employes']);
                    syncPaiesTable($db, $storeToSave['paies']);
                    syncCongesTable($db, is_array($storeToSave['conges'] ?? null) ? $storeToSave['conges'] : []);
                }
                syncComparaisonNetTable($db, $storeToSave['comparaison_net']);
                syncAnneesTable($db, is_array($storeToSave['annees'] ?? null) ? $storeToSave['annees'] : []);
                updateRevisionMeta($db, is_array($storeToSave['meta'] ?? null) ? $storeToSave['meta'] : [], $revision + 1);
            }
        } else {
            $kind = $input['kind'] ?? '';
            $value = $input['value'] ?? null;
            if (!in_array($kind, ['header', 'congeHeader', 'config'], true) || !is_array($value)) { $db->rollBack(); answer(400, ['error' => 'Paramètres invalides.']); }
            if ($kind !== 'congeHeader' && ($_SESSION['user']['role'] ?? '') !== 'Administrateur') { $db->rollBack(); answer(403, ['error' => 'Réservé à l’administrateur.']); }
            if ($kind === 'config') {
                writeConfigTables($db, $value);
            } elseif ($kind === 'congeHeader') {
                writeHeaderTable($db, $value, 2);
            } else {
                writeHeaderTable($db, $value, 1);
            }
            $stRev = $db->prepare('UPDATE salfa_revision SET revision = ?, date_modification = ? WHERE id = 1');
            $stRev->execute([$revision + 1, date('Y-m-d H:i:s')]);
        }
        $db->commit();
        $resp = ['revision' => $revision + 1];
        if ($action === 'save' && ($input['action'] ?? '') === 'cloturerMois') {
            try {
                $resp['backup'] = saveSqlBackupOnDisk($db, 'CLOTURE', '', 'Clôture de caisse / paie validée');
            } catch (Throwable $be) {
                error_log('SALFA auto SQL backup error: ' . $be->getMessage());
            }
        }
        answer(200, $resp);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('SALFA: ' . $e->getMessage());
        answer(500, ['error' => 'Écriture impossible dans MySQL.']);
    }
}

if ($action === 'users_list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    $rows = $db->query('SELECT id, username, nom_complet, role, actif FROM salfa_users ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
    $users = array_map(fn($r) => ['id' => (int)$r['id'], 'username' => $r['username'], 'nom_complet' => $r['nom_complet'], 'role' => $r['role'] === 'Administrateur' ? 'Administrateur' : 'Comptable', 'actif' => (int)$r['actif']], $rows);
    answer(200, ['users' => $users]);
}

if (in_array($action, ['users_create', 'users_update', 'users_password', 'users_toggle', 'users_delete'], true) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    $selfId = (int)($_SESSION['user']['id'] ?? 0);
    if ($action === 'users_create') {
        $username = trim((string)($input['username'] ?? ''));
        $nom = trim((string)($input['nom_complet'] ?? '')) ?: $username;
        $role = ($input['role'] ?? '') === 'Administrateur' ? 'Administrateur' : 'Comptable';
        $password = (string)($input['password'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,60}$/', $username) || strlen($nom) > 160) answer(400, ['error' => 'Identifiant invalide (3 à 60 caractères sans espaces).']);
        if (strlen($password) < 6) answer(400, ['error' => 'Le mot de passe doit contenir au moins 6 caractères.']);
        try {
            $q = $db->prepare('INSERT INTO salfa_users (username, nom_complet, role, actif, password_hash) VALUES (?, ?, ?, 1, ?)');
            $q->execute([$username, $nom, $role, password_hash($password, PASSWORD_DEFAULT)]);
            $id = (int)$db->lastInsertId();
            answer(200, ['success' => true, 'user' => ['id' => $id, 'username' => $username, 'nom_complet' => $nom, 'role' => $role, 'actif' => 1]]);
        } catch (Throwable $e) {
            answer(409, ['error' => "L'identifiant « $username » est déjà utilisé."]);
        }
    }
    $targetId = (int)($input['id'] ?? 0);
    $st = $db->prepare('SELECT id, username, nom_complet, role, actif FROM salfa_users WHERE id = ?');
    $st->execute([$targetId]);
    $target = $st->fetch(PDO::FETCH_ASSOC);
    if (!$target) answer(404, ['error' => 'Utilisateur introuvable.']);
    $otherAdmins = (int)$db->query("SELECT COUNT(*) FROM salfa_users WHERE role='Administrateur' AND actif=1 AND id != $targetId")->fetchColumn();
    if ($action === 'users_update') {
        $username = trim((string)($input['username'] ?? ''));
        $nom = trim((string)($input['nom_complet'] ?? '')) ?: $username;
        $role = ($input['role'] ?? '') === 'Administrateur' ? 'Administrateur' : 'Comptable';
        if (!preg_match('/^[A-Za-z0-9_.-]{3,60}$/', $username) || strlen($nom) > 160) answer(400, ['error' => 'Identifiant invalide.']);
        if ($target['role'] === 'Administrateur' && $role !== 'Administrateur' && (int)$target['actif'] === 1) {
            if ($otherAdmins === 0) answer(400, ['error' => 'Impossible de retirer le rôle Administrateur au dernier administrateur actif.']);
            if ($targetId === $selfId) answer(400, ['error' => 'Impossible de retirer votre propre rôle Administrateur en cours de session.']);
        }
        try {
            $q = $db->prepare('UPDATE salfa_users SET username=?, nom_complet=?, role=? WHERE id=?');
            $q->execute([$username, $nom, $role, $targetId]);
            if ($targetId === $selfId) {
                $_SESSION['user']['username'] = $username;
                $_SESSION['user']['nom_complet'] = $nom;
                $_SESSION['user']['role'] = $role;
            }
            answer(200, ['success' => true, 'user' => ['id' => $targetId, 'username' => $username, 'nom_complet' => $nom, 'role' => $role, 'actif' => (int)$target['actif']]]);
        } catch (Throwable $e) {
            answer(409, ['error' => "L'identifiant « $username » est déjà utilisé."]);
        }
    }
    if ($action === 'users_password') {
        $password = (string)($input['password'] ?? '');
        if (strlen($password) < 6) answer(400, ['error' => 'Le mot de passe doit contenir au moins 6 caractères.']);
        $q = $db->prepare('UPDATE salfa_users SET password_hash=? WHERE id=?');
        $q->execute([password_hash($password, PASSWORD_DEFAULT), $targetId]);
        answer(200, ['success' => true]);
    }
    if ($action === 'users_toggle') {
        $actif = !empty($input['actif']) ? 1 : 0;
        if ($actif === 0) {
            if ($targetId === $selfId) answer(400, ['error' => 'Impossible de désactiver votre propre compte en cours de session.']);
            if ($target['role'] === 'Administrateur' && $otherAdmins === 0) answer(400, ['error' => 'Impossible de désactiver le dernier administrateur actif.']);
        }
        $q = $db->prepare('UPDATE salfa_users SET actif=? WHERE id=?');
        $q->execute([$actif, $targetId]);
        answer(200, ['success' => true]);
    }
    if ($action === 'users_delete') {
        if ($targetId === $selfId) answer(400, ['error' => 'Impossible de supprimer votre propre compte en cours de session.']);
        if ($target['role'] === 'Administrateur' && (int)$target['actif'] === 1 && $otherAdmins === 0) answer(400, ['error' => 'Impossible de supprimer le dernier administrateur actif.']);
        $q = $db->prepare('DELETE FROM salfa_users WHERE id=?');
        $q->execute([$targetId]);
        answer(200, ['success' => true]);
    }
}

// Sauvegardes SQL relationnelles (Administration & Clôture)
if ($action === 'sql_backup_restore' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    if (($input['confirmation'] ?? '') !== 'RESTAURER') answer(400, ['error' => 'Confirmation de restauration requise.']);
    try {
        $operations = salfaParseRestore(is_string($input['sql'] ?? null) ? $input['sql'] : '');
        $db->beginTransaction();
        $revision = $db->query('SELECT revision FROM salfa_revision WHERE id = 1 FOR UPDATE')->fetchColumn();
        if ($revision === false || !is_int($input['revision'] ?? null) || $input['revision'] !== (int)$revision) {
            $db->rollBack(); answer(409, ['error' => 'Les données ont changé. Rechargez avant de restaurer.']);
        }
        // Si cette sauvegarde échoue, aucune restauration n'est effectuée.
        $backup = saveSqlBackupOnDisk($db, 'MANUELLE', '', 'Avant restauration SQL');
        if (empty($backup['server_saved'])) throw new RuntimeException('Sauvegarde de sécurité non enregistrée sur disque.');
        salfaApplyRestore($db, $operations);
        if (!validStore(loadRelationalStore($db))) throw new InvalidArgumentException('Les données restaurées sont invalides.');
        $row = $db->query('SELECT id FROM salfa_revision WHERE id = 1')->fetchColumn();
        if ($row === false) throw new InvalidArgumentException('Métadonnées de sauvegarde invalides.');
        $st = $db->prepare('UPDATE salfa_revision SET revision = ?, date_modification = ? WHERE id = 1');
        $st->execute([(int)$revision + 1, date('Y-m-d H:i:s')]);
        $db->commit();
        answer(200, ['success' => true, 'backup' => $backup['filename'], 'message' => 'Restauration terminée. Les comptes et mots de passe actuels sont conservés.']);
    } catch (InvalidArgumentException $e) {
        if ($db->inTransaction()) $db->rollBack();
        answer(400, ['error' => $e->getMessage()]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('SALFA sql_backup_restore: ' . $e->getMessage());
        answer(500, ['error' => 'Restauration annulée : aucune modification validée. Vérifiez la sauvegarde et le serveur.']);
    }
}

if ($action === 'sql_backups_list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    answer(200, ['backups' => listSqlBackupsOnDisk()]);
}

if ($action === 'sql_backup_export' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    $type = in_array(($input['type'] ?? ''), ['CLOTURE', 'MANUELLE', 'CONGES'], true) ? (string)$input['type'] : 'MANUELLE';
    $periode = substr(trim((string)($input['periode'] ?? '')), 0, 40);
    $motif = substr(trim((string)($input['motif'] ?? 'Sauvegarde SQL manuelle')), 0, 160);
    try {
        $backup = saveSqlBackupOnDisk($db, $type, $periode, $motif);
        $backup['success'] = true;
        answer(200, $backup);
    } catch (Throwable $e) {
        error_log('SALFA sql_backup_export: ' . $e->getMessage());
        answer(500, ['error' => 'Génération de la sauvegarde SQL impossible.']);
    }
}

if ($action === 'sql_backup_download' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_SESSION['user']['role'] ?? '') !== 'Administrateur') answer(403, ['error' => 'Action réservée à l’administrateur.']);
    $file = (string)($_GET['file'] ?? '');
    $sql = readSqlBackupFromDisk($file);
    if ($sql === null) answer(404, ['error' => 'Fichier de sauvegarde SQL introuvable.']);
    answer(200, ['success' => true, 'filename' => basename($file), 'sql' => $sql]);
}

answer(404, ['error' => 'Action inconnue.']);
