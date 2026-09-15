import { SetMetadata } from '@nestjs/common';

// MÓDULOS PROPIOS (14-09-2026, paso 3 del roadmap de venta).
//
// Personal y Marketing no se venden: son de Valle del Sol. Cada empresa
// guarda en `companies.modulos_propios` qué módulos propios tiene
// encendidos (migración 111; la empresa 1 nace con los dos). Un
// controller marcado con @ModuloPropio('personal') exige ese módulo en
// TODAS sus rutas; una ruta marcada con @ModuloPropio(null) se abre
// aunque el controller esté cerrado — así Post-Venta sigue usando las
// sillas y el Dashboard el costo de personal sin tener el módulo.
export const MODULO_PROPIO_KEY = 'moduloPropio';
export type ModuloPropio = 'personal' | 'marketing';
export const ModuloPropio = (modulo: ModuloPropio | null) =>
  SetMetadata(MODULO_PROPIO_KEY, modulo);
