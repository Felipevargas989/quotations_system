-- 211 · EL CONVENIO DEL CLIENTE Y SUS DOCUMENTOS (doc 24)
--
-- Felipe, 19-11-2026: *"tengo muchos convenios con clientes dando vuelta"*;
-- *"hay documentos que son como del cliente. Y este contrato, en el caso de
-- que tenga el convenio, ya está el contrato firmado y si no, poder enviarlo
-- por internet para que lo firmen"*. Eligió «Aceptar en línea».
--
-- Tres tablas:
--   - `convenio_plantillas`: UNA por empresa. El texto del contrato tal cual,
--     con los huecos `[*]` del formato base cambiados por {{variables}} con
--     nombre; los beneficios que muestra la página pública; la vigencia en
--     años y el correo de contacto de la empresa (el hueco de OCTAVO). Una
--     empresa SIN fila no ve la tarjeta «Convenio» (sí «Documentos del
--     cliente"). Eventia se vende a otras empresas: nada de esto va escrito
--     en el código.
--   - `convenios`: el convenio de un cliente. Uno vigente por cliente
--     (enviado o firmado), asegurado por un índice único parcial; los
--     anulados quedan de historial. El enlace público se guarda SOLO como
--     huella (sha256): el enlace en claro viaja únicamente en el correo, y
--     reenviar pone una huella nueva (el enlace anterior deja de servir).
--     Al aceptar en línea queda quién (nombre, RUT, cargo, correo), los datos
--     de la empresa que llenan los huecos, la fecha y hora, la IP, el
--     navegador y el texto ya lleno (la evidencia).
--   - `client_documents`: los documentos que cuelgan del cliente (no de una
--     cotización). El convenio firmado llega aquí solo.
--
-- La plantilla de Valle del Sol (empresa 1) va sembrada al final, con el
-- texto del PDF «CONVENIO SIMPLE VALLE DEL SOL - FORMATO BASE». La fecha fija
-- del formato («10 de junio del 2024») se cambió por {{fecha_firma}}: se usa
-- la fecha real de la firma. Felipe corrigió tres frases el 19-11-2026 («Sí,
-- corrígelos»): DÉCIMO pasa a NOVENO (saltaba de OCTAVO a DÉCIMO), «En
-- Santiago, República de Chile» pasa a «En Quillón, República de Chile», y en
-- TERCERO III «prestados por la Empresa» pasa a «prestados por la Prestadora».
-- Queda IGUAL, a la espera de Felipe: el domicilio y los tribunales de NOVENO
-- («comuna de Santiago, Región Metropolitana»); se cambia con un UPDATE de
-- `convenio_plantillas.texto` (replace de esa frase), sin tocar lo firmado.
--
-- En el laboratorio la 211 se corrió antes de esa corrección; ahí se aplicó
-- con el bloque 5 de abajo (idempotente: en una base nueva no cambia nada).
--
-- RLS encendida y nada para anon/authenticated: el motor entra con
-- service_role y filtra por company_id. Permisos tabla por tabla; NUNCA
-- «ALL TABLES IN SCHEMA».
--
-- Se corre a mano en Supabase, ANTES de que llegue el motor que la usa.
-- Idempotente. Por ahora: SOLO en el laboratorio («Cotizador»).

-- ---------------------------------------------------------------------------
-- 1. La plantilla de cada empresa
-- ---------------------------------------------------------------------------
create table if not exists public.convenio_plantillas (
  id bigint generated always as identity primary key,
  company_id bigint not null unique
    references public.companies(id) on delete cascade,
  nombre text not null default 'Convenio simple'
    check (char_length(nombre) between 1 and 80),
  -- El nombre del documento que ve el cliente («Convenio de beneficios»).
  titulo text not null default 'Convenio de beneficios'
    check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 50 and 100000),
  -- [{ "titulo": "20% en cabañas", "detalle": "..." }, ...]
  beneficios jsonb not null default '[]'::jsonb
    check (jsonb_typeof(beneficios) = 'array'),
  vigencia_anios int not null default 3 check (vigencia_anios between 1 and 20),
  correo_de_contacto text
    check (correo_de_contacto is null
           or char_length(correo_de_contacto) between 3 and 200),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.convenio_plantillas is
  'El convenio de beneficios de cada empresa: texto con {{variables}}, beneficios y vigencia. Sin fila, la empresa no ofrece convenio. doc 24';

alter table public.convenio_plantillas enable row level security;
revoke all on public.convenio_plantillas from anon, authenticated;
grant select on public.convenio_plantillas to service_role;
revoke insert, update, delete, truncate on public.convenio_plantillas
  from service_role;

-- ---------------------------------------------------------------------------
-- 2. Los documentos del cliente
-- ---------------------------------------------------------------------------
create table if not exists public.client_documents (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 200),
  -- La RUTA dentro del balde privado (c<empresa>/client-documents/...).
  file_url text not null check (char_length(file_url) between 1 and 500),
  categoria text not null default 'otros'
    check (categoria in ('convenio', 'otros')),
  subido_por uuid,
  subido_por_nombre text
    check (subido_por_nombre is null
           or char_length(subido_por_nombre) between 1 and 120),
  uploaded_at timestamptz not null default now()
);

create index if not exists client_documents_cliente_idx
  on public.client_documents (company_id, client_id, uploaded_at desc);

comment on table public.client_documents is
  'Documentos que cuelgan del cliente (no de una cotización); el convenio firmado llega aquí solo. doc 24';

alter table public.client_documents enable row level security;
revoke all on public.client_documents from anon, authenticated;
grant select, insert, delete on public.client_documents to service_role;
revoke update, truncate on public.client_documents from service_role;

-- ---------------------------------------------------------------------------
-- 3. El convenio de cada cliente
-- ---------------------------------------------------------------------------
create table if not exists public.convenios (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plantilla_id bigint references public.convenio_plantillas(id)
    on delete set null,
  estado text not null check (estado in ('enviado', 'firmado', 'anulado')),
  origen text check (origen is null or origen in ('en_linea', 'papel')),
  -- sha256 (hex) del enlace público. Nunca el enlace en claro.
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  enviado_a_contact_id bigint,
  enviado_a_correo text check (enviado_a_correo is null
                               or char_length(enviado_a_correo) <= 200),
  enviado_a_nombre text check (enviado_a_nombre is null
                               or char_length(enviado_a_nombre) <= 120),
  enviado_at timestamptz,
  enviado_por uuid,
  -- La firma.
  firmado_at timestamptz,
  vence_at date,
  firmante_nombre text check (firmante_nombre is null
                              or char_length(firmante_nombre) between 1 and 120),
  firmante_rut text check (firmante_rut is null
                           or firmante_rut ~ '^[0-9]{1,8}-[0-9K]$'),
  firmante_cargo text check (firmante_cargo is null
                             or char_length(firmante_cargo) between 1 and 80),
  firmante_correo text check (firmante_correo is null
                              or char_length(firmante_correo) between 3 and 200),
  -- Los datos de la empresa cliente que llenan los huecos del contrato.
  razon_social text check (razon_social is null
                           or char_length(razon_social) between 1 and 150),
  rut_empresa text check (rut_empresa is null
                          or rut_empresa ~ '^[0-9]{1,8}-[0-9K]$'),
  domicilio text check (domicilio is null or char_length(domicilio) <= 200),
  comuna text check (comuna is null or char_length(comuna) <= 80),
  region text check (region is null or char_length(region) <= 80),
  personeria_documento text check (personeria_documento is null
                                   or char_length(personeria_documento) <= 150),
  personeria_fecha text check (personeria_fecha is null
                               or char_length(personeria_fecha) <= 40),
  personeria_notario text check (personeria_notario is null
                                 or char_length(personeria_notario) <= 150),
  -- La constancia de la aceptación en línea.
  ip text check (ip is null or char_length(ip) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  texto_firmado text,
  texto_sha256 text check (texto_sha256 is null
                           or texto_sha256 ~ '^[0-9a-f]{64}$'),
  -- El PDF del convenio firmado en «Documentos del cliente». NULL con estado
  -- firmado = PDF pendiente (la ficha lo dice y deja regenerarlo).
  documento_id bigint references public.client_documents(id)
    on delete set null,
  registrado_por uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint convenios_firmado_completo check (
    estado <> 'firmado' or (firmado_at is not null and vence_at is not null)
  )
);

-- Uno vigente por cliente, en la base y no solo en el código.
create unique index if not exists convenios_uno_vigente_por_cliente
  on public.convenios (client_id) where estado in ('enviado', 'firmado');

create index if not exists convenios_empresa_cliente_idx
  on public.convenios (company_id, client_id);

comment on table public.convenios is
  'El convenio de cada cliente: enviado por enlace o firmado (en línea o en papel), con la constancia de quién aceptó. Uno vigente por cliente. doc 24';
comment on column public.convenios.token_hash is
  'sha256 del enlace público; el enlace en claro solo viaja en el correo. Reenviar cambia la huella. doc 24';

alter table public.convenios enable row level security;
revoke all on public.convenios from anon, authenticated;
grant select, insert, update on public.convenios to service_role;
revoke delete, truncate on public.convenios from service_role;

-- ---------------------------------------------------------------------------
-- 4. La plantilla de Valle del Sol (empresa 1)
-- ---------------------------------------------------------------------------
-- Formato: una línea en blanco separa párrafos; «# » es el título del
-- documento, «## » el título de una cláusula; las líneas que empiezan con
-- «- » son viñetas; un párrafo que empieza con «___» es un bloque de firma
-- (los bloques seguidos van lado a lado) y dentro de él cada salto de línea
-- se respeta. Variables que llena el motor:
--   {{razon_social}} {{rut_empresa}} {{representante_nombre}}
--   {{representante_rut}} {{representante_cargo}} {{domicilio}} {{comuna}}
--   {{region}} {{correo_empresa}} {{fecha_firma}} {{correo_de_contacto}}
--   {{personeria_documento}} {{personeria_fecha}} {{personeria_notario}}
insert into public.convenio_plantillas
  (company_id, nombre, titulo, texto, beneficios, vigencia_anios,
   correo_de_contacto)
select 1, 'Convenio simple', 'Convenio de beneficios',
$plantilla$# CONVENIO DE BENEFICIOS PARA LOS TRABAJADORES ENTRE VALLE DEL SOL QUILLÓN SPA Y {{razon_social}}

En Quillón, República de Chile, a {{fecha_firma}}, entre la sociedad VALLE DEL SOL QUILLÓN SPA Rol Único Tributario Nº 77.701.305-K, en adelante e indistintamente “el Prestador” o “el Recinto”, debidamente representada por don Hernán Felipe Vargas Droguett, cédula de identidad N° 17.505.025-6, domiciliados para estos efectos en Los Guindos #467, comuna de Quillón, Región de Ñuble, por una parte, y {{razon_social}}, RUT Nº {{rut_empresa}}, en adelante también denominada “la Empresa”, representada por su {{representante_cargo}}, don(a) {{representante_nombre}}, cédula nacional de identidad N° {{representante_rut}}, ambos domiciliados en {{domicilio}}, comuna de {{comuna}} Región de {{region}}, ambas referidas como “las Partes”, han acordado el siguiente convenio de beneficios:

## PRIMERO. OBJETO.

Valle Del Sol Quillón SpA, es una empresa legalmente constituida en Chile, dedicada a la prestación de servicios de Hotelería y Recreación, que goza de reconocido prestigio en el mercado nacional. Que por medio del presente instrumento, la Prestadora viene en ofrecer a la Empresa una serie de beneficios para quienes detenten la calidad de “Beneficiarios”, todo bajo los términos y condiciones generales que se señalan a continuación:

1.- Calidad de Beneficiario: Se considerarán como “Beneficiarios” del presente convenio a las siguientes personas:

- Las personas naturales que mantengan contratos de trabajo vigentes con la Empresa, a la fecha en que deseen hacer uso de los beneficios a que refiere el presente instrumento.

Al momento de solicitar alguno de los beneficios a que refiere el presente instrumento el Beneficiario deberá acreditar su vínculo de trabajador con la Empresa, mediante el envío de un correo electrónico desde su correo institucional al correo de Valle Del Sol (contacto@valledelsolquillon.cl), o también se considerará valido un certificado de vigencia de relación laboral emitido por la Empresa.

2.- Tipo de Servicios y Aranceles Preferenciales:

Los beneficios objeto del presente instrumento, que el Prestador pone a disposición de los Beneficiarios, son los siguientes:

1. 20% de descuento en el valor de arriendo de cabañas en el recinto en temporada baja. Se considerará temporada baja para efectos del presente convenio los meses de marzo a noviembre, ambos inclusive. El descuento se aplicará sobre el valor de tarifa estándar. El descuento no será acumulable con otros descuentos.

2. 50% de descuento en el valor del ticket diario para hacer uso de las instalaciones del recinto para el Beneficiario y 2 acompañantes.

3. 5% de descuento en el valor de consumo en el restaurante “Entre Pinos”. Descuento aplicable a la carta de alimentos y tragos, no aplicable sobre menú del día y no acumulable con otros descuentos.

4. 15% de descuento en el valor de arriendo de canchas de Tenis, Futbolito y Pádel dispuestas en el Recinto. Descuento sujeto a disponibilidad y no acumulable con otros descuentos.

5. Beneficio adicional para la Empresa: 30% de descuento en el valor por uso del Recinto para paseos de fin de año, no incluye exclusividad y no considera el servicio de alimentación.

La Empresa dispondrá los métodos idóneos para presentar a los Beneficiarios los servicios y descuentos respectivos que se ofrecen y difundirlo por medios de comunicación interna.

## SEGUNDO. VIGENCIA.

El presente convenio tendrá una duración de 3 años contado desde la suscripción de este documento, el convenio se renovará automáticamente a la fecha de su expiración por periodos de 2 años -y así sucesivamente- salvo que alguna de las partes comunique a la otra su intención de no renovar el contrato, comunicación que deberá ser despachada por carta certificada o notarial o entregada personalmente en el domicilio de la otra parte con recepción firmada de la notificación recibida, con una anticipación no inferior a treinta días respecto de la fecha de expiración del convenio. En cuyo término cesarán inmediatamente y sin necesidad de declaración alguna los beneficios dispuestos mediante el presente instrumento.

## TERCERO. RESPONSABILIDAD.

I. La Empresa acepta la oferta de beneficios indicados en la cláusula PRIMERO, declarando expresamente que no asume responsabilidad alguna por la cantidad o calidad de los productos y/o servicios que serán ofrecidos a sus trabajadores por La prestadora, siendo de exclusiva responsabilidad de esta última cualquier reclamo que realice el Beneficiario por el producto adquirido o servicio recibido.

II. La Empresa no avala ni asume responsabilidad alguna respecto de las deudas de beneficiarios que decidan hacer uso del presente convenio.

III. La Empresa no se obliga a pago alguno por los servicios prestados por la Prestadora, respecto de los cuales hagan uso los Beneficiarios.

IV. Los beneficios serán otorgados directamente por Valle Del Sol Quillón SpA y los pagos serán efectuados por los beneficiarios en forma directa a el Prestador otorgante de estos beneficios.

## CUARTO. INFORMACIÓN E IMAGEN.

Valle del Sol Quillon SpA, hará el envío de la información necesaria e imágenes correspondientes para implementar el beneficio y comunicarlo a los trabajadores de la Empresa.

Las partes de este acuerdo reconocen que los signos distintivos, expresiones, siglas, símbolos o similares, relativos a cada una de ellas, en cualquiera de sus formas registradas o no, son de propiedad exclusiva de cada parte. En ese sentido, ambas partes se comprometen a consensuar previamente la utilización de su imagen derivada de cada una de las actuaciones conjuntas convenidas.

En este sentido, la utilización en cualquier soporte, de la denominación social, nombre, marca, logo institucional y/o imagen de elementos distintivos de una de las partes, requerirá la previa aceptación y concesión expresa y escrita del titular correspondiente, conforme a las respectivas normas institucionales internas aplicables a esta materia.

Para la realización de las actividades de difusión, publicidad o en general cualquier otra que se relacione con la ejecución de este acuerdo, las partes declaran que deberá existir acuerdo previo y por escrito entre ambas, debiendo incluir sus respectivos logos institucionales.

## QUINTO. CONFIDENCIALIDAD.

Las Partes acuerdan que toda información, escrita o verbal, proporcionada por una parte a la otra, en virtud del cumplimiento del presente Convenio, o que llegue por cualquier medio a su conocimiento, ya sea antes, durante o después de la fecha de firma de este Convenio o de cualquiera de sus anexos, incluidos los datos almacenados de cualquier forma, sea en un computador, procesador de palabras u otro dispositivo similar, tendrá el carácter de información confidencial. Las Partes utilizarán dicha información confidencial únicamente para dar cumplimiento al objeto de este Convenio, y no podrá revelarla a terceros bajo ninguna circunstancia.

Las Partes quedan exceptuadas de la obligación de confidencialidad, cuando: a) Cuando la parte receptora tenga evidencia de que conoce previamente la información recibida; b) Cuando la información recibida sea de dominio público y, c) Cuando la información deje de ser confidencial por ser revelada por el propietario. Al término del Convenio, las Partes deberán devolver a la otra toda la información que hubiere recibido incluyendo todas las reproducciones, duplicaciones, archivos, o registros digitales de cualquier especie y no guardará copias, extractos o reproducciones completas o parciales de dicho material.

## SEXTO: TÉRMINO ANTICIPADO.

Las Partes podrán poner término al convenio unilateralmente y sin expresión de causa, comunicando dicha decisión a la contraria mediante el envío de carta certificada al domicilio señalado en la comparecencia del Convenio, con al menos 30 (treinta) días corridos de anticipación.

## SÉPTIMO. OTROS.

Las Partes dejan expresamente establecido que:

I. El presente Convenio no supone transferencia de recursos entre La Empresa y La Prestadora.

II. El presente Convenio no podrá ser cedido por ninguna de las Partes sin autorización previa y por escrito de la otra.

III. El no ejercicio de los Beneficiarios o de las Partes de cualquier beneficio derivado de este Convenio no se interpretará como renuncia a dicho beneficio y no impedirá en forma alguna el ejercicio ulterior del mismo durante el período de vigencia del presente Convenio.

IV. Si cualquiera de las estipulaciones del presente Convenio fuera declarada inválida o ineficaz, dicha declaración no afectará a las restantes. De igual forma, la declaración de nulidad o ineficacia del presente Convenio no afectará la validez de otro acto o contrato suscrito entre las mismas Partes.

## OCTAVO. COMUNICACIONES.

Para efectos de las comunicaciones a que hubiere lugar con ocasión de la ejecución del presente Convenio y sin perjuicio de normas especiales dispuestas en el presente instrumento, las Partes vienen en señalar los siguientes correos electrónicos:

1. VALLE DEL SOL QUILLÓN SPA, correo electrónico {{correo_de_contacto}}, dirigido a don Hernán Felipe Vargas Droguett.

2. {{razon_social}}, correo electrónico {{correo_empresa}}, dirigido a don(a) {{representante_nombre}}.

## NOVENO. RESOLUCIÓN DE CONFLICTOS.

El presente Contrato se regirá e interpretará de acuerdo con las leyes de la República de Chile.

Para todos los efectos legales derivados del presente Contrato, las partes fijan su domicilio en la comuna de Santiago, Región Metropolitana y se someten a la jurisdicción de sus tribunales de justicia.

Personerías. La personería de don {{representante_nombre}}, para representar a {{razon_social}} consta en {{personeria_documento}} de fecha {{personeria_fecha}}, ante el Notario {{personeria_notario}}

La personería de don Hernán Felipe Vargas Droguett para representar a Valle Del Sol Quillón SpA consta en los estatutos de la sociedad de fecha 20 de enero 2023 de acuerdo con el certificado de estatuto actualizado otorgado por el Ministerio de Economía, Fomento y Turismo.

El presente instrumento se firma en dos copias de idéntico tenor, quedando una en poder de cada Parte.

________________________________
{{representante_nombre}}
{{representante_cargo}}
P.p. {{razon_social}}

___________________________________
HERNÁN VARGAS DROGUETT
ADMINISTRADOR
P.p. VALLE DEL SOL QUILLÓN SpA$plantilla$,
'[
  {"titulo": "20% en cabañas", "detalle": "En temporada baja, de marzo a noviembre, sobre la tarifa estándar."},
  {"titulo": "50% en el ticket diario", "detalle": "Para el trabajador y 2 acompañantes."},
  {"titulo": "5% en el restaurante Entre Pinos", "detalle": "En la carta de alimentos y tragos; no aplica al menú del día."},
  {"titulo": "15% en canchas", "detalle": "Tenis, futbolito y pádel, sujeto a disponibilidad."},
  {"titulo": "30% para el paseo de fin de año", "detalle": "Beneficio para la empresa: uso del recinto, sin exclusividad ni alimentación."}
]'::jsonb,
3,
'contacto@valledelsolquillon.cl'
where exists (select 1 from public.companies where id = 1)
on conflict (company_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Las tres frases que corrigió Felipe (19-11-2026), para una base donde la
--    plantilla ya se había sembrado con el texto anterior. Idempotente.
-- ---------------------------------------------------------------------------
update public.convenio_plantillas
set texto = replace(replace(replace(texto,
      'En Santiago, República de Chile, a {{fecha_firma}}',
      'En Quillón, República de Chile, a {{fecha_firma}}'),
      '## DÉCIMO. RESOLUCIÓN DE CONFLICTOS.',
      '## NOVENO. RESOLUCIÓN DE CONFLICTOS.'),
      'por los servicios prestados por la Empresa, respecto',
      'por los servicios prestados por la Prestadora, respecto'),
    actualizado_en = now()
where company_id = 1
  and (texto like '%En Santiago, República de Chile, a {{fecha_firma}}%'
       or texto like '%## DÉCIMO. RESOLUCIÓN DE CONFLICTOS.%'
       or texto like '%prestados por la Empresa, respecto%');
