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

  const config = currencyConfig[currency] || currencyConfig.CLP;

  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: config.minimumFractionDigits,
    maximumFractionDigits: config.maximumFractionDigits,
  }).format(amount);
};
