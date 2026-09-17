export enum EmailStructure {
  NEW_ACCOUNT = 'newAccount',
  NEW_PUBLIC_QUOTATION_CLIENT = 'newPublicQuotationClient',
  NEW_PUBLIC_QUOTATION_ADMIN = 'newPublicQuotationAdmin',
  SOON_EVENTS = 'soonEvents',
  PAYMENT_REMINDER = 'paymentReminder',
  PAYMENT_REMINDER_ADMIN = 'paymentReminderAdmin',
  PAYMENT_OVERDUE = 'paymentOverdue',
  PAYMENT_OVERDUE_ADMIN = 'paymentOverdueAdmin',
  QUOTATION_IS_SENT = 'quotationIsSent',
  QUOTATION_FOLLOW_UP = 'quotationFollowUp',
  PAYMENT_PLAN_CREATED = 'paymentPlanCreated',
  PAYMENT_RECEIVED = 'paymentReceived',
  CUSTOMER_SATISFACTION_SURVEY = 'customerSatisfactionSurvey',
  NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY = 'newAnswerCustomerSatisfactionSurvey',
  WEEKLY_ANALYTICS = 'weeklyAnalytics',
  QUOTATION_STATUS_CHECK = 'quotationStatusCheck',
  WEEKLY_DIGEST = 'weeklyDigest',
  PORTAL_RECEIPT_ADMIN = 'portalReceiptAdmin',
  // SUPER_ADMIN_NOTIFICATION se jubiló (cura 05-08) junto con la
  // puerta huérfana POST /super-admin/new-lead: cero llamadores vivos.
  // Torre de Control (tanda 1, 05-08): alertas a los super-admins.
  // El cobro (16-09-2026, sprint B del paso 4+5): pago rechazado con
  // su gracia, y prueba a dos días de vencer.
  PAGO_FALLIDO = 'pagoFallido',
  PRUEBA_POR_VENCER = 'pruebaPorVencer',
  SUPER_ADMIN_NEW_LEAD = 'superAdminNewLead',
  SUPER_ADMIN_NEW_COMPANY = 'superAdminNewCompany',
}
