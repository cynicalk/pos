"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The dashboard restated information the guest had just given and cost an
 * extra tap before any food appeared. Its status strip and menu shortcut now
 * live on the members screen; this route stays as a redirect so old links
 * and back-stacks keep working.
 */
export default function Dashboard() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/members");
  }, [router]);
  return null;
}
