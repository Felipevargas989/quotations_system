import { Injectable } from '@nestjs/common';
import { regionesDelMercado } from '../datos-abiertos/mercado-de-la-zona';
import { OferenteRepository } from '../oferente/oferente.repository';
import { OportunidadesRepository } from '../oportunidades.repository';
import {
  anioEnChile,
  TODO_CHILE,
  variantesDelRut,
  type TableroDelRadar,
} from './radar-municipal';
import { RadarMunicipalRepository } from './radar-municipal.repository';

// El radar municipal (decisión 108): de partida, las regiones de la empresa
// (las de Configuración, las mismas de «Se viene»); también una región o
// todo Chile. Los RUT de la empresa salen de «Mi empresa».
@Injectable()
export class RadarMunicipalService {
  constructor(
    private readonly repo: RadarMunicipalRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly oferente: OferenteRepository,
  ) {}

  async tablero(
    companyId: number,
    pedido: { anio?: number; region?: string } = {},
  ): Promise<TableroDelRadar & { regiones: string[]; zona: string[] }> {
    const [config, oferente] = await Promise.all([
      this.oportunidades.configDe(companyId),
      this.oferente.oferente(companyId),
    ]);
    const zona = regionesDelMercado(config?.regiones ?? []);
    const regiones =
      pedido.region === TODO_CHILE
        ? []
        : pedido.region
          ? regionesDelMercado([pedido.region])
          : zona;
    const tablero = await this.repo.tablero(
      pedido.anio ?? anioEnChile(new Date()),
      regiones,
      variantesDelRut(oferente?.rut),
    );
    return { ...tablero, regiones, zona };
  }
}
