import type { ClientTypeItem } from "../../services/clientTypes.service";
import DocumentosDelCliente from "./DocumentosDelCliente";
import TarjetaConvenio, { type ContactoDelCliente } from "./TarjetaConvenio";

// EL CONVENIO Y LOS DOCUMENTOS DEL CLIENTE EN SU FICHA (doc 24). Vive aparte
// para que la ficha (ClientDetailPage, de las grandes) solo la monte.
//
// Solo en los clientes que NO son particulares (el tipo con `es_particular`,
// migración 186; «Particulares» por nombre si el tipo no lo dice). Los ve
// quien tiene la sección Clientes, como la ficha 360; en el motor, enviar,
// subir y borrar es desde vendedor, los mismos cargos de esa sección.
export default function FichaDeConvenio({
  client,
  tipos,
  permisos,
}: {
  readonly client: {
    id: string;
    client_type?: string | null;
    client_contacts?: ContactoDelCliente[];
  };
  readonly tipos: readonly ClientTypeItem[];
  readonly permisos: readonly string[];
}) {
  const tipo = tipos.find((t) => t.name === client.client_type);
  const esParticular =
    tipo?.es_particular ?? client.client_type === "Particulares";
  if (esParticular || !permisos.includes("clientes")) return null;
  return (
    <>
      <TarjetaConvenio
        clientId={client.id}
        contactos={client.client_contacts ?? []}
        puedeEditar
      />
      <DocumentosDelCliente clientId={client.id} puedeEditar />
    </>
  );
}
