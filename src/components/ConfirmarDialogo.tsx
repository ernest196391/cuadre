"use client";

export default function ConfirmarDialogo({
  abierto,
  titulo,
  mensaje,
  etiquetaConfirmar = "Confirmar",
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  etiquetaConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgba(24,24,27,.45)" }}
      onClick={onCancelar}
    >
      <div
        className="tarjeta w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="mb-2 text-lg font-semibold">{titulo}</h3>
        <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {mensaje}
        </p>
        <div className="flex gap-2">
          <button className="boton-secundario flex-1 justify-center" onClick={onCancelar} type="button">
            Cancelar
          </button>
          <button className="boton-primario flex-1" onClick={onConfirmar} type="button">
            {etiquetaConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
