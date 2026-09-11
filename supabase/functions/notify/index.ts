import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_USER = Deno.env.get("GMAIL_USER")!;
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
const SITE_URL = "https://camillejbr.github.io/calendrier-snum/";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TYPE_LABELS: Record<string, string> = {
  verre: "Verre",
  activite: "Activité",
  sport: "Sport",
  repas: "Repas",
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

function formatEventLine(ev: { title: string; type: string; date: string; time: string; location: string | null }) {
  const label = TYPE_LABELS[ev.type] || ev.type;
  const d = new Date(ev.date + "T00:00:00");
  const dateLabel = capitalize(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
  const timeLabel = ev.time?.slice(0, 5);
  const loc = ev.location ? ` · ${ev.location}` : "";
  return `${label} — ${ev.title}\n${dateLabel} à ${timeLabel}${loc}`;
}

async function sendMail(to: string, subject: string, textLines: string[]) {
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 587,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  const body = textLines.join("\n\n") + `\n\n—\nL'agenda du SNUM\n${SITE_URL}`;
  await client.send({
    from: `L'agenda du SNUM <${GMAIL_USER}>`,
    to,
    subject,
    content: body,
  });
  await client.close();
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

  const line = formatEventLine(event);
  let sent = 0;
  for (const r of targets) {
    await sendMail(r.email, `Nouvel événement : ${event.title}`, [
      `Un nouvel événement vient d'être publié.`,
      line,
    ]);
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

  await sendMail(hostData.user.email, `Nouvelle inscription : ${payload.event_title}`, [
    `${joiners.join(", ")} vien${joiners.length > 1 ? "nent" : "t"} de s'inscrire à ton événement "${payload.event_title}".`,
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

  const recipients = await usersWithPreference("weekly_digest");
  let sent = 0;
  for (const r of recipients) {
    await sendMail(
      r.email,
      "Ton récap de la semaine — L'agenda du SNUM",
      [
        "Voici les événements de la semaine, et ceux ajoutés la semaine dernière :",
        ...events.map(formatEventLine),
      ]
    );
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
