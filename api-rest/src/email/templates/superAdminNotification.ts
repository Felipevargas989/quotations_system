import { baseLayoutTemplate } from './baseLayout';

export const superAdminNotificationTemplate = (content: string): string => {
  const sanitizedContent = content || '';
  const templateContent = `
    <style>
      .notification-title {
        font-size: 24px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 16px;
        text-align: center;
      }
      .notification-message {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 24px 0;
        text-align: center;
      }
    </style>
    <h2 class="notification-title">Nueva notificación</h2>
    <p class="notification-message">${sanitizedContent}</p>
  `;

  return baseLayoutTemplate({
    content: templateContent,
  });
};
