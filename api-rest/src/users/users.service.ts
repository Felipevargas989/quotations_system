import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SuperAdminService } from 'src/super-admin/super-admin.service';
import { logSafe } from '../logging/log-safe';
import { CreateUserDto } from './dto/create-user.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import { CreateUser } from './types';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
    @Inject(forwardRef(() => SuperAdminService))
    private readonly superAdminService: SuperAdminService,
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
      const userAuth = data.user;

      if (error) throw error;
      if (!userAuth?.id) throw new Error('User ID is required');

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...rest } = createUserDto;
      const newUser: CreateUser = {
        ...rest,
        user_id: userAuth?.id,
        company_id: companyId,
      };

      // 2. Create user in public.user_profiles table
      return this.usersRepository.createUser(newUser);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  findAll(companyId: Company['id'] | undefined, userRole?: UserRole) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    return this.usersRepository.findAll(companyId, userRole);
  }

  findOne(id: User['id']) {
    this.logger.info(`findOne user with id ${id}`);
    return this.usersRepository.findOne(id);
  }

  update(id: User['id'], updateUserDto: UpdateUserDto) {
    this.logger.info(
      `update user with id ${id} and updateUserDto ${logSafe(updateUserDto)}`,
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

  async updatePassword(userId: string, updatePasswordDto: UpdatePasswordDto) {
    this.logger.info(`updatePassword for user ${userId}`);

    try {
      const { data, error } = await this.usersRepository.updatePassword(
        userId,
        updatePasswordDto.newPassword,
      );

      if (error) {
        throw new Error(`Failed to update password: ${error.message}`);
      }

      return {
        message: 'Password updated successfully',
        data: data,
      };
    } catch (error) {
      this.logger.error('Error in updatePassword service:', error);
      throw error;
    }
  }

  async signup(signupDto: SignupDto) {
    this.logger.info(`signup with signupDto ${logSafe(signupDto)}`);

    return this.superAdminService.createSuscription(signupDto);
  }
}
