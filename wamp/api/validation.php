<?php
declare(strict_types=1);

function validStore($store): bool {
    if (!is_array($store) || !is_array($store['employes'] ?? null) || !is_array($store['paies'] ?? null) || !is_array($store['comparaison_net'] ?? null) || !is_array($store['meta'] ?? null)) return false;
    $employees = [];
    $mats = [];
    $ids = [];
    $periods = [];
    foreach ($store['employes'] as $e) {
        $id = (int)($e['id'] ?? 0);
        $mat = (int)($e['numero_matricule'] ?? 0);
        if ($id <= 0 || $mat <= 0 || isset($employees[$id]) || isset($mats[$mat])) return false;
        $employees[$id] = true;
        $mats[$mat] = true;
    }
    foreach ($store['paies'] as $p) {
        $id = (int)($p['id'] ?? 0);
        $emp = (int)($p['employe_id'] ?? 0);
        $key = $emp . '|' . ($p['annee'] ?? '') . '|' . strtoupper((string)($p['mois'] ?? ''));
        if ($id <= 0 || !isset($employees[$emp]) || isset($ids[$id]) || isset($periods[$key])) return false;
        $ids[$id] = true;
        $periods[$key] = true;
    }
    if (isset($store['conges'])) {
        if (!is_array($store['conges'])) return false;
        $congeIds = [];
        foreach ($store['conges'] as $c) {
            if (!is_array($c)) return false;
            $cid = (int)($c['id'] ?? 0);
            $emp = (int)($c['employe_id'] ?? 0);
            if ($cid <= 0 || !isset($employees[$emp]) || isset($congeIds[$cid])) return false;
            $congeIds[$cid] = true;
        }
    }
    if (isset($store['annees'])) {
        if (!is_array($store['annees'])) return false;
        foreach ($store['annees'] as $y) {
            if (!is_int($y) && !is_numeric($y)) return false;
            $yi = (int)$y;
            if ($yi < 1990 || $yi > 2100) return false;
        }
    }
    return true;
}

/** Normalise une ligne de bulletin pour comparer deux versions sans faux positifs de typage SQL/JS. */
function normalizePaieForLockCheck(array $p, bool $ignoreUnlock): array {
    $skip = [
        'date_modification' => true,
        'conge_pris_mois' => true,
        'conge_pris_annee' => true,
        'conge_restant' => true,
        'conge_titre_actif' => true,
        'conge_reste_titre' => true,
        'permission_pris_mois' => true,
        'permission_restante' => true,
    ];
    if ($ignoreUnlock) {
        $skip['verrouille'] = true;
    }
    $numericCols = [
        'nombre_annees', 'enfant_a_charge', 'base_aj', 'logt_trsp', 'rendement', 'resp_repres',
        'salaire_brut', 'cnaps', 'patronal', 'salaire_imposable', 'irsa', 'salaire_net',
        'augmentation_divers', 'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir',
        'brut', 'avance', 'med', 'net', 'rap', 'conge_maternite', 'verrouille',
    ];
    $nullableNumCols = ['virement', 'especes'];
    $strCols = ['nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'rib', 'mois', 'date_debut_maternite'];

    $out = [
        'id' => (int)($p['id'] ?? 0),
        'employe_id' => (int)($p['employe_id'] ?? 0),
        'numero_matricule' => (int)($p['numero_matricule'] ?? 0),
        'annee' => (int)($p['annee'] ?? 0),
    ];
    foreach ($numericCols as $col) {
        if (isset($skip[$col])) continue;
        $out[$col] = round((float)($p[$col] ?? 0), 4);
    }
    foreach ($nullableNumCols as $col) {
        $v = $p[$col] ?? null;
        $out[$col] = ($v === null || $v === '') ? null : round((float)$v, 4);
    }
    foreach ($strCols as $col) {
        $val = trim((string)($p[$col] ?? ''));
        $out[$col] = $col === 'mois' ? strtoupper($val) : $val;
    }
    // Conserver aussi tout attribut personnalisé éventuel passé dans les tests unitaires
    foreach ($p as $k => $v) {
        if (isset($skip[$k]) || array_key_exists($k, $out)) continue;
        $out[$k] = is_numeric($v) ? round((float)$v, 4) : $v;
    }
    ksort($out);
    return $out;
}

function lockedSafe(array $old, array $new, string $action, string $role): bool {
    $oldLocked = [];
    $oldPeriods = [];
    $newById = [];
    foreach ($old['paies'] as $p) {
        if ((int)($p['verrouille'] ?? 0) === 1) {
            $oldLocked[(int)$p['id']] = $p;
            $oldPeriods[($p['annee'] ?? '') . '|' . strtoupper((string)($p['mois'] ?? ''))] = true;
        }
    }
    foreach ($new['paies'] as $p) {
        $id = (int)($p['id'] ?? 0);
        $newById[$id] = $p;
        $period = ($p['annee'] ?? '') . '|' . strtoupper((string)($p['mois'] ?? ''));
        if (isset($oldPeriods[$period]) && !isset($oldLocked[$id])) return false;
    }
    foreach ($oldLocked as $id => $p) {
        if (!isset($newById[$id])) return false;
        $n = $newById[$id];
        $ignoreUnlock = ($action === 'deverrouillerMois' && $role === 'Administrateur' && (int)($n['verrouille'] ?? 0) === 0);
        if (normalizePaieForLockCheck($p, $ignoreUnlock) !== normalizePaieForLockCheck($n, $ignoreUnlock)) {
            return false;
        }
    }
    return true;
}
