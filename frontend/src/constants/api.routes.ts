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

  // super admin
  SUPER_ADMIN: "/super-admin",
  SUPER_ADMIN_STATS_LAST_MONTH: "/super-admin/stats/last-month",
  SUPER_ADMIN_NEW_LEAD: "/super-admin/new-lead",

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
