import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ServiceGroup } from '../entities/service-group.entity';

/** Renombrar un menú guardado (Felipe, 09-09): solo el nombre. */
export class RenameServiceGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: ServiceGroup['name'];
}
