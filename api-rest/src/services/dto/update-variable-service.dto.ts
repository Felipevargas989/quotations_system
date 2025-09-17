import { PartialType } from '@nestjs/mapped-types';
import { CreateVariableServiceDto } from './create-variable-service.dto';

export class UpdateVariableServiceDto extends PartialType(
  CreateVariableServiceDto,
) {}
