const APPROVED_TERMS: ReadonlyArray<string> = [
  // Payment received — the canonical "Recebido" and its aliases across all
  // platforms (Nuvemshop "paid", Shopify "PAID", WBuy "Pagamento efetuado",
  // PT-BR "Recebido/Recebida", manual "APPROVED").
  "approved",
  "aprovado",
  "paid",
  "pago",
  "recebid", // recebido / recebida / recebidos / recebidas
  "efetuado", // WBuy "Pagamento efetuado"
  "captured",
  "settled",
  "completed",
  "complete",
  "concluido",
  "finalizado",
  "faturado",
  "entregue", // delivered order is a terminal, paid sale
  "delivered",
];
// NOTE: fulfillment-progress states (producao/expedicao/separacao/enviado/
// postado/transito/transporte/shipped) are intentionally NOT here. Per product
// rule "Recebido = pagamento recebido, nada a ver com entrega", a fulfillment
// state does not by itself confirm payment — connectors must emit an explicit
// payment term at ingestion. Counting "em separação" as paid inflated GMV.

const REJECTED_TERMS: ReadonlyArray<string> = [
  "abandoned",
  "cancel",
  "cancelado",
  "canceled",
  "chargeback",
  "declined",
  "denied",
  "negado", // WBuy "Pagamento negado"
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

// WBuy only ever advances an order INTO these fulfillment states AFTER payment
// is confirmed (you don't produce/separate/ship an unpaid order), so for WBuy
// they are paid sales — unlike the generic rule, where a fulfillment state does
// not by itself prove payment. Scoped to WBuy via the `provider` argument.
const WBUY_PAID_FULFILLMENT_TERMS: ReadonlyArray<string> = [
  "producao", // Em produção
  "expedicao", // Em expedição
  "separacao", // Em separação
  "transporte",
  "transito",
  "enviado",
  "postado",
  "entrega", // "Saiu para entrega" — out for delivery, post-payment. NOT
  // "retirada" ("disponível para retirada"): the store's own faturamento
  // excludes ready-for-pickup until it's actually collected, so we mirror that.
];

// Legacy rows created before canonical Magazord status codes were persisted can
// still contain the description "Transporte". Keep that compatibility scoped
// to Magazord; new rows use MAGAZORD_STATUS_<code> below.
const MAGAZORD_PAID_FULFILLMENT_TERMS: ReadonlyArray<string> = ["transporte"];

// Magazord's documented lifecycle codes whose labels unambiguously mean an
// approved or post-payment order: approved (4/5), invoiced (6/23), in transit
// or delivered (7/8), payment analysis approved (12), chargeback recovered
// (29). Every other numeric code fails closed until deliberately classified.
const MAGAZORD_APPROVED_STATUS_CODES: ReadonlySet<number> = new Set([
  4, 5, 6, 7, 8, 12, 23, 29,
]);

const DIACRITICS_RE = /[̀-ͯ]/g;

export function isApprovedOrderStatus(
  status: string | null | undefined,
  provider?: string | null,
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

  if (provider === "MAGAZORD") {
    const canonical = /^magazord_status_(\d+)$/.exec(normalized);
    if (canonical) {
      return MAGAZORD_APPROVED_STATUS_CODES.has(Number(canonical[1]));
    }
    if (normalized === "magazord_status_unknown") {
      return false;
    }
  }

  if (REJECTED_TERMS.some((term) => normalized.includes(term))) {
    return false;
  }

  // WBuy: a fulfillment state implies the order was already paid.
  if (
    provider === "WBUY" &&
    WBUY_PAID_FULFILLMENT_TERMS.some((term) => normalized.includes(term))
  ) {
    return true;
  }

  if (
    provider === "MAGAZORD" &&
    MAGAZORD_PAID_FULFILLMENT_TERMS.some((term) => normalized.includes(term))
  ) {
    return true;
  }

  // Levane (Supabase wholesale): an order that exists is a confirmed sale. Its
  // "novo" state is a placed/paid order (not an abandoned cart), so it counts;
  // "concluido" already matches APPROVED_TERMS. Scoped to LEVANE so the generic
  // "new != paid" rule keeps holding for every other provider.
  if (provider === "LEVANE" && normalized.includes("novo")) {
    return true;
  }

  return APPROVED_TERMS.some((term) => normalized.includes(term));
}
