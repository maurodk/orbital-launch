const DEFAULT_LOCAL_API_URL = "http://localhost:3000";

export const apiUrl =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? DEFAULT_LOCAL_API_URL : "");

export function getApiUrl(path = "") {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const normalizedPath = path && !path.startsWith("/") ? `/${path}` : path;

  return `${baseUrl}${normalizedPath}`;
}
