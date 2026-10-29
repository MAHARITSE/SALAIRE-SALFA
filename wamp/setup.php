<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require_once __DIR__ . '/api/schema.php';

$configPath = $argv[1] ?? '';
if (!$configPath || !is_file($configPath)) {
    fwrite(STDERR, "Indiquez le chemin du fichier de configuration hors www.\n");
    exit(1);
}
$c = require $configPath;
try {
    $db = new PDO(
        'mysql:host=' . $c['host'] . ';port=' . $c['port'] . ';dbname=' . $c['database'] . ';charset=utf8mb4',
        $c['user'],
        $c['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "Connexion MySQL impossible. Verifiez la configuration et les droits.\n");
    exit(1);
}

ensureSalfaInitialized($db);
$nbEmployes = (int)$db->query('SELECT COUNT(*) FROM `salfa_employes`')->fetchColumn();
$nbPaies = (int)$db->query('SELECT COUNT(*) FROM `salfa_paies`')->fetchColumn();
$nbConges = (int)$db->query('SELECT COUNT(*) FROM `salfa_conges`')->fetchColumn();
$nbUsers = (int)$db->query('SELECT COUNT(*) FROM `salfa_users`')->fetchColumn();
echo "Tables relationnelles MySQL pretes : $nbUsers utilisateur(s), $nbEmployes salarie(s), $nbPaies paie(s), $nbConges conge(s).\n";
