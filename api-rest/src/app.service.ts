import { Injectable } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';

@Injectable()
export class AppService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getHello(): Promise<any> {
    const { data, error } = await this.supabaseService.client
      .from('users')
      .select('*');
    if (error) throw error;
    return data;
  }
}
