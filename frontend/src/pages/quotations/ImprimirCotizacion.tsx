import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getHojaParaImprimir } from "../../services/quotations.service";
import { buildQuotationPrintDoc } from "../../utils/quotationPrintDoc";

/**
 * LA HOJA DE IMPRESIÓN (doc 13): la ruta pública que abre el navegador
 * invisible del motor para generar el PDF adjunto de "Enviar
 * cotización". Pinta LA MISMA hoja del visor y del portal
 * (buildQuotationPrintDoc) — por eso el PDF es exactamente lo que se
 * ve en pantalla. Se llega solo con un token firmado de corta vida;
 * vencido o adulterado, el motor responde 404 y aquí no se pinta nada.
 *
 * El motor espera el selector `.qv-hoja` para saber que la hoja está
 * lista antes de imprimir — no renderizar nada con esa clase en los
 * estados de carga o error.
 */
export default function ImprimirCotizacion() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<{ css: string; body: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      return;
    }
    getHojaParaImprimir(token)
      .then((d) => {
        setDoc(buildQuotationPrintDoc(d.quotation, d.empresa, d.menu ?? null));
      })
      .catch(() => setError(true));
  }, [token]);

  if (error) {
    return (
      <p className="p-6 text-sm text-gray-500">
        Este enlace no está disponible.
      </p>
    );
  }
  if (!doc) return null;

  return (
    <>
      <style>{`body{margin:0;background:#ffffff;} .qv-hoja{max-width:820px;margin:0 auto;} ${doc.css}`}</style>
      {/* La hoja llega del MOTOR (lista blanca) y la arma nuestro
          propio buildQuotationPrintDoc, que escapa cada dato. */}
      <div dangerouslySetInnerHTML={{ __html: doc.body }} />
    </>
  );
}
