"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setPending(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main>
      <h1>Sign in</h1>
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
          <div className="muted">Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" style={{ marginTop: "1rem" }} disabled={pending}>
          {pending ? "…" : "Sign in"}
        </button>
      </form>
      <div className="muted" style={{ textAlign: "center", margin: "1rem 0" }}>or</div>
      <button
        type="button"
        className="card"
        style={{ width: "100%", cursor: "pointer" }}
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      >
        Continue with Google
      </button>
      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link href="/">Home</Link> · <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
