import { useState } from "react";
import FileViewLink from "../../components/FileViewLink";
import { toast } from "../../components/toast/Toast";
import {
  buscarRazonSocial,
  emitirFacturaSinEvento,
  revisarFacturaSinEvento,
  type BorradorDelDte,
  type DocumentoTributario,
  type DtePedido,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { revisarRut } from "../../utils/rut";
import { CasillaDelRut } from "../postventa/facturacion/CasillaDeLaFactura";
import { RECEPTOR_VACIO } from "../postventa/facturacion/datosDeLaFactura";
import { Borrador } from "../postventa/facturacion/EmitirDte";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.21). Felipe, 06-11: *"crearla
// de cero con quizás la misma estructura que tiene (…) facturación de
// postventa"*. Sin evento ni OC. Primero el RUT: si ya es la razón social
// de un cliente, se llena con su ficha (y pide las referencias que ese
// cliente exige); si es nuevo, se escribe. Después, el mismo DTE de
// Post-Venta: las líneas, el receptor y las referencias, «Ver cómo sale» y
// «Emitir factura», que es del administrador (D5).

const LINEA_VACIA = {
  descripcion: "",
  descripcion_larga: null,
  cantidad: 1,
  precio: 0,
};

export default function FacturaNueva({
  puedeEmitir,
  onEmitida,
}: {
  readonly puedeEmitir: boolean;
  readonly onEmitida: () => void;
}) {
  const [rut, setRut] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [inicial, setInicial] = useState<BorradorDelDte | null>(null);
  const [ultima, setUltima] = useState<DocumentoTributario | null>(null);
  const rutValido = !!rut && !revisarRut(rut);

  const seguir = async () => {
    setBuscando(true);
    try {
      const encontrada = await buscarRazonSocial(rut);
      const pedida: DtePedido = {
        tipo: 33,
        orden_de_compra_id: null,
        receptor: encontrada
          ? {
              rut: encontrada.rut,
              razon_social: encontrada.razon_social,
              giro: encontrada.giro,
              direccion: encontrada.direccion,
              comuna: encontrada.comuna,
              ciudad: encontrada.ciudad,
              correo: encontrada.correo_facturacion,
            }
          : { ...RECEPTOR_VACIO, rut },
        lineas: [LINEA_VACIA],
        referencias: (encontrada?.referencias_exigidas ?? []).map((tipo) => ({
          tipo,
          folio: "",
          fecha: "",
        })),
        pedir_siempre: [...(encontrada?.referencias_exigidas ?? [])],
      };
      const vista = await revisarFacturaSinEvento(pedida);
      setUltima(null);
      setInicial({
        pedida,
        origenes: {
          receptor: encontrada ? "ficha" : "persona",
          detalle: "persona",
        },
        leidoDe: [],
        oc: null,
        evento: {
          numero: 0,
          total: 0,
          facturado: 0,
          cliente: encontrada?.cliente ?? null,
        },
        razones: [],
        vista,
      });
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo armar la factura."));
    } finally {
      setBuscando(false);
    }
  };

  if (inicial)
    return (
      <Borrador
        inicial={inicial}
        puedeEmitir={puedeEmitir}
        onEmitido={(doc) => {
          setInicial(null);
          setRut("");
          setUltima(doc);
          onEmitida();
        }}
        revisar={revisarFacturaSinEvento}
        emitir={emitirFacturaSinEvento}
        llave={["nuevo-documento"]}
        titulo="Factura nueva"
        sinFicha
      />
    );

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
      {ultima && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Factura N° {ultima.folio} emitida por $
          {Math.round(ultima.total).toLocaleString("es-CL")}.
          {ultima.pdf_path && (
            <FileViewLink
              url={ultima.pdf_path}
              title={`Factura N° ${ultima.folio}.pdf`}
            />
          )}
        </p>
      )}
      <div className="grid items-end gap-2 sm:grid-cols-[16rem_auto]">
        <CasillaDelRut valor={rut} onChange={setRut} />
        <button
          type="button"
          disabled={!rutValido || buscando}
          onClick={() => void seguir()}
          className="justify-self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Seguir"}
        </button>
      </div>
    </div>
  );
}
