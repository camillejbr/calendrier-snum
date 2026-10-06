import { useEffect } from "react";

const EDITOR = "Camille Jouaber";
const CONTACT = "camillejbr@gmail.com";
const REPO_URL = "https://github.com/camillejbr/calendrier-snum";
const UPDATED = "octobre 2026";

const colors = { text: "#4A4740", muted: "#6B6862", link: "#4A6FA5", border: "#E4DFD1" };

const pageStyle = {
  fontFamily: "'Inter', sans-serif",
  background: "#F7F3EC",
  minHeight: "calc(100dvh - var(--footer-h))",
  boxSizing: "border-box",
  padding: "2rem 1.25rem 1rem",
  color: colors.text,
};

const h2Style = { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, margin: "28px 0 8px", color: "#2B2A28" };
const pStyle = { fontSize: 15, lineHeight: 1.65, margin: "0 0 12px" };
const listStyle = { fontSize: 15, lineHeight: 1.65, margin: "0 0 12px", paddingLeft: 22 };
const linkStyle = { color: colors.link, textDecoration: "underline", textUnderlineOffset: 2 };

function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {children}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        {" "}
        (nouvelle fenêtre)
      </span>
    </a>
  );
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} style={linkStyle}>
      {CONTACT}
    </a>
  );
}

function MentionsLegales() {
  return (
    <>
      <h2 style={h2Style}>Éditeur du site</h2>
      <p style={pStyle}>
        L'agenda du SNUM est un <strong>projet personnel, à but non lucratif</strong>, édité par {EDITOR}, personne
        physique. Il n'est pas un service du ministère de la Culture : il n'est ni édité, ni validé, ni hébergé par lui.
      </p>
      <ul style={listStyle}>
        <li>Éditrice et directrice de la publication : {EDITOR}</li>
        <li>
          Contact : <Mail />
        </li>
      </ul>

      <h2 style={h2Style}>Hébergement</h2>
      <ul style={listStyle}>
        <li>
          <strong>Site (pages et code)</strong> : GitHub Pages, service de GitHub, Inc. (88 Colin P. Kelly Jr Street,
          San Francisco, CA 94107, États-Unis) — <Ext href="https://github.com">github.com</Ext>.
        </li>
        <li>
          <strong>Base de données et comptes utilisateurs</strong> : Supabase (
          <Ext href="https://supabase.com">supabase.com</Ext>), sur des serveurs situés à Paris (France).
        </li>
      </ul>

      <h2 style={h2Style}>Code source et droits</h2>
      <p style={pStyle}>
        Le code source est public : <Ext href={REPO_URL}>{REPO_URL.replace("https://", "")}</Ext>.
      </p>
      <p style={pStyle}>Le site utilise des éléments tiers :</p>
      <ul style={listStyle}>
        <li>fonds de carte © IGN (Géoplateforme) et calcul d'itinéraires à pied IGN ;</li>
        <li>recherche d'adresses : données © contributeurs OpenStreetMap, via le service Nominatim ;</li>
        <li>bibliothèque cartographique Leaflet ;</li>
        <li>polices Inter et Fraunces (licence SIL Open Font).</li>
      </ul>

      <h2 style={h2Style}>Contenus publiés par les utilisateurs</h2>
      <p style={pStyle}>
        Les événements, lieux et avis sont publiés par les personnes inscrites, sous leur responsabilité. L'éditrice
        peut supprimer tout contenu inapproprié. Pour en signaler un, écrivez à <Mail />.
      </p>

      <h2 style={h2Style}>Disponibilité</h2>
      <p style={pStyle}>
        Le service est proposé tel quel, sans garantie de disponibilité ni de conservation des données : c'est un
        projet personnel.
      </p>
    </>
  );
}

function Confidentialite() {
  return (
    <>
      <h2 style={h2Style}>Qui est responsable de vos données ?</h2>
      <p style={pStyle}>
        {EDITOR}, à titre personnel (voir les mentions légales). Contact pour toute question ou demande : <Mail />. Il
        n'y a pas de délégué à la protection des données.
      </p>

      <h2 style={h2Style}>Quelles données sont enregistrées ?</h2>
      <ul style={listStyle}>
        <li>
          <strong>Votre compte</strong> : adresse email, mot de passe (enregistré uniquement sous forme chiffrée,
          jamais lisible), nom affiché que vous choisissez (prénom et initiale), dates de création et de dernière
          connexion, et le fait d'avoir vu le tutoriel.
        </li>
        <li>
          <strong>Ce que vous publiez</strong> : événements (titre, type, date, heure, lieu, description, nombre de
          places, prix, nom de l'organisateur), inscriptions (votre nom affiché), lieux et avis (adresse du lieu, prix,
          note, commentaire, votre nom affiché).
        </li>
        <li>
          <strong>Vos préférences de notification</strong> : trois choix, désactivés par défaut.
        </li>
        <li>
          <strong>Données techniques</strong> : adresse IP et date de connexion, conservées dans les journaux de
          sécurité de l'hébergeur et du service de comptes.
        </li>
      </ul>
      <p style={pStyle}>
        Les adresses professionnelles <strong>@culture.gouv.fr</strong> ne peuvent pas être utilisées pour s'inscrire. Le
        mot de passe d'accès commun demandé à l'entrée n'est pas une donnée personnelle ; il est enregistré sous forme
        chiffrée.
      </p>

      <h2 style={h2Style}>Pourquoi, et sur quelle base ?</h2>
      <ul style={listStyle}>
        <li>
          Créer votre compte et faire fonctionner l'agenda : c'est le service que vous demandez en vous inscrivant
          (votre consentement).
        </li>
        <li>
          Vous envoyer des notifications par email : uniquement si vous les activez vous-même (votre consentement), et
          vous pouvez les désactiver à tout moment dans « Notifications ».
        </li>
        <li>
          Assurer la sécurité du service (limiter les inscriptions non autorisées) : intérêt légitime.
        </li>
      </ul>
      <p style={pStyle}>
        Vos données ne sont ni vendues, ni utilisées pour de la publicité ou du profilage. Il n'y a aucun outil de mesure
        d'audience.
      </p>

      <h2 style={h2Style}>Qui voit quoi ?</h2>
      <ul style={listStyle}>
        <li>Les personnes inscrites voient votre nom affiché et ce que vous publiez.</li>
        <li>Votre adresse email n'est visible que de l'administratrice du site et des prestataires techniques ci-dessous.</li>
      </ul>

      <h2 style={h2Style}>Prestataires techniques</h2>
      <ul style={listStyle}>
        <li>
          <strong>GitHub</strong> (États-Unis) : héberge les pages du site. Reçoit l'adresse IP des visiteurs.
        </li>
        <li>
          <strong>Supabase</strong> : base de données et comptes, serveurs à Paris.
        </li>
        <li>
          <strong>Brevo</strong> (société française) : envoi des emails de notification que vous avez activés.
        </li>
        <li>
          <strong>Google (Gmail)</strong> : envoi des emails de confirmation d'inscription et de réinitialisation de mot
          de passe, depuis un compte personnel de l'éditrice.
        </li>
        <li>
          <strong>IGN, OpenStreetMap (Nominatim) et Google Fonts</strong> : fonds de carte, calcul de l'itinéraire à pied,
          recherche d'adresse (texte saisi dans le champ « Adresse ») et polices de caractères. Ils reçoivent votre adresse
          IP lorsque la page concernée s'affiche, mais jamais votre nom ni votre email.
        </li>
      </ul>
      <p style={pStyle}>
        Certains de ces prestataires (GitHub, Google, Supabase) sont des sociétés américaines : des transferts de données
        hors de l'Union européenne sont possibles et reposent sur les garanties qu'ils prévoient (clauses contractuelles
        types, cadre de protection des données UE–États-Unis).
      </p>

      <h2 style={h2Style}>Cookies et stockage dans votre navigateur</h2>
      <p style={pStyle}>
        Le site ne dépose <strong>aucun cookie</strong> et n'utilise aucun traceur : il n'y a donc pas de bandeau à
        accepter. Deux éléments techniques indispensables sont stockés dans votre navigateur : le jeton qui vous garde
        connecté·e (stockage local), et le mot de passe d'accès saisi à l'entrée, effacé à la fermeture de l'onglet. Un
        troisième, facultatif, retient sur votre appareil le bureau que vous choisissez sur la carte des bonnes adresses
        (Valois/BE ou La Chapelle), pour vous le proposer à votre prochaine visite ; il ne contient aucune donnée
        personnelle et vous pouvez l'effacer en vidant les données du site dans votre navigateur.
      </p>

      <h2 style={h2Style}>Combien de temps ?</h2>
      <p style={pStyle}>
        Vos données sont conservées tant que votre compte existe. Les comptes inactifs ne sont pas supprimés
        automatiquement. Les durées de conservation des journaux techniques sont celles des prestataires.
      </p>
      <p style={pStyle}>
        À la suppression d'un compte, l'adresse email, le mot de passe chiffré, le nom de compte et les préférences de
        notification sont supprimés. Les événements, inscriptions, lieux et avis déjà publiés restent affichés sous le
        nom saisi à l'époque, <strong>sauf si vous demandez leur suppression ou leur anonymisation</strong>.
      </p>

      <h2 style={h2Style}>Vos droits</h2>
      <p style={pStyle}>
        Vous pouvez demander l'accès à vos données, leur rectification, leur effacement, la limitation ou l'opposition à
        leur traitement, leur portabilité, et retirer votre consentement. Écrivez à <Mail /> : une réponse vous sera
        apportée dans un délai d'un mois.
      </p>
      <p style={pStyle}>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (Commission nationale de
        l'informatique et des libertés) : <Ext href="https://www.cnil.fr/fr/plaintes">cnil.fr/fr/plaintes</Ext> — 3 Place de
        Fontenoy, TSA 80715, 75334 Paris Cedex 07.
      </p>

      <h2 style={h2Style}>Sécurité</h2>
      <p style={pStyle}>
        Connexion chiffrée (HTTPS), mots de passe chiffrés, règles d'accès appliquées directement par la base de données,
        et inscription protégée par un mot de passe d'accès commun.
      </p>
    </>
  );
}

function Accessibilite() {
  return (
    <>
      <p style={pStyle}>
        L'agenda du SNUM est un projet personnel : il n'est pas soumis à l'obligation légale de déclaration
        d'accessibilité qui concerne les services publics. Par souci d'inclusion, voici néanmoins où il en est par
        rapport au référentiel RGAA 4.1.
      </p>

      <h2 style={h2Style}>État de conformité</h2>
      <p style={pStyle}>
        <strong>Non évalué.</strong> Aucun audit RGAA complet n'a été réalisé (ni par un tiers, ni en interne selon la
        grille officielle). Le site ne peut donc pas être déclaré conforme.
      </p>

      <h2 style={h2Style}>Ce qui a été fait</h2>
      <ul style={listStyle}>
        <li>Langue de la page déclarée (français) et titres hiérarchisés sur la page « Bonnes adresses ».</li>
        <li>Champs de formulaire associés à une étiquette, y compris les filtres.</li>
        <li>Boutons et liens avec un libellé explicite ; bouton d'affichage du mot de passe annoncé aux lecteurs d'écran.</li>
        <li>Fenêtre du tutoriel : focus maintenu dans la fenêtre, fermeture avec Échap, étape annoncée aux lecteurs d'écran.</li>
        <li>Messages d'erreur et de confirmation annoncés par les technologies d'assistance.</li>
        <li>Textes secondaires d'un contraste d'au moins 4,5:1 sur leur fond.</li>
        <li>Affichage adapté aux petits écrans.</li>
      </ul>

      <h2 style={h2Style}>Limites connues</h2>
      <ul style={listStyle}>
        <li>
          Aucun test n'a été fait avec des lecteurs d'écran ni d'autres technologies d'assistance ; seuls des tests
          manuels ponctuels (clavier, affichage mobile) ont été réalisés.
        </li>
        <li>
          La carte est interactive : son usage au clavier n'a pas été vérifié en détail. La liste des lieux, affichée à
          côté, donne les mêmes informations (nom, note, prix, temps de marche, adresse).
        </li>
        <li>Les vues « Semaine » et « Mois » du calendrier n'ont pas été vérifiées en détail ; la vue « Liste » donne accès à tous les événements.</li>
        <li>
          La fenêtre « Notifications » n'a pas encore de gestion du focus : le focus n'y est pas maintenu et la
          touche Échap ne la ferme pas.
        </li>
        <li>Certains boutons contiennent un émoji décoratif qui peut être lu à voix haute.</li>
      </ul>

      <h2 style={h2Style}>Technologies utilisées</h2>
      <p style={pStyle}>HTML, CSS et JavaScript (React). Le site n'a pas été testé sur d'autres combinaisons que des navigateurs récents sur ordinateur et mobile.</p>

      <h2 style={h2Style}>Signaler un problème, demander une alternative</h2>
      <p style={pStyle}>
        Si vous rencontrez une difficulté pour utiliser le site ou obtenir une information, écrivez à <Mail /> en
        décrivant le problème et l'outil que vous utilisez : une réponse vous sera apportée dans un délai raisonnable.
      </p>

      <h2 style={h2Style}>Voies de recours</h2>
      <p style={pStyle}>
        Si vous n'obtenez pas de réponse satisfaisante, vous pouvez saisir le Défenseur des droits : via le formulaire en
        ligne <Ext href="https://formulaire.defenseurdesdroits.fr">formulaire.defenseurdesdroits.fr</Ext>, ou par courrier
        gratuit sans affranchissement : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07.
      </p>
    </>
  );
}

const PAGES = {
  mentions: { title: "Mentions légales", Content: MentionsLegales },
  confidentialite: { title: "Politique de confidentialité", Content: Confidentialite },
  accessibilite: { title: "Déclaration d'accessibilité", Content: Accessibilite },
};

export default function LegalPage({ page, onBack }) {
  const { title, Content } = PAGES[page];

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${title} — L'agenda du SNUM`;
    return () => {
      document.title = "L'agenda du SNUM";
    };
  }, [title]);

  return (
    <main style={pageStyle}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: colors.muted,
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: "'Inter', sans-serif",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← Retour à l'agenda
        </button>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 28, margin: "0 0 6px", color: "#2B2A28" }}>
          {title}
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: colors.muted }}>Dernière mise à jour : {UPDATED}</p>
        <Content />
      </div>
    </main>
  );
}
