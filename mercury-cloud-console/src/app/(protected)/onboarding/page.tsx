import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main>
      <h1>Agent onboarding</h1>
      <div className="card">
        <ol style={{ paddingLeft: "1.25rem" }}>
          <li>Create a Hetzner API token and SSH key.</li>
          <li>
            Copy <code>infra/example-provision.request.json</code> and fill secrets.
          </li>
          <li>
            Run <code>bun run provision -- ./your.request.json</code>
          </li>
          <li>
            Open the printed dashboard URL; use <code>MERCURY_API_SECRET</code> as Bearer / cookie.
          </li>
        </ol>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Automated wizard + Stripe checkout will call the same provisioner from API routes (next
          iteration).
        </p>
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  );
}
