export const formatCurrency = (amount: number, currency: string) => {
  // Determine locale and fraction digits based on currency
  const currencyConfig: {
    [key: string]: {
      locale: string;
      minimumFractionDigits: number;
      maximumFractionDigits: number;
    };
  } = {
    CLP: {
      locale: "es-CL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    MXN: {
      locale: "es-MX",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    USD: {
      locale: "en-US",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    EUR: {
      locale: "de-DE",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  };

  // BLINDAJE (23-07): si la moneda viene vacía o desconocida, el respaldo
  // debe ser COMPLETO — antes se usaba la config CLP pero se le pasaba la
  // moneda original ("") a Intl.NumberFormat, que lanza RangeError y bota
  // la página entera (pantalla blanca en Analytics, empresa sin moneda).
  const known = Object.prototype.hasOwnProperty.call(currencyConfig, currency);
  const safeCurrency = known ? currency : "CLP";
  const config = currencyConfig[safeCurrency];

  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: config.minimumFractionDigits,
    maximumFractionDigits: config.maximumFractionDigits,
  }).format(amount);
};
