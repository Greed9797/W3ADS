const APPROVED_TERMS: ReadonlyArray<string> = [
  "approved",
  "aprovado",
  "paid",
  "pago",
  "completed",
  "complete",
  "concluido",
  "finalizado",
  "faturado",
  "entregue",
  "delivered",
  "captured",
  "settled",
  // WBuy post-payment fulfillment states (order is paid once it reaches these).
  "producao",
  "expedicao",
  "separacao",
  "enviado",
  "postado",
  "transito",
  "shipped",
];

const REJECTED_TERMS: ReadonlyArray<string> = [
  "abandoned",
  "cancel",
  "cancelado",
  "canceled",
  "chargeback",
  "declined",
  "denied",
  "devolvido",
  "disputed",
  "estornado",
  "refund",
  "refunded",
  "reembolsado",
  "void",
  "failed",
  "falhou",
  "refused",
  "recusado",
  "unpaid",
  "pending",
  "pendente",
  "aguardando",
  "aberto",
  "authorized",
  "autorizado",
];

const DIACRITICS_RE = /[̀-ͯ]/g;

export function isApprovedOrderStatus(
  status: string | null | undefined,
): boolean {
  const raw = status?.trim();
  if (!raw) {
    // Unknown/empty status is NOT an approved sale. Counting it as approved
    // silently inflated GMV with unprocessed orders. Connectors that genuinely
    // have a confirmed sale must emit an explicit approved term at ingestion
    // (Shopify → financial status, manual commerce → "APPROVED", iSET →
    // "paid"); a bare null must never reach revenue.
    return false;
  }

  const normalized = raw
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase();

  if (REJECTED_TERMS.some((term) => normalized.includes(term))) {
    return false;
  }

  return APPROVED_TERMS.some((term) => normalized.includes(term));
}
