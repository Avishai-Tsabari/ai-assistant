"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setPending(false);
      setError(data.error ?? "Registration failed");
      return;
    }
    const sign = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setPending(false);
    if (sign?.error) {
      setError("Account created but sign-in failed — try signing in.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main>
      <h1>Create account</h1>
      <form className="card" onSubmit={onSubmit}>
        <label>
          <div className="muted">Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label style={{ display: "block", marginTop: "1rem" }}>
          <div className="muted">Password (8+ characters)</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" style={{ marginTop: "1rem" }} disabled={pending}>
          {pending ? "…" : "Sign up"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/signin">Already have an account?</Link>
      </p>
    </main>
  );
}
