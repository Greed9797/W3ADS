import { HelpCircle } from "lucide-react";

import { MarkdownContent } from "@/components/docs/markdown-content";
import { getDoc } from "@/lib/docs/loader";

export default async function FaqIndexPage() {
  const doc = await getDoc([]);

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <HelpCircle aria-hidden className="size-6 text-[var(--w3-red)]" />
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">
            Central de ajuda
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            FAQ &amp; Documentação dos Conectores
          </h1>
        </div>
      </div>

      {doc ? (
        <MarkdownContent source={doc.content} />
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Documentação não encontrada. Confira a pasta{" "}
          <code>docs/connectors/</code>.
        </p>
      )}
    </section>
  );
}
