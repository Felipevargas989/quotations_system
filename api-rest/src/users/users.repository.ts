import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { CreateUser } from './types';

@Injectable()
export class UsersRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersRepository.name);
  }

  async findOne(id: string): Promise<User> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error) throw error;
    return data as User;
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    return data as User[];
  }

  async createAuthUser(createUserDto: CreateUserDto): Promise<any> {
    this.logger.info(
      `createAuthUser with createUserDto ${JSON.stringify(createUserDto)}`,
    );
    return await this.supabase.client.auth.signUp({
      email: createUserDto.email,
      password: createUserDto.password,
    });
  }

  async createUser(createUser: CreateUser): Promise<any> {
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
}
