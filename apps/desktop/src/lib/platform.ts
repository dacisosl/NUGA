/** Tauri 여부와 플랫폼별 파일 저장·알림. 브라우저에서도 동작하도록 폴백 제공. */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function saveFile(name: string, data: Uint8Array | string, filters?: { name: string; extensions: string[] }[]): Promise<boolean> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = accept; input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isTauri) {
      const n = await import("@tauri-apps/plugin-notification");
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === "granted";
      if (ok) n.sendNotification({ title, body });
      return;
    }
    if ("Notification" in window) {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    }
  } catch { /* ignore */ }
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) { const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl(url); return; }
  window.open(url, "_blank", "noopener");
}

export function readFileAsText(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f, "utf-8"); });
}
export function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
}
export function readFileAsArrayBuffer(f: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = rej; r.readAsArrayBuffer(f); });
}

export function hostName(): string {
  try { return isTauri ? "내 PC" : (navigator.platform || "PC"); } catch { return "PC"; }
}
