/** One product's current on-hand stock, normalized across store APIs. */
export type InventoryRow = {
  externalProductId: string;
  sku: string | null;
  productName: string;
  quantity: number;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

/**
 * Resolve an integer stock quantity from a heterogeneous payload. Loja
 * Integrada exposes on-hand stock under different shapes depending on store
 * config (a flat number, a nested `estoque.quantidade`, a `gerenciar_estoque`
 * object, etc.), so we probe the common keys and coerce to a non-negative int.
 * ponytail: covers the documented LI shapes; if a store gates stock behind the
 * separate /produto_estoque/ resource this returns 0 — add that fetch as the
 * upgrade path rather than guessing more keys here.
 */
function resolveQuantity(payload: Record<string, unknown>): number {
  const direct =
    payload.quantidade ??
    payload.quantidade_estoque ??
    payload.estoque_quantidade ??
    payload.saldo ??
    payload.stock ??
    payload.inventory_quantity;
  const fromNested = (() => {
    const nested = payload.estoque ?? payload.gerenciar_estoque;
    if (typeof nested === "number") return nested;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const obj = nested as Record<string, unknown>;
      return obj.quantidade ?? obj.saldo ?? obj.disponivel ?? null;
    }
    return null;
  })();

  const raw = direct ?? fromNested;
  const num =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw.replace(/[^\d.-]/g, ""))
        : NaN;
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

/**
 * Loja Integrada /produto/search/ object → InventoryRow. Returns null when the
 * product has no usable id+name (can't be matched/keyed).
 */
export function normalizeLojaIntegradaInventory(
  payload: Record<string, unknown>,
): InventoryRow | null {
  const externalProductId = firstString(
    payload.id,
    payload.id_produto,
    payload.produto_id,
    payload.codigo,
    payload.sku,
  );
  const productName = firstString(
    payload.nome,
    payload.nome_produto,
    payload.name,
    payload.titulo,
  );
  if (!externalProductId || !productName) {
    return null;
  }
  return {
    externalProductId,
    sku: firstString(payload.sku, payload.codigo, payload.referencia),
    productName,
    quantity: resolveQuantity(payload),
  };
}
