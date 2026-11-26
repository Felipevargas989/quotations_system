import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CompaniesModule } from 'src/companies/companies.module';
import { LicitaController } from './licita.controller';
import { LicitaRepository } from './licita.repository';
import { LicitaService } from './licita.service';

// LICITA (25-11): lo propio de la segunda instalación. `UsersRepository`
// llega de `UsersModule` (global).
@Module({
  imports: [AuthModule, CompaniesModule],
  controllers: [LicitaController],
  providers: [LicitaService, LicitaRepository],
})
export class LicitaModule {}
