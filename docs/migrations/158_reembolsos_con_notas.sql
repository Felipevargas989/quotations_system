-- 158 · Reembolsos con notas (20-10-2026).
--
-- Felipe, al probar los reembolsos por partes: "¿por qué el registrar
-- reembolso no tiene la misma estructura que el registrar pagos (…)?
-- mantener todo homogéneo". «Registrar pago» y «Registrar reembolso» usan
-- ahora el mismo formulario (FormularioDeRegistro), que trae «Notas
-- (opcional)»; los abonos ya las guardan en payment_transactions.notes.
--
-- Columna nueva y opcional: no cambia nada de lo que ya existe.

alter table public.refunds add column if not exists notes text;

comment on column public.refunds.notes is
  'Notas del reembolso registrado (opcional), como las de los abonos.';
