import { IsDateString, IsOptional } from 'class-validator';

export class GetDashboardStatsDto {
  @IsDateString()
  @IsOptional()
  start_date?: Date;

  @IsDateString()
  @IsOptional()
  end_date?: Date;
}
