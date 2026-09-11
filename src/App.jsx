import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";
import TeamCalendar from "./TeamCalendar.jsx";

export default function App() {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);

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

  if (!session || window.location.hash.includes("type=recovery")) {
    return <Auth />;
  }

  return <TeamCalendar user={session.user} onSignOut={() => supabase.auth.signOut()} />;
}
