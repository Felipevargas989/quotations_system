-- 213 · Relleno de la foto de lo pagado (doc 10 §15)
--
-- Las filas selladas antes de la 213 no tienen foto: se toma el valor que
-- tienen HOY y se marca `foto_reconstruida`, porque no es lo medido al
-- pagar. Si una fila pagada cambió después de su nómina, la foto queda con
-- el valor nuevo: esas filas están listadas en el doc 10 §15 para que
-- Felipe decida (por ejemplo, la fila 2912: $20.000 hoy y $25.000
-- pagados). NO se corrigen aquí.

update public.event_staff
   set monto_pagado = amount,
       foto_reconstruida = true
 where payroll_id is not null
   and monto_pagado is null;

update public.event_staff
   set propina_pagada = tip_amount,
       foto_reconstruida = true
 where tip_payroll_id is not null
   and propina_pagada is null;
