import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient.js";

function formatDateTime(iso) {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) +
    " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const thStyle = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#8A8676",
  textTransform: "uppercase",
  padding: "0 12px 8px",
  borderBottom: "1px solid #EDE8DA",
};

const tdStyle = {
  padding: "12px",
  fontSize: 14,
  color: "#2B2A28",
  borderBottom: "1px solid #EDE8DA",
};

export default function AdminPage({ currentUserId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) {
      setError("Impossible de charger la liste des utilisateurs.");
    } else {
      setError("");
      setUsers(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  async function confirmDelete(id) {
    setDeleting(true);
    setActionError("");
    const { error } = await supabase.rpc("admin_delete_user", { target_id: id });
    setDeleting(false);
    setConfirmDeleteId(null);
    if (error) {
      setActionError("La suppression n'a pas fonctionné. Réessaie.");
      return;
    }
    setUsers((list) => list.filter((u) => u.id !== id));
  }

  return (
    <main
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "#F7F3EC",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: "2rem",
        color: "#2B2A28",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap');
        button:focus-visible, input:focus-visible {
          outline: 3px solid #4A6FA5;
          outline-offset: 2px;
        }
      `}</style>

      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "#6B6862",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
          fontFamily: "'Inter', sans-serif",
          padding: 0,
          marginBottom: 16,
        }}
      >
        ← Retour au calendrier
      </button>

      <h1
        style={{
          fontFamily: "'Fraunces', serif",
          fontWeight: 600,
          fontSize: 28,
          margin: "0 0 20px",
        }}
      >
        Administration
      </h1>

      <input
        type="text"
        placeholder="Rechercher un email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          maxWidth: 360,
          boxSizing: "border-box",
          padding: "9px 12px",
          fontSize: 14,
          border: "1px solid #D8D3C6",
          borderRadius: 6,
          marginBottom: 20,
          fontFamily: "'Inter', sans-serif",
          display: "block",
        }}
      />

      {actionError && (
        <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 12px" }}>
          {actionError}
        </p>
      )}

      {loading && <p style={{ color: "#6B6862", fontSize: 14 }}>Chargement…</p>}
      {error && (
        <p role="alert" style={{ color: "#9C3B3B", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <div style={{ background: "#FFFFFF", borderRadius: 10, overflow: "hidden", border: "1px solid #EDE8DA" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, paddingTop: 16 }}>Email</th>
                  <th style={{ ...thStyle, paddingTop: 16 }}>Créé le</th>
                  <th style={{ ...thStyle, paddingTop: 16 }}>Dernière connexion</th>
                  <th style={{ ...thStyle, paddingTop: 16 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const confirming = confirmDeleteId === u.id;
                  return (
                    <tr key={u.id}>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>{formatDateTime(u.created_at)}</td>
                      <td style={tdStyle}>{formatDateTime(u.last_sign_in_at)}</td>
                      <td style={tdStyle}>
                        {isSelf ? (
                          <span style={{ fontSize: 12, color: "#B0AB9C" }}>C'est toi</span>
                        ) : confirming ? (
                          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "#9C3B3B" }}>Confirmer ?</span>
                            <button
                              onClick={() => confirmDelete(u.id)}
                              disabled={deleting}
                              style={{
                                padding: "5px 10px",
                                fontSize: 12,
                                fontWeight: 500,
                                background: "#9C3B3B",
                                color: "#FFFFFF",
                                border: "none",
                                borderRadius: 5,
                                cursor: deleting ? "not-allowed" : "pointer",
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              {deleting ? "…" : "Oui, supprimer"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deleting}
                              style={{
                                padding: "5px 10px",
                                fontSize: 12,
                                background: "transparent",
                                color: "#6B6862",
                                border: "1px solid #D8D3C6",
                                borderRadius: 5,
                                cursor: "pointer",
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(u.id)}
                            aria-label={`Supprimer le compte ${u.email}`}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 500,
                              background: "transparent",
                              color: "#9C3B3B",
                              border: "1px solid #E4C4C4",
                              borderRadius: 5,
                              cursor: "pointer",
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#8A8676" }}>
                      Aucun résultat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#8A8676", marginTop: 12 }}>
        {filtered.length} / {users.length} compte{users.length > 1 ? "s" : ""}
      </p>
    </main>
  );
}
