// Email notification types
interface EmailNotification {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface EmailCategory {
  id: string;
  name: string;
  badge: string;
  badgeColor: string;
  emails: EmailNotification[];
}
