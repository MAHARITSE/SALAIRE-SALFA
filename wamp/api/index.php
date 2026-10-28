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
    answer(200, ['revision' => (int)$row['revision'], 'store' => json_decode($row['store_json'], true), 'config' => $row['config_json'] ? json_decode($row['config_json'], true) : null, 'header' => $row['header_json'] ? json_decode($row['header_json'], true) : null]);
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
            $allowed = ['createEmploye','updateEmploye','toggleActifEmploye','initPaieEmploye','initMoisPaie','savePaieSaisie','cloturerMois','deverrouillerMois','importerClasseur','enregistrerSaisieLot'];
            if (!in_array($operation, $allowed, true) || ($operation === 'deverrouillerMois' && $_SESSION['user']['role'] !== 'Administrateur')) { $db->rollBack(); answer(403, ['error' => 'Action non autorisée.']); }
            $new = $input['store'] ?? null; $old = json_decode($row['store_json'], true);
            if (!validStore($new) || !lockedSafe($old, $new, $operation, $_SESSION['user']['role'])) { $db->rollBack(); answer(400, ['error' => 'Données invalides ou période clôturée.']); }
            $new['utilisateurs'] = []; // Les comptes ne font jamais partie des données envoyées par les clients.
            $value = json_encode($new, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
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
answer(404, ['error' => 'Action inconnue.']);
