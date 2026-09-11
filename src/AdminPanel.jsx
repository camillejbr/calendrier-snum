import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";

function formatDateTime(iso) {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminPanel({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) {
        setError("Impossible de charger la liste des utilisateurs.");
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-panel-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43, 42, 40, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        zIndex: 100,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 24,
          maxWidth: 520,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2
            id="admin-panel-title"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, margin: 0 }}
          >
            Utilisateurs
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "#6B6862",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <p style={{ color: "#6B6862", fontSize: 13, margin: "0 0 18px" }}>
          {users.length} compte{users.length > 1 ? "s" : ""} enregistré{users.length > 1 ? "s" : ""}.
        </p>

        {loading && <p style={{ color: "#6B6862", fontSize: 14 }}>Chargement…</p>}
        {error && (
          <p role="alert" style={{ color: "#9C3B3B", fontSize: 13 }}>
            {error}
          </p>
        )}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #EDE8DA",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 14, color: "#2B2A28", fontWeight: 500 }}>{u.email}</span>
                <span style={{ fontSize: 12, color: "#8A8676" }}>
                  Dernière connexion : {formatDateTime(u.last_sign_in_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
