import { useState, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabaseClient.js";

const OFFICE_LAT = 48.8635971;
const OFFICE_LNG = 2.3376992;
const OFFICE_LABEL = "3 rue de Valois (bureau)";

const FOOD_TYPES = {
  italien: { label: "Italien", icon: "🍝", color: "#9C3B3B" },
  bistro: { label: "Bistro", icon: "🍷", color: "#6B4A2B" },
  asiat: { label: "Asiat'", icon: "🍜", color: "#3F7A5C" },
  oriental: { label: "Oriental", icon: "🫓", color: "#C97A2B" },
  boulangerie: { label: "Boulangerie", icon: "🥖", color: "#B8923F" },
  healthy: { label: "Healthy", icon: "🥗", color: "#4A7A4A" },
};

// Fallback purely defensive, for legacy data that predates the current type list.
const FALLBACK_TYPE = { label: "Autre", icon: "📍", color: "#6B6862" };

const WALK_M_PER_MIN = 80; // ~4.8 km/h

const PRICE_OPTIONS = [
  { value: "", label: "Tous prix" },
  { value: "15", label: "≤ 15 €" },
  { value: "25", label: "≤ 25 €" },
  { value: "40", label: "≤ 40 €" },
];

const DISTANCE_OPTIONS = [
  { value: "", label: "Toutes distances" },
  { value: "5", label: "< 5 min à pied" },
  { value: "10", label: "< 10 min à pied" },
  { value: "15", label: "< 15 min à pied" },
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

function normalizeName(str) {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function metersToWalkMinutes(m) {
  return Math.max(1, Math.round(m / WALK_M_PER_MIN));
}

function formatWalkTime(m) {
  return `${metersToWalkMinutes(m)} min à pied`;
}

async function searchAddress(query, limit = 5) {
  const delta = 0.05;
  const viewbox = [OFFICE_LNG - delta, OFFICE_LAT + delta, OFFICE_LNG + delta, OFFICE_LAT - delta].join(",");
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "fr" } });
  if (!res.ok) throw new Error("geocode failed");
  const data = await res.json();
  return data.map((d) => ({ lat: parseFloat(d.lat), lng: parseFloat(d.lon), displayName: d.display_name }));
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

function MapBoundsWatcher({ onChange }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });
  useEffect(() => {
    onChange(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

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

function smallButtonStyle() {
  return { padding: "7px 10px", fontSize: 12, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" };
}

function Stars({ value }) {
  const rounded = Math.round(value);
  return (
    <span aria-label={`${value} sur 5`} style={{ color: "#C97A2B", fontSize: 13 }}>
      {"★".repeat(rounded)}
      <span style={{ color: "#D8D3C6" }}>{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function StarPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          aria-pressed={value === n}
          style={{
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: n <= value ? "#C97A2B" : "#D8D3C6",
            padding: 2,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const emptyPlaceForm = { name: "", type: "italien", address: "", price: "20", rating: 0, comment: "" };
const emptyReviewForm = { price: "20", rating: 0, comment: "" };

export default function FoodPage({ user, profileName, isAdmin, onBack }) {
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [saveError, setSaveError] = useState("");
  const [confirmDeleteSpotId, setConfirmDeleteSpotId] = useState(null);
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState(null);

  // Place form (create a new spot + its first review, or edit an existing spot's info)
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [editingSpotId, setEditingSpotId] = useState(null);
  const [placeForm, setPlaceForm] = useState(emptyPlaceForm);
  const [placeFormErr, setPlaceFormErr] = useState("");
  const [placeSaving, setPlaceSaving] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [geoResult, setGeoResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef(null);

  // Review form (add a review to an existing spot, or edit one's own review)
  const [reviewFormSpotId, setReviewFormSpotId] = useState(null);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [reviewForm, setReviewForm] = useState(emptyReviewForm);
  const [reviewFormErr, setReviewFormErr] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const [typeFilter, setTypeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [distanceFilter, setDistanceFilter] = useState("");
  const [sortBy, setSortBy] = useState("distance"); // distance | rating | recent
  const [mapBounds, setMapBounds] = useState(null);

  async function loadData() {
    const [{ data: spotsData, error: spotsErr }, { data: reviewsData, error: reviewsErr }] = await Promise.all([
      supabase.from("food_spots").select("*"),
      supabase.from("food_reviews").select("*").order("created_at", { ascending: false }),
    ]);
    if (!spotsErr && spotsData) setSpots(spotsData);
    if (!reviewsErr && reviewsData) setReviews(reviewsData);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!placeForm.address.trim() || (geoResult && geoResult.displayName === placeForm.address)) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const results = await searchAddress(placeForm.address.trim());
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
      setSuggestLoading(false);
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeForm.address]);

  const spotsWithReviews = useMemo(() => {
    return spots.map((s) => {
      const spotReviews = reviews
        .filter((r) => r.spot_id === s.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const avgRating = spotReviews.length ? spotReviews.reduce((sum, r) => sum + r.rating, 0) / spotReviews.length : 0;
      const avgPrice = spotReviews.length ? Math.round(spotReviews.reduce((sum, r) => sum + r.price, 0) / spotReviews.length) : 0;
      const distance = haversineMeters(OFFICE_LAT, OFFICE_LNG, s.lat, s.lng);
      return { ...s, reviews: spotReviews, avgRating, avgPrice, distance };
    });
  }, [spots, reviews]);

  const filtered = useMemo(() => {
    let list = spotsWithReviews;
    if (typeFilter) list = list.filter((s) => s.type === typeFilter);
    if (priceFilter) list = list.filter((s) => s.reviews.length > 0 && s.avgPrice <= Number(priceFilter));
    if (distanceFilter) list = list.filter((s) => metersToWalkMinutes(s.distance) < Number(distanceFilter));
    list = [...list];
    if (sortBy === "distance") list.sort((a, b) => a.distance - b.distance);
    else if (sortBy === "rating") list.sort((a, b) => b.avgRating - a.avgRating);
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [spotsWithReviews, typeFilter, priceFilter, distanceFilter, sortBy]);

  // Ce que montre la carte à l'instant T (zoom/déplacement) restreint la liste affichée à gauche.
  const visibleInList = useMemo(() => {
    if (!mapBounds) return filtered;
    return filtered.filter((s) => mapBounds.contains([s.lat, s.lng]));
  }, [filtered, mapBounds]);

  // Lieu existant portant (à peu près) le même nom que celui en train d'être créé, pour prévenir les doublons.
  const duplicateSpot = useMemo(() => {
    if (editingSpotId) return null;
    const norm = normalizeName(placeForm.name);
    if (!norm) return null;
    return spots.find((s) => normalizeName(s.name) === norm) || null;
  }, [placeForm.name, spots, editingSpotId]);

  function updatePlaceForm(field, value) {
    setPlaceForm((f) => ({ ...f, [field]: value }));
    if (field === "name") setConfirmDuplicate(false);
  }

  function openPlaceForm(spot = null) {
    setShowPlaceForm(true);
    setReviewFormSpotId(null);
    setPlaceFormErr("");
    setSuggestions([]);
    if (spot) {
      setEditingSpotId(spot.id);
      setPlaceForm({ name: spot.name, type: spot.type, address: spot.address, price: "20", rating: 0, comment: "" });
      setGeoResult({ lat: spot.lat, lng: spot.lng, displayName: spot.address });
    } else {
      setEditingSpotId(null);
      setPlaceForm(emptyPlaceForm);
      setGeoResult(null);
    }
  }

  function selectSuggestion(s) {
    setPlaceForm((f) => ({ ...f, address: s.displayName }));
    setGeoResult(s);
    setSuggestions([]);
  }

  async function handlePlaceSubmit(e) {
    e.preventDefault();
    setPlaceFormErr("");
    if (!placeForm.name.trim()) {
      setPlaceFormErr("Renseigne un nom.");
      return;
    }
    if (duplicateSpot && !confirmDuplicate) {
      setPlaceFormErr(`"${duplicateSpot.name}" existe déjà (${duplicateSpot.address}). Clique encore sur "Publier" pour créer un doublon quand même, ou ajoute plutôt ton avis à ce lieu depuis la liste.`);
      setConfirmDuplicate(true);
      return;
    }
    if (!geoResult || geoResult.displayName !== placeForm.address) {
      setPlaceFormErr("Choisis une adresse dans la liste de suggestions.");
      return;
    }
    let priceNum = null;
    if (!editingSpotId) {
      if (!placeForm.rating) {
        setPlaceFormErr("Choisis une note.");
        return;
      }
      priceNum = Number(placeForm.price);
      if (!placeForm.price || Number.isNaN(priceNum) || priceNum <= 0) {
        setPlaceFormErr("Renseigne un prix valide.");
        return;
      }
    }
    setPlaceSaving(true);
    const spotPayload = {
      name: placeForm.name.trim(),
      type: placeForm.type,
      address: placeForm.address.trim(),
      lat: geoResult.lat,
      lng: geoResult.lng,
    };
    if (editingSpotId) {
      const { error } = await supabase.from("food_spots").update(spotPayload).eq("id", editingSpotId);
      setPlaceSaving(false);
      if (error) {
        console.error(error);
        setPlaceFormErr("La sauvegarde n'a pas fonctionné. Réessaie.");
        return;
      }
    } else {
      const { data: spot, error: spotError } = await supabase
        .from("food_spots")
        .insert({ ...spotPayload, host: profileName })
        .select()
        .single();
      if (spotError) {
        console.error(spotError);
        setPlaceSaving(false);
        setPlaceFormErr("La sauvegarde n'a pas fonctionné. Réessaie.");
        return;
      }
      const { error: reviewError } = await supabase.from("food_reviews").insert({
        spot_id: spot.id,
        price: priceNum,
        rating: placeForm.rating,
        comment: placeForm.comment.trim() || null,
        host: profileName,
      });
      setPlaceSaving(false);
      if (reviewError) {
        console.error(reviewError);
        setPlaceFormErr("Le lieu a été créé mais ton avis n'a pas pu être enregistré. Réessaie depuis la liste.");
        setShowPlaceForm(false);
        setEditingSpotId(null);
        loadData();
        return;
      }
    }
    setShowPlaceForm(false);
    setEditingSpotId(null);
    loadData();
  }

  async function deleteSpot(id) {
    const { error } = await supabase.from("food_spots").delete().eq("id", id);
    setConfirmDeleteSpotId(null);
    if (error) {
      setSaveError("La suppression n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    loadData();
  }

  function updateReviewForm(field, value) {
    setReviewForm((f) => ({ ...f, [field]: value }));
  }

  function openReviewForm(spotId, existingReview = null) {
    setReviewFormSpotId(spotId);
    setShowPlaceForm(false);
    setReviewFormErr("");
    if (existingReview) {
      setEditingReviewId(existingReview.id);
      setReviewForm({ price: String(existingReview.price), rating: existingReview.rating, comment: existingReview.comment || "" });
    } else {
      setEditingReviewId(null);
      setReviewForm(emptyReviewForm);
    }
  }

  function closeReviewForm() {
    setReviewFormSpotId(null);
    setEditingReviewId(null);
  }

  async function handleReviewSubmit(e) {
    e.preventDefault();
    setReviewFormErr("");
    if (!reviewForm.rating) {
      setReviewFormErr("Choisis une note.");
      return;
    }
    const priceNum = Number(reviewForm.price);
    if (!reviewForm.price || Number.isNaN(priceNum) || priceNum <= 0) {
      setReviewFormErr("Renseigne un prix valide.");
      return;
    }
    setReviewSaving(true);
    const payload = { price: priceNum, rating: reviewForm.rating, comment: reviewForm.comment.trim() || null };
    const { error } = editingReviewId
      ? await supabase.from("food_reviews").update(payload).eq("id", editingReviewId)
      : await supabase.from("food_reviews").insert({ ...payload, spot_id: reviewFormSpotId, host: profileName });
    setReviewSaving(false);
    if (error) {
      console.error(error);
      setReviewFormErr("La sauvegarde n'a pas fonctionné. Réessaie.");
      return;
    }
    closeReviewForm();
    loadData();
  }

  async function deleteReview(id) {
    const { error } = await supabase.from("food_reviews").delete().eq("id", id);
    setConfirmDeleteReviewId(null);
    if (error) {
      setSaveError("La suppression n'a pas fonctionné. Réessaie.");
      return;
    }
    setSaveError("");
    loadData();
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
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 3px solid #4A6FA5;
          outline-offset: 2px;
        }
        .food-marker { background: none; border: none; }
        .leaflet-popup-content { font-family: 'Inter', sans-serif; }
        .filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .address-suggestions { list-style: none; margin: 4px 0 0; padding: 0; border: 1px solid #D8D3C6; border-radius: 6px; overflow: hidden; background: #FFFFFF; }
        .address-suggestions li button { display: block; width: 100%; text-align: left; padding: 9px 12px; font-size: 13px; background: none; border: none; border-bottom: 1px solid #EDE8DA; cursor: pointer; font-family: 'Inter', sans-serif; color: #2B2A28; }
        .address-suggestions li:last-child button { border-bottom: none; }
        .address-suggestions li button:hover { background: #F7F3EC; }
        .review-row { border-top: 1px solid #EDE8DA; padding: 10px 0 0; margin-top: 10px; }
        .food-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 20px; align-items: start; }
        .food-map { position: sticky; top: 20px; height: 560px; border-radius: 10px; overflow: hidden; border: 1px solid #EDE8DA; }
        .food-map .leaflet-tile-pane { filter: grayscale(0.45) sepia(0.12) contrast(0.92) brightness(1.08) saturate(0.85); }
        @media (max-width: 860px) {
          .food-layout { grid-template-columns: 1fr; }
          .food-map { position: static; height: 320px; order: -1; }
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 28, margin: "0 0 4px" }}>
            Bonnes adresses
          </h1>
          <p style={{ margin: 0, color: "#6B6862", fontSize: 14 }}>Autour du bureau, {OFFICE_LABEL}.</p>
        </div>
        <button
          onClick={() => openPlaceForm()}
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

      {showPlaceForm && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E4DFD1", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, margin: "0 0 14px" }}>
            {editingSpotId ? "Modifier le lieu" : "Ajouter un lieu"}
          </h2>
          <form onSubmit={handlePlaceSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="fs-name" style={labelStyle}>Nom</label>
                <input
                  id="fs-name"
                  type="text"
                  placeholder="ex : Chez Nénesse"
                  value={placeForm.name}
                  onChange={(e) => updatePlaceForm("name", e.target.value)}
                  style={inputStyle}
                />
                {duplicateSpot && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9C3B3B" }}>
                    ⚠️ "{duplicateSpot.name}" existe déjà ({duplicateSpot.address}).{" "}
                    <button
                      type="button"
                      onClick={() => openReviewForm(duplicateSpot.id)}
                      style={{ background: "none", border: "none", padding: 0, color: "#9C3B3B", textDecoration: "underline", cursor: "pointer", fontSize: 12, fontFamily: "'Inter', sans-serif" }}
                    >
                      Ajoute plutôt ton avis à ce lieu →
                    </button>
                  </p>
                )}
              </div>
              <div style={{ gridColumn: "1 / -1", position: "relative" }}>
                <label htmlFor="fs-address" style={labelStyle}>Adresse</label>
                <input
                  id="fs-address"
                  type="text"
                  autoComplete="off"
                  placeholder="ex : 17 rue de Saintonge"
                  value={placeForm.address}
                  onChange={(e) => {
                    updatePlaceForm("address", e.target.value);
                    setGeoResult(null);
                  }}
                  style={inputStyle}
                />
                {suggestLoading && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8A8676" }}>Recherche…</p>
                )}
                {suggestions.length > 0 && (
                  <ul className="address-suggestions">
                    {suggestions.map((s, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => selectSuggestion(s)}>{s.displayName}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {geoResult && geoResult.displayName === placeForm.address && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#3F7A5C" }}>
                    ✓ Adresse repérée, à {formatWalkTime(haversineMeters(OFFICE_LAT, OFFICE_LNG, geoResult.lat, geoResult.lng))} du bureau
                  </p>
                )}
              </div>
              <div style={{ gridColumn: editingSpotId ? "1 / -1" : "auto" }}>
                <label htmlFor="fs-type" style={labelStyle}>Type</label>
                <select id="fs-type" value={placeForm.type} onChange={(e) => updatePlaceForm("type", e.target.value)} style={inputStyle}>
                  {Object.entries(FOOD_TYPES).map(([key, t]) => (
                    <option key={key} value={key}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              {!editingSpotId && (
                <>
                  <div>
                    <label htmlFor="fs-price" style={labelStyle}>Prix (€)</label>
                    <input
                      id="fs-price"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="20"
                      value={placeForm.price}
                      onChange={(e) => updatePlaceForm("price", e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Ta note</label>
                    <StarPicker value={placeForm.rating} onChange={(n) => updatePlaceForm("rating", n)} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="fs-comment" style={labelStyle}>Ton avis (optionnel)</label>
                    <textarea
                      id="fs-comment"
                      rows={3}
                      placeholder="Qu'est-ce que tu recommandes, l'ambiance, le prix…"
                      value={placeForm.comment}
                      onChange={(e) => updatePlaceForm("comment", e.target.value)}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </>
              )}
            </div>
            {placeFormErr && <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 12px" }}>{placeFormErr}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                disabled={placeSaving}
                style={{ padding: "9px 16px", fontSize: 14, fontWeight: 500, background: "#2B2A28", color: "#F7F3EC", border: "none", borderRadius: 6, cursor: placeSaving ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif" }}
              >
                {placeSaving ? "Enregistrement…" : editingSpotId ? "Enregistrer les modifications" : "Publier"}
              </button>
              <button
                type="button"
                onClick={() => { setShowPlaceForm(false); setEditingSpotId(null); }}
                style={{ padding: "9px 16px", fontSize: 14, background: "transparent", color: "#6B6862", border: "1px solid #D8D3C6", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}
              >
                Annuler
              </button>
            </div>
          </form>
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
        <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {PRICE_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
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

      <div className="food-layout">
        <div className="food-list">
          {loading && <p style={{ color: "#6B6862", fontSize: 14 }}>Chargement…</p>}

          {!loading && (
            <>
              <p style={{ fontSize: 12, color: "#8A8676", margin: "0 0 12px" }}>
                {visibleInList.length} lieu{visibleInList.length > 1 ? "x" : ""}
                {visibleInList.length !== filtered.length && ` visible${visibleInList.length > 1 ? "s" : ""} sur la carte (sur ${filtered.length} au total)`}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleInList.map((s) => {
              const t = FOOD_TYPES[s.type] || FALLBACK_TYPE;
              const canEditSpot = s.host_id === user.id || isAdmin;
              const confirmingSpotDelete = confirmDeleteSpotId === s.id;
              const myReview = s.reviews.find((r) => r.host_id === user.id);
              const addingReviewHere = reviewFormSpotId === s.id;
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
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span aria-hidden="true">{t.icon}</span>
                        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16 }}>{s.name}</span>
                        {s.reviews.length > 0 ? (
                          <>
                            <Stars value={s.avgRating} />
                            <span style={{ fontSize: 12, color: "#8A8676" }}>({s.avgRating.toFixed(1)})</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: "#8A8676" }}>Pas encore d'avis</span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#6B6862" }}>
                        {s.reviews.length > 0 && <>{s.avgPrice} € · </>}
                        {formatWalkTime(s.distance)} du bureau · {s.address}
                        {s.reviews.length > 0 && <> · {s.reviews.length} avis</>}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!myReview && !addingReviewHere && (
                        <button onClick={() => openReviewForm(s.id)} style={smallButtonStyle()}>
                          + Mon avis
                        </button>
                      )}
                      {canEditSpot && (
                        confirmingSpotDelete ? (
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#9C3B3B" }}>Supprimer le lieu (et ses avis) ?</span>
                            <button onClick={() => deleteSpot(s.id)} style={{ padding: "7px 12px", fontSize: 12, fontWeight: 500, background: "#9C3B3B", color: "#FFFFFF", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Oui</button>
                            <button onClick={() => setConfirmDeleteSpotId(null)} style={smallButtonStyle()}>Annuler</button>
                          </span>
                        ) : (
                          <>
                            <button onClick={() => openPlaceForm(s)} aria-label={`Modifier le lieu ${s.name}`} style={smallButtonStyle()}>✎ Lieu</button>
                            <button onClick={() => setConfirmDeleteSpotId(s.id)} aria-label={`Supprimer le lieu ${s.name}`} style={smallButtonStyle()}>✕ Lieu</button>
                          </>
                        )
                      )}
                    </div>
                  </div>

                  {s.reviews.map((r) => {
                    const canEditReview = r.host_id === user.id || isAdmin;
                    const confirmingReviewDelete = confirmDeleteReviewId === r.id;
                    return (
                      <div key={r.id} className="review-row">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.host}</span>
                              <Stars value={r.rating} />
                              <span style={{ fontSize: 12, color: "#8A8676" }}>{r.price} €</span>
                            </div>
                            {r.comment && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#4A4740" }}>{r.comment}</p>}
                          </div>
                          {canEditReview && (
                            confirmingReviewDelete ? (
                              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "#9C3B3B" }}>Supprimer ?</span>
                                <button onClick={() => deleteReview(r.id)} style={{ padding: "6px 10px", fontSize: 12, fontWeight: 500, background: "#9C3B3B", color: "#FFFFFF", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>Oui</button>
                                <button onClick={() => setConfirmDeleteReviewId(null)} style={smallButtonStyle()}>Annuler</button>
                              </span>
                            ) : (
                              <span style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => openReviewForm(s.id, r)} aria-label={`Modifier l'avis de ${r.host}`} style={smallButtonStyle()}>Modifier</button>
                                <button onClick={() => setConfirmDeleteReviewId(r.id)} aria-label={`Supprimer l'avis de ${r.host}`} style={smallButtonStyle()}>✕</button>
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {addingReviewHere && (
                    <div className="review-row">
                      <form onSubmit={handleReviewSubmit}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                          <div>
                            <label htmlFor="rf-price" style={labelStyle}>Prix (€)</label>
                            <input
                              id="rf-price"
                              type="number"
                              min="1"
                              step="1"
                              value={reviewForm.price}
                              onChange={(e) => updateReviewForm("price", e.target.value)}
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>Ta note</label>
                            <StarPicker value={reviewForm.rating} onChange={(n) => updateReviewForm("rating", n)} />
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label htmlFor="rf-comment" style={labelStyle}>Ton avis (optionnel)</label>
                            <textarea
                              id="rf-comment"
                              rows={2}
                              placeholder="Qu'est-ce que tu recommandes, l'ambiance, le prix…"
                              value={reviewForm.comment}
                              onChange={(e) => updateReviewForm("comment", e.target.value)}
                              style={{ ...inputStyle, resize: "vertical" }}
                            />
                          </div>
                        </div>
                        {reviewFormErr && <p role="alert" style={{ color: "#9C3B3B", fontSize: 13, margin: "0 0 10px" }}>{reviewFormErr}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="submit"
                            disabled={reviewSaving}
                            style={{ padding: "8px 14px", fontSize: 13, fontWeight: 500, background: "#2B2A28", color: "#F7F3EC", border: "none", borderRadius: 6, cursor: reviewSaving ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif" }}
                          >
                            {reviewSaving ? "Enregistrement…" : editingReviewId ? "Enregistrer" : "Publier mon avis"}
                          </button>
                          <button type="button" onClick={closeReviewForm} style={smallButtonStyle()}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p style={{ textAlign: "center", padding: "32px 0", color: "#6B6862", fontSize: 14 }}>
                Aucun lieu pour ces filtres. Sois le premier à en ajouter un !
              </p>
            )}
            {filtered.length > 0 && visibleInList.length === 0 && (
              <p style={{ textAlign: "center", padding: "32px 0", color: "#6B6862", fontSize: 14 }}>
                Aucun lieu visible dans cette zone de la carte. Dézoome ou déplace-toi.
              </p>
            )}
              </div>
            </>
          )}
        </div>

        <div className="food-map">
          <MapContainer center={[OFFICE_LAT, OFFICE_LNG]} zoom={15} style={{ height: "100%", width: "100%" }}>
            <MapBoundsWatcher onChange={setMapBounds} />
            <TileLayer
              attribution='&copy; <a href="https://www.ign.fr">IGN-F/Géoportail</a>'
              url="https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png"
            />
            <Marker position={[OFFICE_LAT, OFFICE_LNG]} icon={officeIcon}>
              <Popup>{OFFICE_LABEL}</Popup>
            </Marker>
            {filtered.map((s) => (
              <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon((FOOD_TYPES[s.type] || FALLBACK_TYPE).color, (FOOD_TYPES[s.type] || FALLBACK_TYPE).icon)}>
                <Popup>
                  <strong>{s.name}</strong>
                  <br />
                  {s.reviews.length > 0 ? (
                    <>
                      {s.avgPrice} € · <Stars value={s.avgRating} /> · {formatWalkTime(s.distance)}
                      <br />
                      {s.reviews.length} avis
                    </>
                  ) : (
                    <>Pas encore d'avis · {formatWalkTime(s.distance)}</>
                  )}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </main>
  );
}
