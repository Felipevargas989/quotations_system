import { forwardRef, Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { SuperAdminModule } from 'src/super-admin/super-admin.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Global()
@Module({
  imports: [forwardRef(() => SuperAdminModule), LoggerModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
