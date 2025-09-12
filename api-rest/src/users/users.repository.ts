import { Injectable } from '@nestjs/common';
import { SupabaseService } from 'src/supabase/supabase.service';
import { User } from './entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findOne(id: string): Promise<User> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error) throw error;
    return data as User;
  }
}
