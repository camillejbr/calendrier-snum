import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import NotificationSettings from "./NotificationSettings.jsx";
import AdminPage from "./AdminPage.jsx";

const TYPES = {
  verre: { label: "Verre", icon: "🍷", color: "#9C3B3B", bg: "#F7ECEC" },
  activite: { label: "Activité", icon: "🎉", color: "#5B4A8F", bg: "#EFEDF7" },
  sport: { label: "Sport", icon: "🏃", color: "#3F7A5C", bg: "#EAF2ED" },
  repas: { label: "Repas", icon: "🍽️", color: "#C97A2B", bg: "#FBF0E3" },
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function rowToEvent(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    time: row.time,
    location: row.location || "",
    description: row.description || "",
    maxAttendees: row.max_attendees,
    price: row.price,
    host: row.host,
    attendees: row.attendees || [],
  };
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function toISO(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(d, -day);
}

function monthGridDays(refDate) {
  const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const start = startOfWeek(firstOfMonth);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  return days;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Emails follow prenom.nom@culture.gouv.fr or prenom.nom.ext@culture.gouv.fr
// (the optional 3rd segment disambiguates homonyms) — display "Prénom N."
function displayNameFromEmail(email) {
  const local = email.split("@")[0];
  const [prenom, nom] = local.split(".");
  const formattedPrenom = (prenom || local)
    .split("-")
    .map(capitalize)
    .join("-");
  return nom ? `${formattedPrenom} ${nom.charAt(0).toUpperCase()}.` : formattedPrenom;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const full = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  if (diffDays === 0) return "Aujourd'hui · " + full;
  if (diffDays === 1) return "Demain · " + full;
  return capitalize(weekday) + " " + full;
}

export default function TeamCalendar({ user, onSignOut }) {
  const profileName = displayNameFromEmail(user.email);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [view, setView] = useState("liste"); // liste | semaine | mois
  const [refDate, setRefDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toISO(new Date()));
  const [form, setForm] = useState({
    title: "",
    type: "verre",
    date: "",
    time: "",
    location: "",
    description: "",
    maxAttendees: "",
    price: "",
  });
  const [formErr, setFormErr] = useState("");

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    if (!error && data) setEvents(data.map(rowToEvent));
  }, []);

  useEffect(() => {
    async function load() {
      await loadEvents();
      setLoading(false);
    }
    load();

    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));

    const channel = supabase
      .channel("events-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        loadEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEvents]);

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function addEvent() {
    if (!form.title.trim() || !form.date || !form.time) {
      setFormErr("Ajoute au moins un titre, une date et une heure.");
      return;
    }
    const { error } = await supabase.from("events").insert({
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      time: form.time,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      max_attendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : null,
      price: form.price.trim() ? form.price.trim() : null,
      host: profileName,
      attendees: [profileName],
    });
    if (error) {
      setSaveError("La création n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    setForm({ title: "", type: "verre", date: "", time: "", location: "", description: "", maxAttendees: "", price: "" });
    setFormErr("");
    setShowForm(false);
    loadEvents();
  }

  async function toggleAttendance(eventId) {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const already = ev.attendees.includes(profileName);
    if (!already && ev.maxAttendees && ev.attendees.length >= ev.maxAttendees) {
      return; // full, no change
    }
    const nextAttendees = already
      ? ev.attendees.filter((n) => n !== profileName)
      : [...ev.attendees, profileName];
    const { error } = await supabase.from("events").update({ attendees: nextAttendees }).eq("id", eventId);
    if (error) {
      setSaveError("La sauvegarde n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    loadEvents();
  }

  async function deleteEvent(eventId) {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    setConfirmDeleteId(null);
    if (error) {
      setSaveError("La suppression n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    loadEvents();
  }

  function goToday() {
    const now = new Date();
    setRefDate(now);
    setSelectedDate(toISO(now));
  }

  function goPrev() {
    setRefDate((d) => (view === "mois" ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : addDays(d, -7)));
  }

  function goNext() {
    setRefDate((d) => (view === "mois" ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : addDays(d, 7)));
  }

  if (showAdminPanel) {
    return <AdminPage currentUserId={user.id} onBack={() => setShowAdminPanel(false)} />;
  }

  if (loading) {
    return (
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          background: "#F7F3EC",
          minHeight: "100dvh",
          boxSizing: "border-box",
          padding: "3rem",
          textAlign: "center",
          color: "#6B6862",
        }}
      >
        Chargement de l'agenda…
      </div>
    );
  }

  // Lookup by date, used by week/month views
  const eventsByDate = {};
  events.forEach((ev) => {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  });
  Object.values(eventsByDate).forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));

  // Chronological grouping, used by the list view
  const sorted = [...events].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const grouped = [];
  for (const ev of sorted) {
    const last = grouped[grouped.length - 1];
    if (last && last.date === ev.date) last.items.push(ev);
    else grouped.push({ date: ev.date, items: [ev] });
  }

  const todayISO = toISO(new Date());
  const monthLabel = capitalize(refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  const weekStart = startOfWeek(refDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel =
    weekDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) +
    " – " +
    weekDays[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  function renderEventCard(ev) {
    const t = TYPES[ev.type] || TYPES.verre;
    const going = ev.attendees.includes(profileName);
    const isHost = ev.host === profileName;
    const isFull = ev.maxAttendees && ev.attendees.length >= ev.maxAttendees && !going;
    return (
      <div
        key={ev.id}
        style={{
          background: "#FFFFFF",
          borderLeft: `4px solid ${t.color}`,
          borderTop: "1px solid #EDE8DA",
          borderRight: "1px solid #EDE8DA",
          borderBottom: "1px solid #EDE8DA",
          borderRadius: "0 8px 8px 0",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span aria-hidden="true" style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>
              {ev.title}
            </span>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Catégorie : {t.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#6B6862" }}>
            {ev.time.slice(0, 5)}
            {ev.location ? " · " + ev.location : ""} · organisé par {ev.host}
            {ev.maxAttendees ? ` · ${ev.attendees.length}/${ev.maxAttendees} places` : ""}
            {ev.price != null ? ` · ${ev.price}` : ""}
          </p>
          {ev.description && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4A4740" }}>{ev.description}</p>
          )}
          {ev.attendees.length > 0 ? (
            <ul
              aria-label="Participants inscrits"
              style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", padding: 0, listStyle: "none" }}
            >
              {ev.attendees.map((name) => (
                <li
                  key={name}
                  style={{
                    background: t.bg,
                    color: t.color,
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 999,
                    padding: "4px 10px",
                  }}
                >
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12, color: "#6B6862", margin: "8px 0 0" }}>
              Personne inscrit pour le moment
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => !isFull && toggleAttendance(ev.id)}
            disabled={isFull}
            aria-label={
              isFull
                ? `${ev.title}, événement complet`
                : going
                  ? `Se désister de ${ev.title}`
                  : `S'inscrire à ${ev.title}`
            }
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: isFull ? "#EDE8DA" : going ? "#EAE6DA" : t.color,
              color: isFull ? "#6B6862" : going ? "#2B2A28" : "#FFFFFF",
              border: "none",
              borderRadius: 6,
              cursor: isFull ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {isFull ? "Complet" : going ? "Je me désiste" : "Je viens"}
          </button>
          {(isHost || isAdmin) && (
            confirmDeleteId === ev.id ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#9C3B3B" }}>Supprimer ?</span>
                <button
                  onClick={() => deleteEvent(ev.id)}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    background: "#9C3B3B",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Oui
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    background: "transparent",
                    color: "#6B6862",
                    border: "1px solid #D8D3C6",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(ev.id)}
                aria-label={`Supprimer l'événement ${ev.title}`}
                style={{
                  padding: "8px 10px",
                  fontSize: 13,
                  background: "transparent",
                  color: "#6B6862",
                  border: "1px solid #D8D3C6",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  function renderCompactCard(ev) {
    const t = TYPES[ev.type] || TYPES.verre;
    const going = ev.attendees.includes(profileName);
    const isFull = ev.maxAttendees && ev.attendees.length >= ev.maxAttendees && !going;
    return (
      <div
        key={ev.id}
        style={{
          background: "#FFFFFF",
          borderLeft: `3px solid ${t.color}`,
          border: "1px solid #EDE8DA",
          borderLeftWidth: 3,
          borderRadius: "0 6px 6px 0",
          padding: "8px 10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span aria-hidden="true" style={{ fontSize: 12 }}>{t.icon}</span>
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{ev.title}</span>
        </div>
        <p style={{ margin: 0, color: "#6B6862", fontSize: 11 }}>
          {ev.time.slice(0, 5)}{ev.location ? " · " + ev.location : ""}{ev.price != null ? " · " + ev.price : ""}
        </p>
        <button
          onClick={() => !isFull && toggleAttendance(ev.id)}
          disabled={isFull}
          aria-label={
            isFull ? `${ev.title}, événement complet` : going ? `Se désister de ${ev.title}` : `S'inscrire à ${ev.title}`
          }
          style={{
            marginTop: 6,
            width: "100%",
            fontSize: 11,
            padding: "4px 6px",
            background: isFull ? "#EDE8DA" : going ? "#EAE6DA" : t.color,
            color: isFull ? "#6B6862" : going ? "#2B2A28" : "#FFFFFF",
            border: "none",
            borderRadius: 4,
            cursor: isFull ? "not-allowed" : "pointer",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isFull ? "Complet" : going ? "Inscrit ✓" : "Je viens"}
        </button>
      </div>
    );
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
        button:focus-visible, input:focus-visible, select:focus-visible {
          outline: 3px solid #4A6FA5;
          outline-offset: 2px;
        }
        .week-day-header {
          text-align: center;
        }
        @media (max-width: 520px) {
          .header-actions {
            flex-direction: column;
            width: 100%;
          }
          .header-actions button {
            width: 100%;
          }
          .week-grid {
            display: flex !important;
            flex-direction: column;
            overflow-x: visible !important;
          }
          .week-day-header {
            display: flex;
            align-items: center;
            gap: 8px;
            text-align: left;
          }
        }
      `}</style>

      {showNotifSettings && (
        <NotificationSettings user={user} onClose={() => setShowNotifSettings(false)} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1
            style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 600,
              fontSize: 30,
              margin: "0 0 4px",
            }}
          >
            L'agenda du SNUM
          </h1>
          <p style={{ margin: 0, color: "#6B6862", fontSize: 14 }}>
            Connecté comme <strong style={{ color: "#2B2A28" }}>{profileName}</strong>
            {" · "}
            <button
              onClick={onSignOut}
              style={{
                background: "none",
                border: "none",
                color: "#6B6862",
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "'Inter', sans-serif",
                padding: 0,
              }}
            >
              Se déconnecter
            </button>
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <button
              onClick={() => setShowAdminPanel(true)}
              aria-haspopup="dialog"
              style={{
                height: 40,
                boxSizing: "border-box",
                padding: "0 14px",
                fontSize: 14,
                fontWeight: 500,
                background: "#FFFFFF",
                color: "#2B2A28",
                border: "none",
                boxShadow: "0 0 0 1px #D8D3C6",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              ⚙️ Admin
            </button>
          )}
          <button
            onClick={() => setShowNotifSettings(true)}
            aria-haspopup="dialog"
            style={{
              height: 40,
              boxSizing: "border-box",
              padding: "0 14px",
              fontSize: 14,
              fontWeight: 500,
              background: "#FFFFFF",
              color: "#2B2A28",
              border: "none",
              boxShadow: "0 0 0 1px #D8D3C6",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            🔔 Notifications
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            aria-expanded={showForm}
            style={{
              height: 40,
              boxSizing: "border-box",
              padding: "0 18px",
              fontSize: 14,
              fontWeight: 500,
              background: showForm ? "#EAE6DA" : "#2B2A28",
              color: showForm ? "#2B2A28" : "#F7F3EC",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {showForm ? "Annuler" : "+ Nouvel événement"}
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Vue de l'agenda" style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["liste", "Liste"], ["semaine", "Semaine"], ["mois", "Mois"]].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid #D8D3C6",
              background: view === key ? "#2B2A28" : "#FFFFFF",
              color: view === key ? "#F7F3EC" : "#2B2A28",
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="alert" aria-live="polite">
        {saveError && (
          <div style={{ background: "#F7ECEC", color: "#9C3B3B", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {saveError}
          </div>
        )}
      </div>

      {showForm && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E4DFD1",
            borderRadius: 10,
            padding: "20px",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="f-title" style={labelStyle}>Titre</label>
              <input
                id="f-title"
                type="text"
                placeholder="ex : Verre au Comptoir"
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div>
              <label htmlFor="f-type" style={labelStyle}>Catégorie</label>
              <select
                id="f-type"
                value={form.type}
                onChange={(e) => updateForm("type", e.target.value)}
                style={inputStyle()}
              >
                {Object.entries(TYPES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-location" style={labelStyle}>Lieu (optionnel)</label>
              <input
                id="f-location"
                type="text"
                value={form.location}
                onChange={(e) => updateForm("location", e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="f-description" style={labelStyle}>Description (optionnel)</label>
              <textarea
                id="f-description"
                rows={3}
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                placeholder="Quelques mots pour donner envie de venir…"
                style={{ ...inputStyle(), resize: "vertical", fontFamily: "'Inter', sans-serif" }}
              />
            </div>
            <div>
              <label htmlFor="f-date" style={labelStyle}>Date</label>
              <input
                id="f-date"
                type="date"
                value={form.date}
                onChange={(e) => updateForm("date", e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div>
              <label htmlFor="f-time" style={labelStyle}>Heure</label>
              <input
                id="f-time"
                type="time"
                value={form.time}
                onChange={(e) => updateForm("time", e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div>
              <label htmlFor="f-max" style={labelStyle}>Nombre de places max (optionnel)</label>
              <input
                id="f-max"
                type="number"
                min="1"
                value={form.maxAttendees}
                onChange={(e) => updateForm("maxAttendees", e.target.value)}
                style={inputStyle()}
              />
            </div>
            <div>
              <label htmlFor="f-price" style={labelStyle}>Prix par personne (optionnel)</label>
              <input
                id="f-price"
                type="text"
                placeholder="ex : 12€ ou Gratuit"
                value={form.price}
                onChange={(e) => updateForm("price", e.target.value)}
                style={inputStyle()}
              />
            </div>
          </div>
          {formErr && (
            <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 12px" }}>{formErr}</p>
          )}
          <button
            onClick={addEvent}
            style={{
              padding: "9px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: "#2B2A28",
              color: "#F7F3EC",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Créer l'événement
          </button>
        </div>
      )}

      {view === "liste" && (
        <>
          {grouped.length === 0 && (
            <p style={{ textAlign: "center", padding: "48px 0", color: "#6B6862", fontSize: 15 }}>
              Aucun événement pour l'instant. Lance le premier verre, activité ou repas !
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {grouped.map((group) => (
              <section key={group.date} aria-labelledby={`date-${group.date}`}>
                <h2
                  id={`date-${group.date}`}
                  style={{ fontSize: 13, fontWeight: 600, color: "#6B6862", margin: "0 0 10px" }}
                >
                  {formatDateLabel(group.date)}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map(renderEventCard)}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {view === "semaine" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={goPrev} aria-label="Semaine précédente" style={navBtnStyle}>‹</button>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: 0, minWidth: 160, textAlign: "center" }}>
                {weekLabel}
              </h2>
              <button onClick={goNext} aria-label="Semaine suivante" style={navBtnStyle}>›</button>
            </div>
            <button onClick={goToday} style={todayBtnStyle}>Aujourd'hui</button>
          </div>
          <div className="week-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(130px, 1fr))", gap: 10, overflowX: "auto" }}>
            {weekDays.map((day) => {
              const iso = toISO(day);
              const dayEvents = eventsByDate[iso] || [];
              const isToday = iso === todayISO;
              return (
                <div key={iso}>
                  <div className="week-day-header" style={{ marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#8A8676", textTransform: "uppercase" }}>
                      {WEEKDAY_LABELS[(day.getDay() + 6) % 7]}
                    </p>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        fontSize: 13,
                        fontWeight: 600,
                        background: isToday ? "#2B2A28" : "transparent",
                        color: isToday ? "#FFFFFF" : "#2B2A28",
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dayEvents.length === 0 ? (
                      <p style={{ fontSize: 11, color: "#B0AB9C", textAlign: "center", margin: 0 }}>—</p>
                    ) : (
                      dayEvents.map(renderCompactCard)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "mois" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={goPrev} aria-label="Mois précédent" style={navBtnStyle}>‹</button>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: 0, minWidth: 160, textAlign: "center" }}>
                {monthLabel}
              </h2>
              <button onClick={goNext} aria-label="Mois suivant" style={navBtnStyle}>›</button>
            </div>
            <button onClick={goToday} style={todayBtnStyle}>Aujourd'hui</button>
          </div>

          <div
            role="grid"
            aria-label="Calendrier mensuel"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
              background: "#EDE8DA",
              border: "1px solid #EDE8DA",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} style={{ background: "#F7F3EC", padding: "6px 4px", fontSize: 11, fontWeight: 600, color: "#8A8676", textAlign: "center" }}>
                {w}
              </div>
            ))}
            {monthGridDays(refDate).map((day) => {
              const iso = toISO(day);
              const inMonth = day.getMonth() === refDate.getMonth();
              const dayEvents = eventsByDate[iso] || [];
              const isToday = iso === todayISO;
              const isSelected = iso === selectedDate;
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDate(iso)}
                  aria-label={`${day.getDate()} ${day.toLocaleDateString("fr-FR", { month: "long" })}${dayEvents.length ? ", " + dayEvents.length + " événement(s)" : ""}`}
                  aria-pressed={isSelected}
                  style={{
                    background: isSelected ? "#EFEAE0" : "#FFFFFF",
                    border: "none",
                    minHeight: 64,
                    padding: "6px 4px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      color: inMonth ? (isToday ? "#FFFFFF" : "#2B2A28") : "#C7C1B2",
                      background: isToday ? "#2B2A28" : "transparent",
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayEvents.slice(0, 2).map((ev) => {
                      const t = TYPES[ev.type] || TYPES.verre;
                      return (
                        <span
                          key={ev.id}
                          style={{
                            fontSize: 10,
                            background: t.bg,
                            color: t.color,
                            borderRadius: 3,
                            padding: "1px 4px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {ev.title}
                        </span>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <span style={{ fontSize: 10, color: "#8A8676" }}>+{dayEvents.length - 2}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#6B6862", margin: "0 0 10px" }}>
              {formatDateLabel(selectedDate)}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(eventsByDate[selectedDate] || []).length === 0 ? (
                <p style={{ fontSize: 13, color: "#6B6862", margin: 0 }}>Rien de prévu ce jour-là.</p>
              ) : (
                eventsByDate[selectedDate].map(renderEventCard)
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function inputStyle(extra = {}) {
  return {
    padding: "9px 12px",
    fontSize: 14,
    border: "1px solid #D8D3C6",
    borderRadius: 6,
    fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box",
    width: "100%",
    ...extra,
  };
}

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#4A4740",
  marginBottom: 4,
};

const navBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid #D8D3C6",
  background: "#FFFFFF",
  cursor: "pointer",
  fontSize: 16,
  color: "#2B2A28",
};

const todayBtnStyle = {
  padding: "6px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #D8D3C6",
  background: "#FFFFFF",
  cursor: "pointer",
  color: "#2B2A28",
  fontFamily: "'Inter', sans-serif",
};
