import { Refund } from '../entities/refund.entity';

export type CreateRefundPayload = Omit<Refund, 'id'>;
