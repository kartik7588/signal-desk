const { authenticate, bodyOf, clearSession, readJson, send, setSession, supabaseFetch } = require("./_supabase");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      try {
        const { user } = await authenticate(req, res);
        return send(res, 200, { authenticated: true, email: user.email || "" });
      } catch (error) {
        if (error.status === 401) return send(res, 200, { authenticated: false });
        throw error;
      }
    }
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
    const { action, email = "", password = "" } = bodyOf(req);
    if (action === "logout") {
      try { const { accessToken } = await authenticate(req, res); await supabaseFetch("/auth/v1/logout", { method: "POST" }, accessToken); } catch { /* Cookie clearing still signs this browser out. */ }
      clearSession(res);
      return send(res, 200, { authenticated: false });
    }
    if (!["login", "signup"].includes(action)) return send(res, 400, { error: "Choose sign in or create account." });
    if (typeof email !== "string" || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { error: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 12 || password.length > 128) return send(res, 400, { error: "Use a sync account password between 12 and 128 characters." });
    const path = action === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
    const response = await supabaseFetch(path, { method: "POST", body: JSON.stringify({ email, password }) });
    const result = await readJson(response);
    if (!response.ok) return send(res, response.status === 429 ? 429 : 400, { error: result.msg || result.error_description || result.message || "Authentication failed." });
    const session = result.access_token ? result : result.session;
    const user = result.user || session?.user;
    if (!session?.access_token) return send(res, 200, { authenticated: false, message: "Check your email to confirm the account, then sign in." });
    setSession(res, session);
    return send(res, 200, { authenticated: true, email: user?.email || email });
  } catch (error) {
    return send(res, error.status || 500, { error: error.status ? error.message : "The sync service encountered an unexpected error." });
  }
};
