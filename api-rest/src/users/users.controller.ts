import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { API_ROUTES } from 'src/constants/api.routes';
import { CreateUserDto } from './dto/create-user.dto';
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

  @Post()
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /users with createUserDto ${JSON.stringify(createUserDto)}`,
    );
    return this.usersService.create(createUserDto, user.company_id);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /users with user ${user.id}`);
    return this.usersService.findAll(user.company_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: User['id'], @Body() updateUserDto: UpdateUserDto) {
    this.logger.info(
      `PATCH /users/${id} with updateUserDto ${JSON.stringify(updateUserDto)}`,
    );
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: User['id'], @CurrentUser() user: User) {
    this.logger.info(`DELETE /users/${id} with user ${user.id}`);
    return this.usersService.remove(id, user.company_id);
  }
}
