import { HomeHero } from "@/features/home/components/HomeHero";
import { calculateDistanceKm, getDistanceCopy, type Coordinates } from "@/features/distance/distance";
import { getDailyInsight } from "@/features/home/daily-insights";
import { HeartCalendar } from "@/features/home/components/HeartCalendar";
import { getHomeSnapshot } from "@/features/home/queries";
import { requireUser } from "@/lib/auth/require-user";
import { measureServerTiming } from "@/lib/performance/server-timing";
import { LetterEntryModal } from "@/features/letters/editor/LetterEntryModal";
import { getChinaDateString } from "@/lib/date/china-day";
import { getTodayWritingEntry } from "@/features/letters/queries";

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
  const now = new Date();
  const today = getChinaDateString(now);
  const [{ value: snapshot, timing }, writingEntry] = await Promise.all([
    measureServerTiming("home_snapshot", () =>
      getHomeSnapshot({ userId, year: now.getFullYear(), month: now.getMonth() + 1, view: "year" }),
    ),
    getTodayWritingEntry({ userId, today }),
  ]);
  if (process.env.NKD_PERFORMANCE_LOGGING === "1") {
    console.info(`[performance] ${timing.name}=${timing.durationMs.toFixed(1)}ms`);
  }
  const dailyInsight = getDailyInsight(now);
  const otherProfile = snapshot.profiles.find((item) => item.id !== userId) ?? null;
  const latestLetterLocation = snapshot.latestLocations[0] ?? null;
  const calendarDays = snapshot.days.map(({ date, dayOfMonth, monthLabel, heartState, envelopeCount, events }) => ({
    date,
    dayOfMonth,
    monthLabel,
    heartState,
    envelopeCount,
    events,
  }));

  const currentCoordinates =
    latestLetterLocation && latestLetterLocation.latitude !== null && latestLetterLocation.longitude !== null
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

      <section className="flex flex-col items-start gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-semibold text-[var(--ink)]">有些话，慢慢写给 TA</p>
          <p className="mt-1 text-sm text-[var(--muted-ink)]">草稿会留下，不用一次写完。</p>
        </div>
        <LetterEntryModal entry={writingEntry} recoveryOwnerId={userId} />
      </section>

      <HeartCalendar days={calendarDays} anchorDate={today} />
    </div>
  );
}
