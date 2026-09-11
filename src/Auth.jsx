import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";

const REDIRECT_URL = `${window.location.origin}${import.meta.env.BASE_URL}`;

const wrapStyle = {
  fontFamily: "'Inter', sans-serif",
  background: "#F7F3EC",
  minHeight: "480px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #D8D3C6",
  borderRadius: 6,
  marginBottom: 12,
  fontFamily: "'Inter', sans-serif",
};

const labelStyle = {
  display: "block",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 500,
  color: "#4A4740",
  marginBottom: 4,
};

const primaryBtnStyle = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 15,
  fontWeight: 500,
  background: "#2B2A28",
  color: "#F7F3EC",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
};

const linkBtnStyle = {
  background: "none",
  border: "none",
  color: "#4A6FA5",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
  padding: 0,
  textDecoration: "underline",
};

function isRecoveryLink() {
  return window.location.hash.includes("type=recovery");
}

export default function Auth() {
  const [mode, setMode] = useState(() => (isRecoveryLink() ? "reset" : "login")); // login | signup | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        switchMode("reset");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function switchMode(next) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message === "Email not confirmed"
            ? "Ce compte n'est pas encore confirmé — vérifie ta boîte mail."
            : error.message
      );
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim().toLowerCase().endsWith("@culture.gouv.fr")) {
      setError("L'inscription est réservée aux adresses @culture.gouv.fr.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: REDIRECT_URL },
    });
    setBusy(false);
    if (error) {
      if (error.message === "User already registered") {
        setError("Un compte existe déjà avec cet email.");
      } else if (error.message === "Database error saving new user") {
        setError("L'inscription est réservée aux adresses @culture.gouv.fr.");
      } else {
        setError(error.message);
      }
      return;
    }
    switchMode("login");
    setMessage("Compte créé ! Vérifie ta boîte mail et clique sur le lien de confirmation pour activer ton compte.");
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: REDIRECT_URL });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Si un compte existe avec cette adresse, un email vient d'être envoyé pour réinitialiser le mot de passe.");
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setMessage("Mot de passe mis à jour, tu es connecté·e !");
  }

  const titles = {
    login: "L'agenda du SNUM",
    signup: "Créer un compte",
    forgot: "Mot de passe oublié",
    reset: "Nouveau mot de passe",
  };

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
          {titles[mode]}
        </h1>

        {mode === "login" && (
          <p style={{ color: "#6B6862", fontSize: 15, margin: "0 0 24px" }}>
            Connecte-toi pour créer et rejoindre des événements.
          </p>
        )}

        {mode === "signup" && (
          <p style={{ color: "#6B6862", fontSize: 15, margin: "0 0 24px" }}>
            Réservé aux adresses <strong style={{ color: "#2B2A28" }}>@culture.gouv.fr</strong>.
          </p>
        )}

        {message && (
          <div
            role="status"
            style={{ background: "#EAF2ED", color: "#3F7A5C", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, textAlign: "left" }}
          >
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            style={{ background: "#F7ECEC", color: "#9C3B3B", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13, textAlign: "left" }}
          >
            {error}
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin}>
            <label htmlFor="login-email" style={labelStyle}>Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <label htmlFor="login-password" style={labelStyle}>Mot de passe</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Connexion…" : "Se connecter"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("signup")}>
                Créer un compte
              </button>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("forgot")}>
                Mot de passe oublié ?
              </button>
            </div>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={handleSignup}>
            <label htmlFor="signup-email" style={labelStyle}>Email</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="prenom.nom@culture.gouv.fr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <label htmlFor="signup-password" style={labelStyle}>Mot de passe</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <label htmlFor="signup-password-confirm" style={labelStyle}>Confirmer le mot de passe</label>
            <input
              id="signup-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Création…" : "Créer mon compte"}
            </button>
            <div style={{ marginTop: 14 }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("login")}>
                J'ai déjà un compte
              </button>
            </div>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgot}>
            <label htmlFor="forgot-email" style={labelStyle}>Email</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Envoi…" : "Envoyer le lien de réinitialisation"}
            </button>
            <div style={{ marginTop: 14 }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("login")}>
                Retour à la connexion
              </button>
            </div>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={handleReset}>
            <label htmlFor="reset-password" style={labelStyle}>Nouveau mot de passe</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            <label htmlFor="reset-password-confirm" style={labelStyle}>Confirmer le mot de passe</label>
            <input
              id="reset-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
