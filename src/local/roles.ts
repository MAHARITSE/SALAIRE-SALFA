// ==============================================================================
// DROITS D'ACCÈS PAR RÔLE — CLINIQUE SALFA TANAMBAO
// - Administrateur : accès complet à toutes les fonctionnalités de l'application
// - Comptable      : accès exclusif aux Permissions & Congés
// ==============================================================================

export type AppTab = 'salaries' | 'bulletins' | 'rapports' | 'conges';

export function estRoleAdmin(role?: string | null): boolean {
  return role === 'Administrateur';
}

export function ongletsAutorisesPourRole(role?: string | null): AppTab[] {
  if (estRoleAdmin(role)) {
    return ['salaries', 'bulletins', 'rapports', 'conges'];
  }
  return ['conges'];
}
