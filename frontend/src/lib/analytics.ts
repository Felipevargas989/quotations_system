// Google Analytics 4 — propiedad "Eventia" de Felipe (10-08-2026).
// El ID anterior (G-YJZHR3XLTG) era de una cuenta ajena: las visitas
// le llegaban a un desconocido. El ID de medición no es secreto.
export const GA_TRACKING_ID = "G-95XN3KQF7Z";

// Solo PRODUCCIÓN reporta: el laboratorio y el desarrollo local no
// ensucian los datos con nuestras pruebas.
const esProduccion = () =>
  typeof window !== "undefined" &&
  window.location.hostname.endsWith("eventi-app.com");

// Initialize Google Analytics
export const initGA = () => {
  if (!esProduccion()) return;
  // Load the Google Analytics script
  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`;
  script.async = true;
  document.head.appendChild(script);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_TRACKING_ID);
};

// Track page views
export const trackPageView = (path: string) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("config", GA_TRACKING_ID, {
      page_path: path,
    });
  }
};

// Track events
export const trackEvent = (
  action: string,
  category: string,
  label: string,
  value?: number,
) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Declare global gtag function
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}
