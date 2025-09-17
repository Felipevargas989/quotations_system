import { PartialType } from '@nestjs/mapped-types';
import { CreateFixedServiceDto } from './create-fixed-service.dto';

export class UpdateFixedServiceDto extends PartialType(CreateFixedServiceDto) {}
