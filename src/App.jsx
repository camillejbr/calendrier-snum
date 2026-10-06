import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";
import AccessGate from "./AccessGate.jsx";
import TeamCalendar from "./TeamCalendar.jsx";

// Le mot de passe d'accès validé est gardé le temps de l'onglet (sessionStorage) : il sert
// à l'inscription, où la base le revérifie. Ne concerne que les visiteurs non connectés.
const ACCESS_KEY = "snum-access-code";

function readStoredAccessCode() {
  try {
    return sessionStorage.getItem(ACCESS_KEY) || "";
  } catch {
    return "";
  }
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [accessCode, setAccessCode] = useState(readStoredAccessCode);

  function passGate(code) {
    try {
      sessionStorage.setItem(ACCESS_KEY, code);
    } catch {
      // Stockage indisponible (navigation privée stricte) : le code reste en mémoire pour cet onglet.
    }
    setAccessCode(code);
  }

  function resetGate() {
    try {
      sessionStorage.removeItem(ACCESS_KEY);
    } catch {
      // rien à nettoyer
    }
    setAccessCode("");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // A password-recovery link signs the user in temporarily so they can
      // set a new password; Auth.jsx handles that screen, so don't jump
      // straight into the app in that case.
      if (event === "PASSWORD_RECOVERY") return;
      setSession(nextSession);
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", padding: "3rem", textAlign: "center", color: "#6B6862" }}>
        Chargement…
      </div>
    );
  }

  const isRecovery = window.location.hash.includes("type=recovery");

  if (!session || isRecovery) {
    if (!accessCode && !isRecovery) {
      return <AccessGate onPass={passGate} />;
    }
    return <Auth accessCode={accessCode} onAccessCodeInvalid={resetGate} />;
  }

  return <TeamCalendar user={session.user} onSignOut={() => supabase.auth.signOut()} />;
}
