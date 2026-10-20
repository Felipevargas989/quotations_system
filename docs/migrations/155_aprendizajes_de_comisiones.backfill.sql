-- 155 (backfill): los estudios de caso del 20-10-2026, para Valle del Sol
-- (empresa 1). Felipe pidió guardar "cómo el comité interpretó las bases y
-- tomó decisiones ante faltas, omisiones, etc."; solo lo que hizo cada
-- comisión, con su evidencia, sin consejos ni pesos de las bases. Salen de
-- los paquetes que bajó Felipe (actas de evaluación y ofertas) y de las
-- actas públicas de adjudicación. Se corre después de la 155; se puede
-- correr dos veces (índice único por licitación y situación).

insert into public.oportunidades_aprendizajes
  (company_id, codigo, unidad, organismo, situacion, decision, tipo, fuente)
select 1, v.codigo, split_part(v.codigo, '-', 1), v.organismo, v.situacion, v.decision, v.tipo, 'caso'
from (values
  -- Día del Profesor 2025, DAEM de Quillón (acta del 08-10-2025, un solo oferente).
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'Cómo revisó los documentos.', 'Con una tabla de sí/no por documento, en el orden de las bases.', 'estricta'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'Faltó la declaración del programa de integridad, uno de los documentos administrativos pedidos.', 'Puso 0 en integridad y la oferta siguió en carrera: no la declaró fuera de bases.', 'flexible'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'La ubicación se puntuaba por domicilio urbano o rural.', 'Leyó el domicilio del Inicio de Actividades («Km 2,5 camino Quillón») y lo clasificó rural: 18 de 20.', 'estricta'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'El formulario de experiencia (N°3) traía 5 servicios, cada uno con su orden de compra.', 'Contó las filas según la tabla de las bases (de 1 a 5: 3 de 10), sin evaluar si los servicios eran parecidos ni sus montos.', 'estricta'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'La propuesta técnica (N°4) venía como una lista con casillas, más una cotización propia con fotos.', 'La dio por completa y detallada: 30 de 30.', 'flexible'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'Venían documentos que las bases no pedían (un informe comercial con una morosidad).', 'No los tomó en cuenta.', 'estricta'),
  ('4364-5-LE25', 'I. Municipalidad de Quillón (DAEM)', 'Hubo un solo oferente.', 'Le dio el puntaje completo en precio y la adjudicó con 86 puntos, sin exigir un mínimo.', 'estricta'),
  -- Mes de las Juventudes 2026, Oficina de Jóvenes de Quillón (acta del 23-07-2026).
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'Las bases pedían un show principal con más de 400.000 seguidores en Instagram; dos ofertas declararon un artista sin la cifra, o con una cifra que su propio pantallazo desmentía (7.549).', 'Verificó la cifra real con la evidencia y dejó fuera de bases las dos ofertas enteras, aunque eran más baratas.', 'estricta'),
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'Un formulario técnico (N°4) no cumplía todo lo pedido.', 'Lo anotó «No cumple totalidad de requerimiento» y la oferta quedó fuera: no dio puntaje parcial.', 'estricta'),
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'El representante legal de un oferente trabajaba en el DAEM de la misma municipalidad (alerta del Observatorio) y había firmado que no era funcionario.', 'La declaró «fuera de evaluación» por el art. 35 quáter: ni se evaluó.', 'estricta'),
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'Un programa de integridad venía a nombre de fantasía, distinto de la razón social.', 'Lo marcó no aceptado, sin explicar por qué.', 'estricta'),
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'El mismo certificado OS10 de la empresa de seguridad, idéntico, venía en tres ofertas.', 'Lo aceptó en las tres.', 'flexible'),
  ('5040-6-LE26', 'I. Municipalidad de Quillón (DIDECO, Oficina de Jóvenes)', 'El formulario económico de la ganadora traía al pie el encabezado de otra licitación («Fiesta del Pavo»).', 'No lo objetó: un error de forma que no cambia la oferta pasó.', 'flexible'),
  -- Salón y catering, Integra Ñuble (informe del 04-12-2025).
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Las bases decían que la oferta sin «la totalidad de lo requerido» era inadmisible, y ninguna de las 4 lo traía todo.', 'No declaró ninguna inadmisible: puso 0 en requisitos formales a las 4 y no pidió nada por foro inverso.', 'flexible'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Anexo de integridad marcado «Sí» sin adjuntar copia del programa; una oferta adjuntó su Reglamento Interno (RIOHS).', 'Puso 0 en integridad: el reglamento interno no contó como programa.', 'estricta'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'La tabla de experiencia daba máximo 20 puntos, aunque el criterio pesaba 30 %.', 'La aplicó tal cual: nadie podía pasar de 90.', 'estricta'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Un anexo de experiencia traía 2 filas llenas y 3 vacías marcadas «Sí».', 'Contó las 2 respaldadas (5 puntos); no aplicó «anexo incompleto = 0».', 'flexible'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Una oferta listó 5 clientes sin descripción ni respaldo.', 'Le puso 0 en experiencia.', 'estricta'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'La quinta experiencia de la ganadora venía con una resolución de adjudicación de 2023; las bases aceptaban solo contrato, resolución que aprueba el contrato, orden de compra o factura.', 'La contó igual (5 de 5, 20 puntos); con 4 habría ganado otra oferta.', 'contra_las_bases'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Un anexo económico calculó mal el IVA (13 % en vez de 19 %).', 'Usó el total bruto del anexo, como mandaban las bases.', 'estricta'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Dos ofertas omitían parte del menú pedido (salchichas o tocino, papas o vegetales, opción vegetariana).', 'No evaluó lo técnico: no había criterio técnico y nadie quedó fuera por el menú.', 'flexible'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Una oferta no dijo dónde quedaba su salón; las bases exigían que estuviera dentro de las 4 avenidas de Chillán.', 'No lo revisó.', 'flexible'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'La encargada del servicio de la oferta ganadora era la dueña de otra oferente, y sus anexos económicos eran idénticos salvo el precio.', 'No lo notó (la Ley de Compras manda evaluar solo una de las ofertas de empresas relacionadas).', 'flexible'),
  ('1072229-25-L125', 'Fundación Integra, Regional Ñuble', 'Las firmas venían pegadas como foto en los anexos.', 'Las aceptó.', 'flexible'),
  -- Banquetería del Día del Asistente y del Profesor 2025, DEM Yumbel (acta N°24 del 24-09-2025).
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Cómo revisó los documentos.', 'Con un checklist sí/no por formulario (F1, F2, F3, F4) y la inscripción en ChileProveedores.', 'estricta'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'La oferta más barata ofreció la sede de un club deportivo sin patente comercial; las bases pedían el lugar con patente vigente y el documento adjunto.', 'La dejó fuera de bases por la cláusula «ofertar la totalidad», aunque era $3 M más barata. Era la misma sede que la municipalidad había usado en 2024.', 'estricta'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Una oferta declaró 4 trabajos y solo uno traía certificado del mandante; las bases decían que las órdenes de compra no cuentan.', 'Contó solo el certificado: 1 servicio, 10 puntos.', 'estricta'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Un certificado de experiencia no decía el monto, y el mínimo era $1,5 M.', 'Lo contó igual, con el monto declarado en el formulario.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Una oferta marcó el menú solo para uno de los dos servicios; las bases exigían ofertar todo.', 'No lo vio.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Un salón era sobre todo una terraza con piso de cemento y techo de policarbonato; las bases pedían un lugar cerrado y de piso liso.', 'No lo vio.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Las bases pedían adjuntar fotografías del lugar y ninguna oferta las trajo bien.', 'No se lo exigió a nadie.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Las bases pedían el lugar a no más de 7 km de la plaza, y uno estaba en una parcela rural.', 'No verificó la distancia.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'El monto de un certificado no calzaba con el declarado en el formulario.', 'No lo notó: no cambiaba el puntaje.', 'flexible'),
  ('4074-35-LE25', 'I. Municipalidad de Yumbel (DEM)', 'Una declaración jurada venía fechada un mes después del cierre.', 'No la objetó.', 'flexible'),
  -- Cena bailable de funcionarios, UBB Chillán (informe del 09-04-2026, acta pública).
  ('2705-22-LE26', 'Universidad del Bío-Bío, Campus Chillán', 'Las bases pedían el salón a no más de 7 km de la Plaza de Armas de Chillán, y la oferta más barata lo tenía en el km 8 camino a Pinto.', 'La declaró no válida: revisó la ubicación.', 'estricta'),
  ('2705-22-LE26', 'Universidad del Bío-Bío, Campus Chillán', 'Una oferta tenía 7 multas en su registro de Mercado Público; el criterio de comportamiento contractual pesaba 5 %.', 'Le puso 0 en ese criterio y perdió por 0,21 puntos, aunque era $314.000 más barata.', 'estricta'),
  ('2705-22-LE26', 'Universidad del Bío-Bío, Campus Chillán', 'El domicilio comercial se puntuaba (Chillán 100, Ñuble 50).', 'Lo leyó del formulario de identificación.', 'estricta'),
  -- Día del Funcionario 2025, Municipalidad de Concepción (acta pública con la evaluación completa).
  ('2672-2-LE25', 'I. Municipalidad de Concepción (Dirección Administrativa)', 'La oferta más barata no recogió una modificación de las bases publicada durante el proceso (cotizó menos horas y menos tickets).', 'La declaró inadmisible.', 'estricta'),
  ('2672-2-LE25', 'I. Municipalidad de Concepción (Dirección Administrativa)', 'Una oferta no adjuntó los anexos 1 a 6.', 'La declaró inadmisible.', 'estricta'),
  ('2672-2-LE25', 'I. Municipalidad de Concepción (Dirección Administrativa)', 'Una oferta presentó su experiencia en otro formato y no en el Anexo N°5, y le faltó la «descripción del documento».', 'Le puso 0 en experiencia y no lo dejó subsanar, porque completar la oferta le daría ventaja.', 'estricta'),
  -- Actas públicas de adjudicación (sin el acta de evaluación).
  ('1043030-4-LE26', 'Seremi de Educación de Ñuble', 'Un certificado de vigencia de estatutos tenía más de 60 días.', 'Declaró inadmisible la oferta.', 'estricta'),
  ('1043030-12-L125', 'Seremi de Educación de Ñuble', 'Una línea de la oferta superaba el presupuesto máximo.', 'Declaró inadmisible esa línea.', 'estricta'),
  ('1242028-6-LE26', 'Corporación Social y Cultural de Concepción', 'El precio del comprobante de ingreso de la oferta no coincidía con el del anexo económico.', 'La rechazó sin evaluarla.', 'estricta')
) as v(codigo, organismo, situacion, decision, tipo)
where exists (select 1 from public.companies where id = 1)
on conflict do nothing;
