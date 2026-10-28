<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$path = $argv[1] ?? '';
if (!is_file($path)) { fwrite(STDERR, "Usage : php CREER-COMPTE.php chemin-vers-salfa-config.php\n"); exit(1); }
$c = require $path;
try { $db = new PDO('mysql:host='.$c['host'].';port='.$c['port'].';dbname='.$c['database'].';charset=utf8mb4', $c['user'], $c['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); }
catch (Throwable $e) { fwrite(STDERR, "Connexion MySQL impossible.\n"); exit(1); }
echo "Identifiant : "; $user = trim((string)fgets(STDIN));
echo "Nom complet : "; $name = trim((string)fgets(STDIN));
echo "Role (Administrateur ou Comptable) : "; $role = trim((string)fgets(STDIN));
echo "Mot de passe (12 caracteres minimum, saisie visible) : "; $password = rtrim((string)fgets(STDIN), "\r\n");
if (!preg_match('/^[A-Za-z0-9_.-]{3,80}$/', $user) || !$name || strlen($name) > 160 || !in_array($role, ['Administrateur','Comptable'], true) || strlen($password) < 12) { fwrite(STDERR, "Donnees invalides. Aucun compte cree.\n"); exit(1); }
try { $q=$db->prepare('INSERT INTO salfa_users (username,nom_complet,role,password_hash) VALUES (?,?,?,?)'); $q->execute([$user,$name,$role,password_hash($password,PASSWORD_DEFAULT)]); echo "Compte cree.\n"; }
catch (Throwable $e) { fwrite(STDERR, "Creation impossible (identifiant deja utilise ?).\n"); exit(1); }
