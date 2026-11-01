export function isAdminUser(userId) {
  if (userId == null) return false;
  return String(process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[1-9][0-9]*$/.test(id))
    .includes(String(userId));
}
