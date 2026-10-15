const { authenticate, bodyOf, readJson, send, supabaseFetch } = require("./_supabase");

function validBase64(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 1) return false;
  if (envelope.kdf?.name !== "PBKDF2-SHA256" || !Number.isSafeInteger(envelope.kdf.iterations) || envelope.kdf.iterations < 100000 || envelope.kdf.iterations > 2000000) return false;
  if (envelope.cipher?.name !== "AES-256-GCM" || !validBase64(envelope.cipher.iv, 32)) return false;
  if (!validBase64(envelope.kdf.salt, 128) || !validBase64(envelope.payload, 28 * 1024 * 1024)) return false;
  try {
    return Buffer.from(envelope.kdf.salt, "base64").length >= 16 && Buffer.from(envelope.kdf.salt, "base64").length <= 64 && Buffer.from(envelope.cipher.iv, "base64").length === 12;
  } catch { return false; }
}

async function getVault(userId, token) {
  const query = `/rest/v1/vaults?select=revision,envelope,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const response = await supabaseFetch(query, { method: "GET" }, token);
  const rows = await readJson(response);
  if (!response.ok) throw Object.assign(new Error("The encrypted vault could not be read."), { status: response.status });
  if (!rows[0]) return null;
  return { revision: Number(rows[0].revision), envelope: rows[0].envelope, updatedAt: rows[0].updated_at };
}

module.exports = async function handler(req, res) {
  try {
    if (!["GET", "PUT"].includes(req.method)) return send(res, 405, { error: "Method not allowed." });
    const { user, accessToken } = await authenticate(req, res);
    if (req.method === "GET") return send(res, 200, { vault: await getVault(user.id, accessToken) });

    const { envelope, expectedRevision } = bodyOf(req);
    if (!validateEnvelope(envelope)) return send(res, 400, { error: "The encrypted vault envelope is invalid." });
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return send(res, 400, { error: "The sync revision is invalid." });
    const current = await getVault(user.id, accessToken);
    if ((current?.revision || 0) !== expectedRevision) return send(res, 409, { error: "Another browser changed this vault.", revision: current?.revision || 0 });
    const revision = expectedRevision + 1;
    const updatedAt = new Date().toISOString();
    const payload = { user_id: user.id, revision, envelope, updated_at: updatedAt };
    const path = current
      ? `/rest/v1/vaults?user_id=eq.${encodeURIComponent(user.id)}&revision=eq.${expectedRevision}`
      : "/rest/v1/vaults";
    const response = await supabaseFetch(path, {
      method: current ? "PATCH" : "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    }, accessToken);
    const rows = await readJson(response);
    if (!response.ok) return send(res, response.status, { error: "The encrypted vault could not be saved." });
    if (!Array.isArray(rows) || rows.length !== 1) return send(res, 409, { error: "Another browser changed this vault." });
    return send(res, 200, { revision, updatedAt });
  } catch (error) {
    return send(res, error.status || 500, { error: error.status ? error.message : "The sync service encountered an unexpected error." });
  }
};
