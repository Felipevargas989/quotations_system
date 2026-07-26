/**
 * Validation utility functions for form validation
 */

import { ClientFormData } from "../types/clients.types";
import { normalizePhone } from "./phone";

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
 * Valida un teléfono chileno, celular o fijo.
 *
 * ANTES (hasta el 26-07-2026) esto exigía /^\+569\d{8}$/ — o sea, celular o
 * nada. Un fijo como +56 2 2345 6789 se rechazaba de plano, y por eso entre
 * los 250 clientes de la base no había ni uno solo: no es que nadie tuviera,
 * es que no se podía anotar.
 *
 * La regla de verdad es más simple: TODOS los números chilenos tienen 9
 * dígitos, fijos y celulares por igual. Lo que cambia es dónde caen los
 * espacios al mostrarlo, y de eso se encarga formatPhone(), no esta función.
 *
 * Se valida sobre el número ya ordenado, así que escribir "9 5095 5947" o
 * "950955947" no marca error: se acepta y se guarda canónico.
 *
 * @param phone - El teléfono a validar
 * @returns Cadena vacía si es válido, mensaje de error si no
 */
export const validatePhone = (phone: string): string => {
  if (!phone) return "";
  const chileanPhoneRegex = /^\+56\d{9}$/;
  return chileanPhoneRegex.test(normalizePhone(phone))
    ? ""
    : "Teléfono chileno de 9 dígitos (ej: 9 5095 5947 o 42 234 5678)";
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
export const validateCompleteClientForm = (formData: ClientFormData) => {
  const nameError = !formData.name.trim()
    ? "Nombre del cliente es requerido"
    : "";
  const emailError = validateEmail(formData.email || "");
  const phoneError = validatePhone(formData.phone || "");
  const contactPersonError = !formData.contact_person?.trim()
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
