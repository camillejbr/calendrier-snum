import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    icon: "🗓️",
    title: "Bienvenue sur l'agenda du SNUM",
    body: () => (
      <>
        Ici, on organise les moments en équipe : <strong>verres</strong>, <strong>activités</strong>,{" "}
        <strong>sport</strong> et <strong>repas</strong>. Ce tutoriel prend une minute.
      </>
    ),
  },
  {
    icon: "👀",
    title: "Voir ce qui est prévu",
    body: () => (
      <>
        Les événements s'affichent en <strong>Liste</strong>, par <strong>Semaine</strong> ou par{" "}
        <strong>Mois</strong>. Les boutons en haut à gauche permettent de changer de vue.
      </>
    ),
  },
  {
    icon: "✨",
    title: "Proposer un événement",
    body: () => (
      <>
        Clique sur <strong>+ Nouvel événement</strong>, choisis un type, une date, une heure et un lieu.
        Tu peux aussi limiter le nombre de places. Il est visible tout de suite par tout le monde.
      </>
    ),
  },
  {
    icon: "🙋",
    title: "Rejoindre un événement",
    body: () => (
      <>
        Clique sur <strong>Je viens</strong> pour t'inscrire, ou sur <strong>Je me désiste</strong> si tu changes
        d'avis. Quand toutes les places sont prises, l'événement affiche <strong>Complet</strong>.
      </>
    ),
  },
  {
    icon: "🍽️",
    title: "Les bonnes adresses",
    body: () => (
      <>
        Le bouton <strong>Bonnes adresses</strong> ouvre une carte autour du bureau : choisis <strong>Valois/BE</strong>{" "}
        ou <strong>La Chapelle</strong> pour calculer les temps de marche depuis le tien. Ajoute un lieu avec ton avis,
        ou donne le tien sur un lieu déjà listé, et filtre par type, prix et temps de marche.
      </>
    ),
  },
  {
    icon: "🔔",
    title: "Les notifications",
    body: () => (
      <>
        Avec <strong>Notifications</strong>, tu choisis les emails que tu veux recevoir : le récap du lundi, les
        nouveaux événements, les inscriptions à tes événements. Rien n'est activé par défaut.
      </>
    ),
  },
  {
    icon: "✅",
    title: "C'est tout !",
    body: (name) => (
      <>
        Les autres te voient sous le nom <strong>{name}</strong>. Tu peux relire ce tutoriel à tout moment avec
        le lien <strong>Tutoriel</strong>, en haut de la page.
      </>
    ),
  },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Tutoriel pas à pas, affiché à la première connexion (et rouvrable depuis le lien « Tutoriel »).
export default function Onboarding({ name, onDone }) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    return () => {
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    if (titleRef.current) titleRef.current.focus();
  }, [step]);

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onDone();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === titleRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const secondaryBtn = {
    padding: "9px 16px",
    fontSize: 14,
    background: "transparent",
    color: "#6B6862",
    border: "1px solid #D8D3C6",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43, 42, 40, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: 24,
          maxWidth: 460,
          width: "100%",
          maxHeight: "100%",
          overflowY: "auto",
          boxSizing: "border-box",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#716D62" }} aria-live="polite">
          Étape {step + 1} sur {STEPS.length}
        </p>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">
          {current.icon}
        </div>
        <h2
          id="onboarding-title"
          ref={titleRef}
          tabIndex={-1}
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22, margin: "0 0 10px", outline: "none" }}
        >
          {current.title}
        </h2>
        <p style={{ color: "#4A4740", fontSize: 15, lineHeight: 1.55, margin: "0 0 20px" }}>{current.body(name)}</p>

        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === step ? "#2B2A28" : "#D8D3C6",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {!isFirst && (
            <button type="button" onClick={() => setStep((s) => s - 1)} style={secondaryBtn}>
              Précédent
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
            style={{
              padding: "9px 20px",
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
            {isLast ? "C'est parti" : "Suivant"}
          </button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={onDone}
            style={{
              marginTop: 14,
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
            Passer le tutoriel
          </button>
        )}
      </div>
    </div>
  );
}
