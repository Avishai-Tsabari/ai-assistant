"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SignOutButton from "@/app/(protected)/dashboard/SignOutButton";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/usage", label: "Usage Alerts" },
];

export default function AdminNavLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Admin Console</h1>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link href="/dashboard" className="muted" style={{ fontSize: "0.85rem" }}>
            &larr; Dashboard
          </Link>
          <SignOutButton />
        </div>
      </div>

      <nav
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        {NAV_ITEMS.map(({ href, label }) => {
          const active =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: "0.5rem 1rem",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                color: active ? "var(--accent)" : "var(--muted)",
                textDecoration: "none",
                fontSize: "0.9rem",
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </main>
  );
}
