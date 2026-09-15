import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { assertCupo, derechosDe, type EmpresaConPlan } from 'src/auth/derechos';
import { olvidarPerfil } from 'src/cache/memoria';
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
    cupo?: { usuarios_max?: number | null; plan?: string | null },
  ): Promise<any> {
    // El tope de usuarios del plan (paso 3.2, 14-09-2026). Se cuenta
    // ANTES de crear nada en auth: si no, quedaría una cuenta huérfana
    // en Supabase sin perfil. Bajar de plan no bloquea a nadie que ya
    // exista — solo impide agregar uno más (decisión de Felipe).
    if (cupo && cupo.usuarios_max !== null && cupo.usuarios_max !== undefined) {
      const usados = await this.usersRepository.contarDeEmpresa(companyId);
      assertCupo('usuarios_max', usados, cupo.usuarios_max, cupo.plan);
    }
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

  /** Ver un perfil solo si es de la empresa de la sesión (14-09-2026). */
  async findOneDeLaEmpresa(id: User['id'], companyId: Company['id']) {
    const { data, error } = await this.usersRepository.findOne(id);
    if (error || !data || data.company_id !== companyId) {
      throw new NotFoundException('Usuario no encontrado');
    }
    // El perfil es por donde la app se entera de sus derechos (paso 3.2,
    // 14-09-2026). La cuenta la hace el motor y viaja hecha: la app no
    // tiene ninguna copia de la tabla de planes, así que cambiar lo que
    // trae un plan no obliga a publicar la web de nuevo.
    const empresa = data.companies as EmpresaConPlan | null;
    const derechos = derechosDe(empresa);
    return {
      data: {
        ...data,
        companies: empresa ? { ...empresa, ...derechos } : empresa,
      },
      error: null,
    };
  }

  /** Editar un perfil solo si es de la empresa de la sesión (14-09-2026). */
  async update(
    id: User['id'],
    updateUserDto: UpdateUserDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `update user with id ${id} and updateUserDto ${logSafe(updateUserDto)}`,
    );
    const { data, error } = await this.usersRepository.update(
      id,
      updateUserDto,
      companyId,
    );
    if (error || !data) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return { data, error: null };
  }

  async remove(id: User['id'], companyId: Company['id']) {
    // El guardián recuerda perfiles 1 hora: al eliminar, se olvida YA.
    olvidarPerfil(id);
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
