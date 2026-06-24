const { createClient } = require("@supabase/supabase-js");

const LOGS_TABLE = "activity_logs";

// Cliente lazy: process.env se puebla en runtime en Cloudflare Workers.
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

async function addLog(entry) {
  const supabase = getSupabase();
  if (!supabase) {
    console.log("[LOG] Supabase not configured, skipping");
    return null;
  }

  const logEntry = {
    username: entry.username,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_label: entry.entityLabel,
    details: JSON.stringify(entry.details),
    method: entry.method,
    path: entry.path,
    ip: entry.ip,
    user_agent: entry.userAgent,
    duration: entry.duration,
  };

  try {
    const { data, error } = await supabase.from(LOGS_TABLE).insert(logEntry).select().single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Error saving log:", err.message);
    return null;
  }
}

async function getStats({ days = 7, username } = {}) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase.from(LOGS_TABLE).select("*").gte("created_at", since);

  if (username) {
    query = query.eq("username", username);
  }

  const { data: logs, error } = await query;

  if (error) {
    console.error("Error fetching stats:", error.message);
    return null;
  }

  const byAction = logs.reduce((acc, l) => {
    acc[l.action] = (acc[l.action] || 0) + 1;
    return acc;
  }, {});

  const byEntity = logs.reduce((acc, l) => {
    acc[l.entity_type] = (acc[l.entity_type] || 0) + 1;
    return acc;
  }, {});

  const byUser = logs.reduce((acc, l) => {
    acc[l.username] = (acc[l.username] || 0) + 1;
    return acc;
  }, {});

  const byDay = logs.reduce((acc, l) => {
    const date = new Date(l.created_at);
    const day = date.toLocaleDateString("sv-SE");
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  const byDayDuration = logs.reduce((acc, l) => {
    if (l.duration == null) return acc;
    const date = new Date(l.created_at);
    const day = date.toLocaleDateString("sv-SE");
    if (!acc[day]) {
      acc[day] = { sum: 0, count: 0 };
    }
    acc[day].sum += l.duration;
    acc[day].count += 1;
    return acc;
  }, {});
  const durationByDay = Object.fromEntries(
    Object.entries(byDayDuration).map(([day, { sum, count }]) => [day, Math.round(sum / count)]),
  );

  const byHour = logs.reduce((acc, l) => {
    const date = new Date(l.created_at);
    const hour = date.getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});

  const byEntityLabel = logs.reduce((acc, l) => {
    if (l.entity_label) {
      acc[l.entity_label] = (acc[l.entity_label] || 0) + 1;
    }
    return acc;
  }, {});

  const durations = logs.map((l) => l.duration).filter((d) => d != null);
  const avgDuration =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const recent = [...logs].reverse().slice(0, 20);
  const users = [...new Set(logs.map((l) => l.username))];

  return {
    total: logs.length,
    byAction,
    byEntity,
    byUser,
    byDay,
    durationByDay,
    byHour,
    byEntityLabel,
    avgDuration,
    recent,
    users,
  };
}

async function getLogs({ limit = 50, offset = 0, action, entityType, username } = {}) {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from(LOGS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) {
    query = query.eq("action", action);
  }
  if (entityType) {
    query = query.eq("entity_type", entityType);
  }
  if (username) {
    query = query.eq("username", username);
  }

  const { data: logs, error } = await query;

  if (error) {
    console.error("Error fetching logs:", error.message);
    return [];
  }

  return logs || [];
}

async function clearLogs() {
  const supabase = getSupabase();
  if (!supabase) {
    console.log("[LOG] Supabase not configured");
    return;
  }

  const { error } = await supabase.from(LOGS_TABLE).delete().neq("id", 0).select("id");

  if (error) {
    console.error("Error clearing logs:", error.message);
    throw new Error(error.message);
  } else {
    console.log("Activity logs cleared from Supabase");
  }
}

module.exports = {
  addLog,
  getStats,
  getLogs,
  clearLogs,
};