export const API_ROUTES = {
  COMPANIES: "/companies",

  // quotations
  QUOTATIONS: "/quotations",
  QUOTATIONS_CHECK_CONFLICTS: "/quotations/check-conflicts",
  QUOTATIONS_PUBLIC: "/quotations/public",

  // clients
  CLIENTS: "/clients",
  CLIENT_TYPES: "/clients/types",
  CLIENT_TYPES_PUBLIC: "/clients/types/public",

  // payments
  PAYMENTS: "/payments",
  PAYMENTS_PLAN: "/payments/plan",
  PAYMENTS_TRANSACTIONS: "/payments/transactions",
  PAYMENTS_TRANSACTIONS_OVERFLOW: "/payments/transactions/overflow",

  // services
  SERVICES: "/services",
  SERVICES_BULK: "/services/bulk",
  SERVICES_VARIABLE: "/services/variable",
  SERVICES_FIXED: "/services/fixed",
  SERVICES_CATEGORIES: "/services/categories",

  // service groups
  SERVICE_GROUPS: "/service-groups",

  // service group collections (paquetes)
  SERVICE_GROUP_COLLECTIONS: "/service-group-collections",

  // logística ("una sola puerta", mudanzas #2 y #3)
  LOGISTICS_SUPPLIERS: "/logistics/suppliers",
  LOGISTICS_SUPPLIERS_USAGE: "/logistics/suppliers/usage",
  LOGISTICS_SUPPLIES: "/logistics/supplies",
  LOGISTICS_SUPPLIES_USAGE: "/logistics/supplies/usage",
  LOGISTICS_FURNITURE: "/logistics/furniture",
  LOGISTICS_FURNITURE_USAGE: "/logistics/furniture/usage",
  LOGISTICS_RESOURCES: "/logistics/resources",
  LOGISTICS_RESOURCES_USAGE: "/logistics/resources/usage",

  // super admin
  SUPER_ADMIN: "/super-admin",
  SUPER_ADMIN_STATS_LAST_MONTH: "/super-admin/stats/last-month",
  SUPER_ADMIN_NEW_LEAD: "/super-admin/new-lead",
  // Mudanza #1 "una sola puerta": registrar lead (guardar + avisar).
  SUPER_ADMIN_LEAD: "/super-admin/lead",

  // analytics
  ANALYTICS_DASHBOARD: "/analytics/dashboard",
  ANALYTICS_COMPLETE_STATS: "/analytics/complete",

  // users
  USERS: "/users",
  USERS_PASSWORD: "/users/password",
  USERS_SIGNUP: "/users/signup",

  // calendar
  CALENDAR_EVENTS: "/calendar/events",

  // plans
  PLAN_CONFIRMATION: "/plans/confirmation",

  // refunds
  REFUNDS: "/refunds",

  // customer satisfaction survey
  CUSTOMER_SATISFACTION_SURVEY_ANSWERS: "/customer-satisfaction-survey/answers",
  CUSTOMER_SATISFACTION_SURVEY_TEMPLATE:
    "/customer-satisfaction-survey/template",
  CUSTOMER_SATISFACTION_SURVEY_ANSWER: "/customer-satisfaction-survey/answer",
};
