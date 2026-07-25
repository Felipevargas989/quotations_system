import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { QuotationsService } from 'src/quotations/quotations.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { AnalyticsService } from '../analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let quotationsServiceMock: jest.Mocked<QuotationsService>;
  let clientsServiceMock: jest.Mocked<ClientsService>;
  let paymentsServiceMock: jest.Mocked<PaymentsService>;
  let rpcMock: jest.Mock;
  let supabaseMock: any;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    quotationsServiceMock = {
      findAll: jest.fn(),
    } as any;

    clientsServiceMock = {
      findAll: jest.fn(),
    } as any;

    paymentsServiceMock = {
      findAllPaymentsFromQuotation: jest.fn(),
    } as any;

    rpcMock = jest.fn();
    supabaseMock = { client: { rpc: rpcMock } };

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: QuotationsService, useValue: quotationsServiceMock },
        { provide: ClientsService, useValue: clientsServiceMock },
        { provide: PaymentsService, useValue: paymentsServiceMock },
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardStats()', () => {
    it('scopes the quotations lookup to the company and aggregates counts by status', async () => {
      const quotations = [
        {
          id: 1,
          quotation_status: QuotationStatus.ACEPTADA,
          total_amount: 100,
          created_at: '2025-03-10',
          event_date: '2025-06-15',
        },
        {
          id: 2,
          quotation_status: QuotationStatus.ACEPTADA,
          total_amount: 50,
          created_at: '2025-03-20',
          event_date: '2025-06-25',
        },
        {
          id: 3,
          quotation_status: QuotationStatus.SOLICITADA,
          total_amount: 30,
          created_at: '2025-04-01',
          event_date: '2025-07-01',
        },
      ];
      quotationsServiceMock.findAll.mockResolvedValue(quotations as any);
      clientsServiceMock.findAll.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ] as any);
      paymentsServiceMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [{ amount: 200, due_date: '2025-05-01' }],
      } as any);

      const result = await service.getDashboardStats(companyId, {
        start_date: new Date('2025-01-01'),
        end_date: new Date('2025-08-01'),
      });

      // company scoping
      expect(quotationsServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ companyId }),
      );
      expect(clientsServiceMock.findAll).toHaveBeenCalledWith(companyId);
      expect(
        paymentsServiceMock.findAllPaymentsFromQuotation,
      ).toHaveBeenCalledWith([1, 2, 3], companyId);

      // totals
      expect(result.totalQuotations).toBe(3);
      expect(result.totalClients).toBe(2);

      // aggregation by status
      expect(result.totalQuotationsByStatus[QuotationStatus.ACEPTADA]).toEqual({
        count: 2,
        amount: 150,
      });
      expect(
        result.totalQuotationsByStatus[QuotationStatus.SOLICITADA],
      ).toEqual({ count: 1, amount: 30 });
    });

    it('only counts ACEPTADA quotations in totalQuotationsByEventDate', async () => {
      const quotations = [
        {
          id: 1,
          quotation_status: QuotationStatus.ACEPTADA,
          total_amount: 100,
          created_at: '2025-03-10',
          event_date: '2025-06-15',
        },
        {
          id: 2,
          quotation_status: QuotationStatus.RECHAZADA,
          total_amount: 999,
          created_at: '2025-03-20',
          event_date: '2025-06-25',
        },
      ];
      quotationsServiceMock.findAll.mockResolvedValue(quotations as any);
      clientsServiceMock.findAll.mockResolvedValue([] as any);
      paymentsServiceMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [],
      } as any);

      const result = await service.getDashboardStats(companyId, {
        start_date: new Date('2025-01-01'),
        end_date: new Date('2025-08-01'),
      });

      // June 2025 => month index 5 => key "2025-5"
      expect(result.totalQuotationsByEventDate['2025-5']).toEqual({
        count: 1,
        amount: 100,
      });
    });

    it('defaults the date range and handles an empty payments result', async () => {
      quotationsServiceMock.findAll.mockResolvedValue([] as any);
      clientsServiceMock.findAll.mockResolvedValue([] as any);
      paymentsServiceMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: null,
      } as any);

      const result = await service.getDashboardStats(companyId, {});

      expect(result.totalQuotations).toBe(0);
      expect(result.totalClients).toBe(0);
      expect(result.totalPaymentsByMonth).toEqual({});
    });

    it('throws an HttpException when a collaborator rejects', async () => {
      quotationsServiceMock.findAll.mockRejectedValue(new Error('boom'));

      await expect(
        service.getDashboardStats(companyId, {}),
      ).rejects.toBeInstanceOf(HttpException);
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('getCompleteStats()', () => {
    const okRpc = (data: any) => ({ data, error: null });

    it('calls every rpc scoped to the company and returns the aggregated stats', async () => {
      rpcMock
        .mockResolvedValueOnce(okRpc([{ quotation_status: 'aceptada' }])) // status
        .mockResolvedValueOnce(okRpc({ event_type: 'boda' })) // event type conversion
        .mockResolvedValueOnce(okRpc([{ total_revenue: 10 }])) // event type revenue
        .mockResolvedValueOnce(okRpc([{ total_revenue: 20 }])) // revenue by client type
        .mockResolvedValueOnce(okRpc([{ client_name: 'A' }])) // top clients
        .mockResolvedValueOnce(okRpc([{ service_name: 'V' }])) // variable usage
        .mockResolvedValueOnce(okRpc([{ service_name: 'F' }])); // fixed usage

      const result = await service.getCompleteStats(companyId, {
        start_date: new Date('2025-01-01') as any,
        end_date: new Date('2025-12-31') as any,
      });

      expect(rpcMock).toHaveBeenCalledTimes(7);
      expect(rpcMock).toHaveBeenNthCalledWith(
        1,
        'get_quotation_status_stats',
        expect.objectContaining({ p_company_id: companyId }),
      );
      expect(rpcMock).toHaveBeenCalledWith(
        'get_top_clients_by_revenue',
        expect.objectContaining({ p_company_id: companyId }),
      );

      expect(result).toEqual({
        quotation_status_stats: [{ quotation_status: 'aceptada' }],
        event_type_conversion_stats: { event_type: 'boda' },
        event_type_revenue_stats: [{ total_revenue: 10 }],
        revenue_by_client_type: [{ total_revenue: 20 }],
        top_clients_by_revenue: [{ client_name: 'A' }],
        variable_services_usage: [{ service_name: 'V' }],
        fixed_services_usage: [{ service_name: 'F' }],
      });
    });

    it('throws an HttpException when the first rpc returns an error', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'rpc failed' },
      });

      await expect(
        service.getCompleteStats(companyId, {}),
      ).rejects.toBeInstanceOf(HttpException);
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('rpc failed'),
      );
      // it should short-circuit and not call the remaining rpcs
      expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    it('throws an HttpException when a later rpc returns an error', async () => {
      rpcMock
        .mockResolvedValueOnce(okRpc([]))
        .mockResolvedValueOnce(okRpc([]))
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'revenue rpc failed' },
        });

      await expect(
        service.getCompleteStats(companyId, {}),
      ).rejects.toBeInstanceOf(HttpException);
      expect(rpcMock).toHaveBeenCalledTimes(3);
    });
  });
});
