import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type {
  ClienteParaFacturar,
  DtePedido,
  Receptor,
} from "../../services/facturas.service";
import { formatearRut } from "../../utils/rut";
import CamposDelReceptor from "../postventa/facturacion/CamposDelReceptor";
import { RECEPTOR_VACIO } from "../postventa/facturacion/datosDeLaFactura";
import ClienteNuevoParaFacturar from "./ClienteNuevoParaFacturar";

// EL DESTINATARIO DE LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.22).
// Felipe, 06-11: *"la información del destinatario debería buscar en la
// base de eventia o bien crear uno nuevo (cliente con datos de facturación)
// para seguir alimentando nuestra base de clientes"*. Se busca por el
// nombre o por el RUT (con o sin puntos) entre las razones sociales de los
// clientes; un cliente sin datos de facturación también sale, y se
// completan acá. Lo editado queda en su ficha al emitir.

type Razon = ClienteParaFacturar["razones"][number];

const receptorDe = (z: Razon): Receptor => ({
  rut: z.rut,
  razon_social: z.razon_social,
  giro: z.giro,
  direccion: z.direccion,
  comuna: z.comuna,
  ciudad: z.ciudad,
  correo: z.correo_facturacion,
});

/** Lo que el SII pide del receptor y todavía no está. */
const faltanDe = (r: Receptor) =>
  (
    [
      ["razon_social", "la razón social"],
      ["rut", "el RUT"],
      ["giro", "el giro"],
      ["direccion", "la dirección"],
      ["comuna", "la comuna"],
    ] as const
  )
    .filter(([campo]) => !(r[campo] ?? "").trim())
    .map(([, texto]) => texto);

const botonChico =
  "rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50";

export default function DestinatarioDeLaFactura({
  clientes,
  cargando,
  pedida,
  poner,
  onClienteCreado,
}: {
  readonly clientes: ClienteParaFacturar[] | undefined;
  readonly cargando: boolean;
  readonly pedida: DtePedido;
  readonly poner: (cambios: Partial<DtePedido>) => void;
  /** Un cliente nuevo quedó en Clientes: la lista se vuelve a pedir. */
  readonly onClienteCreado: () => void;
}) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(false);
  const r = pedida.receptor;
  const cliente = clientes?.find((c) => c.id === pedida.cliente_id) ?? null;
  // Una razón social que ya está en la ficha: su RUT no se cambia acá.
  const guardada = cliente?.razones.some((z) => z.rut === r.rut) ?? false;

  const opciones = useMemo(
    () =>
      (clientes ?? []).flatMap((c) =>
        c.razones.length
          ? c.razones.map((z) => ({
              value: `${c.id}|${z.id}`,
              label: z.razon_social,
              hint: [formatearRut(z.rut), c.tipo].filter(Boolean).join(" · "),
              // Se encuentra con el RUT como se escriba, y por el nombre
              // del cliente si es otro.
              buscar: `${z.rut} ${z.rut.replace("-", "")} ${c.nombre}`,
            }))
          : [
              {
                value: `${c.id}|`,
                label: c.nombre,
                hint: [c.tipo, "sin datos de facturación"]
                  .filter(Boolean)
                  .join(" · "),
              },
            ],
      ),
    [clientes],
  );

  const elegir = (valor: string) => {
    const [id, razonId] = valor.split("|");
    const c = clientes?.find((x) => x.id === id);
    if (!c) return;
    const z = c.razones.find((x) => String(x.id) === razonId) ?? null;
    const receptor = z
      ? receptorDe(z)
      : { ...RECEPTOR_VACIO, razon_social: c.nombre };
    // Las referencias que pide esa razón social (la OC, la HES…).
    poner({
      cliente_id: c.id,
      receptor,
      referencias: (z?.referencias_exigidas ?? []).map((tipo) => ({
        tipo,
        folio: "",
        fecha: "",
      })),
      pedir_siempre: [...(z?.referencias_exigidas ?? [])],
    });
    setEditando(faltanDe(receptor).length > 0);
    setCreando(false);
  };

  const cambiar = () => {
    poner({
      cliente_id: null,
      receptor: RECEPTOR_VACIO,
      referencias: [],
      pedir_siempre: [],
    });
    setEditando(false);
  };

  if (creando)
    return (
      <ClienteNuevoParaFacturar
        clientes={clientes ?? []}
        onCancelar={() => setCreando(false)}
        onUsar={elegir}
        onListo={(clienteId, receptor) => {
          setCreando(false);
          setEditando(false);
          poner({
            cliente_id: clienteId,
            receptor,
            referencias: [],
            pedir_siempre: [],
          });
          onClienteCreado();
        }}
      />
    );

  if (!pedida.cliente_id)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-72">
          <SelectWithSearch
            options={opciones}
            value=""
            onChange={(v) => v && elegir(v)}
            placeholder={
              cargando
                ? "Cargando los clientes…"
                : "Busca el cliente por nombre o RUT"
            }
            searchPlaceholder="Nombre o RUT"
            noResultsText="No está en Clientes: créalo con «Crear cliente nuevo»"
            disabled={cargando}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <Plus size={14} /> Crear cliente nuevo
        </button>
      </div>
    );

  const faltan = faltanDe(r);
  const contacto = cliente?.contacto;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-gray-900 break-words">
            {r.razon_social || cliente?.nombre || "Cliente nuevo"}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {cliente?.tipo && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-semibold text-gray-600">
                {cliente.tipo}
              </span>
            )}
            {contacto ? (
              <span>
                Contacto: {contacto.nombre}
                {contacto.correo ? ` · ${contacto.correo}` : ""}
                {contacto.telefono ? ` · ${contacto.telefono}` : ""}
              </span>
            ) : cliente ? (
              <span className="font-semibold text-amber-700">Sin contacto</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditando((e) => !e)}
            className={botonChico}
          >
            {editando ? "Listo" : "Editar datos de facturación"}
          </button>
          <button type="button" onClick={cambiar} className={botonChico}>
            Cambiar
          </button>
        </div>
      </div>

      {editando ? (
        <CamposDelReceptor
          receptor={r}
          rutFijo={guardada}
          onChange={(campo, valor) =>
            poner({ receptor: { ...r, [campo]: valor } })
          }
          onLlenar={(datos) => poner({ receptor: { ...r, ...datos } })}
        />
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Dato titulo="RUT" valor={r.rut ? formatearRut(r.rut) : null} />
          <Dato titulo="Giro" valor={r.giro} />
          <Dato titulo="Correo para la factura" valor={r.correo} opcional />
          <Dato titulo="Dirección" valor={r.direccion} />
          <Dato titulo="Comuna" valor={r.comuna} />
          <Dato titulo="Ciudad" valor={r.ciudad} opcional />
        </dl>
      )}

      {faltan.length > 0 && !editando && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Para facturarle, el SII pide {faltan.join(", ")}.{" "}
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="font-semibold underline"
          >
            Completar
          </button>
        </p>
      )}
      {(editando || !guardada) && cliente && (
        <p className="text-xs text-gray-500">
          Al emitir, los datos de facturación quedan en la ficha de{" "}
          {cliente.nombre}.
        </p>
      )}
    </div>
  );
}

function Dato({
  titulo,
  valor,
  opcional = false,
}: {
  readonly titulo: string;
  readonly valor: string | null;
  readonly opcional?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-gray-500">{titulo}</dt>
      <dd className="break-words text-gray-900">
        {valor?.trim() ? (
          valor
        ) : opcional ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="font-semibold text-amber-700">Falta</span>
        )}
      </dd>
    </div>
  );
}
