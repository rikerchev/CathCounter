// v3.03 — "маскирай мейлите на потребителите" (the site owner's request):
// wherever one account's email would be shown to a DIFFERENT account (e.g.
// an organizer looking at their competition's participant list in
// WaterBodyManagement.jsx), show a masked form instead of the real address.
// Deliberately NOT used on admin-only screens (AdminUsers.jsx) — full
// visibility there is appropriate since it's already an admin-restricted
// page, and not used for the account's OWN email shown to itself (Profile.jsx).
//
// Keeps just enough of the local part to be recognizable to someone who
// already knows roughly who it is, without exposing the full address:
// "john.smith@gmail.com" -> "jo***@gmail.com".
export function maskEmail(email) {
  if (!email || typeof email !== "string") return "";
  const at = email.indexOf("@");
  if (at <= 0) return email; // not a well-formed email — show as-is rather than mangle it
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}***${domain}`;
}
