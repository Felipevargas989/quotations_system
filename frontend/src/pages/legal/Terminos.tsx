import PaginaLegal, { Lista, Seccion } from "./PaginaLegal";
import { DIAS_DE_CONSERVACION, EMPRESA } from "./datosLegales";

// TÉRMINOS Y CONDICIONES (18-09-2026). Texto aprobado por Felipe. Los
// números (7 días de prueba, 7 de gracia, precios, topes de cada plan,
// proporcional al subir, 90 días de conservación) son los que aplica el
// sistema: si uno cambia en el código, cambia acá en el mismo commit.

export default function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      otra={{ a: "/privacidad", texto: "la política de privacidad" }}
    >
      <Seccion n={1} titulo="Quién presta el servicio">
        <p>
          Eventia es un software en línea para cotizar, vender y gestionar
          eventos. Lo presta <strong>{EMPRESA.razonSocial}</strong>, RUT{" "}
          {EMPRESA.rut}, con domicilio en {EMPRESA.domicilio}. Contacto:{" "}
          {EMPRESA.correo} y el WhatsApp publicado en www.eventi-app.com.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Para quién es">
        <p>
          Eventia se contrata por empresas y personas que trabajan en eventos:
          banqueterías, centros de eventos, productoras, arriendos. La cuenta la
          abre una persona en nombre de su empresa y esa persona declara que
          puede obligarla. Cada empresa tiene su propio espacio: sus datos no se
          mezclan con los de ninguna otra.
        </p>
      </Seccion>

      <Seccion n={3} titulo="La cuenta">
        <Lista
          items={[
            "Se crea con un correo real, un nombre y una contraseña de al menos 8 caracteres. Un correo solo puede tener una cuenta.",
            "Quien crea la cuenta es el administrador de la empresa: agrega y quita usuarios, elige el plan y responde por lo que hagan sus usuarios dentro de Eventia.",
            "La contraseña es personal. Si sospechas que alguien la tiene, cámbiala desde Mi cuenta o escríbenos.",
          ]}
        />
      </Seccion>

      <Seccion n={4} titulo="La prueba gratis">
        <Lista
          items={[
            "Toda empresa nueva tiene 7 días gratis con todas las funciones (las del plan Opera y Crece). No pide tarjeta.",
            "Al terminar los 7 días, si no se contrató un plan, la cuenta queda pausada: solo permite entrar a elegir un plan. No se borra nada.",
            "Si contratas antes de que termine la prueba, el cobro parte ese día; la prueba no se cobra.",
          ]}
        />
      </Seccion>

      <Seccion n={5} titulo="Los planes y los precios">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Plan</th>
                <th className="text-left px-3 py-2 font-semibold">
                  Precio mensual
                </th>
                <th className="text-left px-3 py-2 font-semibold">Incluye</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2">Cotiza</td>
                <td className="px-3 py-2">$25.000</td>
                <td className="px-3 py-2">
                  1 usuario, hasta 20 cotizaciones al mes
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Gestiona y Cobra</td>
                <td className="px-3 py-2">$60.000</td>
                <td className="px-3 py-2">
                  hasta 3 usuarios, cotizaciones sin tope
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Opera y Crece</td>
                <td className="px-3 py-2">$140.000</td>
                <td className="px-3 py-2">
                  usuarios sin tope, todas las funciones
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Lista
          items={[
            "Precios en pesos chilenos, IVA incluido, publicados en www.eventi-app.com, donde también está el detalle de qué función va en cada plan.",
            "Si un precio cambia, avisamos por correo con 30 días de anticipación y rige desde el siguiente cobro mensual. Nunca cambia un mes ya pagado.",
          ]}
        />
      </Seccion>

      <Seccion n={6} titulo="El pago">
        <Lista
          items={[
            "Se paga mes a mes, por adelantado, con tarjeta a través de Mercado Pago, como una suscripción: cada mes se cobra solo, el mismo día del mes en que se contrató.",
            "Eventia no ve ni guarda tu tarjeta. La guarda Mercado Pago.",
            "El comprobante de cada cobro lo envía Mercado Pago al correo con que se pagó.",
          ]}
        />
      </Seccion>

      <Seccion n={7} titulo="Si un cobro falla">
        <Lista
          items={[
            "Te avisamos por correo el mismo día. Sigues con acceso completo durante 7 días de gracia para regularizar la tarjeta.",
            "Si al octavo día sigue sin pagarse, la cuenta queda pausada: solo permite entrar a pagar. No se borra nada.",
            "Apenas el pago entra, la cuenta se reactiva sola.",
          ]}
        />
      </Seccion>

      <Seccion n={8} titulo="Cambiar de plan">
        <Lista
          items={[
            "Subir de plan rige al instante. Ese día se cobra, por única vez, la diferencia de precio proporcional a los días que faltan del mes ya pagado. Desde el mes siguiente se cobra el precio del plan nuevo.",
            "Bajar de plan rige cuando termina el mes ya pagado. Hasta entonces conservas todo lo del plan actual. No hay reembolsos por bajar.",
            "Se hace desde Mi empresa → Plan.",
          ]}
        />
      </Seccion>

      <Seccion n={9} titulo="Cancelar">
        <Lista
          items={[
            "Puedes cancelar cuando quieras. El servicio sigue activo hasta el fin del mes ya pagado y no se cobra el mes siguiente.",
            "No hay reembolso del mes en curso, salvo error de cobro nuestro (por ejemplo, un cobro duplicado), que se devuelve completo.",
            <>
              Se cancela desde <strong>Mi empresa → Plan</strong>, con el botón
              «Cancelar mi plan»: por el mismo medio por el que se contrató.
              También puedes escribirnos a {EMPRESA.correo}.
            </>,
          ]}
        />
      </Seccion>

      <Seccion n={10} titulo="Los datos de la empresa son de la empresa">
        <Lista
          items={[
            "Todo lo que la empresa ingresa (clientes, cotizaciones, catálogo, precios, logo, correos) es de la empresa. Eventia solo lo procesa para prestar el servicio.",
            "Eventia no vende, no comparte ni usa esos datos para publicidad.",
            "Los datos de los clientes finales de la empresa (las personas que cotizan con ella) los trata Eventia por cuenta de la empresa, que sigue siendo la responsable ante ellos.",
            "Hay respaldo diario. Aun así, la empresa puede exportar sus cotizaciones y pedirnos una copia completa de sus datos cuando quiera.",
            `Si la cuenta queda pausada o cancelada, los datos se conservan ${DIAS_DE_CONSERVACION} días para que la empresa pueda volver o pedir su copia; después pueden eliminarse definitivamente.`,
          ]}
        />
      </Seccion>

      <Seccion n={11} titulo="Uso aceptable">
        <p>
          Eventia es para el negocio propio de cada empresa. No se permite:
          intentar entrar a datos de otra empresa, revender o compartir la
          cuenta con terceros, usar el sistema para enviar correo no solicitado,
          ni cargar contenido ilegal. Ante un abuso, Eventia puede suspender la
          cuenta, avisando por correo salvo que la urgencia no lo permita.
        </p>
      </Seccion>

      <Seccion n={12} titulo="Disponibilidad y responsabilidad">
        <Lista
          items={[
            "Eventia se esfuerza por estar disponible las 24 horas, pero no garantiza el 100 %: hay mantenimientos (avisados cuando se pueda) y fallas de proveedores (nube, correo, pagos) fuera de nuestro control.",
            "La responsabilidad de Eventia por cualquier reclamo se limita a lo pagado por la empresa en los últimos 3 meses. Eventia no responde por lucro cesante ni por decisiones comerciales tomadas con la información del sistema: los precios y totales de cada cotización los define y revisa la empresa.",
          ]}
        />
      </Seccion>

      <Seccion n={13} titulo="Propiedad">
        <p>
          El software, la marca y el diseño de Eventia son de{" "}
          {EMPRESA.razonSocial}. La empresa tiene una licencia de uso, no
          exclusiva, mientras su plan esté vigente. El contenido que la empresa
          ingresa sigue siendo suyo.
        </p>
      </Seccion>

      <Seccion n={14} titulo="Cambios a estos términos">
        <p>
          Si estos términos cambian, avisamos por correo al administrador con 15
          días de anticipación. Seguir usando Eventia después de esa fecha es
          aceptar los nuevos términos; si no estás de acuerdo, puedes cancelar
          sin costo antes.
        </p>
      </Seccion>

      <Seccion n={15} titulo="Ley y tribunales">
        <p>
          Rige la ley chilena. Cualquier diferencia se intenta resolver primero
          conversando; si no, en los tribunales ordinarios de{" "}
          {EMPRESA.ciudadTribunales}.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
