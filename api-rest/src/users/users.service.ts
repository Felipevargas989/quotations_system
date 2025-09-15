import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserAuth } from './entities/user.entity';
import { CreateUser } from './types';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async create(
    createUserDto: CreateUserDto,
    companyId: Company['id'],
  ): Promise<any> {
    try {
      // 1. Create user in auth.users table
      const { data, error } =
        await this.usersRepository.createAuthUser(createUserDto);
      const userAuth = data as UserAuth;

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...rest } = createUserDto;
      const newUser: CreateUser = {
        ...rest,
        user_id: userAuth.id,
        company_id: companyId,
      };
      // 2. Create user in public.user_profiles table
      return this.usersRepository.createUser(newUser);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  findAll(companyId: Company['id']) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    return this.usersRepository.findAll(companyId);
  }

  findOne(id: User['id']) {
    return this.usersRepository.findOne(id);
  }

  update(id: User['id'], updateUserDto: UpdateUserDto) {
    this.logger.info(
      `update user with id ${id} and updateUserDto ${JSON.stringify(updateUserDto)}`,
    );
    return this.usersRepository.update(id, updateUserDto);
  }

  async remove(id: User['id'], companyId: Company['id']) {
    this.logger.info(`remove user with id ${id} and companyId ${companyId}`);

    // 1. remove user from public.user_profiles table
    const { error } = await this.usersRepository.remove(id, companyId);

    if (error) {
      this.logger.error(error);
      throw error;
    }

    // 2. remove user from auth.users table
    const { error: authError } = await this.usersRepository.removeAuthUser(
      id,
      companyId,
    );

    if (authError) {
      this.logger.error(authError);
      throw authError;
    }

    return { message: 'User removed successfully' };
  }
}
