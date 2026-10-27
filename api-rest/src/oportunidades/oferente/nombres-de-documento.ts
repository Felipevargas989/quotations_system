// LOS NOMBRES DE LOS TIPOS DE LA CARPETA DE «MI EMPRESA», como los lee la
// IA y como los nombra el set. Viven aparte desde la decisión 83 (26-10):
// la validación ahora lee el ZIP entero y el set los nombra, y si siguieran
// en `validacion.service.ts` los dos se importarían en círculo.

export const NOMBRES_DE_DOCUMENTO: Readonly<Record<string, string>> = {
  patente: 'Patente municipal',
  inicio_actividades: 'Inicio de actividades (SII)',
  programa_integridad: 'Programa de integridad',
  f30: 'Certificado F30',
  f30_1: 'Certificado F30-1 (cumplimiento de obligaciones laborales)',
  vigencia: 'Certificado de vigencia de la sociedad',
  resolucion_sanitaria: 'Resolución sanitaria',
  dj_trabajadores: 'Declaración jurada de trabajadores',
  erut: 'e-RUT (SII)',
  no_quiebra: 'Certificado de no quiebra',
  estatutos: 'Escritura de constitución y estatutos',
  respaldo_patente: 'Respaldo de la patente (contrato, comodato o dictamen)',
  otro: 'Otro',
};
