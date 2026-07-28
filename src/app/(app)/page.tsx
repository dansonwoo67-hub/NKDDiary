import { HomeHero } from "@/features/home/components/HomeHero";
import { getMonthCalendarState } from "@/features/calendar/actions";
import { calculateDistanceKm, type Coordinates } from "@/features/distance/distance";
import { LocationDistancePanel, type LocationHistoryItem } from "@/features/distance/components/LocationDistancePanel";
import { getDailyInsight } from "@/features/home/daily-insights";
import { MonthHeatmap } from "@/features/home/components/MonthHeatmap";
import { requireUser } from "@/lib/auth/require-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getChinaDateString } from "@/lib/date/china-day";
import { calculateRelationshipDays } from "@/lib/date/relationship-days";
import { listActiveSpaceProfiles } from "@/features/profile/repository";
import { listMemories } from "@/features/memories/repository";
import { buildHomeOverview } from "@/features/home/repository";
import { HomeOverview } from "@/features/home/components/HomeOverview";
import { UpcomingCard } from "@/features/home/components/UpcomingCard";
import { QuickMood } from "@/features/home/components/QuickMood";

function profileCoordinates(profile: { last_login_latitude?: number|null; last_login_longitude?: number|null }): Coordinates|null { return profile.last_login_latitude==null||profile.last_login_longitude==null?null:{latitude:profile.last_login_latitude,longitude:profile.last_login_longitude}; }
function locationLabel(row: { country?: string|null; region?: string|null; city?: string|null }|undefined) { if(!row)return null; return [row.region,row.city].filter(Boolean).join(" · ")||[row.country,row.city].filter(Boolean).join(" · ")||null; }

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ year?:string; month?:string }> }) {
  const { userId, profile, spaceId } = await requireUser();
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const params = await searchParams;
  const [defaultYear, defaultMonth] = getChinaDateString(now).split("-").map(Number);
  const year = Number(params?.year)||defaultYear;
  const month = Math.min(12,Math.max(1,Number(params?.month)||defaultMonth));
  const [calendarState, profiles, memories, spaceResult, historyResult] = await Promise.all([
    getMonthCalendarState(year,month), listActiveSpaceProfiles(supabase,spaceId), listMemories(supabase,spaceId),
    supabase.from("spaces").select("name").eq("id",spaceId).single(),
    supabase.from("location_history").select("id,user_id,recorded_at,country,region,city").eq("space_id",spaceId).order("recorded_at",{ascending:false}).limit(5),
  ]);
  const otherProfile=(profiles??[]).find(item=>String(item.id)!==userId)??null;
  const authorNames=Object.fromEntries((profiles??[]).map(item=>[String(item.id),String(item.display_name)]));
  const currentCoordinates=profileCoordinates(profile); const otherCoordinates=otherProfile?profileCoordinates(otherProfile):null;
  const distanceKm=currentCoordinates&&otherCoordinates?calculateDistanceKm(currentCoordinates,otherCoordinates):null;
  const overview=buildHomeOverview({memories,calendarDays:calendarState.days,today:getChinaDateString(now)});
  const history=(historyResult.data??[]).map((item):LocationHistoryItem=>({id:String(item.id),userId:String(item.user_id),displayName:authorNames[String(item.user_id)]??"伴侣",recordedAt:String(item.recorded_at),country:item.country?String(item.country):null,region:item.region?String(item.region):null,city:item.city?String(item.city):null}));
  const currentLatest=history.find(item=>item.userId===userId); const otherLatest=history.find(item=>item.userId!==userId);
  const userA={displayName:profile.display_name,avatarUrl:profile.avatar_url};
  const userB={displayName:otherProfile?.display_name?String(otherProfile.display_name):"对方",avatarUrl:otherProfile?.avatar_url?String(otherProfile.avatar_url):null};

  return <div className="flex flex-1 flex-col gap-7">
    <header><p className="text-sm text-[var(--muted-ink)]">欢迎回来，{profile.display_name}</p><h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">{spaceResult.data?.name??"我们的空间"}</h1></header>
    <section className="home-dashboard-grid">
      <div className="home-dashboard-left">
        <HomeHero daysTogether={calculateRelationshipDays(profile.relationship_started_on)} relationshipStartedOn={profile.relationship_started_on} dailyQuote={getDailyInsight(now)}/>
        <section className="cos-card overflow-hidden p-5"><LocationDistancePanel userA={userA} userB={userB} currentUserId={userId} distanceKm={distanceKm} currentHasLocation={currentCoordinates!==null} otherHasLocation={otherCoordinates!==null} currentUpdatedAt={profile.last_login_at??null} otherUpdatedAt={otherProfile?.last_login_at??null} currentLocationLabel={locationLabel(currentLatest)} otherLocationLabel={locationLabel(otherLatest)} recentHistory={history}/></section>
        <UpcomingCard events={overview.upcomingEvents}/>
      </div>
      <div className="home-dashboard-right"><QuickMood/><HomeOverview recentMemories={overview.recentMemories.slice(0, 8)} currentUserId={userId} authorNames={authorNames}/></div>
    </section>
    <MonthHeatmap state={calendarState} compact={false}/>
  </div>;
}
