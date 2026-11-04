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
