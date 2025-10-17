export const newAccountTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a Eventia</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background-color: #f3f4f6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #134686 0%, #1e5a9e 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .logo-text {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
      letter-spacing: 1px;
    }
    .content {
      padding: 40px 30px;
    }
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
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #134686 0%, #0f3a6b 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 20px auto;
      display: block;
      max-width: 280px;
      box-shadow: 0 4px 6px rgba(19, 70, 134, 0.25);
      transition: all 0.3s ease;
    }
    .cta-button:hover {
      box-shadow: 0 6px 12px rgba(19, 70, 134, 0.35);
      transform: translateY(-2px);
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer-text {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 10px 0;
    }
    .footer-link {
      color: #134686;
      text-decoration: none;
      font-weight: 500;
    }
    .social-links {
      margin-top: 20px;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 30px 20px;
      }
      .welcome-title {
        font-size: 24px;
      }
      .features {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div style="background-color: #f3f4f6; padding: 20px 0;">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <h1 class="logo-text">EVENTIA</h1>
      </div>

      <!-- Content -->
      <div class="content">
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

        <!-- CTA Button -->
        <a href="https://www.eventi-app.com/" class="cta-button">
          Comenzar Ahora
        </a>

        <div class="divider"></div>

        <p class="welcome-text" style="font-size: 14px; margin-bottom: 10px;">
          ¿Necesitas ayuda para comenzar? Nuestro equipo está aquí para apoyarte en cada paso del camino.
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          © 2025 Eventia. Todos los derechos reservados.
        </p>
        <p class="footer-text">
          <a href="https://www.eventi-app.com/" class="footer-link">Visitar sitio web</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
