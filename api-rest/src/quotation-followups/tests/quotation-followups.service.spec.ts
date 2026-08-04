import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { User, UserRole } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import { QuotationFollowupsRepository } from '../quotation-followups.repository';
import { QuotationFollowupsService } from '../quotation-followups.service';

// Bitácora comercial (03-08): reglas de negocio del service con el
// repositorio mockeado — mismo esquema que payments.service.spec.ts.
describe('QuotationFollowupsService', () => {
  const buildService = (repo: Partial<QuotationFollowupsRepository>) =>
    new QuotationFollowupsService(
      repo as QuotationFollowupsRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );

  const vendedora = {
    id: 'fila-1',
    user_id: 'user-1',
    email: 'vendedora@eventia.cl',
    full_name: 'Vendedora Uno',
    role: UserRole.VENDEDOR,
    company_id: 7,
  } as User;

  describe('create', () => {
    it('inserta con empresa y autor de la SESIÓN (nombre congelado)', async () => {
      const create = jest.fn().mockResolvedValue({ id: 1 });
      const findOwnedQuotation = jest.fn().mockResolvedValue({ id: 'q-1' });
      const service = buildService({ create, findOwnedQuotation });

      await service.create(vendedora, {
        quotation_id: 'q-1',
        note: '  Llamé al cliente, pide propuesta el lunes  ',
        tipo: 'llamada',
        next_contact_date: '2026-08-10',
      });

      // El candado de empresa corre ANTES del insert.
      expect(findOwnedQuotation).toHaveBeenCalledWith(7, 'q-1');
      expect(create).toHaveBeenCalledWith({
        quotation_id: 'q-1',
        company_id: 7,
        author_user_id: 'user-1',
        author_name: 'Vendedora Uno',
        note: 'Llamé al cliente, pide propuesta el lunes',
        tipo: 'llamada',
        next_contact_date: '2026-08-10',
      });
    });

    it('firma con el email cuando el usuario no tiene nombre', async () => {
      const create = jest.fn().mockResolvedValue({ id: 2 });
      const findOwnedQuotation = jest.fn().mockResolvedValue({ id: 'q-1' });
      const service = buildService({ create, findOwnedQuotation });

      await service.create({ ...vendedora, full_name: '' } as User, {
        quotation_id: 'q-1',
        note: 'Sin nombre',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ author_name: 'vendedora@eventia.cl' }),
      );
    });

    it('rechaza una nota vacía o de puros espacios', async () => {
      const create = jest.fn();
      const service = buildService({ create });

      await expect(
        service.create(vendedora, { quotation_id: 'q-1', note: '    ' }),
      ).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('lanza Forbidden si la cotización es de otra empresa', async () => {
      const create = jest.fn();
      const findOwnedQuotation = jest.fn().mockResolvedValue(null);
      const service = buildService({ create, findOwnedQuotation });

      await expect(
        service.create(vendedora, { quotation_id: 'q-ajena', note: 'Hola' }),
      ).rejects.toThrow(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('lanza Forbidden cuando quien edita NO es el autor', async () => {
      const update = jest.fn();
      const findById = jest.fn().mockResolvedValue({
        id: 5,
        company_id: 7,
        author_user_id: 'otro-user',
      });
      const service = buildService({ findById, update });

      await expect(
        service.update(vendedora, 5, { note: 'La reescribo' }),
      ).rejects.toThrow(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('lanza 404 si la nota no existe o es de otra empresa', async () => {
      const findById = jest.fn().mockResolvedValue(null);
      const service = buildService({ findById });

      await expect(service.update(vendedora, 99, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('el autor edita y el servidor sella updated_at', async () => {
      const update = jest.fn().mockResolvedValue({ id: 5 });
      const findById = jest.fn().mockResolvedValue({
        id: 5,
        company_id: 7,
        author_user_id: 'user-1',
      });
      const service = buildService({ findById, update });

      await service.update(vendedora, 5, { note: ' Corregida ' });

      expect(update).toHaveBeenCalledWith(7, 5, {
        note: 'Corregida',
        updated_at: expect.any(String) as string,
      });
    });
  });

  describe('remove', () => {
    it('lanza Forbidden cuando quien elimina NO es el autor', async () => {
      const remove = jest.fn();
      const findById = jest.fn().mockResolvedValue({
        id: 5,
        company_id: 7,
        author_user_id: 'otro-user',
      });
      const service = buildService({ findById, remove });

      await expect(service.remove(vendedora, 5)).rejects.toThrow(
        ForbiddenException,
      );
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('mapByCompany', () => {
    it('se queda con la ÚLTIMA nota de cada cotización (y SU próximo contacto)', async () => {
      // Las filas llegan del repo ordenadas de la más nueva a la más
      // vieja: la reducción toma la primera aparición de cada una.
      const findMapRows = jest.fn().mockResolvedValue([
        {
          quotation_id: 'q-1',
          created_at: '2026-08-02T12:00:00Z',
          next_contact_date: '2026-08-10',
        },
        {
          quotation_id: 'q-2',
          created_at: '2026-08-01T09:00:00Z',
          next_contact_date: null,
        },
        {
          quotation_id: 'q-1',
          created_at: '2026-07-30T08:00:00Z',
          next_contact_date: '2026-08-01',
        },
      ]);
      const service = buildService({ findMapRows });

      const map = await service.mapByCompany(7);

      expect(findMapRows).toHaveBeenCalledWith(7);
      expect(map).toEqual({
        'q-1': {
          last_at: '2026-08-02T12:00:00Z',
          next_contact_date: '2026-08-10',
        },
        'q-2': { last_at: '2026-08-01T09:00:00Z', next_contact_date: null },
      });
    });
  });
});
