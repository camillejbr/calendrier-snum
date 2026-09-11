import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";

const OPTIONS = [
  {
    key: "weekly_digest",
    label: "Récap chaque lundi",
    description: "Un email chaque lundi avec les événements de la semaine et ceux ajoutés la semaine précédente.",
  },
  {
    key: "on_publish",
    label: "Nouvel événement",
    description: "Un email dès qu'un événement est publié.",
  },
  {
    key: "on_join",
    label: "Nouvelle inscription",
    description: "Un email dès que quelqu'un participe à un événement que j'ai créé.",
  },
];

export default function NotificationSettings({ user, onClose }) {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({ weekly_digest: false, on_publish: false, on_join: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("weekly_digest, on_publish, on_join")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        setPrefs({ weekly_digest: data.weekly_digest, on_publish: data.on_publish, on_join: data.on_join });
      }
      setLoading(false);
    }
    load();
  }, [user.id]);

  function toggle(key) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      setError("La sauvegarde n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaved(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-settings-title"
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
          maxWidth: 420,
          width: "100%",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2
            id="notif-settings-title"
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, margin: 0 }}
          >
            Notifications par email
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
          Choisis les emails que tu veux recevoir.
        </p>

        {loading ? (
          <p style={{ color: "#6B6862", fontSize: 14 }}>Chargement…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {OPTIONS.map((opt) => (
              <label
                key={opt.key}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  cursor: "pointer",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #EDE8DA",
                }}
              >
                <input
                  type="checkbox"
                  checked={prefs[opt.key]}
                  onChange={() => toggle(opt.key)}
                  style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: "#2B2A28" }}>
                    {opt.label}
                  </span>
                  <span style={{ display: "block", fontSize: 13, color: "#6B6862", marginTop: 2 }}>
                    {opt.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "14px 0 0" }}>
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" style={{ color: "#3F7A5C", fontSize: 13, margin: "14px 0 0" }}>
            Préférences enregistrées.
          </p>
        )}

        <button
          onClick={save}
          disabled={loading || saving}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "10px 14px",
            fontSize: 14,
            fontWeight: 500,
            background: "#2B2A28",
            color: "#F7F3EC",
            border: "none",
            borderRadius: 6,
            cursor: loading || saving ? "not-allowed" : "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
