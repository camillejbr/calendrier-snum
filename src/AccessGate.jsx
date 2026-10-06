import { useState } from "react";
import { supabase } from "./supabaseClient.js";
import { wrapStyle, labelStyle, primaryBtnStyle, PasswordInput } from "./Auth.jsx";

// Première page : mot de passe commun à tout le monde, vérifié côté base (RPC
// check_access_code, comparaison au hash bcrypt) — jamais stocké ni lisible dans ce code.
export default function AccessGate({ onPass }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const candidate = code.trim();
    const { data, error: rpcError } = await supabase.rpc("check_access_code", { code: candidate });
    setBusy(false);
    if (rpcError) {
      setError("Impossible de vérifier le mot de passe pour le moment. Réessaie dans un instant.");
      return;
    }
    if (!data) {
      setError("Mot de passe incorrect. Après plusieurs essais ratés, patiente quelques minutes avant de réessayer.");
      return;
    }
    onPass(candidate);
  }

  return (
    <div style={wrapStyle}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">
          🗓️
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 600,
            fontSize: 28,
            color: "#2B2A28",
            margin: "0 0 8px",
          }}
        >
          L'agenda du SNUM
        </h1>
        <p style={{ color: "#6B6862", fontSize: 15, margin: "0 0 24px" }}>
          Entre le mot de passe d'accès pour continuer.
        </p>

        {error && (
          <div
            role="alert"
            style={{ background: "#F7ECEC", color: "#9C3B3B", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, textAlign: "left" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="access-code" style={labelStyle}>Mot de passe d'accès</label>
          <PasswordInput
            id="access-code"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" disabled={busy} style={primaryBtnStyle}>
            {busy ? "Vérification…" : "Continuer"}
          </button>
        </form>
      </div>
    </div>
  );
}
