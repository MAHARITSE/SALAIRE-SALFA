<?php
declare(strict_types=1);
require_once __DIR__ . '/api/sqlRestore.php';
function verifier(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$tables = ['salfa_revision', 'salfa_employes', 'salfa_paies', 'salfa_conges', 'salfa_comparaison_net', 'salfa_config', 'salfa_bareme_anciennete', 'salfa_bareme_irsa', 'salfa_entete', 'salfa_annees'];
$prefix = "-- SAUVEGARDE SQL RELATIONNELLE\nSET NAMES utf8mb4;\nSTART TRANSACTION;\n";
$body = '';
foreach ($tables as $table) $body .= "DELETE FROM `$table`;\n";
$valid = $prefix . $body . "INSERT INTO `salfa_employes` (`id`, `nom_prenoms`) VALUES (1, 'L''employé; -- SALFA'),(2, 'ligne\\nsuivante');\nCOMMIT;\nSET FOREIGN_KEY_CHECKS = 1;\n";
$ops = salfaParseRestore($valid);
verifier(count($ops) === 11, 'Tables complètes et INSERT reconnus');
verifier($ops[10]['rows'][0][1] === "L'employé; -- SALFA", 'Apostrophe, point-virgule et commentaire dans les données');
verifier($ops[10]['rows'][1][1] === "ligne\nsuivante", 'Nouvelle ligne décodée');
$withUsers = str_replace('COMMIT;', "DELETE FROM `salfa_users`; INSERT INTO `salfa_users` (`id`) VALUES (1); COMMIT;", $valid);
verifier(count(salfaParseRestore($withUsers)) === 11, 'Comptes serveur conservés');
foreach ([
    str_replace('COMMIT;', 'SELECT SLEEP(1); COMMIT;', $valid),
    str_replace('COMMIT;', 'DROP TABLE `salfa_employes`; COMMIT;', $valid),
    str_replace('COMMIT;', "INSERT INTO `salfa_employes` (`id`) VALUES (SLEEP(1)); COMMIT;", $valid),
    str_replace('COMMIT;', "INSERT INTO `autre_base`.`salfa_employes` (`id`) VALUES (1); COMMIT;", $valid),
    str_replace('DELETE FROM `salfa_paies`;', '', $valid),
    str_replace('COMMIT;', '', $valid),
    $prefix . "DELETE FROM `salfa_conges`; COMMIT;",
    $valid . 'DELETE FROM `salfa_employes`;',
    str_replace("(2, 'ligne\\nsuivante')", '(2)', $valid),
] as $bad) {
    try { salfaParseRestore($bad); throw new RuntimeException('Un SQL interdit a été accepté'); }
    catch (InvalidArgumentException $e) { /* attendu */ }
}
// PDO SQLite permet de vérifier les écritures préparées et le rollback sans MySQL.
class RestoreTestPdo extends PDO {
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
        if (preg_match('/^SHOW COLUMNS FROM `([a-z_]+)`$/', $query, $m)) {
            return parent::query("SELECT name FROM pragma_table_info('" . $m[1] . "')");
        }
        return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs);
    }
}
$db = new RestoreTestPdo('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach ($tables as $table) $db->exec("CREATE TABLE `$table` (id INTEGER PRIMARY KEY, nom_prenoms TEXT)");
$db->exec("INSERT INTO salfa_employes VALUES (99, 'Ancien')");
$db->beginTransaction(); salfaApplyRestore($db, $ops); $db->commit();
verifier($db->query('SELECT COUNT(*) FROM salfa_employes')->fetchColumn() == 2, 'Restauration appliquée');
verifier($db->query('SELECT nom_prenoms FROM salfa_employes WHERE id=1')->fetchColumn() === "L'employé; -- SALFA", 'Valeur préparée exacte');
$db->beginTransaction();
try {
    $badOps = $ops;
    $badOps[] = ['table' => 'salfa_employes', 'columns' => ['colonne_inconnue'], 'rows' => [[1]]];
    salfaApplyRestore($db, $badOps);
    throw new RuntimeException('Colonne inconnue acceptée');
} catch (InvalidArgumentException $e) { $db->rollBack(); }
verifier($db->query('SELECT COUNT(*) FROM salfa_employes')->fetchColumn() == 2, 'Rollback sur erreur de schéma');
if (isset($argv[1])) {
    $generated = file_get_contents($argv[1]);
    verifier(count(salfaParseRestore($generated)) >= 10, 'Export local réel accepté');
}
echo "SQL restauration : dump complet, littéraux, comptes conservés, scripts arbitraires/partiels/tronqués refusés : OK\n";
