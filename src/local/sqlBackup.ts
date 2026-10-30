// ==============================================================================
// GÉNÉRATEUR & JOURNAL DE SAUVEGARDE SQL RELATIONNELLE — SALFA PAIE & CONGÉS
// Génère un script MySQL/MariaDB 100 % relationnel (colonnes et lignes séparées,
// AUCUNE colonne JSON, suppression automatique de l'ancienne table salfa_state),
// incluant les utilisateurs par défaut (admin / comptable), la configuration,
// les barèmes IRSA & ancienneté, l'entête, les salariés, les paies clôturées/actives
// et les fiches de congés & permissions.
// ==============================================================================

import type { JsonStore } from './store';
import type { PaieConfig } from './config';
import { DEFAULT_BAREME_ANCIENNETE, DEFAULT_BAREME_IRSA, DEFAULT_CONFIG } from './config';
import { DEFAULT_CONGES_CONFIG } from './conges';

export interface StoredHeaderSnapshot {
  mode?: 'image' | 'personnalise';
  image?: string;
  fullImage?: string;
  lines?: string[];
  logoLeft?: string;
  logoRight?: string;
}

const DEFAULT_HEADER_LINES = [
  'FIANGONANA LOTERANA MALAGASY',
  '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
  "SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA",
  'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',
  'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',
  'NIF: 5000767080    STAT: 851 125 120 120 001 36',
  'E-mail: salfa.tulear@moov.mg',
];

export function readStoredHeaderSnapshot(): StoredHeaderSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('salfa_bulletin_entete_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function readStoredCongeHeaderSnapshot(): StoredHeaderSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('salfa_conge_entete_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export const DEFAULT_ADMIN_BCRYPT = '$2y$10$YX/zKbv4VMuSaS3ddJB5MuBWGfTgOr6aIf7L4PEsva5y2hyHw0j/G'; // admin123
export const DEFAULT_COMPTABLE_BCRYPT = '$2y$10$xFu0Kw7V7YsnIfrwPjOr1.C6.CfWtRq4Wyo.w/PX8cG36QN2.ezou'; // comptable123

const SQL_HISTORY_KEY = 'salfa_sql_backups_history_v1';

export interface EntreeHistoriqueSql {
  id: string;
  filename: string;
  created_at: string;
  motif: string;
  type: 'CLOTURE' | 'MANUELLE' | 'CONGES';
  size: number;
  nb_employes: number;
  nb_paies: number;
  nb_conges: number;
  server_saved?: boolean;
}

export interface ResultatSauvegardeSql {
  success: boolean;
  filename: string;
  sql: string;
  size: number;
  created_at: string;
  motif: string;
  type: 'CLOTURE' | 'MANUELLE' | 'CONGES';
  downloaded: boolean;
  server_saved?: boolean;
  message?: string;
}

export function sqlEscapeString(val: unknown, maxLen?: number): string {
  if (val === null || val === undefined) return "''";
  let s = String(val);
  if (maxLen && maxLen > 0 && s.length > maxLen) {
    s = s.slice(0, maxLen);
  }
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\0/g, '');
  return `'${escaped}'`;
}

export function sqlNullableString(val: unknown, maxLen?: number): string {
  if (val === null || val === undefined || val === '') return 'NULL';
  return sqlEscapeString(val, maxLen);
}

export function sqlInt(val: unknown, fallback = 0): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.trunc(n));
}

export function sqlFloat(val: unknown, fallback = 0): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return String(fallback);
  const rounded = Math.round(n * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function sqlNullableFloat(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'NULL';
  const n = Number(val);
  if (!Number.isFinite(n)) return 'NULL';
  const rounded = Math.round(n * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatSqlStamp(date = new Date()): { iso: string; fileStamp: string; human: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return {
    iso: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    fileStamp: `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`,
    human: `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`,
  };
}

export function buildSqlBackupFilename(options: {
  type?: 'CLOTURE' | 'MANUELLE' | 'CONGES';
  periode?: string;
  date?: Date;
} = {}): string {
  const { fileStamp } = formatSqlStamp(options.date || new Date());
  const slugPeriode = String(options.periode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (options.type === 'CLOTURE') {
    return `SALFA_CLOTURE_${slugPeriode ? `${slugPeriode}_` : ''}${fileStamp}.sql`;
  }
  if (options.type === 'CONGES') {
    return `SALFA_CONGES_${fileStamp}.sql`;
  }
  return `SALFA_SAUVEGARDE_SQL_${fileStamp}.sql`;
}

const SCHEMA_TABLES_DDL = `-- Suppression définitive d'une éventuelle ancienne table JSON
DROP TABLE IF EXISTS \`salfa_state\`;

CREATE TABLE IF NOT EXISTS \`salfa_users\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`username\` VARCHAR(80) NOT NULL UNIQUE,
  \`nom_complet\` VARCHAR(160) NOT NULL,
  \`role\` VARCHAR(32) NOT NULL,
  \`actif\` TINYINT NOT NULL DEFAULT 1,
  \`password_hash\` VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_revision\` (
  \`id\` TINYINT NOT NULL PRIMARY KEY,
  \`revision\` BIGINT NOT NULL DEFAULT 1,
  \`source_file\` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2026.xlsm',
  \`entreprise\` VARCHAR(160) NOT NULL DEFAULT 'SALFA TANAMBAO',
  \`titre\` VARCHAR(255) NOT NULL DEFAULT 'FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN''OLONA (Bulletin de paie individuel)',
  \`annee\` INT NOT NULL DEFAULT 2026,
  \`source_version\` VARCHAR(60) NOT NULL DEFAULT 'classeur-2026-10',
  \`source_historique\` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2022-2025',
  \`conges_version\` VARCHAR(60) NOT NULL DEFAULT 'controle-2026-10',
  \`conges_loi_3ans\` INT NOT NULL DEFAULT 3,
  \`date_modification\` VARCHAR(32) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_employes\` (
  \`id\` INT NOT NULL PRIMARY KEY,
  \`numero_matricule\` INT NOT NULL UNIQUE,
  \`nom_prenoms\` VARCHAR(160) NOT NULL,
  \`numero_cnaps\` VARCHAR(60) NOT NULL DEFAULT '',
  \`categorie\` VARCHAR(32) NOT NULL DEFAULT '',
  \`jobs\` VARCHAR(160) NOT NULL DEFAULT '',
  \`date_embauche\` VARCHAR(20) NOT NULL DEFAULT '',
  \`nombre_annees\` INT NOT NULL DEFAULT 0,
  \`enfant_a_charge\` INT NOT NULL DEFAULT 0,
  \`base_aj\` DOUBLE NOT NULL DEFAULT 0,
  \`logement_transport\` DOUBLE NOT NULL DEFAULT 0,
  \`rendement\` DOUBLE NOT NULL DEFAULT 0,
  \`responsabilite_representation\` DOUBLE NOT NULL DEFAULT 0,
  \`rib\` VARCHAR(80) NOT NULL DEFAULT '',
  \`mode_paiement\` VARCHAR(32) NOT NULL DEFAULT 'ESPECES',
  \`actif\` TINYINT NOT NULL DEFAULT 1,
  \`date_inactif\` VARCHAR(20) NOT NULL DEFAULT '',
  \`conge_maternite\` TINYINT NOT NULL DEFAULT 0,
  \`date_debut_maternite\` VARCHAR(20) NOT NULL DEFAULT '',
  \`date_creation\` VARCHAR(32) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_paies\` (
  \`id\` INT NOT NULL PRIMARY KEY,
  \`employe_id\` INT NOT NULL,
  \`numero_matricule\` INT NOT NULL,
  \`annee\` INT NOT NULL,
  \`mois\` VARCHAR(20) NOT NULL,
  \`nom_prenoms\` VARCHAR(160) NOT NULL DEFAULT '',
  \`numero_cnaps\` VARCHAR(60) NOT NULL DEFAULT '',
  \`categorie\` VARCHAR(32) NOT NULL DEFAULT '',
  \`jobs\` VARCHAR(160) NOT NULL DEFAULT '',
  \`date_embauche\` VARCHAR(20) NOT NULL DEFAULT '',
  \`nombre_annees\` INT NOT NULL DEFAULT 0,
  \`enfant_a_charge\` INT NOT NULL DEFAULT 0,
  \`base_aj\` DOUBLE NOT NULL DEFAULT 0,
  \`logt_trsp\` DOUBLE NOT NULL DEFAULT 0,
  \`rendement\` DOUBLE NOT NULL DEFAULT 0,
  \`resp_repres\` DOUBLE NOT NULL DEFAULT 0,
  \`salaire_brut\` DOUBLE NOT NULL DEFAULT 0,
  \`cnaps\` DOUBLE NOT NULL DEFAULT 0,
  \`patronal\` DOUBLE NOT NULL DEFAULT 0,
  \`salaire_imposable\` DOUBLE NOT NULL DEFAULT 0,
  \`irsa\` DOUBLE NOT NULL DEFAULT 0,
  \`salaire_net\` DOUBLE NOT NULL DEFAULT 0,
  \`augmentation_divers\` DOUBLE NOT NULL DEFAULT 0,
  \`prime_de_garde\` DOUBLE NOT NULL DEFAULT 0,
  \`anciennete2\` DOUBLE NOT NULL DEFAULT 0,
  \`risque\` DOUBLE NOT NULL DEFAULT 0,
  \`repr_rec\` DOUBLE NOT NULL DEFAULT 0,
  \`accessoir\` DOUBLE NOT NULL DEFAULT 0,
  \`brut\` DOUBLE NOT NULL DEFAULT 0,
  \`avance\` DOUBLE NOT NULL DEFAULT 0,
  \`med\` DOUBLE NOT NULL DEFAULT 0,
  \`net\` DOUBLE NOT NULL DEFAULT 0,
  \`virement\` DOUBLE NULL DEFAULT NULL,
  \`especes\` DOUBLE NULL DEFAULT NULL,
  \`rap\` TINYINT NOT NULL DEFAULT 1,
  \`rib\` VARCHAR(80) NOT NULL DEFAULT '',
  \`verrouille\` TINYINT NOT NULL DEFAULT 0,
  \`conge_maternite\` TINYINT NOT NULL DEFAULT 0,
  \`date_debut_maternite\` VARCHAR(20) NOT NULL DEFAULT '',
  \`date_modification\` VARCHAR(32) NOT NULL DEFAULT '',
  UNIQUE KEY \`uq_paie_periode\` (\`employe_id\`, \`annee\`, \`mois\`),
  KEY \`idx_paie_annee_mois\` (\`annee\`, \`mois\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_conges\` (
  \`id\` INT NOT NULL PRIMARY KEY,
  \`employe_id\` INT NOT NULL,
  \`numero_matricule\` INT NOT NULL DEFAULT 0,
  \`nom_prenoms\` VARCHAR(160) NOT NULL DEFAULT '',
  \`fonction\` VARCHAR(160) NOT NULL DEFAULT '',
  \`service\` VARCHAR(120) NOT NULL DEFAULT '',
  \`contact\` VARCHAR(120) NOT NULL DEFAULT '',
  \`categorie\` VARCHAR(32) NOT NULL DEFAULT 'CONGE',
  \`motif_code\` VARCHAR(40) NOT NULL DEFAULT '',
  \`motif_libelle\` VARCHAR(255) NOT NULL DEFAULT '',
  \`imputation\` VARCHAR(32) NOT NULL DEFAULT 'CONGE',
  \`annee\` INT NOT NULL,
  \`date_demande\` VARCHAR(20) NOT NULL DEFAULT '',
  \`date_debut\` VARCHAR(20) NOT NULL DEFAULT '',
  \`heure_debut\` VARCHAR(16) NOT NULL DEFAULT '',
  \`date_fin\` VARCHAR(20) NOT NULL DEFAULT '',
  \`date_retour\` VARCHAR(20) NOT NULL DEFAULT '',
  \`heure_fin\` VARCHAR(16) NOT NULL DEFAULT '',
  \`jours_demandes\` DOUBLE NOT NULL DEFAULT 0,
  \`jours_valides\` DOUBLE NULL DEFAULT NULL,
  \`remplacant\` VARCHAR(160) NOT NULL DEFAULT '',
  \`titre_periode\` VARCHAR(80) NOT NULL DEFAULT '',
  \`justificatif\` VARCHAR(255) NOT NULL DEFAULT '',
  \`observations\` TEXT NOT NULL,
  \`statut\` VARCHAR(32) NOT NULL DEFAULT 'VALIDE',
  \`visa_chef_par\` VARCHAR(120) NOT NULL DEFAULT '',
  \`visa_chef_le\` VARCHAR(32) NOT NULL DEFAULT '',
  \`visa_medecin_par\` VARCHAR(120) NOT NULL DEFAULT '',
  \`visa_medecin_le\` VARCHAR(32) NOT NULL DEFAULT '',
  \`visa_gestionnaire_par\` VARCHAR(120) NOT NULL DEFAULT '',
  \`visa_gestionnaire_le\` VARCHAR(32) NOT NULL DEFAULT '',
  \`motif_refus\` VARCHAR(255) NOT NULL DEFAULT '',
  \`ajustement_type\` VARCHAR(32) NOT NULL DEFAULT '',
  \`saisie_par\` VARCHAR(80) NOT NULL DEFAULT '',
  \`date_saisie\` VARCHAR(32) NOT NULL DEFAULT '',
  \`date_modification\` VARCHAR(32) NOT NULL DEFAULT '',
  KEY \`idx_conge_employe_annee\` (\`employe_id\`, \`annee\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_comparaison_net\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`numero_matricule\` INT NOT NULL,
  \`nom_prenoms\` VARCHAR(160) NOT NULL DEFAULT '',
  \`categorie\` VARCHAR(32) NOT NULL DEFAULT '',
  \`jobs\` VARCHAR(160) NOT NULL DEFAULT '',
  \`net_actuel\` DOUBLE NOT NULL DEFAULT 0,
  \`net_avant\` DOUBLE NOT NULL DEFAULT 0,
  \`ecart\` DOUBLE NOT NULL DEFAULT 0,
  KEY \`idx_comp_matricule\` (\`numero_matricule\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_config\` (
  \`id\` TINYINT NOT NULL PRIMARY KEY,
  \`configuree\` TINYINT NOT NULL DEFAULT 0,
  \`cnaps_salariale\` DOUBLE NOT NULL DEFAULT 1.0,
  \`cnaps_patronale\` DOUBLE NOT NULL DEFAULT 13.0,
  \`deduction_enfant\` DOUBLE NOT NULL DEFAULT 2000,
  \`min_irsa\` DOUBLE NOT NULL DEFAULT 3000,
  \`arrondi_irsa_base\` INT NOT NULL DEFAULT 100,
  \`arrondi_net\` INT NOT NULL DEFAULT 100,
  \`plafond_especes\` DOUBLE NOT NULL DEFAULT 5000,
  \`taux_maternite\` DOUBLE NOT NULL DEFAULT 50,
  \`duree_maternite_mois\` INT NOT NULL DEFAULT 3,
  \`jours_conge_par_an\` DOUBLE NOT NULL DEFAULT 30,
  \`nb_annees_cumul\` INT NOT NULL DEFAULT 3,
  \`plafond_cumul_conge\` DOUBLE NOT NULL DEFAULT 30,
  \`jours_permission_par_an\` DOUBLE NOT NULL DEFAULT 10,
  \`report_autorise\` TINYINT NOT NULL DEFAULT 0,
  \`exclure_dimanche\` TINYINT NOT NULL DEFAULT 0,
  \`exclure_samedi\` TINYINT NOT NULL DEFAULT 0,
  \`jours_feries\` TEXT NOT NULL,
  \`examen_sur_permission\` TINYINT NOT NULL DEFAULT 0,
  \`bloquer_depassement\` TINYINT NOT NULL DEFAULT 1,
  \`version_calendrier\` INT NOT NULL DEFAULT 3,
  \`icone_app\` LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_bareme_anciennete\` (
  \`ordre\` INT NOT NULL PRIMARY KEY,
  \`annees_min\` INT NOT NULL,
  \`annees_max\` INT NOT NULL,
  \`indice\` DOUBLE NOT NULL,
  \`description\` VARCHAR(60) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_bareme_irsa\` (
  \`ordre\` INT NOT NULL PRIMARY KEY,
  \`seuil_min\` DOUBLE NOT NULL,
  \`seuil_max\` DOUBLE NULL DEFAULT NULL,
  \`taux\` DOUBLE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_entete\` (
  \`id\` TINYINT NOT NULL PRIMARY KEY,
  \`configuree\` TINYINT NOT NULL DEFAULT 0,
  \`mode\` VARCHAR(20) NOT NULL DEFAULT 'image',
  \`ligne_1\` VARCHAR(255) NOT NULL DEFAULT 'FIANGONANA LOTERANA MALAGASY',
  \`ligne_2\` VARCHAR(255) NOT NULL DEFAULT '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
  \`ligne_3\` VARCHAR(255) NOT NULL DEFAULT 'SAMPAN''ASA LOTERANA MOMBA NY FAHASALAMANA',
  \`ligne_4\` VARCHAR(255) NOT NULL DEFAULT 'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',
  \`ligne_5\` VARCHAR(255) NOT NULL DEFAULT 'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',
  \`ligne_6\` VARCHAR(255) NOT NULL DEFAULT 'NIF: 5000767080    STAT: 851 125 120 120 001 36',
  \`ligne_7\` VARCHAR(255) NOT NULL DEFAULT 'E-mail: salfa.tulear@moov.mg',
  \`image_finale\` LONGTEXT NULL,
  \`image_complete\` LONGTEXT NULL,
  \`logo_gauche\` LONGTEXT NULL,
  \`logo_droite\` LONGTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`salfa_annees\` (
  \`annee\` INT NOT NULL PRIMARY KEY,
  \`date_creation\` VARCHAR(32) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

function chunkArray<T>(items: T[], size = 150): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Construit un dump SQL relationnel complet (10 tables normalisées, zéro colonne JSON).
 */
export function buildRelationalSqlBackup(params: {
  store: JsonStore;
  config?: PaieConfig | null;
  header?: StoredHeaderSnapshot | null;
  motif?: string;
  congesOnly?: boolean;
  date?: Date;
}): string {
  const now = params.date || new Date();
  const { iso } = formatSqlStamp(now);
  const store = params.store || ({ employes: [], paies: [], conges: [], comparaison_net: [], meta: {} } as any);
  const cfg = params.config || DEFAULT_CONFIG;
  const congies = cfg.congies || DEFAULT_CONGES_CONFIG;
  const hdr = params.header || null;
  const employes = Array.isArray(store.employes) ? store.employes : [];
  const paies = Array.isArray(store.paies) ? store.paies : [];
  const conges = Array.isArray(store.conges) ? store.conges : [];
  const comparaison = Array.isArray(store.comparaison_net) ? store.comparaison_net : [];
  const motif = params.motif || (params.congesOnly ? 'Sauvegarde SQL Congés & Permissions' : 'Sauvegarde SQL complète');

  const periodesVerrouillees = new Set<string>();
  for (const p of paies) {
    if (Number((p as any).verrouille) === 1) {
      periodesVerrouillees.add(`${(p as any).mois} ${(p as any).annee}`);
    }
  }

  const lines: string[] = [];
  lines.push('-- ==============================================================================');
  lines.push('-- SAUVEGARDE SQL RELATIONNELLE — SALFA TANAMBAO (PAIE & CONGÉS)');
  lines.push(`-- Générée le : ${iso}`);
  lines.push(`-- Motif      : ${motif}`);
  lines.push(`-- Contenu    : ${employes.length} salarié(s), ${params.congesOnly ? '(paies préservées)' : `${paies.length} bulletin(s)`}, ${conges.length} fiche(s) congés/permissions`);
  if (periodesVerrouillees.size > 0 && !params.congesOnly) {
    lines.push(`-- Clôtures   : ${Array.from(periodesVerrouillees).join(', ')}`);
  }
  lines.push('-- Format     : 100 % relationnel (colonnes et lignes MySQL, aucun JSON)');
  lines.push('-- ==============================================================================');
  lines.push('');
  lines.push('SET NAMES utf8mb4;');
  lines.push('SET FOREIGN_KEY_CHECKS = 0;');
  lines.push('CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  lines.push('USE `salfa_paie`;');
  lines.push('');
  lines.push('START TRANSACTION;');
  lines.push('');
  lines.push(SCHEMA_TABLES_DDL);
  lines.push('');

  // 1. Utilisateurs par défaut (INSERT IGNORE pour ne jamais écraser un mot de passe modifié en base)
  lines.push('-- Comptes utilisateurs par défaut (admin / admin123, comptable / comptable123)');
  lines.push('INSERT IGNORE INTO `salfa_users` (`id`, `username`, `nom_complet`, `role`, `actif`, `password_hash`) VALUES');
  lines.push(`  (1, 'admin', 'Administrateur Principal SALFA', 'Administrateur', 1, '${DEFAULT_ADMIN_BCRYPT}'),`);
  lines.push(`  (2, 'comptable', 'Comptable Clinique SALFA', 'Comptable', 1, '${DEFAULT_COMPTABLE_BCRYPT}');`);
  lines.push('');

  // Comptes supplémentaires éventuels issus du store local
  const extraUsers = Array.isArray((store as any).utilisateurs)
    ? (store as any).utilisateurs.filter((u: any) => u && u.username && u.username !== 'admin' && u.username !== 'comptable')
    : [];
  if (extraUsers.length > 0) {
    lines.push('-- Comptes utilisateurs additionnels');
    for (const u of extraUsers) {
      const role = u.role === 'Administrateur' ? 'Administrateur' : 'Comptable';
      const fallbackHash = role === 'Administrateur' ? DEFAULT_ADMIN_BCRYPT : DEFAULT_COMPTABLE_BCRYPT;
      const hash = typeof u.password_hash === 'string' && u.password_hash.startsWith('$2') ? u.password_hash : fallbackHash;
      lines.push(
        `INSERT IGNORE INTO \`salfa_users\` (\`id\`, \`username\`, \`nom_complet\`, \`role\`, \`actif\`, \`password_hash\`) VALUES (${sqlInt(u.id, 3)}, ${sqlEscapeString(u.username, 80)}, ${sqlEscapeString(u.nom_complet || u.username, 160)}, ${sqlEscapeString(role, 32)}, ${Number(u.actif) === 0 ? 0 : 1}, ${sqlEscapeString(hash, 255)});`
      );
    }
    lines.push('');
  }

  // 2. Salariés (INSERT IGNORE en mode congesOnly, remplacement complet en mode COMPLET)
  if (params.congesOnly) {
    if (employes.length > 0) {
      lines.push('-- Salariés référencés (sans écraser les salaires déjà présents en base)');
      for (const batch of chunkArray(employes, 100)) {
        lines.push('INSERT IGNORE INTO `salfa_employes` (`id`, `numero_matricule`, `nom_prenoms`, `numero_cnaps`, `categorie`, `jobs`, `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`, `logement_transport`, `rendement`, `responsabilite_representation`, `rib`, `mode_paiement`, `actif`, `date_inactif`, `conge_maternite`, `date_debut_maternite`, `date_creation`) VALUES');
        lines.push(
          batch
            .map((e: any) => `  (${sqlInt(e.id)}, ${sqlInt(e.numero_matricule)}, ${sqlEscapeString(e.nom_prenoms, 160)}, ${sqlEscapeString(e.numero_cnaps, 60)}, ${sqlEscapeString(e.categorie, 32)}, ${sqlEscapeString(e.jobs, 160)}, ${sqlEscapeString(e.date_embauche, 20)}, ${sqlInt(e.nombre_annees)}, ${sqlInt(e.enfant_a_charge)}, ${sqlFloat(e.base_aj)}, ${sqlFloat(e.logement_transport)}, ${sqlFloat(e.rendement)}, ${sqlFloat(e.responsabilite_representation)}, ${sqlEscapeString(e.rib, 80)}, ${sqlEscapeString(e.mode_paiement || 'ESPECES', 32)}, ${Number(e.actif) === 0 ? 0 : 1}, ${sqlEscapeString(e.date_inactif, 20)}, ${e.conge_maternite ? 1 : 0}, ${sqlEscapeString(e.date_debut_maternite, 20)}, ${sqlEscapeString(e.date_creation, 32)})`)
            .join(',\n') + ';'
        );
      }
      lines.push('');
    }
  } else {
    const meta: any = store.meta || {};
    lines.push('-- Métadonnées & révision');
    lines.push('DELETE FROM `salfa_revision`;');
    lines.push(
      `INSERT INTO \`salfa_revision\` (\`id\`, \`revision\`, \`source_file\`, \`entreprise\`, \`titre\`, \`annee\`, \`source_version\`, \`source_historique\`, \`conges_version\`, \`conges_loi_3ans\`, \`date_modification\`) VALUES (1, 1, ${sqlEscapeString(meta.source_file || 'SALAIRE SALFA 2026.xlsm', 160)}, ${sqlEscapeString(meta.entreprise || 'SALFA TANAMBAO', 160)}, ${sqlEscapeString(meta.titre || "FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA (Bulletin de paie individuel)", 255)}, ${sqlInt(meta.annee, 2026)}, ${sqlEscapeString(meta.source_version || 'classeur-2026-10', 60)}, ${sqlEscapeString(meta.source_historique || 'SALAIRE SALFA 2022-2025', 160)}, ${sqlEscapeString(meta.conges_version || 'controle-2026-10', 60)}, ${sqlInt(meta.conges_loi_3ans, 3)}, ${sqlEscapeString(iso, 32)});`
    );
    lines.push('');

    // Configuration relationnelle (incluant icone_app et congés indépendants plafonnés à 30 j/an)
    lines.push('-- Configuration de paie, congés (30 j/an indépendants) et icône application');
    lines.push('DELETE FROM `salfa_config`;');
    lines.push(
      `INSERT INTO \`salfa_config\` (\`id\`, \`configuree\`, \`cnaps_salariale\`, \`cnaps_patronale\`, \`deduction_enfant\`, \`min_irsa\`, \`arrondi_irsa_base\`, \`arrondi_net\`, \`plafond_especes\`, \`taux_maternite\`, \`duree_maternite_mois\`, \`jours_conge_par_an\`, \`nb_annees_cumul\`, \`plafond_cumul_conge\`, \`jours_permission_par_an\`, \`report_autorise\`, \`exclure_dimanche\`, \`exclure_samedi\`, \`jours_feries\`, \`examen_sur_permission\`, \`bloquer_depassement\`, \`version_calendrier\`, \`icone_app\`) VALUES (1, 1, ${sqlFloat(cfg.cnapsSalariale, 1)}, ${sqlFloat(cfg.cnapsPatronale, 13)}, ${sqlFloat(cfg.deductionEnfant, 2000)}, ${sqlFloat(cfg.minIrsa, 3000)}, ${sqlInt(cfg.arrondiIrsaBase, 100)}, ${sqlInt(cfg.arrondiNet, 100)}, ${sqlFloat(cfg.plafondEspeces, 5000)}, ${sqlFloat(cfg.tauxMaternite, 50)}, ${sqlInt(cfg.dureeMaterniteMois, 3)}, ${sqlFloat(Math.min(30, congies.joursCongeParAn || 30), 30)}, ${sqlInt(congies.nbAnneesCumul, 3)}, ${sqlFloat(Math.min(30, congies.plafondCumulConge || 30), 30)}, ${sqlFloat(congies.joursPermissionParAn, 10)}, 0, ${congies.exclureDimanche ? 1 : 0}, ${congies.exclureSamedi ? 1 : 0}, ${sqlEscapeString(congies.joursFeries || '')}, ${congies.examenSurPermission ? 1 : 0}, ${congies.bloquerDepassement === false ? 0 : 1}, 3, ${sqlNullableString(cfg.iconeApp)});`
    );
    lines.push('');

    // Barème ancienneté
    const baremeAnc = Array.isArray(cfg.baremeAnciennete) && cfg.baremeAnciennete.length > 0
      ? cfg.baremeAnciennete
      : DEFAULT_BAREME_ANCIENNETE;
    lines.push('-- Barème d’ancienneté');
    lines.push('DELETE FROM `salfa_bareme_anciennete`;');
    lines.push('INSERT INTO `salfa_bareme_anciennete` (`ordre`, `annees_min`, `annees_max`, `indice`, `description`) VALUES');
    lines.push(
      baremeAnc
        .map((b, idx) => {
          const desc = b.min === 0 ? '0 à 1 an' : b.max >= 100 ? `${b.min} et plus` : String(b.min);
          return `  (${idx + 1}, ${sqlInt(b.min)}, ${sqlInt(b.max)}, ${sqlFloat(b.indice, 1)}, ${sqlEscapeString(desc, 60)})`;
        })
        .join(',\n') + ';'
    );
    lines.push('');

    // Barème IRSA
    const baremeIrsa = Array.isArray(cfg.baremeIrsa) && cfg.baremeIrsa.length > 0
      ? cfg.baremeIrsa
      : DEFAULT_BAREME_IRSA;
    lines.push('-- Barème progressif IRSA');
    lines.push('DELETE FROM `salfa_bareme_irsa`;');
    lines.push('INSERT INTO `salfa_bareme_irsa` (`ordre`, `seuil_min`, `seuil_max`, `taux`) VALUES');
    lines.push(
      baremeIrsa
        .map((t, idx) => `  (${idx + 1}, ${sqlFloat(t.min)}, ${sqlNullableFloat(t.max)}, ${sqlFloat(t.taux)})`)
        .join(',\n') + ';'
    );
    lines.push('');

    // Entêtes (id=1 : bulletins de paie, id=2 : congés & fiches d'absence)
    const hLines = hdr && Array.isArray(hdr.lines) && hdr.lines.length >= 7 ? hdr.lines : DEFAULT_HEADER_LINES;
    const hdrConge = readStoredCongeHeaderSnapshot();
    const hcLines = hdrConge && Array.isArray(hdrConge.lines) && hdrConge.lines.length >= 7 ? hdrConge.lines : DEFAULT_HEADER_LINES;
    lines.push("-- Entêtes des bulletins (id=1) et des fiches de congé (id=2)");
    lines.push('DELETE FROM `salfa_entete`;');
    lines.push(
      `INSERT INTO \`salfa_entete\` (\`id\`, \`configuree\`, \`mode\`, \`ligne_1\`, \`ligne_2\`, \`ligne_3\`, \`ligne_4\`, \`ligne_5\`, \`ligne_6\`, \`ligne_7\`, \`image_finale\`, \`image_complete\`, \`logo_gauche\`, \`logo_droite\`) VALUES\n` +
      `  (1, ${hdr ? 1 : 0}, ${sqlEscapeString(hdr?.mode === 'personnalise' ? 'personnalise' : 'image', 20)}, ${sqlEscapeString(hLines[0], 255)}, ${sqlEscapeString(hLines[1], 255)}, ${sqlEscapeString(hLines[2], 255)}, ${sqlEscapeString(hLines[3], 255)}, ${sqlEscapeString(hLines[4], 255)}, ${sqlEscapeString(hLines[5], 255)}, ${sqlEscapeString(hLines[6], 255)}, ${sqlNullableString(hdr?.image)}, ${sqlNullableString(hdr?.fullImage)}, ${sqlNullableString(hdr?.logoLeft)}, ${sqlNullableString(hdr?.logoRight)}),\n` +
      `  (2, ${hdrConge ? 1 : 0}, ${sqlEscapeString(hdrConge?.mode === 'personnalise' ? 'personnalise' : 'image', 20)}, ${sqlEscapeString(hcLines[0], 255)}, ${sqlEscapeString(hcLines[1], 255)}, ${sqlEscapeString(hcLines[2], 255)}, ${sqlEscapeString(hcLines[3], 255)}, ${sqlEscapeString(hcLines[4], 255)}, ${sqlEscapeString(hcLines[5], 255)}, ${sqlEscapeString(hcLines[6], 255)}, ${sqlNullableString(hdrConge?.image)}, ${sqlNullableString(hdrConge?.fullImage)}, ${sqlNullableString(hdrConge?.logoLeft)}, ${sqlNullableString(hdrConge?.logoRight)});`
    );
    lines.push('');

    // Salariés
    lines.push('-- Salariés');
    lines.push('DELETE FROM `salfa_employes`;');
    for (const batch of chunkArray(employes, 100)) {
      lines.push('INSERT INTO `salfa_employes` (`id`, `numero_matricule`, `nom_prenoms`, `numero_cnaps`, `categorie`, `jobs`, `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`, `logement_transport`, `rendement`, `responsabilite_representation`, `rib`, `mode_paiement`, `actif`, `date_inactif`, `conge_maternite`, `date_debut_maternite`, `date_creation`) VALUES');
      lines.push(
        batch
          .map((e: any) => `  (${sqlInt(e.id)}, ${sqlInt(e.numero_matricule)}, ${sqlEscapeString(e.nom_prenoms, 160)}, ${sqlEscapeString(e.numero_cnaps, 60)}, ${sqlEscapeString(e.categorie, 32)}, ${sqlEscapeString(e.jobs, 160)}, ${sqlEscapeString(e.date_embauche, 20)}, ${sqlInt(e.nombre_annees)}, ${sqlInt(e.enfant_a_charge)}, ${sqlFloat(e.base_aj)}, ${sqlFloat(e.logement_transport)}, ${sqlFloat(e.rendement)}, ${sqlFloat(e.responsabilite_representation)}, ${sqlEscapeString(e.rib, 80)}, ${sqlEscapeString(e.mode_paiement || 'ESPECES', 32)}, ${Number(e.actif) === 0 ? 0 : 1}, ${sqlEscapeString(e.date_inactif, 20)}, ${e.conge_maternite ? 1 : 0}, ${sqlEscapeString(e.date_debut_maternite, 20)}, ${sqlEscapeString(e.date_creation, 32)})`)
          .join(',\n') + ';'
      );
    }
    lines.push('');

    // Paies mensuelles
    lines.push('-- Bulletins de paie mensuels (avec état de clôture verrouille)');
    lines.push('DELETE FROM `salfa_paies`;');
    for (const batch of chunkArray(paies, 150)) {
      lines.push('INSERT INTO `salfa_paies` (`id`, `employe_id`, `numero_matricule`, `annee`, `mois`, `nom_prenoms`, `numero_cnaps`, `categorie`, `jobs`, `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`, `logt_trsp`, `rendement`, `resp_repres`, `salaire_brut`, `cnaps`, `patronal`, `salaire_imposable`, `irsa`, `salaire_net`, `augmentation_divers`, `prime_de_garde`, `anciennete2`, `risque`, `repr_rec`, `accessoir`, `brut`, `avance`, `med`, `net`, `virement`, `especes`, `rap`, `rib`, `verrouille`, `conge_maternite`, `date_debut_maternite`, `date_modification`) VALUES');
      lines.push(
        batch
          .map((p: any) => `  (${sqlInt(p.id)}, ${sqlInt(p.employe_id)}, ${sqlInt(p.numero_matricule)}, ${sqlInt(p.annee)}, ${sqlEscapeString(String(p.mois || '').toUpperCase(), 20)}, ${sqlEscapeString(p.nom_prenoms, 160)}, ${sqlEscapeString(p.numero_cnaps, 60)}, ${sqlEscapeString(p.categorie, 32)}, ${sqlEscapeString(p.jobs, 160)}, ${sqlEscapeString(p.date_embauche, 20)}, ${sqlInt(p.nombre_annees)}, ${sqlInt(p.enfant_a_charge)}, ${sqlFloat(p.base_aj)}, ${sqlFloat(p.logt_trsp)}, ${sqlFloat(p.rendement)}, ${sqlFloat(p.resp_repres)}, ${sqlFloat(p.salaire_brut)}, ${sqlFloat(p.cnaps)}, ${sqlFloat(p.patronal)}, ${sqlFloat(p.salaire_imposable)}, ${sqlFloat(p.irsa)}, ${sqlFloat(p.salaire_net)}, ${sqlFloat(p.augmentation_divers)}, ${sqlFloat(p.prime_de_garde)}, ${sqlFloat(p.anciennete2)}, ${sqlFloat(p.risque)}, ${sqlFloat(p.repr_rec)}, ${sqlFloat(p.accessoir)}, ${sqlFloat(p.brut)}, ${sqlFloat(p.avance)}, ${sqlFloat(p.med)}, ${sqlFloat(p.net)}, ${sqlNullableFloat(p.virement)}, ${sqlNullableFloat(p.especes)}, ${Number(p.rap ?? 1) === 0 ? 0 : 1}, ${sqlEscapeString(p.rib, 80)}, ${Number(p.verrouille) === 1 ? 1 : 0}, ${p.conge_maternite ? 1 : 0}, ${sqlEscapeString(p.date_debut_maternite, 20)}, ${sqlEscapeString(p.date_modification, 32)})`)
          .join(',\n') + ';'
      );
    }
    lines.push('');

    // Comparaison net
    lines.push('-- Comparaison des salaires nets');
    lines.push('DELETE FROM `salfa_comparaison_net`;');
    for (const batch of chunkArray(comparaison, 150)) {
      lines.push('INSERT INTO `salfa_comparaison_net` (`id`, `numero_matricule`, `nom_prenoms`, `categorie`, `jobs`, `net_actuel`, `net_avant`, `ecart`) VALUES');
      lines.push(
        batch
          .map((c: any, idx: number) => `  (${sqlInt(c.id, idx + 1)}, ${sqlInt(c.numero_matricule)}, ${sqlEscapeString(c.nom_prenoms, 160)}, ${sqlEscapeString(c.categorie, 32)}, ${sqlEscapeString(c.jobs, 160)}, ${sqlFloat(c.net_actuel)}, ${sqlFloat(c.net_avant)}, ${sqlFloat(c.ecart)})`)
          .join(',\n') + ';'
      );
    }
    lines.push('');

    // Années ajoutées explicitement
    const anneesExplicites = Array.isArray((store as any).annees)
      ? Array.from(
          new Set<number>(
            ((store as any).annees as any[])
              .map((y) => Number(y))
              .filter((y) => Number.isInteger(y) && y >= 1990 && y <= 2100)
          )
        ).sort((a, b) => a - b)
      : [];
    lines.push('-- Années ajoutées explicitement dans la base');
    lines.push('DELETE FROM `salfa_annees`;');
    if (anneesExplicites.length > 0) {
      lines.push('INSERT INTO `salfa_annees` (`annee`, `date_creation`) VALUES');
      lines.push(
        anneesExplicites.map((y) => `  (${sqlInt(y)}, ${sqlEscapeString(iso, 32)})`).join(',\n') + ';'
      );
    }
    lines.push('');
  }

  // 3. Congés, permissions et examens médicaux
  lines.push('-- Fiches de congés, permissions, examens médicaux et soldes saisis');
  lines.push('DELETE FROM `salfa_conges`;');
  for (const batch of chunkArray(conges, 150)) {
    lines.push('INSERT INTO `salfa_conges` (`id`, `employe_id`, `numero_matricule`, `nom_prenoms`, `fonction`, `service`, `contact`, `categorie`, `motif_code`, `motif_libelle`, `imputation`, `annee`, `date_demande`, `date_debut`, `heure_debut`, `date_fin`, `date_retour`, `heure_fin`, `jours_demandes`, `jours_valides`, `remplacant`, `titre_periode`, `justificatif`, `observations`, `statut`, `visa_chef_par`, `visa_chef_le`, `visa_medecin_par`, `visa_medecin_le`, `visa_gestionnaire_par`, `visa_gestionnaire_le`, `motif_refus`, `ajustement_type`, `saisie_par`, `date_saisie`, `date_modification`) VALUES');
    lines.push(
      batch
        .map((c: any, idx: number) => `  (${sqlInt(c.id, idx + 1)}, ${sqlInt(c.employe_id)}, ${sqlInt(c.numero_matricule)}, ${sqlEscapeString(c.nom_prenoms, 160)}, ${sqlEscapeString(c.fonction, 160)}, ${sqlEscapeString(c.service, 120)}, ${sqlEscapeString(c.contact, 120)}, ${sqlEscapeString(c.categorie || 'CONGE', 32)}, ${sqlEscapeString(c.motif_code, 40)}, ${sqlEscapeString(c.motif_libelle, 255)}, ${sqlEscapeString(c.imputation || 'CONGE', 32)}, ${sqlInt(c.annee, 2026)}, ${sqlEscapeString(c.date_demande, 20)}, ${sqlEscapeString(c.date_debut, 20)}, ${sqlEscapeString(c.heure_debut, 16)}, ${sqlEscapeString(c.date_fin, 20)}, ${sqlEscapeString(c.date_retour, 20)}, ${sqlEscapeString(c.heure_fin, 16)}, ${sqlFloat(c.jours_demandes)}, ${sqlNullableFloat(c.jours_valides)}, ${sqlEscapeString(c.remplacant, 160)}, ${sqlEscapeString(c.titre_periode, 80)}, ${sqlEscapeString(c.justificatif, 255)}, ${sqlEscapeString(c.observations)}, ${sqlEscapeString(c.statut || 'VALIDE', 32)}, ${sqlEscapeString(c.visa_chef_par, 120)}, ${sqlEscapeString(c.visa_chef_le, 32)}, ${sqlEscapeString(c.visa_medecin_par, 120)}, ${sqlEscapeString(c.visa_medecin_le, 32)}, ${sqlEscapeString(c.visa_gestionnaire_par, 120)}, ${sqlEscapeString(c.visa_gestionnaire_le, 32)}, ${sqlEscapeString(c.motif_refus, 255)}, ${sqlEscapeString(c.ajustement_type, 32)}, ${sqlEscapeString(c.saisie_par, 80)}, ${sqlEscapeString(c.date_saisie, 32)}, ${sqlEscapeString(c.date_modification, 32)})`)
        .join(',\n') + ';'
    );
  }
  lines.push('');
  lines.push('COMMIT;');
  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  lines.push('');
  return lines.join('\n');
}

/** Déclenche le téléchargement du fichier .sql dans le navigateur (sans planter sous Node/tests). */
export function triggerSqlDownload(filename: string, sqlContent: string): boolean {
  try {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return false;
    }
    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 1500);
    return true;
  } catch {
    return false;
  }
}

export function lireHistoriqueSauvegardesSql(): EntreeHistoriqueSql[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SQL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enregistrerEntreeHistoriqueSql(entree: EntreeHistoriqueSql): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const actuel = lireHistoriqueSauvegardesSql().filter((x) => x.filename !== entree.filename);
    const suivant = [entree, ...actuel].slice(0, 25);
    localStorage.setItem(SQL_HISTORY_KEY, JSON.stringify(suivant));
  } catch {
    /* ignore */
  }
}

let derniereSauvegardeMemoire: ResultatSauvegardeSql | null = null;

export function setDerniereSauvegardeSql(res: ResultatSauvegardeSql | null): void {
  derniereSauvegardeMemoire = res;
}

export function getDerniereSauvegardeSql(): ResultatSauvegardeSql | null {
  return derniereSauvegardeMemoire;
}
