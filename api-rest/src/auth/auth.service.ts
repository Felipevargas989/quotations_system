import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { User } from './interfaces/auth.interfaces';

@Injectable()
export class AuthService {
  private readonly supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async validateToken(token: string): Promise<User> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
 
      if (error || !user) {
        throw new UnauthorizedException('Invalid token');
      }

      return {
        id: user.id,
        email: user.email,
        ...user.user_metadata,
      };
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
