import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';

// Mock the Supabase SDK so no real client/network is created.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

const createClientMock = createClient as jest.Mock;

describe('SupabaseService', () => {
  const buildConfig = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined when configuration is present', () => {
    const service = new SupabaseService(
      buildConfig({
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    );

    expect(service).toBeDefined();
  });

  it('creates the client from the configured url and service role key', () => {
    const fakeClient = {} as any;
    createClientMock.mockReturnValue(fakeClient);

    const service = new SupabaseService(
      buildConfig({
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    );

    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-role-key',
    );
    expect(service.client).toBe(fakeClient);
  });

  it('throws when SUPABASE_URL is missing', () => {
    expect(
      () =>
        new SupabaseService(
          buildConfig({ SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }),
        ),
    ).toThrow('Missing Supabase configuration');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    expect(
      () =>
        new SupabaseService(
          buildConfig({ SUPABASE_URL: 'https://project.supabase.co' }),
        ),
    ).toThrow('Missing Supabase configuration');
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
