/**
 * Base email layout template
 * Provides consistent structure for all email communications
 */

export interface BaseLayoutParams {
  /**
   * HTML content to be rendered in the body section
   */
  content: string;

  /**
   * Call-to-action button configuration (optional)
   */
  cta?: {
    text: string;
    link: string;
  };

  /**
   * Custom title for the header (defaults to 'EVENTIA')
   */
  headerTitle?: string;

  /**
   * Additional footer text (optional)
   */
  footerText?: string;
}

/**
 * Creates a complete email HTML with consistent header, footer, and styling
 * @param params - Configuration for the email layout
 * @returns Complete HTML string for the email
 */
export const baseLayoutTemplate = (params: BaseLayoutParams): string => {
  const headerTitle = params.headerTitle || 'EVENTIA';
  const defaultFooterText = '© 2025 Eventia. Todos los derechos reservados.';
  const footerText = params.footerText || defaultFooterText;

  // CTA Button HTML (only if provided)
  const ctaButtonHtml = params.cta
    ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${params.cta.link}" class="cta-button">
        ${params.cta.text}
      </a>
    </div>
  `
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
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
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 30px 0;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 30px 20px;
      }
      .header {
        padding: 30px 20px;
      }
      .logo-text {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <div style="background-color: #f3f4f6; padding: 20px 0;">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <h1 class="logo-text">${headerTitle}</h1>
      </div>

      <!-- Content -->
      <div class="content">
        ${params.content}
        ${ctaButtonHtml}
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          ${footerText}
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
};
