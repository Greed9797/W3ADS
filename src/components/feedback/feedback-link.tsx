"use client";

import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

export function FeedbackLink() {
  const pathname = usePathname();
  const href = `/feedback?from=${encodeURIComponent(pathname)}`;

  return (
    <Button asChild variant="secondary">
      <Link href={href}>
        <MessageSquareText aria-hidden className="size-4" />
        Feedback
      </Link>
    </Button>
  );
}
