/**
 * Validation utility functions for form validation
 */

/**
 * Validates email format
 * @param email - The email to validate
 * @returns Empty string if valid, error message if invalid
 */
export const validateEmail = (email: string): string => {
  if (!email) return "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? "" : "Email inválido";
};

/**
 * Validates Chilean phone number format (+569XXXXXXXX)
 * @param phone - The phone number to validate
 * @returns Empty string if valid, error message if invalid
 */
export const validatePhone = (phone: string): string => {
  if (!phone) return "";
  const chileanPhoneRegex = /^\+569\d{8}$/;
  return chileanPhoneRegex.test(phone)
    ? ""
    : "Teléfono debe ser formato chileno: +569XXXXXXXX";
};

/**
 * Validates both email and phone number
 * @param email - The email to validate
 * @param phone - The phone number to validate
 * @returns Object with validation results
 */
export const validateClientData = (email: string, phone: string) => {
  const emailError = validateEmail(email);
  const phoneError = validatePhone(phone);

  return {
    emailError,
    phoneError,
    isValid: !emailError && !phoneError,
  };
};

/**
 * Validates a form with email and phone fields
 * @param formData - Object containing email and phone fields
 * @returns Object with validation results and error messages
 */
export const validateClientForm = (formData: {
  email: string;
  phone: string;
}) => {
  const emailError = validateEmail(formData.email);
  const phoneError = validatePhone(formData.phone);

  return {
    errors: {
      email: emailError,
      phone: phoneError,
    },
    isValid: !emailError && !phoneError,
  };
};

/**
 * Validates a complete client form with all required fields
 * @param formData - Object containing name, email, phone, contact_person, and client_type fields
 * @returns Object with validation results and error messages
 */
export const validateCompleteClientForm = (formData: {
  name: string;
  email: string;
  phone: string;
  contact_person: string;
  client_type: string;
}) => {
  const nameError = !formData.name.trim()
    ? "Nombre del cliente es requerido"
    : "";
  const emailError = validateEmail(formData.email);
  const phoneError = validatePhone(formData.phone);
  const contactPersonError = !formData.contact_person.trim()
    ? "Persona de contacto es requerida"
    : "";

  return {
    errors: {
      name: nameError,
      email: emailError,
      phone: phoneError,
      contact_person: contactPersonError,
    },
    isValid: !nameError && !emailError && !phoneError && !contactPersonError,
  };
};
