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

  // La sesión REAL que arma el guardián: { id, company_id, role, email }.
  // Antes esta doble traía además user_id y full_name, campos que el
  // guardián nunca adjunta — y por creerle, el servicio guardaba el
  // autor en `user.user_id` (undefined → null en las 38 notas de
  // producción) sin que la suite lo notara. La doble tiene que
  // parecerse a la sesión de verdad, no al tipo User completo.
  const vendedora = {
    id: 'user-1',
    email: 'vendedora@eventia.cl',
    role: UserRole.VENDEDOR,
    company_id: 7,
  } as User;

  describe('crearComoAsistente (el seguimiento con IA anota el envío, doc 18 §9)', () => {
    it('firma «Asistente», sin autor de sesión, y con el candado de empresa', async () => {
      const create = jest.fn().mockResolvedValue({ id: 9 });
      const findOwnedQuotation = jest.fn().mockResolvedValue({ id: 'q-1' });
      const service = buildService({ create, findOwnedQuotation });

      await service.crearComoAsistente(7, {
        quotation_id: 'q-1',
        note: ' Seguimiento con IA enviado desde contacto@ el 17-10. ',
        tipo: 'correo',
        next_contact_date: '2026-10-31',
      });

      expect(findOwnedQuotation).toHaveBeenCalledWith(7, 'q-1');
      expect(create).toHaveBeenCalledWith({
        quotation_id: 'q-1',
        company_id: 7,
        author_user_id: null,
        author_name: 'Asistente',
        note: 'Seguimiento con IA enviado desde contacto@ el 17-10.',
        tipo: 'correo',
        next_contact_date: '2026-10-31',
      });
    });

    it('una cotización de otra empresa no se toca', async () => {
      const create = jest.fn();
      const findOwnedQuotation = jest.fn().mockResolvedValue(null);
      const service = buildService({ create, findOwnedQuotation });

      await expect(
        service.crearComoAsistente(7, {
          quotation_id: 'q-ajena',
          note: 'x',
          tipo: 'correo',
          next_contact_date: null,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });
  });

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
        // El CORREO, no el nombre: la sesión que arma el guardián no
        // trae full_name. Así están firmadas las 38 notas de producción
        // ("camila@valledelsolquillon.cl"), y la pantalla lo recorta
        // antes del @ para mostrar "Camila".
        author_name: 'vendedora@eventia.cl',
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
    it('toma la última nota de cada cotización y el compromiso VIGENTE', async () => {
      // Las filas llegan del repo ordenadas de la más nueva a la más
      // vieja: la reducción toma la primera aparición de cada una.
      const findMapRows = jest.fn().mockResolvedValue([
        {
          quotation_id: 'q-1',
          created_at: '2026-08-02T12:00:00Z',
          next_contact_date: '2026-08-10',
          next_contact_done_at: null,
        },
        // q-2: la última nota NO tiene fecha (caso normal en Post-Venta,
        // donde anotar sin compromiso es lo habitual), pero una nota más
        // vieja dejó un pendiente vivo. El mapa tiene que encontrarlo.
        {
          quotation_id: 'q-2',
          created_at: '2026-08-01T09:00:00Z',
          next_contact_date: null,
          next_contact_done_at: null,
        },
        {
          quotation_id: 'q-2',
          created_at: '2026-07-28T09:00:00Z',
          next_contact_date: '2026-08-05',
          next_contact_done_at: null,
        },
        {
          quotation_id: 'q-1',
          created_at: '2026-07-30T08:00:00Z',
          next_contact_date: '2026-08-01',
          next_contact_done_at: null,
        },
        // q-3: tenía fecha pero se marcó "Listo" → no es pendiente.
        {
          quotation_id: 'q-3',
          created_at: '2026-08-03T10:00:00Z',
          next_contact_date: '2026-08-04',
          next_contact_done_at: '2026-08-04T18:00:00Z',
        },
        // q-3 también tenía un compromiso más viejo sin marcar: quedó
        // resuelto por la nota que lo siguió y NO reaparece al marcar
        // «Listo» la más nueva (28-10-2026, "se corre hacia abajo").
        {
          quotation_id: 'q-3',
          created_at: '2026-07-20T10:00:00Z',
          next_contact_date: '2026-07-25',
          next_contact_done_at: null,
        },
      ]);
      const service = buildService({ findMapRows });

      const map = await service.mapByCompany(7);

      expect(findMapRows).toHaveBeenCalledWith(7, [
        'solicitada',
        'enviada',
        'en_negociacion',
        'aceptada',
      ]);
      expect(map).toEqual({
        'q-1': {
          last_at: '2026-08-02T12:00:00Z',
          next_contact_date: '2026-08-10',
          next_contact_done_at: null,
        },
        'q-2': {
          last_at: '2026-08-01T09:00:00Z',
          next_contact_date: '2026-08-05',
          next_contact_done_at: null,
        },
        'q-3': {
          last_at: '2026-08-03T10:00:00Z',
          next_contact_date: null,
          next_contact_done_at: null,
        },
      });
    });

    it('no pide las notas de rechazadas, realizadas ni anuladas (28-10-2026)', async () => {
      // Felipe: lo cerrado se lee solo al entrar a su Seguimiento. Todo
      // evento vendido termina realizado con sus notas: si el semáforo
      // las leyera, la lista crecería para siempre.
      const findMapRows = jest.fn().mockResolvedValue([]);
      await buildService({ findMapRows }).mapByCompany(7);

      const [, estados] = findMapRows.mock.calls[0] as [number, string[]];
      for (const cerrado of ['rechazada', 'realizada', 'cancelada'])
        expect(estados).not.toContain(cerrado);
    });
  });

  describe('update() — marcar cumplido', () => {
    it('deja cerrar el pendiente aunque la nota sea de OTRO', async () => {
      // El caso real del 07-08: las notas del hilo eran de Camila y
      // Felipe apretó "Listo". Cerrar una tarea no es reescribir la
      // nota de otro.
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 5, author_user_id: 'camila', company_id: 7 });
      const update = jest.fn().mockResolvedValue({ id: 5 });
      const service = buildService({ findById, update });

      await service.update({ company_id: 7, id: 'felipe' } as never, 5, {
        next_contact_done_at: '2026-08-07T18:00:00Z',
      } as never);

      const [, , fields] = update.mock.calls[0];
      expect((fields as Record<string, unknown>).next_contact_done_at).toBe(
        '2026-08-07T18:00:00Z',
      );
    });

    it('sigue exigiendo autoría para cambiar el TEXTO', async () => {
      const findById = jest
        .fn()
        .mockResolvedValue({ id: 5, author_user_id: 'camila', company_id: 7 });
      const update = jest.fn();
      const service = buildService({ findById, update });

      await expect(
        service.update({ company_id: 7, id: 'felipe' } as never, 5, {
          note: 'reescribo lo que dijo otro',
        } as never),
      ).rejects.toThrow('Solo el autor puede modificar su nota');
      expect(update).not.toHaveBeenCalled();
    });
  });
});
