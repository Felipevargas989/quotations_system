import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { SinPlan } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import { API_ROUTES } from 'src/constants/api.routes';
import { logSafe } from '../logging/log-safe';
import { CreateUserDto } from './dto/create-user.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller(API_ROUTES.USERS)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersController.name);
  }

  @Roles(...ADMIN_ONLY)
  @Post()
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /users with createUserDto ${logSafe(createUserDto)}`,
    );
    // El tope de usuarios del plan viaja en la sesión (paso 3.2,
    // 14-09-2026); el servicio cuenta antes de crear nada.
    return this.usersService.create(createUserDto, user.company_id, {
      usuarios_max: user.usuarios_max,
      plan: user.plan,
    });
  }

  @Roles(...ADMIN_ONLY)
  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /users with user ${user.id}`);
    return this.usersService.findAll(user.company_id);
  }

  @Patch('password')
  updatePassword(
    @Body() updatePasswordDto: UpdatePasswordDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /users/password with user ${user.id}`);
    return this.usersService.updatePassword(user.id, updatePasswordDto);
  }

  // Aislamiento entre empresas (14-09-2026): ver y editar solo perfiles de
  // la propia empresa. `AuthGuard` sigue usando `findOne` sin empresa para
  // poblar la sesión; estas dos puertas usan las variantes con empresa.
  // Una empresa bloqueada igual necesita su perfil: es por donde la
  // app sabe qué plan tiene y qué pantalla mostrarle (paso 3.2).
  @SinPlan()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`GET /users/${id}`);
    return this.usersService.findOneDeLaEmpresa(id, user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Patch(':id')
  update(
    @Param('id') id: User['id'],
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /users/${id} with updateUserDto ${logSafe(updateUserDto)}`,
    );
    return this.usersService.update(id, updateUserDto, user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Delete(':id')
  remove(@Param('id') id: User['id'], @CurrentUser() user: User) {
    this.logger.info(`DELETE /users/${id} with user ${user.id}`);
    return this.usersService.remove(id, user.company_id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('signup')
  signup(@Body() signupDto: SignupDto) {
    this.logger.info(`POST /users/signup with signupDto ${logSafe(signupDto)}`);
    return this.usersService.signup(signupDto);
  }
}
