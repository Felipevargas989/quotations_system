-- ============================================================
-- 172 · LA BASE ORDENADA DEL MERCADO (29-10-2026)
-- ============================================================
-- Decisión 109 del doc 17. Felipe: «una base de datos fácil y ágil de
-- preguntar», con dos fuentes: la historia que llega en los archivos de
-- ChileCompra (decisión 101) y lo vivo que trae la API (el radar).
--
-- Las tablas mercado_* de la 168 siguen guardando lo que llega, tal cual.
-- Encima va una capa limpia y resumida, que es la que leen todos:
--   1. Una sola forma de escribir cada dato: el RUT sin puntos, con guion y
--      K mayúscula (12345678-5), y la región y la comuna por su código
--      oficial (mercado_regiones, y mercado_comunas con el CUT del INE).
--   2. Control de calidad: al resumir cada mes se cuenta lo que no calza
--      (un RUT que no es un RUT chileno válido, una región o una comuna
--      desconocida) y queda en mercado_cargas.calidad. Lo dudoso no entra a
--      los ganadores ni a la zona; nunca se borra de lo que llegó.
--   3. Resúmenes listos: mercado_compras (cada licitación, de todos los
--      rubros, y cada compra ágil del rubro, con sus ganadores),
--      mercado_gasto_por_comprador_mes y mercado_ganadores_por_mes. Los
--      arma mercado_resumir_mes() apenas el cargador termina un mes: unos
--      segundos por mes, sin relojes nuevos.
--
-- Datos públicos, sin empresa: RLS sin políticas, nada para anon ni
-- authenticated; solo el motor (service_role). Idempotente; primero en el
-- laboratorio y después en producción.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Una sola forma de escribir
-- ------------------------------------------------------------
-- Un nombre sin tildes, eñes ni signos: «Región del Ñuble» → REGIONDELNUBLE.
create or replace function public.mercado_clave(texto text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(
    upper(translate(coalesce(texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
    '[^A-Z0-9]', '', 'g')
$$;

-- Las tres que siguen son una sola expresión, sin FROM, para que la base las
-- meta dentro de cada consulta: llamadas de a una costaban 0,12 ms por
-- oferta y un mes de licitaciones tardaba 15 s (medido el 29-10).

-- El RUT sin puntos ni espacios, sin ceros a la izquierda, con guion y K
-- mayúscula: «07.123.456-k» → 7123456-K. Lo que no tiene forma de RUT
-- chileno queda como vino, sin espacios de más: los proveedores
-- extranjeros traen su propio número.
create or replace function public.mercado_rut(rut text) returns text
language sql immutable parallel safe as $$
  select case
    when upper(regexp_replace(coalesce(rut, ''), '[.\s]', '', 'g')) ~ '^[0-9]{1,9}-[0-9K]$'
      then regexp_replace(upper(regexp_replace(rut, '[.\s]', '', 'g')),
        '^0*([0-9]+)-([0-9K])$', '\1-\2')
    else nullif(btrim(regexp_replace(coalesce(rut, ''), '\s+', ' ', 'g')), '')
  end
$$;

-- Si es un RUT chileno de verdad: la forma 12345678-5 y el dígito
-- verificador correcto (módulo 11, con los pesos 3 2 7 6 5 4 3 2 desde la
-- izquierda de los 8 dígitos). Recibe el RUT ya pasado por mercado_rut. El
-- CASE asegura que no se suma nada que no sea un número.
create or replace function public.mercado_rut_valido(rut text) returns boolean
language sql immutable parallel safe as $$
  select case
    when coalesce(rut, '') !~ '^[1-9][0-9]{0,7}-[0-9K]$' then false
    else split_part(rut, '-', 2) = (array['1','2','3','4','5','6','7','8','9','K','0'])[
      11 - (
          substr(lpad(split_part(rut, '-', 1), 8, '0'), 1, 1)::integer * 3
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 2, 1)::integer * 2
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 3, 1)::integer * 7
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 4, 1)::integer * 6
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 5, 1)::integer * 5
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 6, 1)::integer * 4
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 7, 1)::integer * 3
        + substr(lpad(split_part(rut, '-', 1), 8, '0'), 8, 1)::integer * 2
      ) % 11]
  end
$$;

-- La comuna como la escribe ChileCompra, llevada al nombre del INE. Medido
-- el 29-10 en las 356 mil licitaciones de 3 años: con esta lista cruzan
-- todas las comunas escritas; las de la 108 vienen de los municipios.
create or replace function public.mercado_clave_de_comuna(texto text) returns text
language sql immutable parallel safe as $$
  select case public.mercado_clave(texto)
    when 'SANTIAGOCENTRO' then 'SANTIAGO'
    when 'PUERTONATALES' then 'NATALES'
    when 'LACALERA' then 'CALERA'
    when 'SANVICENTEDETAGUATAGUA' then 'SANVICENTE'
    when 'LLAYLLAY' then 'LLAILLAY'
    when 'PUERTOSAAVEDRA' then 'SAAVEDRA'
    when 'MARCHIGUE' then 'MARCHIHUE'
    when 'TORRESDELPAYNE' then 'TORRESDELPAINE'
    when 'TORRESDELPAIN' then 'TORRESDELPAINE'
    when 'LASGUAITECAS' then 'GUAITECAS'
    when 'PAIGUANO' then 'PAIHUANO'
    when 'TREGUACO' then 'TREHUACO'
    when 'CABODEHORNOSYANTARTICA' then 'CABODEHORNOS'
    else public.mercado_clave(texto)
  end
$$;

-- ------------------------------------------------------------
-- 2. Las regiones y las comunas, con su código oficial
-- ------------------------------------------------------------
create table if not exists public.mercado_regiones (
  codigo smallint primary key,
  -- Como la escribe ChileCompra en sus archivos.
  nombre text not null,
  corto text not null,
  clave text not null unique
);

insert into public.mercado_regiones (codigo, nombre, corto, clave)
select v.codigo, v.nombre, v.corto, public.mercado_clave(v.nombre)
from (values
  (1, 'Región de Tarapacá', 'Tarapacá'),
  (2, 'Región de Antofagasta', 'Antofagasta'),
  (3, 'Región de Atacama', 'Atacama'),
  (4, 'Región de Coquimbo', 'Coquimbo'),
  (5, 'Región de Valparaíso', 'Valparaíso'),
  (6, 'Región del Libertador General Bernardo O´Higgins', 'O''Higgins'),
  (7, 'Región del Maule', 'Maule'),
  (8, 'Región del Biobío', 'Biobío'),
  (9, 'Región de la Araucanía', 'Araucanía'),
  (10, 'Región de los Lagos', 'Los Lagos'),
  (11, 'Región Aysén del General Carlos Ibáñez del Campo', 'Aysén'),
  (12, 'Región de Magallanes y de la Antártica', 'Magallanes'),
  (13, 'Región Metropolitana de Santiago', 'Metropolitana'),
  (14, 'Región de Los Ríos', 'Los Ríos'),
  (15, 'Región de Arica y Parinacota', 'Arica y Parinacota'),
  (16, 'Región del Ñuble', 'Ñuble')
) as v(codigo, nombre, corto)
on conflict (codigo) do update set nombre = excluded.nombre,
  corto = excluded.corto, clave = excluded.clave;

-- Las 346 comunas del Censo 2024 (INE). La región sale de los primeros
-- dígitos del CUT.
create table if not exists public.mercado_comunas (
  cut integer primary key,
  comuna text not null,
  region_codigo smallint not null references public.mercado_regiones (codigo),
  poblacion integer,
  clave text not null
);

create index if not exists idx_mercado_comunas_clave
  on public.mercado_comunas (clave);

insert into public.mercado_comunas (cut, comuna, region_codigo, poblacion, clave)
select v.cut, v.comuna, (v.cut / 1000)::smallint, v.poblacion,
  public.mercado_clave(v.comuna)
from (values
  (1101,'Iquique',199587),(1107,'Alto Hospicio',142086),(1401,'Pozo Almonte',16878),(1402,'Camiña',1335),(1403,'Colchane',790),(1404,'Huara',2858),
  (1405,'Pica',6272),(2101,'Antofagasta',401096),(2102,'Mejillones',14084),(2103,'Sierra Gorda',1472),(2104,'Taltal',12097),(2201,'Calama',166334),
  (2202,'Ollagüe',256),(2203,'San Pedro de Atacama',9843),(2301,'Tocopilla',25400),(2302,'María Elena',4834),(3101,'Copiapó',168831),(3102,'Caldera',18805),
  (3103,'Tierra Amarilla',11846),(3201,'Chañaral',12345),(3202,'Diego de Almagro',11397),(3301,'Vallenar',54222),(3302,'Alto del Carmen',4788),(3303,'Freirina',7577),
  (3304,'Huasco',9369),(4101,'La Serena',250141),(4102,'Coquimbo',263719),(4103,'Andacollo',11566),(4104,'La Higuera',4335),(4105,'Paihuano',4649),
  (4106,'Vicuña',28047),(4201,'Illapel',32009),(4202,'Canela',9639),(4203,'Los Vilos',22879),(4204,'Salamanca',27823),(4301,'Ovalle',118696),
  (4302,'Combarbalá',12954),(4303,'Monte Patria',29997),(4304,'Punitaqui',12076),(4305,'Río Hurtado',4334),(5101,'Valparaíso',284938),(5102,'Casablanca',29876),
  (5103,'Concón',48294),(5104,'Juan Fernández',904),(5105,'Puchuncaví',22539),(5107,'Quintero',35754),(5109,'Viña del Mar',334871),(5201,'Isla de Pascua',4800),
  (5301,'Los Andes',63440),(5302,'Calle Larga',16597),(5303,'Rinconada',11855),(5304,'San Esteban',20112),(5401,'La Ligua',39270),(5402,'Cabildo',20015),
  (5403,'Papudo',7561),(5404,'Petorca',10206),(5405,'Zapallar',7980),(5501,'Quillota',96753),(5502,'Calera',50631),(5503,'Hijuelas',19286),
  (5504,'La Cruz',24939),(5506,'Nogales',22136),(5601,'San Antonio',96770),(5602,'Algarrobo',16076),(5603,'Cartagena',24599),(5604,'El Quisco',18971),
  (5605,'El Tabo',16260),(5606,'Santo Domingo',13171),(5701,'San Felipe',80413),(5702,'Catemu',13760),(5703,'Llaillay',25484),(5704,'Panquehue',7269),
  (5705,'Putaendo',17336),(5706,'Santa María',15134),(5801,'Quilpué',162559),(5802,'Limache',56145),(5803,'Olmué',19778),(5804,'Villa Alemana',139571),
  (6101,'Rancagua',257744),(6102,'Codegua',13955),(6103,'Coinco',7916),(6104,'Coltauco',21373),(6105,'Doñihue',21925),(6106,'Graneros',35938),
  (6107,'Las Cabras',27554),(6108,'Machalí',60875),(6109,'Malloa',13882),(6110,'Mostazal',27394),(6111,'Olivar',13901),(6112,'Peumo',14243),
  (6113,'Pichidegua',20363),(6114,'Quinta de Tilcoco',13558),(6115,'Rengo',63620),(6116,'Requínoa',29508),(6117,'San Vicente',49559),(6201,'Pichilemu',19847),
  (6202,'La Estrella',4609),(6203,'Litueche',8852),(6204,'Marchihue',8715),(6205,'Navidad',8885),(6206,'Paredones',7228),(6301,'San Fernando',75585),
  (6302,'Chépica',15668),(6303,'Chimbarongo',37258),(6304,'Lolol',7791),(6305,'Nancagua',18723),(6306,'Palmilla',13060),(6307,'Peralillo',12493),
  (6308,'Placilla',9438),(6309,'Pumanque',4559),(6310,'Santa Cruz',41209),(7101,'Talca',232131),(7102,'Constitución',47004),(7103,'Curepto',9519),
  (7104,'Empedrado',3990),(7105,'Maule',61081),(7106,'Pelarco',9229),(7107,'Pencahue',9181),(7108,'Río Claro',14276),(7109,'San Clemente',47380),
  (7110,'San Rafael',11230),(7201,'Cauquenes',42798),(7202,'Chanco',9446),(7203,'Pelluhue',8578),(7301,'Curicó',159968),(7302,'Hualañé',10775),
  (7303,'Licantén',6892),(7304,'Molina',48949),(7305,'Rauco',11266),(7306,'Romeral',17233),(7307,'Sagrada Familia',19427),(7308,'Teno',30113),
  (7309,'Vichuquén',4716),(7401,'Linares',96744),(7402,'Colbún',22637),(7403,'Longaví',33299),(7404,'Parral',45323),(7405,'Retiro',22310),
  (7406,'San Javier',49559),(7407,'Villa Alegre',17919),(7408,'Yerbas Buenas',20035),(8101,'Concepción',230375),(8102,'Coronel',123648),(8103,'Chiguayante',85822),
  (8104,'Florida',12958),(8105,'Hualqui',25795),(8106,'Lota',39980),(8107,'Penco',48971),(8108,'San Pedro de la Paz',150992),(8109,'Santa Juana',14947),
  (8110,'Talcahuano',147322),(8111,'Tomé',56907),(8112,'Hualpén',87731),(8201,'Lebu',25246),(8202,'Arauco',37163),(8203,'Cañete',34640),
  (8204,'Contulmo',5905),(8205,'Curanilahue',31119),(8206,'Los Álamos',21950),(8207,'Tirúa',10208),(8301,'Los Ángeles',219441),(8302,'Antuco',4373),
  (8303,'Cabrero',31256),(8304,'Laja',23706),(8305,'Mulchén',29036),(8306,'Nacimiento',26140),(8307,'Negrete',10723),(8308,'Quilaco',4440),
  (8309,'Quilleco',9700),(8310,'San Rosendo',3575),(8311,'Santa Bárbara',14075),(8312,'Tucapel',15729),(8313,'Yumbel',23170),(8314,'Alto Biobío',6016),
  (9101,'Temuco',292518),(9102,'Carahue',24957),(9103,'Cunco',19177),(9104,'Curarrehue',7733),(9105,'Freire',26164),(9106,'Galvarino',12710),
  (9107,'Gorbea',14148),(9108,'Lautaro',41936),(9109,'Loncoche',25158),(9110,'Melipeuco',6796),(9111,'Nueva Imperial',33988),(9112,'Padre las Casas',80656),
  (9113,'Perquenco',7438),(9114,'Pitrufquén',27041),(9115,'Pucón',32321),(9116,'Saavedra',12877),(9117,'Teodoro Schmidt',15639),(9118,'Toltén',10041),
  (9119,'Vilcún',31575),(9120,'Villarrica',67737),(9121,'Cholchol',13167),(9201,'Angol',53022),(9202,'Collipulli',24303),(9203,'Curacautín',18536),
  (9204,'Ercilla',7730),(9205,'Lonquimay',10247),(9206,'Los Sauces',7348),(9207,'Lumaco',9253),(9208,'Purén',12184),(9209,'Renaico',10686),
  (9210,'Traiguén',18873),(9211,'Victoria',34464),(10101,'Puerto Montt',277040),(10102,'Calbuco',36474),(10103,'Cochamó',4199),(10104,'Fresia',12320),
  (10105,'Frutillar',22554),(10106,'Los Muermos',17162),(10107,'Llanquihue',18088),(10108,'Maullín',15063),(10109,'Puerto Varas',52942),(10201,'Castro',46997),
  (10202,'Ancud',40949),(10203,'Chonchi',16078),(10204,'Curaco de Vélez',3662),(10205,'Dalcahue',14894),(10206,'Puqueldón',4048),(10207,'Queilén',5690),
  (10208,'Quellón',28460),(10209,'Quemchi',8409),(10210,'Quinchao',7678),(10301,'Osorno',166455),(10302,'Puerto Octay',8865),(10303,'Purranque',19542),
  (10304,'Puyehue',11712),(10305,'Río Negro',13874),(10306,'San Juan de la Costa',7776),(10307,'San Pablo',10883),(10401,'Chaitén',4025),(10402,'Futaleufú',3062),
  (10403,'Hualaihué',9480),(10404,'Palena',1903),(11101,'Coyhaique',57823),(11102,'Lago Verde',779),(11201,'Aysén',23170),(11202,'Cisnes',5137),
  (11203,'Guaitecas',1598),(11301,'Cochrane',3458),(11302,'O''Higgins',647),(11303,'Tortel',505),(11401,'Chile Chico',4905),(11402,'Río Ibáñez',2723),
  (12101,'Punta Arenas',132363),(12102,'Laguna Blanca',269),(12103,'Río Verde',102),(12104,'San Gregorio',241),(12201,'Cabo de Hornos',1750),(12202,'Antártica',60),
  (12301,'Porvenir',6809),(12302,'Primavera',431),(12303,'Timaukel',157),(12401,'Natales',24152),(12402,'Torres del Paine',203),(13101,'Santiago',438856),
  (13102,'Cerrillos',85041),(13103,'Cerro Navia',127250),(13104,'Conchalí',121587),(13105,'El Bosque',155257),(13106,'Estación Central',181049),(13107,'Huechuraba',101808),
  (13108,'Independencia',116943),(13109,'La Cisterna',103157),(13110,'La Florida',374836),(13111,'La Granja',112022),(13112,'La Pintana',175421),(13113,'La Reina',89870),
  (13114,'Las Condes',296134),(13115,'Lo Barnechea',112620),(13116,'Lo Espejo',87295),(13117,'Lo Prado',91290),(13118,'Macul',123800),(13119,'Maipú',503635),
  (13120,'Ñuñoa',241467),(13121,'Pedro Aguirre Cerda',96062),(13122,'Peñalolén',236478),(13123,'Providencia',143974),(13124,'Pudahuel',227820),(13125,'Quilicura',205624),
  (13126,'Quinta Normal',129351),(13127,'Recoleta',154615),(13128,'Renca',143622),(13129,'San Joaquín',95602),(13130,'San Miguel',150829),(13131,'San Ramón',76002),
  (13132,'Vitacura',86420),(13201,'Puente Alto',568086),(13202,'Pirque',29060),(13203,'San José de Maipo',17441),(13301,'Colina',173293),(13302,'Lampa',145160),
  (13303,'Tiltil',19742),(13401,'San Bernardo',306371),(13402,'Buin',116969),(13403,'Calera de Tango',25491),(13404,'Paine',78828),(13501,'Melipilla',136325),
  (13502,'Alhué',7768),(13503,'Curacaví',35165),(13504,'María Pinto',15352),(13505,'San Pedro',11108),(13601,'Talagante',76429),(13602,'El Monte',37497),
  (13603,'Isla de Maipo',39274),(13604,'Padre Hurtado',81243),(13605,'Peñaflor',94402),(14101,'Valdivia',170043),(14102,'Corral',5501),(14103,'Lanco',16876),
  (14104,'Los Lagos',21431),(14105,'Máfil',8074),(14106,'Mariquina',22973),(14107,'Paillaco',19802),(14108,'Panguipulli',35098),(14201,'La Unión',38907),
  (14202,'Futrono',15635),(14203,'Lago Ranco',10527),(14204,'Río Bueno',33363),(15101,'Arica',241653),(15102,'Camarones',861),(15201,'Putre',1547),
  (15202,'General Lagos',508),(16101,'Chillán',190382),(16102,'Bulnes',23863),(16103,'Chillán Viejo',32688),(16104,'El Carmen',13186),(16105,'Pemuco',8930),
  (16106,'Pinto',12502),(16107,'Quillón',19165),(16108,'San Ignacio',17405),(16109,'Yungay',18680),(16201,'Quirihue',11746),(16202,'Cobquecura',5495),
  (16203,'Coelemu',15895),(16204,'Ninhue',5763),(16205,'Portezuelo',5203),(16206,'Ránquil',6508),(16207,'Trehuaco',6124),(16301,'San Carlos',55847),
  (16302,'Coihueco',29766),(16303,'Ñiquén',12797),(16304,'San Fabián',5245),(16305,'San Nicolás',15099)
) as v(cut, comuna, poblacion)
on conflict (cut) do update set comuna = excluded.comuna,
  region_codigo = excluded.region_codigo, poblacion = excluded.poblacion,
  clave = excluded.clave;

-- ------------------------------------------------------------
-- 3. Lo que la capa resumida necesita de las tablas de la 168
-- ------------------------------------------------------------
-- Las compras ágiles guardadas en detalle son las del rubro; la 170 del
-- laboratorio suma las de municipios con esta misma marca en false.
alter table public.mercado_compras_agiles
  add column if not exists del_rubro boolean not null default true;

-- La comuna y el organismo de una unidad de compra, desde sus licitaciones:
-- las compras ágiles no traen comuna ni organismo, y una de cada 15
-- licitaciones viene sin comuna.
create index if not exists idx_mercado_licitaciones_unidad
  on public.mercado_licitaciones (unidad_codigo, mes desc)
  where comuna is not null;

-- Cuándo se resumió cada mes (null = falta) y qué no calzó.
alter table public.mercado_cargas
  add column if not exists resumida_en timestamptz,
  add column if not exists calidad jsonb;

-- ------------------------------------------------------------
-- 4. Los resúmenes
-- ------------------------------------------------------------
-- Cada compra con la misma forma: todas las licitaciones, de todos los
-- rubros, y las compras ágiles del rubro, con sus ganadores. Es lo que
-- leen «Se viene» y los competidores.
create table if not exists public.mercado_compras (
  codigo text primary key,
  tipo text not null check (tipo in ('licitacion', 'compra_agil')),
  mes date not null,
  nombre text,
  organismo_codigo text,
  organismo text,
  unidad_codigo text,
  unidad text,
  rut_unidad text,
  region_codigo smallint,
  region text,
  cut integer,
  comuna text,
  fecha_publicacion date,
  fecha_cierre date,
  monto numeric,
  monto_adjudicado numeric,
  oferentes integer,
  rubros text[],
  productos text,
  del_rubro boolean not null,
  ganadores jsonb
);

-- La zona de «Se viene» y los competidores, una región a la vez y en orden
-- de código: con la región en una lista, la base recorría todo por código
-- (2,4 s por página; así, 15 ms, medido en el laboratorio el 29-10).
create index if not exists idx_mercado_compras_zona
  on public.mercado_compras (tipo, region_codigo, codigo) where del_rubro;
create index if not exists idx_mercado_compras_mes
  on public.mercado_compras (tipo, mes);
create index if not exists idx_mercado_compras_organismo
  on public.mercado_compras (organismo_codigo, mes);

-- Lo que compra cada comprador por mes y región: el organismo, o la unidad
-- si no se sabe de qué organismo es. Las compras ágiles que no son del
-- rubro salen de los totales por unidad, porque no se guardan en detalle:
-- ahí no se sabe cuántas se adjudicaron.
create table if not exists public.mercado_gasto_por_comprador_mes (
  mes date not null,
  tipo text not null,
  del_rubro boolean not null,
  comprador text not null,
  -- 0 = región desconocida.
  region_codigo smallint not null,
  organismo_codigo text,
  organismo text,
  -- La comuna, si todo lo de ese mes y región fue en una sola.
  cut integer,
  procesos integer not null,
  adjudicados integer,
  monto_adjudicado numeric not null default 0,
  primary key (mes, tipo, del_rubro, comprador, region_codigo)
);

create index if not exists idx_mercado_gasto_organismo
  on public.mercado_gasto_por_comprador_mes (organismo_codigo, mes);
create index if not exists idx_mercado_gasto_region
  on public.mercado_gasto_por_comprador_mes (region_codigo, mes);

-- Lo que oferta y gana cada proveedor por mes, según la región del
-- comprador. Solo RUT chilenos válidos. Fuera del rubro quedan solo los que
-- ganaron algo: los que solo ofertaron eran 6 de cada 10 filas y casi la
-- mitad del peso (medido en el laboratorio el 29-10).
create table if not exists public.mercado_ganadores_por_mes (
  mes date not null,
  tipo text not null,
  del_rubro boolean not null,
  -- 0 = región desconocida.
  region_codigo smallint not null,
  rut text not null,
  proveedor text,
  ofertas integer not null,
  ganadas integer not null,
  monto_ganado numeric not null default 0,
  compradores integer not null,
  primary key (mes, tipo, del_rubro, region_codigo, rut)
);

create index if not exists idx_mercado_ganadores_rut
  on public.mercado_ganadores_por_mes (rut, mes);
create index if not exists idx_mercado_ganadores_region
  on public.mercado_ganadores_por_mes (region_codigo, mes) where ganadas > 0;

-- ------------------------------------------------------------
-- 5. Resumir un mes
-- ------------------------------------------------------------
-- La llama el motor apenas guarda un mes (DatosAbiertosService): rehace las
-- filas de ese mes y ese tipo en los tres resúmenes, cuenta lo que no calzó
-- y lo anota en mercado_cargas. Devuelve esa cuenta. El RUT de cada oferta
-- se limpia una sola vez, en una tabla temporal que se borra al terminar.
-- El motor la llama por la API de la base, que corta a los 8 segundos: el
-- mes más grande de los 3 años, noviembre de 2023 con 16.636 licitaciones,
-- tardó 5,7 s en el laboratorio. Por eso lleva su propio tope de 60 s.
create or replace function public.mercado_resumir_mes(p_fuente text, p_mes date)
returns jsonb
language plpgsql
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_tipo text := case p_fuente
    when 'licitaciones' then 'licitacion'
    when 'compra_agil' then 'compra_agil'
  end;
  v_calidad jsonb;
begin
  if v_tipo is null then
    raise exception 'mercado_resumir_mes: fuente desconocida %', p_fuente;
  end if;

  delete from mercado_gasto_por_comprador_mes where tipo = v_tipo and mes = p_mes;
  delete from mercado_ganadores_por_mes where tipo = v_tipo and mes = p_mes;
  delete from mercado_compras where tipo = v_tipo and mes = p_mes;

  -- Las ofertas (o cotizaciones) del mes, con el RUT limpio.
  drop table if exists pg_temp.mercado_ofertas_del_mes;
  if v_tipo = 'licitacion' then
    create temp table mercado_ofertas_del_mes on commit drop as
    with o as materialized (
      select x.codigo, x.proveedor, x.gano, x.monto_adjudicado as monto,
        mercado_rut(x.rut) as rut
      from mercado_ofertas x
      join mercado_licitaciones l on l.codigo = x.codigo
      where l.mes = p_mes)
    select o.*, mercado_rut_valido(o.rut) as valido from o;
  else
    create temp table mercado_ofertas_del_mes on commit drop as
    with o as materialized (
      select x.codigo, x.proveedor, x.elegida as gano, x.monto,
        mercado_rut(x.rut) as rut
      from mercado_cotizaciones x
      join mercado_compras_agiles ca on ca.codigo = x.codigo
      where ca.mes = p_mes and ca.del_rubro)
    select o.*, mercado_rut_valido(o.rut) as valido from o;
  end if;
  analyze mercado_ofertas_del_mes;

  -- Los ganadores de cada compra, en la forma de la adjudicación del radar.
  drop table if exists pg_temp.mercado_ganadores_del_mes;
  create temp table mercado_ganadores_del_mes on commit drop as
  select codigo,
    jsonb_agg(jsonb_build_object('rut', rut, 'nombre', proveedor,
        'cantidad', 1, 'monto_unitario', monto)
      order by monto desc nulls last) as ganadores
  from mercado_ofertas_del_mes
  where gano and valido
  group by codigo;

  if v_tipo = 'licitacion' then
    -- Un código que pasó de otro mes también se rehace aquí.
    delete from mercado_compras m using mercado_licitaciones l
    where m.codigo = l.codigo and l.mes = p_mes;

    insert into mercado_compras (codigo, tipo, mes, nombre, organismo_codigo,
      organismo, unidad_codigo, unidad, rut_unidad, region_codigo, region, cut,
      comuna, fecha_publicacion, fecha_cierre, monto, monto_adjudicado,
      oferentes, rubros, productos, del_rubro, ganadores)
    select l.codigo, 'licitacion', l.mes, l.nombre, l.organismo_codigo,
      l.organismo, l.unidad_codigo, l.unidad, mercado_rut(l.rut_unidad),
      r.codigo, coalesce(r.nombre, l.region), c.cut,
      coalesce(c.comuna, l.comuna), l.fecha_publicacion, l.fecha_cierre,
      l.monto_estimado, l.monto_adjudicado, l.oferentes, l.rubros, null,
      l.del_rubro, g.ganadores
    from mercado_licitaciones l
    left join mercado_regiones r on r.clave = mercado_clave(l.region)
    left join lateral (
      select k.comuna from mercado_licitaciones k
      where l.comuna is null and k.unidad_codigo = l.unidad_codigo
        and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c
      on c.clave = mercado_clave_de_comuna(coalesce(l.comuna, u.comuna))
    left join mercado_ganadores_del_mes g on g.codigo = l.codigo
    where l.mes = p_mes;
  else
    delete from mercado_compras m using mercado_compras_agiles ca
    where m.codigo = ca.codigo and ca.mes = p_mes;

    -- Las compras ágiles no traen comuna ni organismo: salen de las
    -- licitaciones de la misma unidad de compra.
    insert into mercado_compras (codigo, tipo, mes, nombre, organismo_codigo,
      organismo, unidad_codigo, unidad, rut_unidad, region_codigo, region, cut,
      comuna, fecha_publicacion, fecha_cierre, monto, monto_adjudicado,
      oferentes, rubros, productos, del_rubro, ganadores)
    select ca.codigo, 'compra_agil', ca.mes, ca.nombre, u.organismo_codigo,
      ca.organismo, ca.unidad_codigo, ca.unidad, mercado_rut(ca.rut_unidad),
      r.codigo, coalesce(r.nombre, ca.region), c.cut,
      coalesce(c.comuna, u.comuna), ca.fecha_publicacion, ca.fecha_cierre,
      ca.monto_disponible, ca.monto_elegido, ca.cotizaciones, null,
      ca.productos, ca.del_rubro, g.ganadores
    from mercado_compras_agiles ca
    left join mercado_regiones r on r.clave = mercado_clave(ca.region)
    left join lateral (
      select k.organismo_codigo, k.comuna from mercado_licitaciones k
      where k.unidad_codigo = ca.unidad_codigo and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c on c.clave = mercado_clave_de_comuna(u.comuna)
    left join mercado_ganadores_del_mes g on g.codigo = ca.codigo
    where ca.mes = p_mes and ca.del_rubro;
  end if;

  insert into mercado_ganadores_por_mes (mes, tipo, del_rubro, region_codigo,
    rut, proveedor, ofertas, ganadas, monto_ganado, compradores)
  select p_mes, v_tipo, m.del_rubro, coalesce(m.region_codigo, 0), o.rut,
    max(o.proveedor), count(*), count(*) filter (where o.gano),
    coalesce(sum(o.monto) filter (where o.gano), 0),
    count(distinct coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo))
      filter (where o.gano)
  from mercado_ofertas_del_mes o
  join mercado_compras m on m.codigo = o.codigo
  where o.valido
  group by m.del_rubro, coalesce(m.region_codigo, 0), o.rut
  having m.del_rubro or count(*) filter (where o.gano) > 0;

  insert into mercado_gasto_por_comprador_mes (mes, tipo, del_rubro, comprador,
    region_codigo, organismo_codigo, organismo, cut, procesos, adjudicados,
    monto_adjudicado)
  select p_mes, v_tipo, m.del_rubro,
    coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo, 'n:' || m.organismo, '?'),
    coalesce(m.region_codigo, 0), max(m.organismo_codigo), max(m.organismo),
    case when count(distinct m.cut) = 1 then max(m.cut) end,
    count(*), count(*) filter (where m.monto_adjudicado > 0),
    coalesce(sum(m.monto_adjudicado), 0)
  from mercado_compras m
  where m.tipo = v_tipo and m.mes = p_mes
  group by m.del_rubro,
    coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo, 'n:' || m.organismo, '?'),
    coalesce(m.region_codigo, 0);

  if v_tipo = 'compra_agil' then
    -- Las que no son del rubro, desde los totales por unidad: no se guardan
    -- en detalle, así que no se sabe cuántas se adjudicaron.
    insert into mercado_gasto_por_comprador_mes (mes, tipo, del_rubro, comprador,
      region_codigo, organismo_codigo, organismo, cut, procesos, adjudicados,
      monto_adjudicado)
    select p_mes, 'compra_agil', false,
      coalesce(u.organismo_codigo, 'u:' || t.unidad_codigo),
      coalesce(r.codigo, 0), max(u.organismo_codigo), max(t.organismo),
      case when count(distinct c.cut) = 1 then max(c.cut) end,
      sum(t.solicitudes - t.solicitudes_rubro), null,
      coalesce(sum(t.monto_elegido - t.monto_rubro), 0)
    from mercado_compras_agiles_totales t
    left join mercado_regiones r on r.clave = mercado_clave(t.region)
    left join lateral (
      select k.organismo_codigo, k.comuna from mercado_licitaciones k
      where k.unidad_codigo = t.unidad_codigo and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c on c.clave = mercado_clave_de_comuna(u.comuna)
    where t.mes = p_mes and t.solicitudes > t.solicitudes_rubro
    group by coalesce(u.organismo_codigo, 'u:' || t.unidad_codigo),
      coalesce(r.codigo, 0);
  end if;

  select jsonb_build_object(
      'procesos', count(*),
      'sin_region', count(*) filter (where region_codigo is null),
      'sin_comuna', count(*) filter (where cut is null))
  into v_calidad
  from mercado_compras
  where tipo = v_tipo and mes = p_mes;

  select v_calidad || jsonb_build_object(
      'ofertas', count(*),
      'rut_no_valido', count(*) filter (where not valido),
      'ganadoras_rut_no_valido', count(*) filter (where gano and not valido))
  into v_calidad
  from mercado_ofertas_del_mes;

  update mercado_cargas set resumida_en = now(), calidad = v_calidad
  where fuente = p_fuente and mes = p_mes;
  return v_calidad;
end
$$;

-- ------------------------------------------------------------
-- 6. Qué es cada cosa, dentro de la base
-- ------------------------------------------------------------
comment on table public.mercado_regiones is
  'Las 16 regiones con su código oficial y el nombre como lo escribe ChileCompra (decisión 109).';
comment on table public.mercado_comunas is
  'Las 346 comunas con su CUT, su región y la población del Censo 2024 (decisión 109).';
comment on table public.mercado_compras is
  'Cada licitación, de todos los rubros, y cada compra ágil del rubro, con la misma forma, claves limpias y sus ganadores con RUT chileno válido. La arma mercado_resumir_mes (decisión 109).';
comment on table public.mercado_gasto_por_comprador_mes is
  'Lo que compra cada organismo, o unidad si no se sabe el organismo, por mes, región, tipo y si es del rubro (decisión 109).';
comment on table public.mercado_ganadores_por_mes is
  'Lo que oferta y gana cada proveedor con RUT chileno válido, por mes, región del comprador, tipo y si es del rubro; fuera del rubro, solo los que ganaron algo (decisión 109).';
comment on column public.mercado_cargas.calidad is
  'Lo que no calzó al resumir el mes: sin región, sin comuna, RUT que no es un RUT chileno válido (decisión 109).';
comment on function public.mercado_resumir_mes(text, date) is
  'Rehace los resúmenes de un mes (licitaciones o compra_agil) y devuelve el control de calidad (decisión 109).';

-- ------------------------------------------------------------
-- 7. Permisos: solo el motor
-- ------------------------------------------------------------
alter table public.mercado_regiones enable row level security;
alter table public.mercado_comunas enable row level security;
alter table public.mercado_compras enable row level security;
alter table public.mercado_gasto_por_comprador_mes enable row level security;
alter table public.mercado_ganadores_por_mes enable row level security;

revoke all on public.mercado_regiones, public.mercado_comunas,
  public.mercado_compras, public.mercado_gasto_por_comprador_mes,
  public.mercado_ganadores_por_mes
  from anon, authenticated;
grant select, insert, update, delete on public.mercado_regiones,
  public.mercado_comunas, public.mercado_compras,
  public.mercado_gasto_por_comprador_mes, public.mercado_ganadores_por_mes
  to service_role;

revoke execute on function public.mercado_clave(text), public.mercado_rut(text),
  public.mercado_rut_valido(text), public.mercado_clave_de_comuna(text),
  public.mercado_resumir_mes(text, date)
  from public, anon, authenticated;
grant execute on function public.mercado_clave(text), public.mercado_rut(text),
  public.mercado_rut_valido(text), public.mercado_clave_de_comuna(text),
  public.mercado_resumir_mes(text, date)
  to service_role;
