import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";
import AccessGate from "./AccessGate.jsx";
import TeamCalendar from "./TeamCalendar.jsx";
import Footer from "./Footer.jsx";

// Le mot de passe d'accès validé est gardé le temps de l'onglet (sessionStorage) : il sert
// à l'inscription, où la base le revérifie. Ne concerne que les visiteurs non connectés.
const ACCESS_KEY = "snum-access-code";

// Chargées à la demande (texte long, rarement ouvert) pour ne pas alourdir le chargement initial.
const LegalPage = lazy(() => import("./LegalPages.jsx"));

// Pages légales : publiques (accessibles sans être connecté, même avant la page d'entrée).
const LEGAL_ROUTES = {
  "#/mentions-legales": "mentions",
  "#/confidentialite": "confidentialite",
  "#/accessibilite": "accessibilite",
};

function legalPageFromHash() {
  return LEGAL_ROUTES[window.location.hash] || null;
}

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
  const [legalPage, setLegalPage] = useState(legalPageFromHash);

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
    function onHashChange() {
      setLegalPage(legalPageFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function closeLegal() {
    window.history.pushState(null, "", window.location.pathname + window.location.search);
    setLegalPage(null);
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

  function renderMain() {
    if (legalPage) {
      return (
        <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center", color: "#6B6862", fontFamily: "'Inter', sans-serif" }}>Chargement…</div>}>
          <LegalPage page={legalPage} onBack={closeLegal} />
        </Suspense>
      );
    }

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

  return (
    <>
      {renderMain()}
      <Footer />
    </>
  );
}
