import { Quotation } from 'src/quotations/entities/quotation.entity';
// import { BlockedDays } from '../entities/blocked-days.entity';

export type FindAllEventsResponse = {
  quotations: Quotation[];
  // blockedDays: BlockedDays[] | null;
};
