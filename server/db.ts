// ==============================================================================
// SERVEUR NODE : ACCÈS SQLITE ET SYNCHRONISATION DU DISQUE (TYPESCRIPT)
// ==============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs, { Database } from 'sql.js';
import { calculerPaieEmploye, BaremeAnciennete } from './calcul';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: Database | null = null;
const DB_PATH = path.resolve(__dirname, '../../paie_salfa.db');
const SCHEMA_PATH = path.resolve(__dirname, '../../schema.sql');
const JSON_PATH = path.resolve(__dirname, '../../salfa_data.json');

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(buffer);
  } else {
    dbInstance = new SQL.Database();
    if (fs.existsSync(SCHEMA_PATH)) {
      const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
      dbInstance.run(schemaSql);
    }
  }

  // Activer foreign keys et migrations de schéma
  dbInstance.run("PRAGMA foreign_keys = ON;");
  try { dbInstance.run("ALTER TABLE employes ADD COLUMN conge_maternite BOOLEAN DEFAULT 0;"); } catch {}
  try { dbInstance.run("ALTER TABLE paie_mensuelle ADD COLUMN conge_maternite BOOLEAN DEFAULT 0;"); } catch {}
  
  // Vérifier et alimenter les données initiales
  seedDataIfEmpty();
  return dbInstance;
}

export function saveDb() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export async function queryAll<T = any>(sqlStr: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sqlStr);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export async function queryOne<T = any>(sqlStr: string, params: any[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sqlStr, params);
  return rows[0] || null;
}

export async function execWrite(sqlStr: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  db.run(sqlStr, params);
  saveDb();
}

function seedDataIfEmpty() {
  if (!dbInstance) return;
  const countRes = dbInstance.exec("SELECT count(*) as count FROM employes");
  const count = countRes[0]?.values[0]?.[0] as number || 0;
  
  if (count === 0 && fs.existsSync(JSON_PATH)) {
    console.log("[SERVER] Base vide détectée. Seeding initial depuis salfa_data.json...");
    try {
      const raw = fs.readFileSync(JSON_PATH, 'utf8');
      const data = JSON.parse(raw);
      
      // 1. Bareme
      const bareme = data.bareme_anciennete?.bareme || [];
      for (const item of bareme) {
        const annees = item.annees_anciennete;
        const indice = Number(item.indice_augmentation || 1.0);
        const amin = typeof annees === 'number' ? annees : 20;
        const amax = typeof annees === 'number' ? annees + 1 : 100;
        dbInstance.run(
          "INSERT INTO bareme_anciennete (annees_min, annees_max, indice_augmentation, description) VALUES (?, ?, ?, ?)",
          [amin, amax, indice, String(annees)]
        );
      }
      
      // 2. Employés
      const employesMap: Record<number, any> = {};
      const paieData = data.paie_mensuelle || {};
      for (const mois of Object.keys(paieData)) {
        for (const emp of paieData[mois].employes || []) {
          const mat = emp["N° Mat"];
          if (mat && mat !== "Total") {
            const mInt = Number(mat);
            employesMap[mInt] = {
              numero_matricule: mInt,
              nom_prenoms: String(emp["NOM ET PRENOMS"] || "").trim(),
              numero_cnaps: String(emp["N° CNaPS"] || "").trim(),
              categorie: String(emp["CAT"] || ""),
              jobs: String(emp["JOBS"] || ""),
              date_embauche: String(emp["Date emb"] || ""),
              nombre_annees: Number(emp["Nombre d'année"] || 0),
              enfant_a_charge: Number(emp["enfant a charge"] || 0),
              base_aj: Number(emp["BASE AJ"] || 0),
              logement_transport: Number(emp["Logt Trsp"] || 0),
              rendement: Number(emp["Rendement"] || 0),
              responsabilite_representation: Number(emp["RESP REPRES"] || 0),
              rib: String(emp["RIB"] || "").trim(),
              mode_paiement: emp["RIB"] ? "VIREMENT" : "ESPECES",
              actif: 1
            };
          }
        }
      }
      
      for (const emp of data.comparaison_net?.employes || []) {
        const mat = emp["N° Mat"];
        if (mat && mat !== "Total") {
          const mInt = Number(mat);
          if (!employesMap[mInt]) {
            employesMap[mInt] = {
              numero_matricule: mInt,
              nom_prenoms: String(emp["NOM ET PRENOMS"] || "").trim(),
              numero_cnaps: "",
              categorie: String(emp["CAT"] || ""),
              jobs: String(emp["JOBS"] || ""),
              date_embauche: "",
              nombre_annees: 0,
              enfant_a_charge: 0,
              base_aj: 0,
              logement_transport: 0,
              rendement: 0,
              responsabilite_representation: 0,
              rib: "",
              mode_paiement: "ESPECES",
              actif: 1
            };
          }
        }
      }
      
      for (const mat of Object.keys(employesMap)) {
        const e = employesMap[Number(mat)];
        dbInstance.run(`
          INSERT INTO employes (
            numero_matricule, nom_prenoms, numero_cnaps, categorie, jobs,
            date_embauche, nombre_annees, enfant_a_charge, base_aj,
            logement_transport, rendement, responsabilite_representation,
            rib, mode_paiement, actif
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          e.numero_matricule, e.nom_prenoms, e.numero_cnaps, e.categorie, e.jobs,
          e.date_embauche, e.nombre_annees, e.enfant_a_charge, e.base_aj,
          e.logement_transport, e.rendement, e.responsabilite_representation,
          e.rib, e.mode_paiement, e.actif
        ]);
      }
      
      // 3. Paies (Janvier à Juin 2026)
      const matToIdRes = dbInstance.exec("SELECT id, numero_matricule FROM employes");
      const matToId: Record<number, number> = {};
      if (matToIdRes[0]) {
        for (const row of matToIdRes[0].values) {
          matToId[Number(row[1])] = Number(row[0]);
        }
      }
      
      for (const mois of Object.keys(paieData)) {
        for (const emp of paieData[mois].employes || []) {
          const mat = emp["N° Mat"];
          if (!mat || mat === "Total") continue;
          const empId = matToId[Number(mat)];
          if (!empId) continue;
          
          dbInstance.run(`
            INSERT INTO paie_mensuelle (
              employe_id, numero_matricule, annee, mois, nom_prenoms, numero_cnaps, categorie, jobs,
              date_embauche, nombre_annees, enfant_a_charge, base_aj, logt_trsp, rendement, resp_repres,
              salaire_brut, cnaps, patronal, salaire_imposable, irsa, salaire_net, augmentation_divers,
              prime_de_garde, anciennete2, risque, repr_rec, accessoir, brut, avance, med, net,
              virement, especes, rap, rib, verrouille
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
            )
          `, [
            empId, Number(mat), 2026, mois, String(emp["NOM ET PRENOMS"] || ""),
            String(emp["N° CNaPS"] || ""), String(emp["CAT"] || ""), String(emp["JOBS"] || ""),
            String(emp["Date emb"] || ""), Number(emp["Nombre d'année"] || 0), Number(emp["enfant a charge"] || 0),
            Number(emp["BASE AJ"] || 0), Number(emp["Logt Trsp"] || 0), Number(emp["Rendement"] || 0),
            Number(emp["RESP REPRES"] || 0), Number(emp["Salaire Brut"] || 0), Number(emp["CNaPS"] || 0),
            Number(emp["Patronal"] || 0), Number(emp["salaire imp."] || 0), Number(emp["IRSA"] || 0),
            Number(emp["SALAIRE NET"] || 0), Number(emp["AUGMENTATION DIVERS"] || 0), Number(emp["Prime  de garde"] || 0),
            Number(emp["Ancienneté2"] || 0), Number(emp["RISQUE"] || 0), Number(emp["Repr° réc°"] || 0),
            Number(emp["Accessoir"] || 0), Number(emp["BRUT"] || 0), Number(emp["AVANCE"] || 0),
            Number(emp["MED"] || 0), Number(emp["NET"] || 0), emp["Virement"] != null ? Number(emp["Virement"]) : null,
            emp["Espèces"] != null ? Number(emp["Espèces"]) : 0, emp["RAP"] !== false ? 1 : 0, String(emp["RIB"] || "").trim()
          ]);
        }
      }

      // 4. Comparaison
      for (const cemp of data.comparaison_net?.employes || []) {
        const mat = cemp["N° Mat"];
        if (!mat || mat === "Total") continue;
        dbInstance.run(`
          INSERT INTO comparaison_net (numero_matricule, nom_prenoms, categorie, jobs, net_actuel, net_avant, ecart)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          Number(mat), String(cemp["NOM ET PRENOMS"] || ""), String(cemp["CAT"] || ""),
          String(cemp["JOBS"] || ""), Number(cemp["NET"] || 0), Number(cemp["Net Avant"] || 0), Number(cemp["ECART"] || 0)
        ]);
      }
      
      saveDb();
      console.log("[SERVER] Seeding terminé. Données 2026 chargées dans SQLite.");
    } catch (e) {
      console.error("[SERVER] Erreur seeding:", e);
    }
  }
}
