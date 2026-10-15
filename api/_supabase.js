const ACCESS_COOKIE = "sd_access";
const REFRESH_COOKIE = "sd_refresh";

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) throw Object.assign(new Error("Encrypted sync is not configured."), { status: 503 });
  return { url, key };
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index < 0) return cookies;
    cookies[decodeURIComponent(part.slice(0, index).trim())] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function appendCookie(res, value) {
  const current = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", current ? [].concat(current, value) : value);
}

function cookie(name, value, maxAge) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setSession(res, session) {
  appendCookie(res, cookie(ACCESS_COOKIE, session.access_token, Math.max(60, Number(session.expires_in || 3600))));
  appendCookie(res, cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
}

function clearSession(res) {
  appendCookie(res, cookie(ACCESS_COOKIE, "", 0));
  appendCookie(res, cookie(REFRESH_COOKIE, "", 0));
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function send(res, status, data) {
  noStore(res);
  return res.status(status).json(data);
}

async function supabaseFetch(path, options = {}, token = "") {
  const { url, key } = config();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function authenticate(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let accessToken = cookies[ACCESS_COOKIE];
  let response = accessToken ? await supabaseFetch("/auth/v1/user", { method: "GET" }, accessToken) : null;
  if ((!response || !response.ok) && cookies[REFRESH_COOKIE]) {
    const refreshed = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", body: JSON.stringify({ refresh_token: cookies[REFRESH_COOKIE] })
    });
    const session = await readJson(refreshed);
    if (refreshed.ok && session.access_token) {
      setSession(res, session);
      accessToken = session.access_token;
      response = await supabaseFetch("/auth/v1/user", { method: "GET" }, accessToken);
    }
  }
  if (!response?.ok) {
    clearSession(res);
    throw Object.assign(new Error("Your sync session has expired."), { status: 401 });
  }
  return { user: await readJson(response), accessToken };
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body); } catch { throw Object.assign(new Error("The request body is invalid."), { status: 400 }); }
}

module.exports = { authenticate, bodyOf, clearSession, readJson, send, setSession, supabaseFetch };
