<?php
declare(strict_types=1);
function validStore($store): bool {
    if (!is_array($store) || !is_array($store['employes'] ?? null) || !is_array($store['paies'] ?? null) || !is_array($store['comparaison_net'] ?? null) || !is_array($store['meta'] ?? null)) return false;
    $employees = []; $mats = []; $ids = []; $periods = [];
    foreach ($store['employes'] as $e) { $id = (int)($e['id'] ?? 0); $mat = (int)($e['numero_matricule'] ?? 0); if ($id <= 0 || $mat <= 0 || isset($employees[$id]) || isset($mats[$mat])) return false; $employees[$id] = true; $mats[$mat] = true; }
    foreach ($store['paies'] as $p) { $id = (int)($p['id'] ?? 0); $emp = (int)($p['employe_id'] ?? 0); $key = $emp.'|'.($p['annee'] ?? '').'|'.strtoupper((string)($p['mois'] ?? '')); if ($id <= 0 || !isset($employees[$emp]) || isset($ids[$id]) || isset($periods[$key])) return false; $ids[$id] = true; $periods[$key] = true; }
    if (isset($store['conges'])) {
        if (!is_array($store['conges'])) return false;
        $congeIds = [];
        foreach ($store['conges'] as $c) {
            if (!is_array($c)) return false;
            $cid = (int)($c['id'] ?? 0); $emp = (int)($c['employe_id'] ?? 0);
            if ($cid <= 0 || !isset($employees[$emp]) || isset($congeIds[$cid])) return false;
            $congeIds[$cid] = true;
        }
    }
    return true;
}
function lockedSafe(array $old, array $new, string $action, string $role): bool {
    $oldLocked = []; $oldPeriods = []; $newById = [];
    foreach ($old['paies'] as $p) if ((int)($p['verrouille'] ?? 0) === 1) { $oldLocked[(int)$p['id']] = $p; $oldPeriods[($p['annee'] ?? '').'|'.strtoupper((string)($p['mois'] ?? ''))] = true; }
    foreach ($new['paies'] as $p) { $id = (int)($p['id'] ?? 0); $newById[$id] = $p; $period = ($p['annee'] ?? '').'|'.strtoupper((string)($p['mois'] ?? '')); if (isset($oldPeriods[$period]) && !isset($oldLocked[$id])) return false; }
    foreach ($oldLocked as $id => $p) {
        if (!isset($newById[$id])) return false; $n = $newById[$id];
        if ($action === 'deverrouillerMois' && $role === 'Administrateur' && (int)($n['verrouille'] ?? 0) === 0) { unset($p['verrouille'], $p['date_modification'], $n['verrouille'], $n['date_modification']); }
        if ($p != $n) return false;
    }
    return true;
}
