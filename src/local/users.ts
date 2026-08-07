// ==============================================================================
// CLIENT LOCAL : UTILISATEURS PAR DÉFAUT - SALFA TANAMBAO
// Hashes salés SHA-256 avec sel "salfa_tanambao_2026_salt_".
// ==============================================================================

export function defaultUtilisateurs() {
  return [
    {
      id: 1,
      username: 'admin',
      password_hash: '5a9e592c4c66b0fbabc6246cb059e6852c72652da3cf1dc485a721a3e4db1a97',
      nom_complet: 'Administrateur Principal SALFA',
      role: 'Administrateur',
      actif: 1,
    },
    {
      id: 2,
      username: 'comptable',
      password_hash: '8acd1a4e11b1720b3b80be7db7f3e1340bb093a16f4553f2001b0bdaf9459fc6',
      nom_complet: 'Comptable Clinique SALFA',
      role: 'Comptable',
      actif: 1,
    },
  ];
}
