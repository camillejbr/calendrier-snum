import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER_EMAIL = Deno.env.get("GMAIL_USER")!;
const SITE_URL = "https://camillejbr.github.io/calendrier-snum/";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  verre: { label: "Verre", icon: "🍷", color: "#9C3B3B", bg: "#F7ECEC" },
  activite: { label: "Activité", icon: "🎉", color: "#5B4A8F", bg: "#EFEDF7" },
  sport: { label: "Sport", icon: "🏃", color: "#3F7A5C", bg: "#EAF2ED" },
  repas: { label: "Repas", icon: "🍽️", color: "#C97A2B", bg: "#FBF0E3" },
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Mirrors displayNameFromEmail() in src/TeamCalendar.jsx
function displayNameFromEmail(email: string) {
  const local = email.split("@")[0];
  const [prenom, nom] = local.split(".");
  const formattedPrenom = (prenom || local).split("-").map(capitalize).join("-");
  return nom ? `${formattedPrenom} ${nom.charAt(0).toUpperCase()}.` : formattedPrenom;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return capitalize(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
}

type EventRow = {
  title: string;
  type: string;
  date: string;
  time: string;
  location: string | null;
};

function formatEventLine(ev: EventRow) {
  const t = TYPES[ev.type] || TYPES.verre;
  const loc = ev.location ? ` · ${ev.location}` : "";
  return `${t.label} — ${ev.title}\n${formatDateLabel(ev.date)} à ${ev.time?.slice(0, 5)}${loc}`;
}

function eventCardHtml(ev: EventRow) {
  const t = TYPES[ev.type] || TYPES.verre;
  const loc = ev.location ? ` · ${escapeHtml(ev.location)}` : "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="border-left:4px solid ${t.color};background:${t.bg};border-radius:0 8px 8px 0;padding:14px 16px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:16px;color:#2B2A28;">
            ${t.icon} ${escapeHtml(ev.title)}
          </div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6B6862;margin-top:4px;">
            ${formatDateLabel(ev.date)} à ${ev.time?.slice(0, 5)}${loc}
          </div>
        </td>
      </tr>
    </table>`;
}

function htmlShell(intro: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F7F3EC;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td align="center" style="font-size:36px;padding-bottom:8px;">🗓️</td>
            </tr>
            <tr>
              <td align="center" style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:24px;color:#2B2A28;padding-bottom:4px;">
                L'agenda du SNUM
              </td>
            </tr>
            <tr>
              <td align="center" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6B6862;padding-bottom:24px;">
                ${escapeHtml(intro)}
              </td>
            </tr>
            <tr>
              <td style="background:#FFFFFF;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <a href="${SITE_URL}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#F7F3EC;background:#2B2A28;padding:10px 20px;border-radius:6px;text-decoration:none;">
                  Ouvrir l'agenda
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#B0AB9C;">
                L'agenda du SNUM — ${SITE_URL.replace("https://", "")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendMail(to: string, subject: string, intro: string, bodyHtml: string, textLines: string[]) {
  const textBody = textLines.join("\n\n") + `\n\n—\nL'agenda du SNUM\n${SITE_URL}`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "L'agenda du SNUM", email: SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: htmlShell(intro, bodyHtml),
      textContent: textBody,
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo error ${res.status}: ${bodyText}`);
  }
  return bodyText;
}

async function usersWithPreference(column: "weekly_digest" | "on_publish" | "on_join") {
  const { data: prefs, error } = await admin
    .from("notification_preferences")
    .select("user_id")
    .eq(column, true);
  if (error || !prefs?.length) return [];

  const ids = new Set(prefs.map((p) => p.user_id));
  const emails: { id: string; email: string }[] = [];
  let page = 1;
  while (true) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr || !data) break;
    for (const u of data.users) {
      if (ids.has(u.id) && u.email) emails.push({ id: u.id, email: u.email });
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return emails;
}

async function handlePublished(event: any) {
  const recipients = await usersWithPreference("on_publish");
  const targets = recipients.filter((r) => r.id !== event.host_id);
  if (!targets.length) return { sent: 0 };

  const intro = "Un nouvel événement vient d'être publié.";
  const bodyHtml = eventCardHtml(event);
  let sent = 0;
  for (const r of targets) {
    await sendMail(r.email, `Nouvel événement : ${event.title}`, intro, bodyHtml, [intro, formatEventLine(event)]);
    sent += 1;
  }
  return { sent };
}

async function handleJoined(payload: {
  event_id: string;
  event_title: string;
  host_id: string | null;
  new_attendees: string[];
}) {
  if (!payload.host_id) return { sent: 0, reason: "no host_id" };

  const { data: hostData, error } = await admin.auth.admin.getUserById(payload.host_id);
  if (error || !hostData?.user?.email) return { sent: 0, reason: "host not found" };

  const { data: pref } = await admin
    .from("notification_preferences")
    .select("on_join")
    .eq("user_id", payload.host_id)
    .maybeSingle();
  if (!pref?.on_join) return { sent: 0, reason: "pref off" };

  const hostDisplayName = displayNameFromEmail(hostData.user.email);
  const joiners = payload.new_attendees.filter((n) => n !== hostDisplayName);
  if (!joiners.length) return { sent: 0, reason: "self-join only" };

  const namesLine = joiners.join(", ");
  const verb = joiners.length > 1 ? "viennent" : "vient";
  const intro = `${namesLine} ${verb} de s'inscrire à ton événement.`;
  const bodyHtml = `
    <div style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:18px;color:#2B2A28;text-align:center;">
      ${escapeHtml(payload.event_title)}
    </div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6B6862;text-align:center;margin-top:8px;">
      ${escapeHtml(namesLine)} ${verb} de s'inscrire.
    </div>`;

  await sendMail(hostData.user.email, `Nouvelle inscription : ${payload.event_title}`, intro, bodyHtml, [
    `${namesLine} ${verb} de s'inscrire à ton événement "${payload.event_title}".`,
  ]);
  return { sent: 1 };
}

function parisNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  return { weekday, hour };
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function handleDigestCheck() {
  const { weekday, hour } = parisNow();
  if (weekday !== "Mon" || hour !== 10) {
    return { skipped: true, weekday, hour };
  }

  const now = new Date();
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const { data: thisWeek } = await admin
    .from("events")
    .select("*")
    .gte("date", toISODate(monday))
    .lte("date", toISODate(sunday));
  const { data: recentlyAdded } = await admin
    .from("events")
    .select("*")
    .gte("created_at", weekAgo.toISOString());

  const byId = new Map<string, any>();
  for (const ev of [...(thisWeek || []), ...(recentlyAdded || [])]) byId.set(ev.id, ev);
  const events = [...byId.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (!events.length) return { sent: 0, reason: "no events" };

  const intro = "Voici les événements de la semaine, et ceux ajoutés la semaine dernière.";
  const bodyHtml = events.map(eventCardHtml).join("");

  const recipients = await usersWithPreference("weekly_digest");
  let sent = 0;
  for (const r of recipients) {
    await sendMail(r.email, "Ton récap de la semaine — L'agenda du SNUM", intro, bodyHtml, [
      intro,
      ...events.map(formatEventLine),
    ]);
    sent += 1;
  }
  return { sent, events: events.length };
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    let result;
    if (payload.kind === "published") result = await handlePublished(payload.event);
    else if (payload.kind === "joined") result = await handleJoined(payload);
    else if (payload.kind === "digest-check") result = await handleDigestCheck();
    else return new Response(JSON.stringify({ error: "unknown kind" }), { status: 400 });

    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
