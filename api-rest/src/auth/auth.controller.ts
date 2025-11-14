import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { API_ROUTES } from 'src/constants/api.routes';
import { AuthService } from './auth.service';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './public.decorator';

@Controller(API_ROUTES.AUTH)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Public()
  @Post('password/recovery')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordRecovery(
    @Body() requestPasswordRecoveryDto: RequestPasswordRecoveryDto,
  ) {
    this.logger.info(
      `POST /auth/password/recovery for ${requestPasswordRecoveryDto.email}`,
    );
    await this.authService.requestPasswordRecovery(
      requestPasswordRecoveryDto.email,
    );
    return {
      message:
        'If an account exists for that email, you will receive recovery instructions shortly.',
    };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    this.logger.info(
      `POST /auth/password/reset for token ${resetPasswordDto.accessToken.substring(0, 6)}...`,
    );
    await this.authService.resetPasswordWithToken(
      resetPasswordDto.accessToken,
      resetPasswordDto.password,
    );
    return {
      message: 'Password updated successfully.',
    };
  }
}
