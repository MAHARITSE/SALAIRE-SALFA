<?php
declare(strict_types=1);

/** Parse uniquement les dumps relationnels SALFA. Aucun SQL fourni n'est exécuté. */
function salfaSqlStatements(string $sql): array {
    if (strlen($sql) > 10000000 || strpos($sql, 'SAUVEGARDE SQL RELATIONNELLE') === false) {
        throw new InvalidArgumentException('Choisissez une sauvegarde SQL complète SALFA (10 Mo maximum).');
    }
    $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql);
    $out = []; $buffer = ''; $quoted = false; $length = strlen($sql);
    for ($i = 0; $i < $length; $i++) {
        $c = $sql[$i];
        if (!$quoted && $c === '-' && ($sql[$i + 1] ?? '') === '-' && ctype_space($sql[$i + 2] ?? ' ')) {
            while ($i < $length && $sql[$i] !== "\n") $i++;
            $buffer .= "\n"; continue;
        }
        $buffer .= $c;
        if ($quoted && $c === '\\') {
            if (++$i >= $length) throw new InvalidArgumentException('Chaîne SQL incomplète.');
            $buffer .= $sql[$i]; continue;
        }
        if ($c === "'") {
            if ($quoted && ($sql[$i + 1] ?? '') === "'") { $buffer .= $sql[++$i]; continue; }
            $quoted = !$quoted;
        }
        if (!$quoted && $c === ';') { $out[] = trim(substr($buffer, 0, -1)); $buffer = ''; }
    }
    if ($quoted || trim($buffer) !== '') throw new InvalidArgumentException('Sauvegarde tronquée ou instruction sans point-virgule.');
    return $out;
}

function salfaSqlValues(string $text, int $columns): array {
    $rows = []; $i = 0; $len = strlen($text);
    $space = static function () use (&$i, $len, $text): void { while ($i < $len && ctype_space($text[$i])) $i++; };
    while ($i < $len) {
        $space();
        if (($text[$i++] ?? '') !== '(') throw new InvalidArgumentException('Liste de valeurs SQL invalide.');
        $row = [];
        while (true) {
            $space();
            if (($text[$i] ?? '') === "'") {
                $i++; $value = ''; $closed = false;
                while ($i < $len) {
                    $c = $text[$i++];
                    if ($c === '\\') {
                        if ($i >= $len) break;
                        $next = $text[$i++];
                        $value .= ['n' => "\n", 'r' => "\r", 't' => "\t", '0' => "\0", 'Z' => "\x1a"][$next] ?? $next;
                    } elseif ($c === "'") {
                        if (($text[$i] ?? '') === "'") { $value .= "'"; $i++; }
                        else { $closed = true; break; }
                    } else { $value .= $c; }
                }
                if (!$closed) throw new InvalidArgumentException('Chaîne SQL incomplète.');
            } else {
                if (!preg_match('/\G(NULL|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/Ai', $text, $m, 0, $i)) {
                    throw new InvalidArgumentException('Seules les valeurs littérales sont acceptées (aucune fonction SQL).');
                }
                $i += strlen($m[0]); $value = strtoupper($m[0]) === 'NULL' ? null : $m[0];
            }
            $row[] = $value; $space(); $separator = $text[$i++] ?? '';
            if ($separator === ')') break;
            if ($separator !== ',') throw new InvalidArgumentException('Séparateur SQL invalide.');
        }
        if (count($row) !== $columns) throw new InvalidArgumentException('Nombre de colonnes SQL incohérent.');
        $rows[] = $row; $space();
        if ($i === $len) break;
        if (($text[$i++] ?? '') !== ',') throw new InvalidArgumentException('Fin de liste SQL invalide.');
        $space();
        if ($i === $len) throw new InvalidArgumentException('Liste SQL tronquée.');
    }
    if (!$rows) throw new InvalidArgumentException('Aucune valeur SQL.');
    return $rows;
}

function salfaParseRestore(string $sql): array {
    $tables = ['salfa_revision', 'salfa_employes', 'salfa_paies', 'salfa_conges', 'salfa_comparaison_net', 'salfa_config', 'salfa_bareme_anciennete', 'salfa_bareme_irsa', 'salfa_entete', 'salfa_annees'];
    $allowed = array_merge($tables, ['salfa_users']); $deleted = []; $operations = []; $committed = false;
    foreach (salfaSqlStatements($sql) as $stmt) {
        if ($stmt === '') continue;
        if (preg_match('/^(?:SET NAMES utf8mb4|SET FOREIGN_KEY_CHECKS\s*=\s*[01]|START TRANSACTION|USE `salfa_paie`|DROP TABLE IF EXISTS `salfa_state`|CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)$/i', $stmt)) continue;
        // Le DDL est reconnu pour compatibilité, mais n'est jamais exécuté.
        if (preg_match('/^CREATE TABLE IF NOT EXISTS `(salfa_[a-z_]+)`\s*\(/i', $stmt, $m) && in_array($m[1], $allowed, true)) continue;
        if (strcasecmp($stmt, 'COMMIT') === 0) { $committed = true; continue; }
        if ($committed) throw new InvalidArgumentException('Données après COMMIT.');
        if (preg_match('/^DELETE FROM `(salfa_[a-z_]+)`$/i', $stmt, $m) && in_array($m[1], $allowed, true)) {
            if ($m[1] !== 'salfa_users') {
                if (isset($deleted[$m[1]])) throw new InvalidArgumentException('Table répétée dans la sauvegarde.');
                $deleted[$m[1]] = true; $operations[] = ['table' => $m[1], 'delete' => true];
            }
            continue;
        }
        if (preg_match('/^INSERT(?: IGNORE)? INTO `(salfa_[a-z_]+)`\s*\(([^)]+)\)\s*VALUES\s*(.+)$/is', $stmt, $m) && in_array($m[1], $allowed, true)) {
            $cols = array_map('trim', explode(',', $m[2]));
            foreach ($cols as &$col) {
                if (!preg_match('/^`([a-z_][a-z_0-9]*)`$/', $col, $cm)) throw new InvalidArgumentException('Colonne SQL invalide.');
                $col = $cm[1];
            }
            unset($col);
            if (count(array_unique($cols)) !== count($cols)) throw new InvalidArgumentException('Colonne répétée.');
            $rows = salfaSqlValues($m[3], count($cols));
            // Préserver les comptes actuels, leurs mots de passe et les sessions.
            if ($m[1] === 'salfa_users') continue;
            if (!isset($deleted[$m[1]])) throw new InvalidArgumentException('Sauvegarde partielle non prise en charge.');
            $operations[] = ['table' => $m[1], 'columns' => $cols, 'rows' => $rows];
            continue;
        }
        throw new InvalidArgumentException('Instruction non prise en charge. Utilisez un export SQL complet SALFA.');
    }
    if (!$committed || count($deleted) !== count($tables)) throw new InvalidArgumentException('Sauvegarde complète requise (les exports Congés seuls sont refusés).');
    return $operations;
}

/** L'appelant doit avoir ouvert une transaction et verrouillé salfa_revision. */
function salfaApplyRestore(PDO $db, array $operations): void {
    $columns = [];
    foreach ($operations as $op) {
        $table = $op['table'];
        if (!isset($columns[$table])) $columns[$table] = $db->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($op['delete'])) { $db->exec("DELETE FROM `$table`"); continue; }
        foreach ($op['columns'] as $column) {
            if (!in_array($column, $columns[$table], true)) throw new InvalidArgumentException('Schéma de sauvegarde incompatible : colonne inconnue.');
        }
        $names = implode(', ', array_map(static fn($c) => "`$c`", $op['columns']));
        $marks = implode(', ', array_fill(0, count($op['columns']), '?'));
        $statement = $db->prepare("INSERT INTO `$table` ($names) VALUES ($marks)");
        foreach ($op['rows'] as $row) $statement->execute($row);
    }
}
