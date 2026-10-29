<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function answer(int $status, array $value): void { http_response_code($status); echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE); exit; }
$action = $_GET['action'] ?? '';
if ($action === 'health' && $_SERVER['REQUEST_METHOD'] === 'GET') answer(200, ['service' => 'salfa-wamp-v1']);
session_name('SALFASESSID');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'path' => '/']);
session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    if ($origin !== $scheme.'://'.($_SERVER['HTTP_HOST'] ?? '')) answer(403, ['error' => 'Origine non autorisée.']);
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) answer(415, ['error' => 'Format de requête invalide.']);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000000) answer(413, ['error' => 'Données trop volumineuses.']);
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) answer(400, ['error' => 'Requête invalide.']);
} else $input = [];
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
$configFile = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'salfa-config.php';
if (!is_file($configFile)) answer(503, ['error' => 'Serveur non configuré. Consultez le guide WAMP.']);
$config = require $configFile;
try {
    $db = new PDO('mysql:host='.$config['host'].';port='.$config['port'].';dbname='.$config['database'].';charset=utf8mb4', $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
} catch (Throwable $e) { error_log('SALFA: MySQL inaccessible: '.$e->getMessage()); answer(503, ['error' => 'Base de données indisponible. Contactez l’administrateur.']); }
if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string)($input['username'] ?? '')); $password = (string)($input['password'] ?? '');
    $q = $db->prepare('SELECT id, username, nom_complet, role, password_hash FROM salfa_users WHERE username = ? AND actif = 1'); $q->execute([$username]); $user = $q->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, $user['password_hash'])) { usleep(300000); answer(401, ['error' => 'Identifiants incorrects.']); }
    session_regenerate_id(true); $_SESSION['user'] = ['id' => (int)$user['id'], 'username' => $user['username'], 'nom_complet' => $user['nom_complet'], 'role' => $user['role'], 'actif' => 1];
    $_SESSION['csrf'] = bin2hex(random_bytes(32)); $_SESSION['last'] = time();
    answer(200, ['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}
if (empty($_SESSION['user']) || time() - ($_SESSION['last'] ?? 0) > 3600) { session_destroy(); answer(401, ['error' => 'Session expirée. Reconnectez-vous.']); }
$_SESSION['last'] = time();
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !hash_equals($_SESSION['csrf'] ?? '', $_SERVER['HTTP_X_SALFA_CSRF'] ?? '')) answer(403, ['error' => 'Session invalide. Reconnectez-vous.']);
if ($action === 'snapshot' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $q = $db->query('SELECT revision, store_json, config_json, header_json FROM salfa_state WHERE id = 1'); $row = $q->fetch(PDO::FETCH_ASSOC);
    if (!$row) answer(503, ['error' => 'Base non initialisée.']);
    $store = json_decode($row['store_json'], true);
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
                $emp['resp_repres'] = 0;
                $emp['responsabilite_representation'] = 0;
                $emp['rib'] = '';
                $emp['mode_paiement'] = '';
            }
            unset($emp);
        }
    }
    answer(200, ['revision' => (int)$row['revision'], 'store' => $store, 'config' => $row['config_json'] ? json_decode($row['config_json'], true) : null, 'header' => $row['header_json'] ? json_decode($row['header_json'], true) : null]);
}
require_once __DIR__ . '/validation.php';
if (($action === 'save' || $action === 'settings') && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $revision = $input['revision'] ?? null;
    if (!is_int($revision) || $revision < 0) answer(400, ['error' => 'Révision invalide.']);
    try {
        $db->beginTransaction();
        $row = $db->query('SELECT revision, store_json FROM salfa_state WHERE id=1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['revision'] !== $revision) { $db->rollBack(); answer(409, ['error' => 'Les données ont changé sur un autre poste. Rechargez la période.']); }
        if ($action === 'save') {
            $operation = (string)($input['action'] ?? '');
            $role = (string)($_SESSION['user']['role'] ?? '');
            $congeActions = ['creerConge','modifierConge','deciderConge','supprimerConge','saisirOuverturePremiereAnnee','importerConges'];
            $adminActions = ['createEmploye','updateEmploye','toggleActifEmploye','initPaieEmploye','initMoisPaie','savePaieSaisie','savePaieReglement','cloturerMois','deverrouillerMois','importerClasseur','enregistrerSaisieLot'];
            $allowed = array_merge($adminActions, $congeActions);
            if (!in_array($operation, $allowed, true)) { $db->rollBack(); answer(403, ['error' => 'Action non autorisée.']); }
            if ($role !== 'Administrateur' && !in_array($operation, $congeActions, true)) { $db->rollBack(); answer(403, ['error' => 'Action réservée à l’administrateur.']); }
            $new = $input['store'] ?? null; $old = json_decode($row['store_json'], true);
            if (!is_array($new) || !is_array($old)) { $db->rollBack(); answer(400, ['error' => 'Données invalides.']); }
            // Un non-administrateur (Comptable) ne peut modifier que le registre des congés & permissions
            $storeToSave = ($role === 'Administrateur') ? $new : array_merge($old, ['conges' => is_array($new['conges'] ?? null) ? $new['conges'] : []]);
            if (!validStore($storeToSave) || !lockedSafe($old, $storeToSave, $operation, $role)) { $db->rollBack(); answer(400, ['error' => 'Données invalides ou période clôturée.']); }
            $storeToSave['utilisateurs'] = []; // Les comptes ne font jamais partie des données envoyées par les clients.
            $value = json_encode($storeToSave, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $q = $db->prepare('UPDATE salfa_state SET store_json=?, revision=revision+1 WHERE id=1 AND revision=?'); $q->execute([$value, $revision]);
        } else {
            if ($_SESSION['user']['role'] !== 'Administrateur') { $db->rollBack(); answer(403, ['error' => 'Réservé à l’administrateur.']); }
            $kind = $input['kind'] ?? ''; $value = $input['value'] ?? null;
            if (!in_array($kind, ['header','config'], true) || !is_array($value)) { $db->rollBack(); answer(400, ['error' => 'Paramètres invalides.']); }
            $column = $kind === 'header' ? 'header_json' : 'config_json';
            $q = $db->prepare("UPDATE salfa_state SET $column=?, revision=revision+1 WHERE id=1 AND revision=?"); $q->execute([json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $revision]);
        }
        $db->commit(); answer(200, ['revision' => $revision + 1]);
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); error_log('SALFA: '.$e->getMessage()); answer(500, ['error' => 'Écriture impossible dans MySQL.']); }
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
        } catch (Throwable $e) { answer(409, ['error' => "L'identifiant « $username » est déjà utilisé."]); }
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
            if ($targetId === $selfId) { $_SESSION['user']['username'] = $username; $_SESSION['user']['nom_complet'] = $nom; $_SESSION['user']['role'] = $role; }
            answer(200, ['success' => true, 'user' => ['id' => $targetId, 'username' => $username, 'nom_complet' => $nom, 'role' => $role, 'actif' => (int)$target['actif']]]);
        } catch (Throwable $e) { answer(409, ['error' => "L'identifiant « $username » est déjà utilisé."]); }
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
answer(404, ['error' => 'Action inconnue.']);
