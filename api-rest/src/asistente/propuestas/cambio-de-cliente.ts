import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
import { ClientsService } from 'src/clients/clients.service';
import type { User } from 'src/users/entities/user.entity';
import { normal } from '../herramientas/buscar-en-catalogo';
import { ErrorDeHerramienta } from '../herramientas/comun';
import { esRecepcion } from '../herramientas/recepcion';
import type { ResultadoDeAplicar, TarjetaDePropuesta } from './comun';
import { PropuestasRepository, type Propuesta } from './propuestas.repository';

// CORREGIR UN CLIENTE MAL CLASIFICADO (doc 21 §6): la tarjeta de
// `proponer_cambio_de_cliente`, con el tipo o el nombre de antes y de
// después. Al aprobarla se revisa de nuevo que nadie haya tocado el cliente
// entre medio (su huella: el nombre y el tipo) y que el tipo exista. Se
// guarda por la misma puerta de la ficha del cliente (`ClientsService.update`).

export type CambioPedido = {
  cliente_id: string;
  tipo?: string;
  nombre?: string;
  motivo: string;
};

type Guardado = { name: string; client_type: string | null };

const huellaDe = (c: Guardado) => `${c.name}|${c.client_type ?? ''}`;

@Injectable()
export class CambioDeCliente {
  constructor(
    private readonly guardadas: PropuestasRepository,
    private readonly clientes: ClientsService,
    // Para avisar qué cambia para recepción, que ve las de particulares.
    @Optional() private readonly alcance?: AlcanceDeRecepcion,
  ) {}

  async proponer(
    usuario: User,
    pedido: CambioPedido,
  ): Promise<TarjetaDePropuesta> {
    if (esRecepcion(usuario.role)) {
      throw new ErrorDeHerramienta(
        'Con el cargo de recepción no se cambian los clientes: lo hace quien vende.',
      );
    }
    const empresa = usuario.company_id;
    const c = await this.guardadas.clienteDeLaEmpresa(
      empresa,
      pedido.cliente_id,
    );
    if (!c)
      throw new ErrorDeHerramienta('Ese cliente no existe en esta empresa.');
    const despues: Partial<Guardado> = {};
    if (pedido.tipo) {
      const tipos = await this.guardadas.tiposDeCliente(empresa);
      const tipo = tipos.find((t) => normal(t) === normal(pedido.tipo!.trim()));
      if (!tipo) {
        throw new ErrorDeHerramienta(
          `El tipo tiene que ser uno de estos: ${tipos.join(', ')}.`,
        );
      }
      if (tipo !== c.client_type) despues.client_type = tipo;
    }
    const nombre = pedido.nombre?.trim();
    if (nombre && nombre !== c.name) despues.name = nombre;
    if (despues.name === undefined && despues.client_type === undefined) {
      throw new ErrorDeHerramienta(
        'El cliente ya está así: no hay nada que cambiar.',
      );
    }

    const avisos: string[] = [];
    if (despues.name) {
      const parecidos = await this.clientes.coincidencias(
        { name: despues.name },
        empresa,
      );
      const otro = parecidos.find((x) => x.cliente_id !== c.id);
      if (otro) {
        avisos.push(
          `Ya hay un cliente parecido: «${otro.nombre}». Si es la misma persona, conviene juntarlos en uno.`,
        );
      }
    }
    if (despues.client_type && this.alcance) {
      const [antes, ahora] = await Promise.all([
        this.alcance.esParticular(empresa, c.client_type),
        this.alcance.esParticular(empresa, despues.client_type),
      ]);
      if (antes !== ahora) {
        avisos.push(
          ahora
            ? 'Al quedar como particular, recepción va a ver y trabajar sus cotizaciones.'
            : 'Al dejar de ser particular, recepción ya no ve sus cotizaciones.',
        );
      }
    }

    const fila = await this.guardadas.crearPropuesta({
      company_id: empresa,
      quotation_id: null,
      usuario_id: usuario.id,
      usuario_nombre: usuario.full_name?.trim() || null,
      tipo: 'cliente',
      resumen: pedido.motivo,
      antes: { cliente_id: c.id, name: c.name, client_type: c.client_type },
      despues: { cliente_id: c.id, ...despues },
      huella_antes: huellaDe(c),
    });
    return {
      id: fila.id,
      tipo: 'cliente',
      numero: null,
      cliente: c.name,
      cotizacion_id: null,
      enlace: `/clients/${c.id}`,
      resumen: pedido.motivo,
      lineas: [
        ...(despues.client_type
          ? [
              {
                dia: 'Cliente',
                que: 'Tipo',
                quita: [c.client_type ?? 'sin tipo'],
                agrega: [despues.client_type],
              },
            ]
          : []),
        ...(despues.name
          ? [
              {
                dia: 'Cliente',
                que: 'Nombre',
                quita: [c.name],
                agrega: [despues.name],
              },
            ]
          : []),
      ],
      avisos,
      se_puede_deshacer: false,
      vence_at: fila.vence_at,
    };
  }

  /** El «Sí, cambiar». `alGuardar` avisa que ya quedó guardado. */
  async aplicar(
    usuario: User,
    p: Propuesta,
    alGuardar: () => void,
  ): Promise<ResultadoDeAplicar> {
    if (esRecepcion(usuario.role)) {
      throw new ForbiddenException(
        'Con el cargo de recepción no se cambian los clientes.',
      );
    }
    const empresa = usuario.company_id;
    const d = p.despues as { cliente_id: string } & Partial<Guardado>;
    const c = await this.guardadas.clienteDeLaEmpresa(empresa, d.cliente_id);
    if (!c) throw new NotFoundException('Ese cliente ya no existe.');
    if (huellaDe(c) !== p.huella_antes) {
      throw new ConflictException(
        `«${c.name}» cambió desde que te lo propuse (alguien lo guardó entre medio). Pídemelo de nuevo.`,
      );
    }
    if (d.client_type) {
      const tipos = await this.guardadas.tiposDeCliente(empresa);
      if (!tipos.includes(d.client_type)) {
        throw new ConflictException(
          `El tipo «${d.client_type}» ya no existe en la empresa.`,
        );
      }
    }
    await this.clientes.update(
      c.id,
      {
        ...(d.name ? { name: d.name } : {}),
        ...(d.client_type ? { client_type: d.client_type } : {}),
      },
      empresa,
    );
    alGuardar();
    await this.guardadas
      .moverPropuesta(empresa, p.id, 'aplicando', {
        estado: 'aplicada',
        aplicada_at: new Date().toISOString(),
      })
      .catch(() => undefined);
    return {
      estado: 'aplicada',
      enlace: `/clients/${c.id}`,
      aviso: `Listo: ${d.name ? `«${c.name}» ahora se llama «${d.name}»` : `«${c.name}»`}${d.client_type ? ` y es de «${d.client_type}»` : ''}.`,
    };
  }
}
