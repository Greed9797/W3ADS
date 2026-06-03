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
    return true;
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
