import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/auth/roles.decorator';
import { UserRole, type User } from 'src/users/entities/user.entity';
import {
  EventDocumentsController,
  EventDocumentsRepository,
} from '../event-documents.controller';

// 03-11-2026, Felipe: "los vendedores sí deben subir captures". Entran
// a los respaldos, pero solo a los comerciales.
describe('Respaldos del evento: el vendedor sube los comerciales', () => {
  const vendedor = { company_id: 1, role: UserRole.VENDEDOR } as User;
  const operaciones = { company_id: 1, role: UserRole.OPERACIONES } as User;
  const dto = (category: string) => ({
    quotation_id: '00000000-0000-0000-0000-000000000000',
    category,
    file_name: 'Captura',
    file_url: 'c1/x.png',
  });

  const armar = () => {
    const repo = {
      add: jest.fn().mockResolvedValue({ added: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };
    const ctrl = new EventDocumentsController(
      repo as unknown as EventDocumentsRepository,
    );
    return { repo, ctrl };
  };

  it('el controller admite al vendedor', () => {
    const roles = new Reflector().get<UserRole[]>(
      ROLES_KEY,
      EventDocumentsController,
    );
    expect(roles).toEqual(
      expect.arrayContaining([
        UserRole.VENDEDOR,
        UserRole.OPERACIONES,
        UserRole.ADMINISTRADOR,
      ]),
    );
    expect(roles).not.toContain(UserRole.RECEPCION);
  });

  it('el vendedor guarda un respaldo comercial', async () => {
    const { repo, ctrl } = armar();
    await ctrl.add(dto('comercial'), vendedor);
    expect(repo.add).toHaveBeenCalled();
  });

  it('el vendedor no guarda contratos ni facturas', () => {
    const { repo, ctrl } = armar();
    expect(() => ctrl.add(dto('facturas'), vendedor)).toThrow(
      ForbiddenException,
    );
    expect(repo.add).not.toHaveBeenCalled();
  });

  it('operaciones sigue guardando cualquier categoría', async () => {
    const { repo, ctrl } = armar();
    await ctrl.add(dto('facturas'), operaciones);
    expect(repo.add).toHaveBeenCalled();
  });

  it('al quitar, el vendedor queda limitado a lo comercial', async () => {
    const { repo, ctrl } = armar();
    await ctrl.delete(7, vendedor);
    expect(repo.delete).toHaveBeenCalledWith(1, 7, true);
    await ctrl.delete(8, operaciones);
    expect(repo.delete).toHaveBeenCalledWith(1, 8, false);
  });
});

// Doc 19 §9.26 (Felipe, 07-11): «con las órdenes de compra, cada vez que
// una se suba se debería leer y dejar todo listo para facturar».
describe('La OC que se sube la lee BelIA por detrás', () => {
  const EVENTO = '00000000-0000-0000-0000-000000000000';
  const dto = (category: string) => ({
    quotation_id: EVENTO,
    category,
    file_name: 'OC 4500123.pdf',
    file_url: 'c1/oc.pdf',
  });
  const operaciones = (derechos: string[]) =>
    ({
      id: 'u-op',
      company_id: 1,
      role: UserRole.OPERACIONES,
      derechos,
    }) as unknown as User;
  const armar = () => {
    const repo = { add: jest.fn().mockResolvedValue({ added: true }) };
    const ocs = { leerAlSubir: jest.fn().mockResolvedValue(undefined) };
    const ctrl = new EventDocumentsController(
      repo as unknown as EventDocumentsRepository,
      ocs as never,
    );
    return { repo, ocs, ctrl };
  };
  const esperar = () => new Promise((r) => setImmediate(r));

  it('con Facturación, la OC subida se lee sin hacer esperar', async () => {
    const { ocs, ctrl } = armar();
    expect(
      await ctrl.add(dto('ordenes_compra'), operaciones(['facturacion'])),
    ).toEqual({ added: true });
    await esperar();
    expect(ocs.leerAlSubir).toHaveBeenCalledWith(EVENTO, 1, 'u-op');
  });

  it('otra categoría, o una empresa sin Facturación, no la lee', async () => {
    const { ocs, ctrl } = armar();
    await ctrl.add(dto('contratos'), operaciones(['facturacion']));
    await ctrl.add(dto('ordenes_compra'), operaciones([]));
    await esperar();
    expect(ocs.leerAlSubir).not.toHaveBeenCalled();
  });
});
