import { notFound } from "next/navigation";

import { MarkdownContent } from "@/components/docs/markdown-content";
import { getDoc, listDocs } from "@/lib/docs/loader";

type FaqDocPageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateStaticParams() {
  const groups = await listDocs();
  return groups.flatMap((group) =>
    group.docs
      .filter((doc) => doc.slug.length > 0)
      .map((doc) => ({ slug: doc.slug })),
  );
}

export default async function FaqDocPage({ params }: FaqDocPageProps) {
  const { slug } = await params;
  const doc = await getDoc(slug);

  if (!doc) {
    notFound();
  }

  return (
    <section>
      <p className="text-caption text-[var(--text-tertiary)]">
        FAQ · Documentação
      </p>
      <MarkdownContent source={doc.content} />
    </section>
  );
}
