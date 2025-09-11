import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from './interfaces/auth.interfaces';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
