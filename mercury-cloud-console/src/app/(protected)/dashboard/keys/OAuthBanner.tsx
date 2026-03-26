import type { ProviderMeta } from "@/lib/providers";

type OAuthBannerProps = {
  meta: ProviderMeta;
  onClick: () => void;
};

export function OAuthBanner({ meta, onClick }: OAuthBannerProps) {
  return (
    <div
      style={{
        marginBottom: "0.75rem",
        padding: "0.75rem",
        background: "var(--surface-alt, #f8f8f8)",
        borderRadius: "0.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span className="muted" style={{ fontSize: "0.9rem" }}>
        Have a {meta.label} subscription?
      </span>
      <button type="button" onClick={onClick} style={{ whiteSpace: "nowrap" }}>
        {meta.oauthLabel ?? `Connect via OAuth`}
      </button>
    </div>
  );
}
