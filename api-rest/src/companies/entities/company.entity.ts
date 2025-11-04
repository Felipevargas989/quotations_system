import { EmailStructure } from 'src/email/types';

export class Company {
  id: number;
  name: string;
  logo_url?: string;
  colors?: {
    primary: string;
    secondary: string;
  };
  notifications?: {
    emails: {
      [key in EmailStructure]: boolean;
    };
  };
  currency: string;
}
