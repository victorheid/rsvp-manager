/** VAPID public keys are URL-safe base64; `PushManager.subscribe` wants raw bytes. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes;
}
