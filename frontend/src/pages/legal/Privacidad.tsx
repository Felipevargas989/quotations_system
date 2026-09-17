import PaginaLegal, { Lista, Seccion } from "./PaginaLegal";
import { DIAS_DE_CONSERVACION, EMPRESA } from "./datosLegales";

// POLÍTICA DE PRIVACIDAD (18-09-2026). Texto aprobado por Felipe. Los
// proveedores de la sección 3 son los reales (mapa del sistema, cap 18 y
// 20); las huellas de origen son las de las migraciones 110 y 116.

const FILAS: { dato: string; paraQue: string; cuanto: string }[] = [
  {
    dato: "De la cuenta: nombre, correo, teléfono, nombre de la empresa, tamaño y ventas declaradas al registrarse",
    paraQue:
      "Crear y operar la cuenta y enviar los avisos del servicio (bienvenida, prueba por vencer, pago fallido)",
    cuanto: `Mientras la cuenta exista, más los ${DIAS_DE_CONSERVACION} días de conservación`,
  },
  {
    dato: "De uso: fecha de último ingreso y registros técnicos (dirección IP, navegador, errores)",
    paraQue: "Seguridad, soporte y mejorar el servicio",
    cuanto: "Registros técnicos: 90 días",
  },
  {
    dato: "De pago: la referencia de la suscripción en Mercado Pago y el correo con que se paga",
    paraQue: "Saber qué pago corresponde a qué empresa",
    cuanto:
      "Mientras la suscripción exista. Eventia nunca ve ni guarda la tarjeta",
  },
  {
    dato: "De los clientes finales de cada empresa: nombre, correo, teléfono y lo que cotizan",
    paraQue:
      "Prestar el servicio a la empresa, que es la responsable de esos datos",
    cuanto: "Lo que la empresa decida",
  },
  {
    dato: "De origen: por qué canal llegó la persona a registrarse (identificador del clic de Google o Meta, etiquetas de campaña, sitio desde el que venía)",
    paraQue:
      "Saber qué canal de difusión funciona. Es un identificador del clic, no de la persona",
    cuanto: "Junto con la cuenta",
  },
];

export default function Privacidad() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      otra={{ a: "/terminos", texto: "los términos y condiciones" }}
    >
      <Seccion n={1} titulo="Responsable">
        <p>
          <strong>{EMPRESA.razonSocial}</strong>, RUT {EMPRESA.rut},{" "}
          {EMPRESA.domicilio}. Contacto: {EMPRESA.correo}. Cumple la Ley 19.628
          sobre protección de la vida privada y se prepara para la Ley 21.719 de
          protección de datos personales, que rige desde diciembre de 2026.
        </p>
      </Seccion>

      <Seccion n={2} titulo="Qué datos se recogen y para qué">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Dato</th>
                <th className="text-left px-3 py-2 font-semibold">Para qué</th>
                <th className="text-left px-3 py-2 font-semibold">
                  Cuánto tiempo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 align-top">
              {FILAS.map((f) => (
                <tr key={f.dato}>
                  <td className="px-3 py-2">{f.dato}</td>
                  <td className="px-3 py-2">{f.paraQue}</td>
                  <td className="px-3 py-2">{f.cuanto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion n={3} titulo="Con quién se comparten">
        <p>
          Solo con los proveedores que hacen funcionar Eventia, y solo para eso:
        </p>
        <Lista
          items={[
            "Supabase (base de datos y cuentas), servidores en Estados Unidos.",
            "Railway (el motor del sistema), Estados Unidos.",
            "Netlify (la página web).",
            "Resend (envío de los correos del servicio).",
            "Mercado Pago (cobros; ellos guardan la tarjeta).",
            "Google Analytics en la página pública, para medir visitas.",
          ]}
        />
        <p>
          Eventia no vende datos a nadie. Solo los entrega a una autoridad si la
          ley la obliga.
        </p>
      </Seccion>

      <Seccion n={4} titulo="Derechos de las personas">
        <p>
          Cualquier persona puede pedir acceso a sus datos, corregirlos,
          eliminarlos u oponerse a un uso, escribiendo a {EMPRESA.correo}.
          Respondemos dentro de 10 días hábiles. Los clientes finales de una
          empresa deben dirigirse primero a esa empresa, que es la responsable;
          si nos escriben a nosotros, los ayudamos a llegar a ella.
        </p>
      </Seccion>

      <Seccion n={5} titulo="Cookies">
        <p>
          La aplicación usa solo las cookies imprescindibles para mantener la
          sesión abierta. La página pública usa además Google Analytics para
          contar visitas y, cuando hay campañas, la etiqueta de conversión de
          Google Ads. Se pueden bloquear desde el navegador sin que la
          aplicación deje de funcionar.
        </p>
      </Seccion>

      <Seccion n={6} titulo="Seguridad">
        <p>
          Contraseñas cifradas (nunca se guardan en claro), conexión cifrada
          (HTTPS), cada empresa aislada de las demás dentro del sistema,
          respaldo diario y acceso al motor solo con llaves que no salen del
          servidor.
        </p>
      </Seccion>

      <Seccion n={7} titulo="Cambios">
        <p>
          Igual que los términos: si esta política cambia, avisamos por correo
          con 15 días de anticipación.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
