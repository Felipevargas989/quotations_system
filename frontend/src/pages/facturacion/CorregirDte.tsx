import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import {
  armarBorradorDeDte,
  revisarDte,
  type BorradorDelDte,
  type DtePedido,
  type RazonSocialDelBorrador,
  type TipoDeDte,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatearRut } from "../../utils/rut";
import CamposDelReceptor from "../postventa/facturacion/CamposDelReceptor";
import Casilla from "../postventa/facturacion/CasillaDeLaFactura";
import LineasDelDte, {
  TotalesDelDte,
} from "../postventa/facturacion/LineasDelDte";
import ReferenciasDelDte from "../postventa/facturacion/ReferenciasDelDte";
import {
  OTRA,
  RECEPTOR_VACIO,
  claseTitulo,
  useQuieto,
} from "../postventa/facturacion/datosDeLaFactura";
import { Seccion } from "./PiezasDelDocumento";
import SeccionDocumento from "./SeccionDocumento";
import type { RevisadoParaLaMasiva } from "./revisarUnoParaLaMasiva";

// «CORREGIR» EN LA REVISIÓN DE «FACTURAR SELECCIONADOS» (doc 19 §9.32;
// Felipe, 08-11: *"no me gustan todos estos chip... mira la cantidad de
// información, podemos replantear esto"*; vio la maqueta: *"me parece
// mejor"*). El mismo documento por secciones que se revisa, con casillas,
// como la factura de «Nuevo DTE» (*"si arreglas esta pieza también se
// arregla desde el botón + nuevo DTE"*):
// - Documento (`SeccionDocumento`): el tipo y de dónde se llena, en listas
//   (cambiarlos le pide a BelIA el documento de nuevo); la fecha de emisión
//   y la condición de pago.
// - Destinatario: la razón social del cliente en una lista si tiene varias,
//   y los datos con el RUT arriba (`CamposDelReceptor`); lo que falta, en
//   rojo en su casilla. La boleta, solo el correo.
// - Ítems, Referencias y Totales: los de «Nuevo DTE». Para facturar una
//   parte, se cambia el monto (Felipe, 08-11: *"si es solo cambiar el monto
//   lo cambio yo"*): salieron los chips de «Qué parte».
// Los avisos van una sola vez, en «Lo del evento» (la ventana). Cada cambio
// sube con su revisión del motor (`onCambio`), y la ventana pone «Listo» y
// «Aprobar».

/** Lo que se está corrigiendo, con su revisión: listo si se puede aprobar. */
export interface EnCorreccion {
  dte: RevisadoParaLaMasiva;
  listo: boolean;
}

const COTIZACION = "cotizacion";
const fuenteDe = (ocId: number | null) =>
  ocId == null ? COTIZACION : String(ocId);

const delBorrador = (z: RazonSocialDelBorrador): DtePedido["receptor"] => ({
  rut: z.rut,
  razon_social: z.razon_social,
  giro: z.giro,
  direccion: z.direccion,
  comuna: z.comuna,
  ciudad: z.ciudad,
  correo: z.correo_facturacion,
});

export default function CorregirDte({
  quotationId,
  inicial,
  onCambio,
}: {
  readonly quotationId: string;
  /** Lo que se revisa: el pedido de ahora (de BelIA o ya corregido), con su
   *  preparación y su borrador. */
  readonly inicial: RevisadoParaLaMasiva;
  readonly onCambio: (r: EnCorreccion) => void;
}) {
  const [base, setBase] = useState<BorradorDelDte | undefined>(
    inicial.borrador,
  );
  const [pedida, setPedida] = useState<DtePedido>(inicial.pedida);
  const [armando, setArmando] = useState(false);
  const preparacion = inicial.preparacion;
  const factura = pedida.tipo === 33;
  const poner = (cambios: Partial<DtePedido>) =>
    setPedida((p) => ({ ...p, ...cambios }));

  // La revisión del motor, cuando se deja de escribir (la misma que emite).
  const quieta = useQuieto(pedida);
  const sinCambios = quieta === inicial.pedida;
  const revision = useQuery({
    queryKey: ["facturacion", "corregir", quotationId, quieta],
    queryFn: () => revisarDte(quotationId, quieta),
    enabled: !sinCambios,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  // Mientras el motor revisa lo cambiado, la de BelIA (no se puede aprobar
  // hasta que llegue la nueva).
  const vista =
    !sinCambios && revision.data
      ? revision.data
      : !sinCambios && base
        ? base.vista
        : inicial.vista;
  const revisando =
    armando || pedida !== quieta || (!sinCambios && revision.isFetching);

  // Cada cambio sube a la ventana, con su revisión.
  const subir = useRef(onCambio);
  subir.current = onCambio;
  useEffect(() => {
    subir.current({
      dte: {
        tipo: quieta.tipo,
        pedida: quieta,
        vista,
        preparacion,
        borrador: base,
      },
      listo: !revisando && vista.ok,
    });
  }, [quieta, vista, revisando, preparacion, base]);

  /** Otro tipo u otra fuente: BelIA arma de nuevo, y se conservan la fecha
   *  y la condición de pago elegidas. */
  const rearmar = async (tipo: TipoDeDte, ocId: number | null) => {
    setArmando(true);
    try {
      const nuevo = await armarBorradorDeDte(quotationId, tipo, ocId);
      setBase(nuevo);
      setPedida((p) => ({
        ...nuevo.pedida,
        fecha_emision: tipo === 33 ? (p.fecha_emision ?? null) : null,
        ...(tipo === 33
          ? { forma_de_pago: p.forma_de_pago, plazo_dias: p.plazo_dias }
          : {}),
      }));
    } catch (error) {
      toast.error(humanizeApiError(error, "BelIA no pudo armar el DTE."));
    } finally {
      setArmando(false);
    }
  };

  const ocs = factura
    ? (preparacion?.ocs ?? []).filter(
        (o) => o.facturado < o.total || o.id === pedida.orden_de_compra_id,
      )
    : [];
  const fuentes = [
    ...ocs.map((o) => ({ valor: String(o.id), etiqueta: `OC N° ${o.numero}` })),
    {
      valor: COTIZACION,
      etiqueta: `Cotización N° ${preparacion?.evento.numero ?? ""}`.trim(),
    },
  ];
  const razones = base?.razones ?? [];
  const conLista =
    factura &&
    !pedida.orden_de_compra_id &&
    (razones.length > 1 ||
      (razones.length === 1 && base?.origenes.receptor === "persona"));
  const razonElegida =
    razones.find((z) => z.rut === pedida.receptor.rut)?.rut ?? OTRA;
  const elegirRazon = (rut: string) => {
    const z = razones.find((x) => x.rut === rut);
    setPedida((p) => ({
      ...p,
      receptor: z ? delBorrador(z) : RECEPTOR_VACIO,
      // Las referencias que pide la razón social elegida.
      referencias: (z?.referencias_exigidas ?? []).map(
        (c) =>
          p.referencias.find((x) => x.tipo === c) ?? {
            tipo: c,
            folio: "",
            fecha: "",
          },
      ),
      pedir_siempre: [...(z?.referencias_exigidas ?? [])],
    }));
  };
  const faltan = vista.faltan.map((f) => f.campo);

  return (
    <div className="space-y-3">
      {armando && (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está armando el documento…
        </p>
      )}
      <SeccionDocumento
        pedida={pedida}
        vista={vista}
        onChange={poner}
        onTipo={(t) => void rearmar(t, t === 33 ? (ocs[0]?.id ?? null) : null)}
        fuentes={factura ? fuentes : undefined}
        fuente={fuenteDe(pedida.orden_de_compra_id)}
        onFuente={(v) => void rearmar(33, v === COTIZACION ? null : Number(v))}
      />

      <Seccion titulo="Destinatario">
        {factura ? (
          <div className="space-y-3">
            {conLista && (
              <div
                role="group"
                aria-label="Razón social del cliente"
                className="block sm:max-w-md"
              >
                <span className={claseTitulo}>Razón social del cliente</span>
                <SelectWithSearch
                  options={[
                    ...razones.map((z) => ({
                      value: z.rut,
                      label: `${z.razon_social} · ${formatearRut(z.rut)}`,
                      buscar: z.rut,
                    })),
                    { value: OTRA, label: "Otra razón social" },
                  ]}
                  value={razonElegida}
                  onChange={(v) => v && elegirRazon(v)}
                  searchPlaceholder="Buscar por nombre o RUT..."
                  tamano="sm"
                  sinLimpiar
                  mostrarConteo={false}
                />
              </div>
            )}
            <CamposDelReceptor
              receptor={pedida.receptor}
              faltan={faltan}
              onChange={(campo, valor) =>
                setPedida((p) => ({
                  ...p,
                  receptor: { ...p.receptor, [campo]: valor },
                }))
              }
              onLlenar={(datos) =>
                setPedida((p) => ({
                  ...p,
                  receptor: { ...p.receptor, ...datos },
                }))
              }
            />
          </div>
        ) : (
          <Casilla
            etiqueta="Correo del cliente (facturacion.cl le manda la boleta)"
            valor={pedida.receptor.correo}
            onChange={(v) =>
              setPedida((p) => ({
                ...p,
                receptor: { ...p.receptor, correo: v },
              }))
            }
          />
        )}
      </Seccion>

      <Seccion titulo="Ítems">
        <LineasDelDte
          lineas={pedida.lineas}
          montos={vista.montos}
          onChange={(lineas) => poner({ lineas })}
          sinMarco
          conDescuento={factura}
        />
      </Seccion>

      {factura && (
        <Seccion titulo="Referencias">
          {pedida.referencias.length === 0 && (
            <p className="text-xs text-gray-500">Sin referencias.</p>
          )}
          <ReferenciasDelDte
            referencias={pedida.referencias}
            onChange={(referencias) => poner({ referencias })}
          />
        </Seccion>
      )}

      <Seccion titulo="Totales">
        <div className="flex justify-end">
          <TotalesDelDte montos={vista.montos} />
        </div>
      </Seccion>
    </div>
  );
}
