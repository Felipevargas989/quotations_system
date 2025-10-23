import { baseLayoutTemplate } from '../baseLayout';
import { WeeklyAnalyticsParams } from './types';

export const weeklyAnalyticsTemplate = (params: WeeklyAnalyticsParams) => {
  const emailContent = `
    <style>
      .greeting {
        font-size: 18px;
        color: #374151;
        margin: 0 0 20px 0;
      }
      .content {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 30px 0;
      }
    </style>
    <div class="greeting">
      <p>Hola,</p>
    </div>
    <div class="content">
      <p>Te informamos que ya está disponible el análisis semanal de tus eventos.</p>
      <p>Acá puedes revisar diferentes estadísticas claves para entender mejor el rendimiento de tu negocio. </p>
    </div>
  `;

  return baseLayoutTemplate({
    content: emailContent,
    cta: {
      text: 'Ver análisis semanal',
      link: params.link,
    },
  });
};
