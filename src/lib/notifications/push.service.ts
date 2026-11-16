import { createClient } from "@/lib/supabase/server";
import { getAnnouncementById } from "@/lib/announcements/announcements.service";

interface PushRequest {
  title: string;
  body: string;
  url: string;
  icon: string;
  userIds?: string[];
}

async function dispatchPushNotification(payload: PushRequest): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.functions.invoke("send-push", {
    body: payload,
  });

  if (error) {
    console.error("[push.service] send-push invocation failed:", error);
    throw new Error(`Push notification delivery failed: ${error.message}`);
  }
}

export async function sendPushNotificationToAll(announcementId: string): Promise<void> {
  const announcement = await getAnnouncementById(announcementId);

  await dispatchPushNotification({
    title: announcement.title,
    body: announcement.content,
    url: "/announcements",
    icon: "/android-chrome-192x192.png",
  });
}

export async function sendPushNotificationToUser(
  userId: string,
  announcementId: string
): Promise<void> {
  const announcement = await getAnnouncementById(announcementId);

  await dispatchPushNotification({
    title: announcement.title,
    body: announcement.content,
    url: "/announcements",
    icon: "/android-chrome-192x192.png",
    userIds: [userId],
  });
}

export async function getActiveSubscriptionCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[getActiveSubscriptionCount] Supabase error:", error);
    throw new Error(`Unable to count push subscriptions: ${error.message}`);
  }
  if (count === null) {
    throw new Error("Unable to count push subscriptions: count was not returned.");
  }

  return count;
}
