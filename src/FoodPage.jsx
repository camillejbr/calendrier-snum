import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabaseClient.js";

const OFFICE_LAT = 48.8635971;
const OFFICE_LNG = 2.3376992;
const OFFICE_LABEL = "3 rue de Valois (bureau)";

const FOOD_TYPES = {
  restaurant: { label: "Restaurant", icon: "🍽️", color: "#9C3B3B" },
  boulangerie: { label: "Boulangerie", icon: "🥖", color: "#C97A2B" },
  cafe: { label: "Café", icon: "☕", color: "#5B4A8F" },
  bar: { label: "Bar", icon: "🍷", color: "#3F7A5C" },
  autre: { label: "Autre", icon: "📍", color: "#6B6862" },
};

const PRICES = ["€", "€€", "€€€"];

const DISTANCE_OPTIONS = [
  { value: "", label: "Toutes distances" },
  { value: "250", label: "< 250 m" },
  { value: "500", label: "< 500 m" },
  { value: "1000", label: "< 1 km" },
];

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

async function geocodeAddress(query) {
  const delta = 0.05;
  const viewbox = [OFFICE_LNG - delta, OFFICE_LAT + delta, OFFICE_LNG + delta, OFFICE_LAT - delta].join(",");
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
  if (!res.ok) throw new Error("geocode failed");
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
}

function pinIcon(color, emoji, big) {
  const size = big ? 34 : 28;
  return L.divIcon({
    className: "food-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:${big ? 15 : 13}px;">${emoji}</span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const officeIcon = pinIcon("#2B2A28", "🏛️", true);

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  fontSize: 14,
  border: "1px solid #D8D3C6",
  borderRadius: 6,
  fontFamily: "'Inter', sans-serif",
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#4A4740",
  marginBottom: 4,
};

function chipStyle(active, color) {
  return {
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 999,
    border: `1px solid ${active ? color || "#2B2A28" : "#D8D3C6"}`,
    background: active ? color || "#2B2A28" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#2B2A28",
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    whiteSpace: "nowrap",
  };
}

function Stars({ value }) {
  return (
    <span aria-label={`${value} sur 5`} style={{ color: "#C97A2B", fontSize: 13 }}>
      {"★".repeat(value)}
      <span style={{ color: "#D8D3C6" }}>{"★".repeat(5 - value)}</span>
    </span>
  );
}

export default function FoodPage({ user, profileName, isAdmin, onBack }) {
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState([]);
  const [saveError, setSaveError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState("edit"); // edit | confirm
  const [form, setForm] = useState({ name: "", type: "restaurant", address: "", price: "€", rating: 0, comment: "" });
  const [formErr, setFormErr] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoResult, setGeoResult] = useState(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [distanceFilter, setDistanceFilter] = useState("");
  const [sortBy, setSortBy] = useState("distance"); // distance | rating | recent

  async function loadSpots() {
    const { data, error } = await supabase.from("food_spots").select("*").order("created_at", { ascending: false });
    if (!error && data) setSpots(data);
    setLoading(false);
  }

  useEffect(() => {
    loadSpots();
  }, []);

  const withDistance = useMemo(
    () => spots.map((s) => ({ ...s, distance: haversineMeters(OFFICE_LAT, OFFICE_LNG, s.lat, s.lng) })),
    [spots]
  );

  const filtered = useMemo(() => {
    let list = withDistance;
    if (typeFilter) list = list.filter((s) => s.type === typeFilter);
    if (priceFilter) list = list.filter((s) => s.price === priceFilter);
    if (distanceFilter) list = list.filter((s) => s.distance <= Number(distanceFilter));
    list = [...list];
    if (sortBy === "distance") list.sort((a, b) => a.distance - b.distance);
    else if (sortBy === "rating") list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [withDistance, typeFilter, priceFilter, distanceFilter, sortBy]);

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openForm() {
    setShowForm(true);
    setFormStep("edit");
    setForm({ name: "", type: "restaurant", address: "", price: "€", rating: 0, comment: "" });
    setFormErr("");
    setGeoResult(null);
  }

  async function handleLocate(e) {
    e.preventDefault();
    setFormErr("");
    if (!form.name.trim() || !form.address.trim()) {
      setFormErr("Renseigne au moins un nom et une adresse.");
      return;
    }
    if (!form.rating) {
      setFormErr("Choisis une note.");
      return;
    }
    setGeoBusy(true);
    try {
      const result = await geocodeAddress(form.address.trim());
      setGeoBusy(false);
      if (!result) {
        setFormErr("Adresse introuvable. Essaie avec le numéro et la rue (ex : 12 rue de Richelieu).");
        return;
      }
      setGeoResult(result);
      setFormStep("confirm");
    } catch {
      setGeoBusy(false);
      setFormErr("La recherche d'adresse a échoué. Réessaie.");
    }
  }

  async function handleConfirm() {
    if (!geoResult) return;
    const { error } = await supabase.from("food_spots").insert({
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim(),
      lat: geoResult.lat,
      lng: geoResult.lng,
      price: form.price,
      rating: form.rating,
      comment: form.comment.trim() || null,
      host: profileName,
    });
    if (error) {
      console.error(error);
      setFormErr("La sauvegarde n'a pas fonctionné. Réessaie.");
      return;
    }
    setShowForm(false);
    loadSpots();
  }

  async function deleteSpot(id) {
    const { error } = await supabase.from("food_spots").delete().eq("id", id);
    setConfirmDeleteId(null);
    if (error) {
      setSaveError("La suppression n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    loadSpots();
  }

  const confirmDistance = geoResult ? haversineMeters(OFFICE_LAT, OFFICE_LNG, geoResult.lat, geoResult.lng) : null;

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
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 3px solid #4A6FA5;
          outline-offset: 2px;
        }
        .food-marker { background: none; border: none; }
        .leaflet-popup-content { font-family: 'Inter', sans-serif; }
        .filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 28, margin: "0 0 4px" }}>
            Bonnes adresses
          </h1>
          <p style={{ margin: 0, color: "#6B6862", fontSize: 14 }}>Autour du bureau, {OFFICE_LABEL}.</p>
        </div>
        <button
          onClick={openForm}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 500,
            background: "#2B2A28",
            color: "#F7F3EC",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          + Ajouter un lieu
        </button>
      </div>

      {saveError && (
        <div style={{ background: "#F7ECEC", color: "#9C3B3B", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {saveError}
        </div>
      )}

      {showForm && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E4DFD1", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          {formStep === "edit" && (
            <form onSubmit={handleLocate}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="fs-name" style={labelStyle}>Nom</label>
                  <input
                    id="fs-name"
                    type="text"
                    placeholder="ex : Chez Nénesse"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="fs-address" style={labelStyle}>Adresse</label>
                  <input
                    id="fs-address"
                    type="text"
                    placeholder="ex : 17 rue de Saintonge, 75003 Paris"
                    value={form.address}
                    onChange={(e) => updateForm("address", e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label htmlFor="fs-type" style={labelStyle}>Type</label>
                  <select id="fs-type" value={form.type} onChange={(e) => updateForm("type", e.target.value)} style={inputStyle}>
                    {Object.entries(FOOD_TYPES).map(([key, t]) => (
                      <option key={key} value={key}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="fs-price" style={labelStyle}>Prix</label>
                  <select id="fs-price" value={form.price} onChange={(e) => updateForm("price", e.target.value)} style={inputStyle}>
                    {PRICES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Note</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => updateForm("rating", n)}
                        aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                        aria-pressed={form.rating === n}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 24,
                          cursor: "pointer",
                          color: n <= form.rating ? "#C97A2B" : "#D8D3C6",
                          padding: 2,
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="fs-comment" style={labelStyle}>Ton avis (optionnel)</label>
                  <textarea
                    id="fs-comment"
                    rows={3}
                    placeholder="Qu'est-ce que tu recommandes, l'ambiance, le prix…"
                    value={form.comment}
                    onChange={(e) => updateForm("comment", e.target.value)}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </div>
              </div>
              {formErr && <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 12px" }}>{formErr}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={geoBusy}
                  style={{ padding: "9px 16px", fontSize: 14, fontWeight: 500, background: "#2B2A28", color: "#F7F3EC", border: "none", borderRadius: 6, cursor: geoBusy ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif" }}
                >
                  {geoBusy ? "Recherche de l'adresse…" : "Localiser l'adresse"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ padding: "9px 16px", fontSize: 14, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {formStep === "confirm" && geoResult && (
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 14, color: "#2B2A28" }}>
                <strong>Adresse trouvée :</strong> {geoResult.displayName}
              </p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6B6862" }}>
                À {formatDistance(confirmDistance)} du bureau. Si ce n'est pas le bon endroit, corrige l'adresse.
              </p>
              {formErr && <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 12px" }}>{formErr}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleConfirm}
                  style={{ padding: "9px 16px", fontSize: 14, fontWeight: 500, background: "#2B2A28", color: "#F7F3EC", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
                >
                  Confirmer et publier
                </button>
                <button
                  onClick={() => setFormStep("edit")}
                  style={{ padding: "9px 16px", fontSize: 14, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
                >
                  Corriger l'adresse
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="filter-row" style={{ marginBottom: 12 }}>
        <button onClick={() => setTypeFilter("")} style={chipStyle(typeFilter === "")}>Tous types</button>
        {Object.entries(FOOD_TYPES).map(([key, t]) => (
          <button key={key} onClick={() => setTypeFilter(key)} style={chipStyle(typeFilter === key, t.color)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="filter-row" style={{ marginBottom: 16 }}>
        <button onClick={() => setPriceFilter("")} style={chipStyle(priceFilter === "")}>Tous prix</button>
        {PRICES.map((p) => (
          <button key={p} onClick={() => setPriceFilter(p)} style={chipStyle(priceFilter === p)}>{p}</button>
        ))}
        <select value={distanceFilter} onChange={(e) => setDistanceFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {DISTANCE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="distance">Trier : plus proches</option>
          <option value="rating">Trier : mieux notés</option>
          <option value="recent">Trier : plus récents</option>
        </select>
      </div>

      <div style={{ height: 380, borderRadius: 10, overflow: "hidden", border: "1px solid #EDE8DA", marginBottom: 20 }}>
        <MapContainer center={[OFFICE_LAT, OFFICE_LNG]} zoom={15} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[OFFICE_LAT, OFFICE_LNG]} icon={officeIcon}>
            <Popup>{OFFICE_LABEL}</Popup>
          </Marker>
          {filtered.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon((FOOD_TYPES[s.type] || FOOD_TYPES.autre).color, (FOOD_TYPES[s.type] || FOOD_TYPES.autre).icon)}>
              <Popup>
                <strong>{s.name}</strong>
                <br />
                {s.price} · <Stars value={s.rating} /> · {formatDistance(s.distance)}
                {s.comment && <><br />{s.comment}</>}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {loading && <p style={{ color: "#6B6862", fontSize: 14 }}>Chargement…</p>}

      {!loading && (
        <>
          <p style={{ fontSize: 12, color: "#8A8676", margin: "0 0 12px" }}>
            {filtered.length} lieu{filtered.length > 1 ? "x" : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((s) => {
              const t = FOOD_TYPES[s.type] || FOOD_TYPES.autre;
              const canDelete = s.host_id === user.id || isAdmin;
              const confirming = confirmDeleteId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    background: "#FFFFFF",
                    borderLeft: `4px solid ${t.color}`,
                    border: "1px solid #EDE8DA",
                    borderLeftWidth: 4,
                    borderRadius: "0 8px 8px 0",
                    padding: "14px 18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span aria-hidden="true">{t.icon}</span>
                      <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16 }}>{s.name}</span>
                      <Stars value={s.rating} />
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "#6B6862" }}>
                      {s.price} · {formatDistance(s.distance)} du bureau · {s.address} · ajouté par {s.host}
                    </p>
                    {s.comment && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4A4740" }}>{s.comment}</p>}
                  </div>
                  {canDelete && (
                    confirming ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#9C3B3B" }}>Supprimer ?</span>
                        <button onClick={() => deleteSpot(s.id)} style={{ padding: "7px 12px", fontSize: 12, fontWeight: 500, background: "#9C3B3B", color: "#FFFFFF", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Oui</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "7px 12px", fontSize: 12, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Annuler</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(s.id)}
                        aria-label={`Supprimer ${s.name}`}
                        style={{ padding: "8px 10px", fontSize: 13, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    )
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p style={{ textAlign: "center", padding: "32px 0", color: "#6B6862", fontSize: 14 }}>
                Aucun lieu pour ces filtres. Sois le premier à en ajouter un !
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
