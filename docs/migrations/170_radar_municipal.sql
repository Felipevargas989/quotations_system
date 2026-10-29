-- ============================================================
-- 170 · EL RADAR MUNICIPAL: ÓRDENES DE COMPRA, COMPRAS ÁGILES DE LOS
--       MUNICIPIOS Y POBLACIÓN POR COMUNA (28-10-2026)
-- ============================================================
-- Decisión 108 del doc 17, SOLO EN EL LABORATORIO por ahora. Felipe: "la
-- idea de esto es generar un spinoff de una empresa que será un radar
-- municipal para detectar irregularidades de usos de dineros publicos
-- inspirados en zorro de ukrania". Eligió una pestaña en Oportunidades,
-- tratos directos, todas las compras ágiles y población por comuna, y
-- "dejemos esto en laboratorio no más mientras no quiero pagar más".
--
-- Lo que se suma a la migración 168, todo de MUNICIPIOS (sector
-- «Municipalidades» de ChileCompra, cerca de la mitad de lo que compra el
-- Estado; medido el 28-10 con septiembre 2026: 45.495 de 147.627 órdenes):
--  - mercado_ordenes_de_compra: cada orden de compra municipal, una fila por
--    orden, con su modalidad (licitación, compra ágil, convenio marco, trato
--    directo) y, si es trato directo, su causal (emergencia, proveedor
--    único...). Sale de oc-da/{año}-{mes}.zip.
--  - mercado_organismos y mercado_proveedores: el nombre de cada uno, una
--    vez, para no repetirlo en cada orden. El proveedor trae su giro.
--  - mercado_compras_agiles: ahora también las de municipios fuera del rubro
--    (sin sus cotizaciones, solo cuántas fueron y la elegida).
--  - mercado_poblacion: las 346 comunas del Censo 2024 del INE (capa
--    COMUNA_DPA_INDICADORES, 18.480.432 personas), para el gasto por
--    habitante como el CIC N°22 de Contraloría.
--  - mercado_utm: la UTM de cada mes según el SII, para los topes legales
--    (compra ágil hasta 100 UTM, concejo desde 500...).
--
-- Datos PÚBLICOS, sin company_id (doc 17, regla 4). Fuera del respaldo
-- diario. GRANT y RLS en la misma migración; solo el motor (service_role).
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Una fuente más en el registro de cargas
-- ------------------------------------------------------------
alter table public.mercado_cargas drop constraint if exists mercado_cargas_fuente_check;
alter table public.mercado_cargas add constraint mercado_cargas_fuente_check
  check (fuente in ('licitaciones', 'compra_agil', 'ordenes_de_compra'));

-- ------------------------------------------------------------
-- 2. Las órdenes de compra de los municipios, una fila por orden
-- ------------------------------------------------------------
create table if not exists public.mercado_ordenes_de_compra (
  codigo text primary key,
  -- El mes del archivo (el del envío de la orden).
  mes date not null,
  fecha_envio date,
  nombre text,
  -- Como lo escribe ChileCompra: AG, SE, CM, TD, CC...
  tipo text,
  modalidad text not null
    check (modalidad in ('licitacion', 'compra_agil', 'convenio_marco', 'trato_directo', 'otra')),
  -- Solo en los tratos directos: la causal que invocó el municipio.
  causal text,
  emergencia boolean not null default false,
  estado text,
  organismo_codigo text,
  unidad_codigo text,
  rut_proveedor text,
  -- En pesos y con impuestos (MontoTotalOC_PesosChilenos).
  monto numeric,
  codigo_licitacion text,
  -- Eventos, banquetería, alimentación o alojamiento (como la 168).
  del_rubro boolean not null default false
);

create index if not exists idx_mercado_oc_mes
  on public.mercado_ordenes_de_compra (mes);
create index if not exists idx_mercado_oc_organismo_mes
  on public.mercado_ordenes_de_compra (organismo_codigo, mes);
create index if not exists idx_mercado_oc_proveedor
  on public.mercado_ordenes_de_compra (rut_proveedor);
create index if not exists idx_mercado_oc_rubro
  on public.mercado_ordenes_de_compra (mes) where del_rubro;

alter table public.mercado_ordenes_de_compra enable row level security;
revoke all on public.mercado_ordenes_de_compra from anon, authenticated;
grant select, insert, update, delete on public.mercado_ordenes_de_compra to service_role;

-- ------------------------------------------------------------
-- 3. Los organismos y los proveedores, una vez cada uno
-- ------------------------------------------------------------
create table if not exists public.mercado_organismos (
  codigo text primary key,
  nombre text,
  sector text,
  region text,
  ciudad text,
  -- La comuna del municipio en mercado_poblacion (se une por el nombre).
  cut integer
);

alter table public.mercado_organismos enable row level security;
revoke all on public.mercado_organismos from anon, authenticated;
grant select, insert, update, delete on public.mercado_organismos to service_role;

create table if not exists public.mercado_proveedores (
  rut text primary key,
  nombre text,
  -- El giro que declara en ChileCompra.
  actividad text,
  comuna text,
  region text
);

alter table public.mercado_proveedores enable row level security;
revoke all on public.mercado_proveedores from anon, authenticated;
grant select, insert, update, delete on public.mercado_proveedores to service_role;

-- ------------------------------------------------------------
-- 4. Las compras ágiles: también las de municipios fuera del rubro
-- ------------------------------------------------------------
-- Las que ya estaban son todas del rubro.
alter table public.mercado_compras_agiles
  add column if not exists del_rubro boolean not null default true,
  add column if not exists municipal boolean not null default false;

create index if not exists idx_mercado_compras_agiles_municipal
  on public.mercado_compras_agiles (unidad_codigo, rut_elegido, fecha_publicacion)
  where municipal;

-- ------------------------------------------------------------
-- 5. La población de cada comuna (Censo 2024, INE)
-- ------------------------------------------------------------
create table if not exists public.mercado_poblacion (
  cut integer primary key,
  comuna text not null,
  -- Como la nombra ChileCompra, para cruzarla con el mercado.
  region text,
  poblacion integer not null,
  -- El nombre sin tildes, eñes ni signos: QUILLON, OHIGGINS.
  clave text not null
);

create index if not exists idx_mercado_poblacion_clave
  on public.mercado_poblacion (clave);

alter table public.mercado_poblacion enable row level security;
revoke all on public.mercado_poblacion from anon, authenticated;
grant select, insert, update, delete on public.mercado_poblacion to service_role;

-- ------------------------------------------------------------
-- 6. La UTM de cada mes (SII)
-- ------------------------------------------------------------
create table if not exists public.mercado_utm (
  mes date primary key,
  valor numeric not null
);

alter table public.mercado_utm enable row level security;
revoke all on public.mercado_utm from anon, authenticated;
grant select, insert, update, delete on public.mercado_utm to service_role;

-- ------------------------------------------------------------
-- 7. Los datos: 346 comunas y 47 meses de UTM
-- ------------------------------------------------------------
-- La región sale de los primeros dígitos del código de la comuna (CUT).
insert into public.mercado_poblacion (cut, comuna, region, poblacion, clave)
select v.cut, v.comuna,
  (array[
    'Región de Tarapacá', 'Región de Antofagasta', 'Región de Atacama',
    'Región de Coquimbo', 'Región de Valparaíso',
    'Región del Libertador General Bernardo O´Higgins', 'Región del Maule',
    'Región del Biobío', 'Región de la Araucanía', 'Región de los Lagos',
    'Región Aysén del General Carlos Ibáñez del Campo',
    'Región de Magallanes y de la Antártica',
    'Región Metropolitana de Santiago', 'Región de Los Ríos',
    'Región de Arica y Parinacota', 'Región del Ñuble'
  ])[v.cut / 1000],
  v.poblacion,
  regexp_replace(upper(translate(v.comuna, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^A-Z0-9]', '', 'g')
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
on conflict (cut) do update set comuna = excluded.comuna, region = excluded.region,
  poblacion = excluded.poblacion, clave = excluded.clave;

insert into public.mercado_utm (mes, valor) values
  ('2023-01-01',61769),('2023-02-01',61954),('2023-03-01',62450),('2023-04-01',62388),('2023-05-01',63074),('2023-06-01',63263),
  ('2023-07-01',63326),('2023-08-01',63199),('2023-09-01',63452),('2023-10-01',63515),('2023-11-01',63960),('2023-12-01',64216),
  ('2024-01-01',64666),('2024-02-01',64343),('2024-03-01',64793),('2024-04-01',65182),('2024-05-01',65443),('2024-06-01',65770),
  ('2024-07-01',65967),('2024-08-01',65901),('2024-09-01',66362),('2024-10-01',66561),('2024-11-01',66628),('2024-12-01',67294),
  ('2025-01-01',67429),('2025-02-01',67294),('2025-03-01',68034),('2025-04-01',68306),('2025-05-01',68648),('2025-06-01',68785),
  ('2025-07-01',68923),('2025-08-01',68647),('2025-09-01',69265),('2025-10-01',69265),('2025-11-01',69542),('2025-12-01',69542),
  ('2026-01-01',69751),('2026-02-01',69611),('2026-03-01',69889),('2026-04-01',69889),('2026-05-01',70588),('2026-06-01',71506),
  ('2026-07-01',71649),('2026-08-01',71649),('2026-09-01',71721),('2026-10-01',72151),('2026-11-01',72440)
on conflict (mes) do update set valor = excluded.valor;
