<?php
declare(strict_types=1);

// Fenêtre de présence demandée : 1 heure sans contact (secondes).
const SALFA_DUREE_SESSION = 3600;
function sessionPresenceValide($last, int $now): bool {
    return is_int($last) && $last > 0 && $last <= $now && $now - $last <= SALFA_DUREE_SESSION;
}

/** Une session révoquée ou dont le rôle a changé ne doit plus autoriser d'écriture. */
function sessionUserStillAllowed(array $sessionUser, $currentUser): bool {
    return is_array($currentUser)
        && (int)($currentUser['id'] ?? 0) === (int)($sessionUser['id'] ?? 0)
        && (int)($currentUser['actif'] ?? 0) === 1
        && in_array($currentUser['role'] ?? '', ['Administrateur', 'Comptable'], true)
        && ($currentUser['role'] ?? '') === ($sessionUser['role'] ?? '');
}

function validPositiveId($value): bool {
    return is_numeric($value) && is_finite((float)$value) && (float)$value === (float)(int)$value && (int)$value > 0;
}

function validStore($store): bool {
    if (!is_array($store) || !is_array($store['employes'] ?? null) || !is_array($store['paies'] ?? null) || !is_array($store['comparaison_net'] ?? null) || !is_array($store['meta'] ?? null)) return false;
    $employees = [];
    $mats = [];
    $ids = [];
    $periods = [];
    foreach ($store['employes'] as $e) {
        if (!is_array($e) || !validPositiveId($e['id'] ?? null) || !validPositiveId($e['numero_matricule'] ?? null)) return false;
        $id = (int)($e['id'] ?? 0);
        $mat = (int)($e['numero_matricule'] ?? 0);
        if ($id <= 0 || $mat <= 0 || isset($employees[$id]) || isset($mats[$mat])) return false;
        $employees[$id] = true;
        $mats[$mat] = true;
    }
    foreach ($store['paies'] as $p) {
        if (!is_array($p) || !validPositiveId($p['id'] ?? null) || !validPositiveId($p['employe_id'] ?? null)) return false;
        $year = $p['annee'] ?? null;
        if (!validPositiveId($year) || (int)$year < 1990 || (int)$year > 2100) return false;
        if (!in_array(strtoupper((string)($p['mois'] ?? '')), ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'], true)) return false;
        if (isset($p['verrouille']) && (!is_numeric($p['verrouille']) || !in_array((float)$p['verrouille'], [0.0, 1.0], true))) return false;
        foreach (['base_aj', 'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps', 'patronal', 'salaire_imposable', 'irsa', 'salaire_net', 'augmentation_divers', 'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir', 'brut', 'avance', 'med', 'net', 'virement', 'especes'] as $col) {
            if (isset($p[$col]) && (!is_numeric($p[$col]) || !is_finite((float)$p[$col]))) return false;
        }
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
function normalizePaieForLockCheck(
    array $p,
    bool $ignoreUnlock,
    bool $ignoreIdentityReattach = false,
    bool $ignoreEmployeeProfileMeta = false
): array {
    $skip = [
        'date_modification' => true,
        'rap' => true,
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
    if ($ignoreIdentityReattach) {
        $skip['employe_id'] = true;
        $skip['numero_matricule'] = true;
        $skip['nom_prenoms'] = true;
        $skip['numero_cnaps'] = true;
    }
    if ($ignoreEmployeeProfileMeta) {
        // Autoriser l'administrateur à corriger l'identité / la catégorie d'un salarié
        // tout en interdisant strictement toute modification des montants d'un mois clôturé.
        $skip['numero_matricule'] = true;
        $skip['nom_prenoms'] = true;
        $skip['numero_cnaps'] = true;
        $skip['categorie'] = true;
        $skip['jobs'] = true;
        $skip['date_embauche'] = true;
    }
    $numericCols = [
        'nombre_annees', 'enfant_a_charge', 'base_aj', 'logt_trsp', 'rendement', 'resp_repres',
        'salaire_brut', 'cnaps', 'patronal', 'salaire_imposable', 'irsa', 'salaire_net',
        'augmentation_divers', 'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir',
        'brut', 'avance', 'med', 'net', 'conge_maternite', 'verrouille',
    ];
    $nullableNumCols = ['virement', 'especes'];
    $strCols = ['nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'rib', 'mois', 'date_debut_maternite'];

    $out = [
        'id' => (int)($p['id'] ?? 0),
        'annee' => (int)($p['annee'] ?? 0),
    ];
    if (!$ignoreIdentityReattach) {
        $out['employe_id'] = (int)($p['employe_id'] ?? 0);
        if (!$ignoreEmployeeProfileMeta) {
            $out['numero_matricule'] = (int)($p['numero_matricule'] ?? 0);
        }
    }
    foreach ($numericCols as $col) {
        if (isset($skip[$col])) continue;
        $out[$col] = round((float)($p[$col] ?? 0), 4);
    }
    foreach ($nullableNumCols as $col) {
        $v = $p[$col] ?? null;
        $out[$col] = ($v === null || $v === '') ? null : round((float)$v, 4);
    }
    foreach ($strCols as $col) {
        if (isset($skip[$col])) continue;
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
    $newPeriodsWithLockedRow = [];

    // Identifier si exactement une fiche salarié doublon est fusionnée par un Administrateur
    $mergedSourceEmpId = 0;
    if ($action === 'fusionnerEmployes' && $role === 'Administrateur') {
        $newEmpSet = [];
        foreach ($new['employes'] ?? [] as $e) {
            $newEmpSet[(int)($e['id'] ?? 0)] = true;
        }
        $removedIds = [];
        foreach ($old['employes'] ?? [] as $e) {
            $eid = (int)($e['id'] ?? 0);
            if ($eid > 0 && !isset($newEmpSet[$eid])) {
                $removedIds[] = $eid;
            }
        }
        if (count($removedIds) === 1) {
            $mergedSourceEmpId = $removedIds[0];
        }
    }

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
        if ((int)($p['verrouille'] ?? 0) === 1) {
            $newPeriodsWithLockedRow[$period] = true;
        }
        if (isset($oldPeriods[$period]) && !isset($oldLocked[$id])) return false;
    }
    foreach ($oldLocked as $id => $p) {
        $isMergedSourceRow = ($mergedSourceEmpId > 0 && (int)($p['employe_id'] ?? 0) === $mergedSourceEmpId);
        if (!isset($newById[$id])) {
            // Lors d'une fusion de doublon, une ligne verrouillée du doublon ne peut disparaître
            // que si la période correspondante conserve déjà le bulletin verrouillé du salarié cible
            if ($isMergedSourceRow) {
                $period = ($p['annee'] ?? '') . '|' . strtoupper((string)($p['mois'] ?? ''));
                if (isset($newPeriodsWithLockedRow[$period])) {
                    continue;
                }
            }
            return false;
        }
        $n = $newById[$id];
        $ignoreUnlock = ($action === 'deverrouillerMois' && $role === 'Administrateur' && (int)($n['verrouille'] ?? 0) === 0);
        $ignoreEmployeeProfileMeta = ($action === 'updateEmploye' && $role === 'Administrateur');
        if (
            normalizePaieForLockCheck($p, $ignoreUnlock, $isMergedSourceRow, $ignoreEmployeeProfileMeta) !==
            normalizePaieForLockCheck($n, $ignoreUnlock, $isMergedSourceRow, $ignoreEmployeeProfileMeta)
        ) {
            return false;
        }
    }
    return true;
}
