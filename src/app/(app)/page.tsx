import { HomeHero } from "@/features/home/components/HomeHero";
import { getMonthCalendarState } from "@/features/calendar/actions";
import { calculateDistanceKm, getDistanceCopy, type Coordinates } from "@/features/distance/distance";
import { getDailyInsight } from "@/features/home/daily-insights";
import { MonthHeatmap } from "@/features/home/components/MonthHeatmap";
import { FutureDiaryStatusCard, selectHomepageFutureDiary } from "@/features/home/components/FutureDiaryStatusCard";
import { listFutureDiaryCards } from "@/features/journal/repository";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChinaDateString } from "@/lib/date/china-day";

function daysBetween(startDate: string, endDate: Date) {
  const start = new Date(`${startDate}T00:00:00+08:00`);
  return Math.max(0, Math.floor((endDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function profileCoordinates(profile: { last_login_latitude: number | null; last_login_longitude: number | null }): Coordinates | null {
  if (profile.last_login_latitude === null || profile.last_login_longitude === null) return null;
  return { latitude: profile.last_login_latitude, longitude: profile.last_login_longitude };
}

function avatarPoints(distanceKm: number | null) {
  if (distanceKm === null) return { currentX: 38, otherX: 62 };
  if (distanceKm < 100) return { currentX: 46, otherX: 54 };
  return { currentX: 30, otherX: 70 };
}

export default async function HomePage() {
  const { userId, profile } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const [chinaYear, chinaMonth] = getChinaDateString(now).split("-").map(Number);
  const dailyInsight = getDailyInsight(now);

  const [calendarState, receivedFuture, profileResult] = await Promise.all([
    getMonthCalendarState(chinaYear, chinaMonth),
    listFutureDiaryCards(supabase, { userId, box: "received", now }),
    supabase.from("profiles").select("id, display_name, avatar_url, last_login_latitude, last_login_longitude"),
  ]);
  const profiles = profileResult.data;
  const otherProfile = (profiles ?? []).find((item) => String(item.id) !== userId) ?? null;
  const authorName = otherProfile?.display_name ? String(otherProfile.display_name) : "伴侣";
  const futureStatus = selectHomepageFutureDiary(receivedFuture
    .filter((entry) => entry.state === "ready" || entry.state === "waiting")
    .map((entry) => ({ id: entry.id, authorName, state: entry.state as "ready" | "waiting", openAt: entry.openAt })));
  const { data: latestLetterLocation } = await supabase
    .from("letters")
    .select("latitude, longitude")
    .eq("author_id", userId)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentCoordinates =
    latestLetterLocation?.latitude !== null && latestLetterLocation?.longitude !== null && latestLetterLocation
      ? { latitude: Number(latestLetterLocation.latitude), longitude: Number(latestLetterLocation.longitude) }
      : profileCoordinates(profile);
  const otherCoordinates = otherProfile ? profileCoordinates(otherProfile) : null;
  const distanceKm = currentCoordinates && otherCoordinates ? calculateDistanceKm(currentCoordinates, otherCoordinates) : null;
  const distanceCopy = getDistanceCopy(distanceKm);
  const points = avatarPoints(distanceKm);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <HomeHero
        daysTogether={daysBetween(profile.relationship_started_on, now)}
        distanceKm={distanceKm}
        distanceCopy={distanceCopy}
        userA={{ displayName: profile.display_name, avatarUrl: profile.avatar_url, x: points.currentX, y: 72 }}
        userB={{
          displayName: otherProfile?.display_name ? String(otherProfile.display_name) : "对方",
          avatarUrl: otherProfile?.avatar_url ? String(otherProfile.avatar_url) : null,
          x: points.otherX,
          y: 72,
        }}
      />

      <section className="hand-card rounded-[2rem] p-6">
        <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">今日新知</p>
        <p className="mt-3 text-lg leading-8 text-[var(--ink)]">{dailyInsight}</p>
      </section>

      <FutureDiaryStatusCard entry={futureStatus} />

      <MonthHeatmap state={calendarState} />
    </div>
  );
}
