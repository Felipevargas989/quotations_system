/**
 * Client types constants for the application
 */

export const CLIENT_TYPES = [
  "Colegios & Universidades",
  "Particulares",
  "Tour Operadores",
  "Empresas",
  "Iglesias",
  "Empresas Publicas",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

/**
 * Default client type for new clients
 */
export const DEFAULT_CLIENT_TYPE: ClientType = "Particulares";
