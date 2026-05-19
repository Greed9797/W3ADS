ALTER TABLE "EcommerceOrder"
  ADD COLUMN "shippingState" TEXT;

CREATE TABLE "EcommerceOrderItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "ecommerceOrderId" TEXT NOT NULL,
  "externalOrderId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sku" TEXT,
  "quantity" INTEGER NOT NULL,
  "total" DECIMAL(14, 2),
  "placedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EcommerceOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EcommerceOrderItem"
  ADD CONSTRAINT "EcommerceOrderItem_ecommerceOrderId_fkey"
  FOREIGN KEY ("ecommerceOrderId") REFERENCES "EcommerceOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EcommerceOrderItem_workspaceId_placedAt_idx"
  ON "EcommerceOrderItem"("workspaceId", "placedAt");

CREATE INDEX "EcommerceOrderItem_connectorAccountId_externalOrderId_idx"
  ON "EcommerceOrderItem"("connectorAccountId", "externalOrderId");

ALTER TABLE "EcommerceOrderItem" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "EcommerceOrderItem" TO authenticated;
GRANT ALL ON "EcommerceOrderItem" TO service_role;

CREATE POLICY "workspace_member_read" ON "EcommerceOrderItem"
  FOR SELECT
  USING (
    "workspaceId" IN (
      SELECT "workspaceId" FROM "Membership"
      WHERE "userId" = auth.uid()::text
    )
  );

CREATE POLICY "workspace_admin_write" ON "EcommerceOrderItem"
  FOR ALL
  USING (
    "workspaceId" IN (
      SELECT "workspaceId" FROM "Membership"
      WHERE "userId" = auth.uid()::text
        AND "role" IN ('OWNER', 'ADMIN')
    )
  );
