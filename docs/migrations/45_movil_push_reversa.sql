-- REVERSA migración 45: elimina las tablas del push del móvil.
DROP TABLE IF EXISTS public.push_devices;
DROP TABLE IF EXISTS public.notifications;
