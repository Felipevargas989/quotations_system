-- 154: LOS CONTACTOS DE LA EMPRESA PARA LICITAR (19-10-2026, decisión 43
-- del doc 17).
--
-- En el Día del Profesor, el Formulario N°1 (identificación del oferente)
-- pedía, además de lo que ya está en «Mi empresa», la dirección, los
-- teléfonos y el correo DEL REPRESENTANTE LEGAL, los datos del coordinador
-- durante la licitación y la página web; la IA los dejó en blanco. Felipe:
-- "podríamos incluir los datos del coordinador de la identificación".
-- Si el contacto del representante queda vacío, la IA usa el de la empresa.
--
-- Número 154: del 146 al 149 los usa la otra conversación de Eventia.
-- Primero en el laboratorio (Cotizador); a producción, antes del motor
-- (el motor pide estas columnas al leer «Mi empresa»).

alter table public.oportunidades_oferente
  add column if not exists representante_correo text,
  add column if not exists representante_telefono text,
  add column if not exists representante_direccion text,
  add column if not exists coordinador_nombre text,
  add column if not exists coordinador_cargo text,
  add column if not exists coordinador_correo text,
  add column if not exists coordinador_telefono text,
  add column if not exists sitio_web text;
