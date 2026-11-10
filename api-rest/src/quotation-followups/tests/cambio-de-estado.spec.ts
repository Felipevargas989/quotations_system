import { ForbiddenException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { User, UserRole } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import {
  EL_CAMBIO_DE_ESTADO_NO_SE_EDITA,
  TIPO_CAMBIO_DE_ESTADO,
  esGestion,
  notaDeCambioDeEstado,
} from '../cambio-de-estado';
import { QuotationFollowupsRepository } from '../quotation-followups.repository';
import { QuotationFollowupsService } from '../quotation-followups.service';

// EL CAMBIO DE ESTADO QUEDA EN EL SEGUIMIENTO (Felipe, 09-11-2026): "de quién
// la movió, de qué estado a cuál estado"; "que no cuente como gestión en el
// semáforo, y que lo firme quien lo mueve".
describe('El cambio de estado en el Seguimiento', () => {
  const buildService = (repo: Partial<QuotationFollowupsRepository>) =>
    new QuotationFollowupsService(
      repo as QuotationFollowupsRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );

  // La sesión real que arma el guardián: { id, company_id, role, email }.
  const camila = {
    id: 'user-camila',
    email: 'camila@valledelsol.cl',
    role: UserRole.ADMINISTRADOR,
    company_id: 1,
  } as User;

  describe('el texto', () => {
    it('dice de qué estado a cuál, con las palabras de la pantalla', () => {
      expect(notaDeCambioDeEstado('enviada', 'en_negociacion')).toBe(
        'Cambió el estado de Enviada a En Negociación.',
      );
      // 'cancelada' en la base, «Anulada» en pantalla.
      expect(notaDeCambioDeEstado('aceptada', 'cancelada')).toBe(
        'Cambió el estado de Aceptada a Anulada.',
      );
    });

    it('un rechazo o una anulación lleva su motivo, con las palabras de la ventanita', () => {
      expect(notaDeCambioDeEstado('enviada', 'rechazada', 'precio')).toBe(
        'Cambió el estado de Enviada a Rechazada. Motivo: Precio.',
      );
      expect(
        notaDeCambioDeEstado('aceptada', 'cancelada', 'cliente_cancelo'),
      ).toBe(
        'Cambió el estado de Aceptada a Anulada. Motivo: El cliente canceló.',
      );
      // Un motivo que no está en la lista va tal cual, sin punto doble.
      expect(notaDeCambioDeEstado('enviada', 'rechazada', 'se fue.')).toBe(
        'Cambió el estado de Enviada a Rechazada. Motivo: se fue.',
      );
    });

    it('no es una gestión; todo lo demás sí', () => {
      expect(esGestion({ tipo: TIPO_CAMBIO_DE_ESTADO })).toBe(false);
      expect(esGestion({ tipo: 'llamada' })).toBe(true);
      expect(esGestion({ tipo: null })).toBe(true);
    });
  });

  describe('registrarCambioDeEstado', () => {
    it('lo firma quien movió la cotización, sin fecha de próximo contacto', async () => {
      const create = jest.fn().mockResolvedValue({ id: 1 });
      const findOwnedQuotation = jest.fn().mockResolvedValue({ id: 'q-1' });
      const service = buildService({ create, findOwnedQuotation });

      await service.registrarCambioDeEstado(
        camila,
        1,
        'q-1',
        'enviada',
        'en_negociacion',
      );

      expect(findOwnedQuotation).toHaveBeenCalledWith(1, 'q-1');
      expect(create).toHaveBeenCalledWith({
        quotation_id: 'q-1',
        company_id: 1,
        author_user_id: 'user-camila',
        author_name: 'camila@valledelsol.cl',
        note: 'Cambió el estado de Enviada a En Negociación.',
        tipo: TIPO_CAMBIO_DE_ESTADO,
        next_contact_date: null,
      });
    });

    it('si lo hizo Eventia sola (sin sesión), firma BelIA', async () => {
      const create = jest.fn().mockResolvedValue({ id: 2 });
      const findOwnedQuotation = jest.fn().mockResolvedValue({ id: 'q-2' });
      const service = buildService({ create, findOwnedQuotation });

      await service.registrarCambioDeEstado(
        null,
        1,
        'q-2',
        'solicitada',
        'aceptada',
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          author_user_id: null,
          author_name: 'BelIA',
          note: 'Cambió el estado de Solicitada a Aceptada.',
          tipo: TIPO_CAMBIO_DE_ESTADO,
        }),
      );
    });

    it('sin cambio de verdad, no anota nada', async () => {
      const create = jest.fn();
      const service = buildService({
        create,
        findOwnedQuotation: jest.fn().mockResolvedValue({ id: 'q-1' }),
      });
      await service.registrarCambioDeEstado(
        camila,
        1,
        'q-1',
        'enviada',
        'enviada',
      );
      await service.registrarCambioDeEstado(camila, 1, 'q-1', 'enviada', null);
      expect(create).not.toHaveBeenCalled();
    });

    it('en una cotización de otra empresa no anota', async () => {
      const create = jest.fn();
      const service = buildService({
        create,
        findOwnedQuotation: jest.fn().mockResolvedValue(null),
      });
      await service.registrarCambioDeEstado(
        camila,
        1,
        'q-ajena',
        'enviada',
        'rechazada',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('si la base falla, el cambio de estado no se rompe', async () => {
      const service = buildService({
        create: jest.fn().mockRejectedValue(new Error('caída')),
        findOwnedQuotation: jest.fn().mockResolvedValue({ id: 'q-1' }),
      });
      await expect(
        service.registrarCambioDeEstado(
          camila,
          1,
          'q-1',
          'enviada',
          'rechazada',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('no cuenta como gestión en el semáforo', () => {
    it('la última gestión es la nota de antes, no el cambio de estado', async () => {
      const findMapRows = jest.fn().mockResolvedValue([
        // De la más nueva a la más vieja, como las entrega el repositorio.
        {
          quotation_id: 'q-1',
          created_at: '2026-11-09T15:00:00Z',
          next_contact_date: null,
          next_contact_done_at: null,
          tipo: TIPO_CAMBIO_DE_ESTADO,
        },
        {
          quotation_id: 'q-1',
          created_at: '2026-11-02T12:00:00Z',
          next_contact_date: '2026-11-05',
          next_contact_done_at: null,
          tipo: 'llamada',
        },
      ]);
      const map = await buildService({ findMapRows }).mapByCompany(1);
      expect(map['q-1']).toEqual({
        last_at: '2026-11-02T12:00:00Z',
        next_contact_date: '2026-11-05',
        next_contact_done_at: null,
      });
    });

    it('una cotización con solo cambios de estado queda sin gestión', async () => {
      const findMapRows = jest.fn().mockResolvedValue([
        {
          quotation_id: 'q-2',
          created_at: '2026-11-09T15:00:00Z',
          next_contact_date: null,
          next_contact_done_at: null,
          tipo: TIPO_CAMBIO_DE_ESTADO,
        },
      ]);
      const map = await buildService({ findMapRows }).mapByCompany(1);
      expect(map['q-2']).toBeUndefined();
    });
  });

  describe('es un registro: nadie lo edita ni lo borra', () => {
    const lineaDeCamila = {
      id: 5,
      company_id: 1,
      author_user_id: 'user-camila',
      author_name: 'camila@valledelsol.cl',
      tipo: TIPO_CAMBIO_DE_ESTADO,
    };

    it('ni su autora la edita', async () => {
      const update = jest.fn();
      const service = buildService({
        findById: jest.fn().mockResolvedValue(lineaDeCamila),
        update,
      });
      await expect(
        service.update(camila, 5, { note: 'otra cosa' }),
      ).rejects.toThrow(
        new ForbiddenException(EL_CAMBIO_DE_ESTADO_NO_SE_EDITA),
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('ni la da por «Listo»', async () => {
      const update = jest.fn();
      const service = buildService({
        findById: jest.fn().mockResolvedValue(lineaDeCamila),
        update,
      });
      await expect(
        service.update(camila, 5, {
          next_contact_done_at: '2026-11-09T15:00:00Z',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('ni la borra', async () => {
      const remove = jest.fn();
      const service = buildService({
        findById: jest.fn().mockResolvedValue(lineaDeCamila),
        remove,
      });
      await expect(service.remove(camila, 5)).rejects.toThrow(
        EL_CAMBIO_DE_ESTADO_NO_SE_EDITA,
      );
      expect(remove).not.toHaveBeenCalled();
    });
  });
});
