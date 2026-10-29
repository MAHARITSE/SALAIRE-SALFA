<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$configPath = $argv[1] ?? '';
if (!$configPath || !is_file($configPath)) { fwrite(STDERR, "Indiquez le chemin du fichier de configuration hors www.\n"); exit(1); }
$c = require $configPath;
try { $db = new PDO('mysql:host='.$c['host'].';port='.$c['port'].';dbname='.$c['database'].';charset=utf8mb4', $c['user'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); }
catch (Throwable $e) { fwrite(STDERR, "Connexion MySQL impossible. Verifiez la configuration et les droits.\n"); exit(1); }
$db->exec("CREATE TABLE IF NOT EXISTS salfa_users (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE, nom_complet VARCHAR(160) NOT NULL, role VARCHAR(32) NOT NULL, actif TINYINT NOT NULL DEFAULT 1, password_hash VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$db->exec("CREATE TABLE IF NOT EXISTS salfa_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, store_json LONGTEXT NOT NULL, config_json LONGTEXT NULL, header_json LONGTEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$empty = ['meta' => ['source_version' => 'classeur-2026-10', 'conges_version' => 'controle-2026-10', 'conges_loi_3ans' => 3], 'bareme_anciennete' => new stdClass(), 'employes' => [], 'paies' => [], 'comparaison_net' => [], 'conges' => [], 'utilisateurs' => []];
$q = $db->prepare('INSERT IGNORE INTO salfa_state (id, revision, store_json) VALUES (1, 0, ?)'); $q->execute([json_encode($empty)]);
// Données déjà présentes (par ex. importées via wamp/sql/salfa_donnees_excel_2022-2026.sql) : ne jamais les écraser.
$etat = json_decode((string)$db->query('SELECT store_json FROM salfa_state WHERE id = 1')->fetchColumn(), true);
$nbEmployes = is_array($etat) && is_array($etat['employes'] ?? null) ? count($etat['employes']) : 0;
$nbPaies = is_array($etat) && is_array($etat['paies'] ?? null) ? count($etat['paies']) : 0;
if ((int)$db->query('SELECT COUNT(*) FROM salfa_users')->fetchColumn() > 0) { echo "Base deja initialisee. Aucune donnee ni compte modifie. ($nbEmployes salaries, $nbPaies lignes de paie presentes)\n"; exit(0); }
echo "Initialisation du compte administrateur (saisie visible a l'ecran).\nIdentifiant : "; $user = trim((string)fgets(STDIN));
echo "Mot de passe (12 caracteres minimum) : "; $password = rtrim((string)fgets(STDIN), "\r\n");
if (!preg_match('/^[A-Za-z0-9_.-]{3,80}$/', $user) || strlen($password) < 12) { fwrite(STDERR, "Identifiant invalide ou mot de passe trop court. Relancez l'installation.\n"); exit(1); }
$q = $db->prepare('INSERT INTO salfa_users (username, nom_complet, role, password_hash) VALUES (?, ?, ?, ?)'); $q->execute([$user, 'Administrateur', 'Administrateur', password_hash($password, PASSWORD_DEFAULT)]);
echo "Installation terminee. Base de paie vide.\n";
