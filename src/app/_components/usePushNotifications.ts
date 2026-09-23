"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { pushSubscriptionSchema } from "@/server/integrations/push/types";
import { urlBase64ToUint8Array } from "@/app/_components/urlBase64ToUint8Array";

/** `unsupported` includes iPhone Safari outside the Home Screen app (§9). */
export type PushStatus = "loading" | "unsupported" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function isSupported(): boolean {
  return (
    VAPID_PUBLIC_KEY !== undefined &&
    VAPID_PUBLIC_KEY !== "" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * This device's web-push state and the two things a user can do about it.
 * `enable` asks for permission (so call it from a tap), registers the
 * service worker and stores the subscription on the server.
 */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const subscribe = trpc.notifications.subscribePush.useMutation();
  const unsubscribe = trpc.notifications.unsubscribePush.useMutation();

  useEffect(() => {
    async function detect() {
      if (!isSupported()) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");

      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const existing = await registration?.pushManager.getSubscription();
      setStatus(existing ? "on" : "off");
    }

    void detect();
  }, []);

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await subscribe.mutateAsync({ subscription: pushSubscriptionSchema.parse(subscription.toJSON()) });
    setStatus("on");
  }, [subscribe]);

  const disable = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      await unsubscribe.mutateAsync({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setStatus("off");
  }, [unsubscribe]);

  return { status, enable, disable };
}
