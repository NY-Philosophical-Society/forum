"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** /admin has no dashboard of its own — the queue is the landing page. */
export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/reports");
  }, [router]);
  return <p className="meta">Opening the reports queue…</p>;
}
