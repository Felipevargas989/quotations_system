import { Injectable } from '@nestjs/common';
import { AuthResponse, PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import { CreateUser, UserWithCompany } from './types';

@Injectable()
export class UsersRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersRepository.name);
  }

  async findOne(id: string): Promise<{
    data: UserWithCompany | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`findOne user with id ${id}`);
    return await this.supabase.client
      .from('user_profiles')
      .select(
        `*,
        companies (
          id,
          name,
          logo_url,
          colors,
          is_premium,
          currency,
          is_active
        )
        `,
      )
      .eq('user_id', id)
      .single();
  }

  async findAll(companyId: Company['id'] | undefined, role?: UserRole) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    const query = this.supabase.client.from('user_profiles').select('*');
    if (companyId) {
      query.eq('company_id', companyId);
    }
    if (role) {
      query.eq('role', role);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data as User[];
  }

  async createAuthUser(createUserDto: CreateUserDto): Promise<AuthResponse> {
    this.logger.info(
      `createAuthUser with createUserDto ${JSON.stringify(createUserDto)}`,
    );
    return await this.supabase.client.auth.signUp({
      email: createUserDto.email,
      password: createUserDto.password,
    });
  }

  async createUser(
    createUser: CreateUser,
  ): Promise<{ data: User | null; error: PostgrestError | null }> {
    this.logger.info(
      `createUser with createUser ${JSON.stringify(createUser)}`,
    );
    return await this.supabase.client
      .from('user_profiles')
      .insert([createUser])
      .select()
      .single();
  }

  async update(id: User['id'], updateUserDto: UpdateUserDto) {
    this.logger.info(
      `update user with id ${id} and updateUserDto ${JSON.stringify(updateUserDto)}`,
    );
    return await this.supabase.client
      .from('user_profiles')
      .update(updateUserDto)
      .eq('id', id)
      .select()
      .single();
  }

  async remove(id: User['id'], companyId: Company['id']) {
    this.logger.info(`remove user with id ${id} and companyId ${companyId}`);
    return await this.supabase.client
      .from('user_profiles')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
  }

  async removeAuthUser(id: User['id'], companyId: Company['id']) {
    this.logger.info(
      `remove auth user with id ${id} and companyId ${companyId}`,
    );
    // TODO: check because it's not working.
    return await this.supabase.client.auth.admin.deleteUser(id);
  }

  async updatePassword(userId: string, newPassword: string) {
    this.logger.info(`updatePassword for user ${userId}`);
    return await this.supabase.client.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
  }
}
