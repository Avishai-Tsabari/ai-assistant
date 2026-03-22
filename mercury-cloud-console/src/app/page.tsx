import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Mercury Cloud Console</h1>
      <p className="muted">
        Provision Mercury agents on Hetzner, manage extensions and billing (Phase 2).
      </p>
      <div className="card">
        <p>
          <Link href="/signin">Sign in</Link> · <Link href="/signup">Create account</Link>
        </p>
        <p className="muted" style={{ marginTop: "1rem" }}>
          CLI: <code>bun run provision</code> from repo root — see README.
        </p>
      </div>
    </main>
  );
}
