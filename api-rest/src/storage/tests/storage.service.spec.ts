import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { StorageService } from '../storage.service';

// La regla del dueño es EL candado de la misión storage: estas pruebas
// verifican que nadie vea ni borre archivos de otra empresa.
describe('StorageService', () => {
  let service: StorageService;
  let quotationCompany: number | null;

  const supabaseMock = {
    client: {
      storage: {
        from: jest.fn().mockReturnValue({
          createSignedUrl: jest
            .fn()
            .mockResolvedValue({ data: { signedUrl: 'https://firmada' } }),
          remove: jest.fn().mockResolvedValue({ error: null }),
          upload: jest.fn().mockResolvedValue({ error: null }),
          getPublicUrl: jest
            .fn()
            .mockReturnValue({ data: { publicUrl: 'https://publica' } }),
        }),
      },
      from: jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(() =>
          Promise.resolve({
            data:
              quotationCompany === null
                ? null
                : { company_id: quotationCompany },
          }),
        ),
      })),
    },
  };

  beforeEach(() => {
    quotationCompany = null;
    service = new StorageService(
      supabaseMock as unknown as SupabaseService,
      mockPinoLogger(),
    );
  });

  it('firma una ruta nueva de la MISMA empresa', async () => {
    const r = await service.signedUrl('c1/payment-receipts/q/p/a.pdf', 1);
    expect(r.url).toBe('https://firmada');
  });

  it('rechaza una ruta nueva de OTRA empresa', async () => {
    await expect(
      service.signedUrl('c2/payment-receipts/q/p/a.pdf', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('firma una ruta vieja si la cotización es de la empresa', async () => {
    quotationCompany = 1;
    const r = await service.signedUrl(
      'payment-receipts/uuid-cotizacion/pago/a.jpg',
      1,
    );
    expect(r.url).toBe('https://firmada');
  });

  it('rechaza una ruta vieja de una cotización ajena', async () => {
    quotationCompany = 51;
    await expect(
      service.signedUrl('payment-receipts/uuid/pago/a.jpg', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('acepta la URL pública vieja completa y extrae la ruta', async () => {
    quotationCompany = 1;
    const r = await service.signedUrl(
      'https://x.supabase.co/storage/v1/object/public/payment-receipts/refund-receipts/uuid/1_t.png',
      1,
    );
    expect(r.url).toBe('https://firmada');
  });

  it('rechaza URLs que no son del balde de comprobantes', async () => {
    await expect(
      service.signedUrl('https://malicioso.com/cosa.pdf', 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza rutas con prefijo desconocido', async () => {
    await expect(service.signedUrl('otra-cosa/archivo.pdf', 1)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('borrar exige el mismo candado de dueño', async () => {
    await expect(
      service.remove('c2/payment-receipts/q/p/a.pdf', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('subir rechaza tipos de archivo no permitidos', async () => {
    await expect(
      service.upload(
        { kind: 'payment-receipt', quotation_id: 'q', payment_id: 'p' },
        {
          mimetype: 'application/x-sh',
          size: 10,
          originalname: 'malo.sh',
          buffer: Buffer.from(''),
        } as Express.Multer.File,
        1,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('subir arma la ruta CON la empresa de la sesión', async () => {
    const r = await service.upload(
      {
        kind: 'payment-receipt',
        quotation_id: 'q1',
        payment_id: 'p1',
        transaction_id: '7',
      },
      {
        mimetype: 'image/png',
        size: 100,
        originalname: 'foto.png',
        buffer: Buffer.from('x'),
      } as Express.Multer.File,
      42,
    );
    expect(r.url).toMatch(/^c42\/payment-receipts\/q1\/p1\/7_/);
  });
});
