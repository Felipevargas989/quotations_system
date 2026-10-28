import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZONA_DEL_RADAR } from '../oportunidades-cron.service';
import { DatosAbiertosService } from './datos-abiertos.service';

// EL MERCADO, DE NOCHE (decisión 101 del doc 17). A las 00:15 de Chile, entre
// la pasada del radar de las 23:07 y la de las 02:07; no usa la API de
// Mercado Público ni sus tickets, sino los archivos de ChileCompra. Corre
// hasta las 06:30: la primera noche alcanza para los 3 años; las siguientes
// solo recargan lo que cambió. Como todos los relojes, solo con
// NODE_ENV=production.
export const HORA_DEL_MERCADO = '15 0 * * *';
export const DURACION_DE_LA_CARGA_MS = 375 * 60_000;

@Injectable()
export class DatosAbiertosCronService {
  constructor(private readonly datosAbiertos: DatosAbiertosService) {}

  @Cron(HORA_DEL_MERCADO, { timeZone: ZONA_DEL_RADAR })
  deNoche() {
    return this.datosAbiertos.cargar({
      hasta: Date.now() + DURACION_DE_LA_CARGA_MS,
      origen: 'reloj',
    });
  }
}
