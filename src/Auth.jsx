import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";

const REDIRECT_URL = `${window.location.origin}${import.meta.env.BASE_URL}`;

// 12+ chars, at least one lowercase, one uppercase, one digit, one symbol
function passwordError(pw) {
  if (pw.length < 12) return "Le mot de passe doit faire au moins 12 caractères.";
  if (!/[a-z]/.test(pw)) return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[A-Z]/.test(pw)) return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[0-9]/.test(pw)) return "Le mot de passe doit contenir au moins un chiffre.";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) {
    return "Le mot de passe doit contenir au moins un caractère spécial (ex : ! @ # $ %).";
  }
  return null;
}

export const wrapStyle = {
  fontFamily: "'Inter', sans-serif",
  background: "#F7F3EC",
  minHeight: "100dvh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem",
  paddingTop: "12vh",
  boxSizing: "border-box",
};

export const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #D8D3C6",
  borderRadius: 6,
  marginBottom: 12,
  fontFamily: "'Inter', sans-serif",
};

export const labelStyle = {
  display: "block",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 500,
  color: "#4A4740",
  marginBottom: 4,
};

export const primaryBtnStyle = {
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

// Champ mot de passe avec bouton œil pour afficher/masquer ce qu'on tape.
export function PasswordInput({ id, value, onChange, autoComplete, autoFocus = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={value}
        onChange={onChange}
        style={{ ...inputStyle, marginBottom: 0, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "#6B6862",
          cursor: "pointer",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

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

// Les adresses @culture.gouv.fr (et leurs sous-domaines) ne peuvent pas s'inscrire.
// Même règle que le trigger côté base (private.enforce_signup_rules) : ici, c'est pour
// afficher un message clair, la vraie barrière est côté serveur.
const BLOCKED_DOMAIN = /@([a-z0-9-]+\.)*culture\.gouv\.fr$/i;

// Nom affiché : prénom suivi de l'initiale du nom, saisi à l'inscription ("Camille J" ou
// "Camille J." → "Camille J."). Renvoie null si le format n'est pas respecté.
function normalizeDisplayName(raw) {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  const m = cleaned.match(/^(\p{L}[\p{L}'’-]*(?: \p{L}[\p{L}'’-]*)*) (\p{L})\.?$/u);
  if (!m) return null;
  // Majuscule à chaque suite de lettres : "jean-pierre" → "Jean-Pierre", "o'brien" → "O'Brien".
  const prenom = m[1].replace(/\p{L}+/gu, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return `${prenom} ${m[2].toUpperCase()}.`;
}

function isRecoveryLink() {
  return window.location.hash.includes("type=recovery");
}

export default function Auth({ accessCode, onAccessCodeInvalid }) {
  const [mode, setMode] = useState(() => (isRecoveryLink() ? "reset" : "login")); // login | signup | confirm | forgot | reset
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
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
    setCode("");
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
    if (BLOCKED_DOMAIN.test(email.trim())) {
      setError("Les adresses @culture.gouv.fr ne peuvent pas s'inscrire ici.");
      return;
    }
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedName) {
      setError("Indique ton prénom suivi de l'initiale de ton nom, par exemple : Camille J");
      return;
    }
    const pwError = passwordError(password);
    if (pwError) {
      setError(pwError);
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
      options: { data: { access_code: accessCode, display_name: normalizedName } },
    });
    if (error) {
      if (error.message === "User already registered") {
        setBusy(false);
        setError("Un compte existe déjà avec cet email.");
      } else if (error.message === "Database error saving new user") {
        // Le trigger côté base a refusé l'inscription sans dire pourquoi : on regarde si
        // le mot de passe d'accès est toujours valide (il a pu être changé entre-temps).
        const { data: stillValid } = await supabase.rpc("check_access_code", { code: accessCode });
        setBusy(false);
        if (!stillValid) {
          onAccessCodeInvalid();
          return;
        }
        setError("Inscription refusée : cette adresse n'est pas autorisée.");
      } else {
        setBusy(false);
        setError(error.message);
      }
      return;
    }
    setBusy(false);
    setMode("confirm");
    setError("");
    setMessage("");
  }

  async function handleConfirmCode(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes("expired") || error.message.toLowerCase().includes("invalid")
          ? "Code incorrect ou expiré. Vérifie le code ou demande-en un nouveau."
          : error.message
      );
      return;
    }
    // On success, the auth state change is picked up by App.jsx which shows the app.
  }

  async function resendCode() {
    setError("");
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Un nouveau code vient d'être envoyé.");
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
    const pwError = passwordError(password);
    if (pwError) {
      setError(pwError);
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
    confirm: "Vérifie ton email",
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
            Ouvert à toutes les adresses email, sauf <strong style={{ color: "#2B2A28" }}>@culture.gouv.fr</strong>.
          </p>
        )}

        {mode === "confirm" && (
          <p style={{ color: "#6B6862", fontSize: 15, margin: "0 0 24px" }}>
            Un code de confirmation vient d'être envoyé à <strong style={{ color: "#2B2A28" }}>{email}</strong>.
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
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              placeholder="prenom.nom@exemple.fr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <label htmlFor="signup-display-name" style={labelStyle}>Prénom et initiale du nom</label>
            <input
              id="signup-display-name"
              type="text"
              autoComplete="off"
              placeholder="Camille J"
              required
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-describedby="signup-display-name-help"
              style={inputStyle}
            />
            <p id="signup-display-name-help" style={{ margin: "-8px 0 12px", fontSize: 12, color: "#8A8676", textAlign: "left" }}>
              Le nom affiché aux autres, ex : Camille J
            </p>
            <label htmlFor="signup-password" style={labelStyle}>Mot de passe</label>
            <PasswordInput
              id="signup-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p style={{ margin: "-8px 0 12px", fontSize: 12, color: "#8A8676", textAlign: "left" }}>
              12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.
            </p>
            <label htmlFor="signup-password-confirm" style={labelStyle}>Confirmer le mot de passe</label>
            <PasswordInput
              id="signup-password-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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

        {mode === "confirm" && (
          <form onSubmit={handleConfirmCode}>
            <label htmlFor="confirm-code" style={labelStyle}>Code de confirmation</label>
            <input
              id="confirm-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={12}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ ...inputStyle, letterSpacing: 4, fontSize: 20, textAlign: "center" }}
            />
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Vérification…" : "Valider le code"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("login")}>
                Retour à la connexion
              </button>
              <button type="button" style={linkBtnStyle} onClick={resendCode} disabled={busy}>
                Renvoyer le code
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
            <PasswordInput
              id="reset-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p style={{ margin: "-8px 0 12px", fontSize: 12, color: "#8A8676", textAlign: "left" }}>
              12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.
            </p>
            <label htmlFor="reset-password-confirm" style={labelStyle}>Confirmer le mot de passe</label>
            <PasswordInput
              id="reset-password-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
