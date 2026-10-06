const linkStyle = {
  color: "#6B6862",
  fontSize: 12.5,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  fontFamily: "'Inter', sans-serif",
};

export const LEGAL_LINKS = [
  { hash: "#/mentions-legales", label: "Mentions légales" },
  { hash: "#/confidentialite", label: "Confidentialité" },
  { hash: "#/accessibilite", label: "Accessibilité" },
];

// Pied de page discret, visible sur toutes les pages (y compris avant connexion).
export default function Footer() {
  return (
    <footer
      style={{
        minHeight: "var(--footer-h)",
        boxSizing: "border-box",
        padding: "0 1rem 1rem",
        background: "#F7F3EC",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <nav aria-label="Informations légales">
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "4px 18px",
          }}
        >
          {LEGAL_LINKS.map((l) => (
            <li key={l.hash}>
              <a href={l.hash} style={linkStyle}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
