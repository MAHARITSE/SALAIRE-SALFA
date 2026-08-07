// ==============================================================================
// TYPES ET INTERFACES TYPESCRIPT - SALFA TANAMBAO
// ==============================================================================

export interface Employe {
  id: number;
  numero_matricule: number;
  nom_prenoms: string;
  numero_cnaps: string;
  categorie: string;
  jobs: string;
  date_embauche: string;
  nombre_annees: number;
  enfant_a_charge: number;
  base_aj: number;
  logement_transport: number;
  rendement: number;
  responsabilite_representation: number;
  rib: string;
  mode_paiement: string;
  actif: number;
  conge_maternite?: number | boolean;
}

export interface PaieMensuelle {
  id: number;
  employe_id: number;
  numero_matricule: number;
  annee: number;
  mois: string;
  nom_prenoms: string;
  numero_cnaps: string;
  categorie: string;
  jobs: string;
  date_embauche: string;
  nombre_annees: number;
  enfant_a_charge: number;
  base_aj: number;
  logt_trsp: number;
  rendement: number;
  resp_repres: number;
  salaire_brut: number;
  cnaps: number;
  patronal: number;
  salaire_imposable: number;
  irsa: number;
  salaire_net: number;
  augmentation_divers: number;
  prime_de_garde: number;
  anciennete2: number;
  risque: number;
  repr_rec: number;
  accessoir: number;
  brut: number;
  avance: number;
  med: number;
  net: number;
  virement: number | null;
  especes: number | null;
  rap: number;
  rib: string;
  verrouille: number;
  conge_maternite?: number | boolean;
}

export interface TotauxMois {
  count_employes?: number;
  total_enfant_a_charge?: number;
  total_base_aj?: number;
  total_logt_trsp?: number;
  total_rendement?: number;
  total_resp_repres?: number;
  total_salaire_brut?: number;
  total_cnaps?: number;
  total_patronal?: number;
  total_salaire_imposable?: number;
  total_irsa?: number;
  total_salaire_net?: number;
  total_augmentation_divers?: number;
  total_prime_de_garde?: number;
  total_anciennete2?: number;
  total_risque?: number;
  total_repr_rec?: number;
  total_accessoir?: number;
  total_brut?: number;
  total_avance?: number;
  total_med?: number;
  total_net?: number;
  total_virement?: number;
  total_especes?: number;
}

export interface ComparaisonNet {
  numero_matricule: number;
  nom_prenoms: string;
  categorie: string;
  jobs: string;
  net_actuel: number;
  net_avant: number;
  ecart: number;
}

export interface UserSession {
  id: number;
  username: string;
  nom_complet: string;
  role: 'Administrateur' | 'Comptable';
  actif?: number;
}
