import { baseLayoutTemplate } from './baseLayout';

/**
 * Welcome email template for new account creation
 * @returns HTML string for the new account welcome email
 */
export const newAccountTemplate = (): string => {
  // Content specific to the new account email
  const content = `
    <style>
      .welcome-title {
        font-size: 28px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 20px 0;
        text-align: center;
      }
      .welcome-text {
        font-size: 16px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0 0 30px 0;
        text-align: center;
      }
      .features {
        background-color: #f9fafb;
        border-radius: 12px;
        padding: 30px;
        margin: 30px 0;
      }
      .feature-item {
        display: flex;
        align-items: flex-start;
        margin-bottom: 20px;
      }
      .feature-item:last-child {
        margin-bottom: 0;
      }
      .feature-icon {
        background-color: #134686;
        color: #ffffff;
        border-radius: 8px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        margin-right: 15px;
        flex-shrink: 0;
      }
      .feature-content h3 {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 5px 0;
      }
      .feature-content p {
        font-size: 14px;
        color: #6b7280;
        margin: 0;
        line-height: 1.5;
      }
      .divider {
        height: 1px;
        background-color: #e5e7eb;
        margin: 30px 0;
      }
      @media only screen and (max-width: 600px) {
        .welcome-title {
          font-size: 24px;
        }
        .features {
          padding: 20px;
        }
      }
    </style>

    <h2 class="welcome-title">¡Bienvenido a Eventia! 🎉</h2>
    <p class="welcome-text">
      Estamos emocionados de tenerte en nuestra plataforma. Eventia es tu solución integral para la gestión de cotizaciones y eventos, diseñada para hacer tu trabajo más fácil y eficiente.
    </p>

    <!-- Features Section -->
    <div class="features">
      <div class="feature-item">
        <div class="feature-icon">📋</div>
        <div class="feature-content">
          <h3>Gestión de Cotizaciones</h3>
          <p>Crea, edita y envía cotizaciones profesionales en minutos</p>
        </div>
      </div>

      <div class="feature-item">
        <div class="feature-icon">👥</div>
        <div class="feature-content">
          <h3>Control de Clientes</h3>
          <p>Administra tu cartera de clientes de forma centralizada</p>
        </div>
      </div>

      <div class="feature-item">
        <div class="feature-icon">📊</div>
        <div class="feature-content">
          <h3>Análisis y Reportes</h3>
          <p>Obtén insights valiosos sobre tu negocio</p>
        </div>
      </div>

      <div class="feature-item">
        <div class="feature-icon">🎨</div>
        <div class="feature-content">
          <h3>Personalización</h3>
          <p>Adapta la plataforma con tus colores y logo de marca</p>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <p class="welcome-text" style="font-size: 14px; margin-bottom: 10px;">
      ¿Necesitas ayuda para comenzar? Nuestro equipo está aquí para apoyarte en cada paso del camino.
    </p>
  `;

  // Use the base layout with the new account content
  return baseLayoutTemplate({
    content,
    cta: {
      text: 'Comenzar Ahora',
      link: 'https://www.eventi-app.com/',
    },
  });
};

// Export as string for backward compatibility with existing code
export const newAccountTemplateString = newAccountTemplate();
