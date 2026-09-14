import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import {
  OPERATIONS_AND_UP,
  RECEPTION_AND_UP,
  Roles,
} from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { SignedUrlDto, UploadFileDto } from './dto/upload-file.dto';
import { StorageService } from './storage.service';

// La puerta única de archivos (misión storage). Todas las rutas exigen
// sesión (guardián global); la empresa sale SIEMPRE de la sesión.
@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Body() dto: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /storage/upload kind=${dto.kind}`);
    return this.storageService.upload(dto, file, user.company_id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('signed-url')
  signedUrl(@Query() dto: SignedUrlDto, @CurrentUser() user: User) {
    return this.storageService.signedUrl(dto.src, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post('delete')
  remove(@Body() dto: SignedUrlDto, @CurrentUser() user: User) {
    this.logger.info(`POST /storage/delete`);
    return this.storageService.remove(dto.src, user.company_id);
  }
}
