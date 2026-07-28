"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { LocateFixed, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { recordLoginLocationAction } from "@/features/profile/actions";
import { getDistanceCopy } from "@/features/distance/distance";

const REMINDER_DISMISSED_KEY = "nkd-location-reminder-dismissed";
const PERMISSION_DECLINED_KEY = "nkd-location-permission-declined";
const PERMISSION_DECLINED_EVENT = "nkd-location-permission-declined-change";
type PersonPoint = { displayName: string; avatarUrl: string | null };
export type LocationHistoryItem = { id: string; userId: string; displayName: string; recordedAt: string; country: string | null; region: string | null; city: string | null };
type Props = { userA: PersonPoint; userB: PersonPoint; currentUserId?: string; distanceKm: number | null; currentHasLocation: boolean; otherHasLocation: boolean; currentUpdatedAt: string | null; otherUpdatedAt: string | null; currentLocationLabel?: string | null; otherLocationLabel?: string | null; recentHistory?: LocationHistoryItem[] };
type RequestState = "idle" | "loading" | "success" | "error";

function formatShanghai(value: string | null) {
  if (!value) return "尚未更新";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(new Date(value)).replace(/\//g, "-");
}
function placeLabel(item: { country?: string | null; region?: string | null; city?: string | null }) {
  return [item.region, item.city].filter(Boolean).join(" · ") || [item.country, item.city].filter(Boolean).join(" · ") || "地点确认中";
}
async function reverseGeocode(latitude: number, longitude: number) {
  try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`, { cache: "no-store" });
    if (!response.ok) return {};
    const data = await response.json();
    return { country: data.countryName || "", region: data.principalSubdivision || "", city: data.city || data.locality || "" };
  } catch { return {}; }
}
function stale(value: string | null) { return !value || Date.now() - new Date(value).getTime() > 30 * 86400000; }
function subscribePermissionDeclined(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PERMISSION_DECLINED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PERMISSION_DECLINED_EVENT, onStoreChange);
  };
}

export function LocationDistancePanel(props: Props) {
  const recentHistory = props.recentHistory ?? [];
  const router = useRouter();
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const declinedStorageKey = props.currentUserId
    ? `${PERMISSION_DECLINED_KEY}:${props.currentUserId}`
    : PERMISSION_DECLINED_KEY;
  const permissionDeclined = useSyncExternalStore(
    subscribePermissionDeclined,
    () => localStorage.getItem(declinedStorageKey) === "1",
    () => false,
  );
  const needsStaleReminder = useMemo(
    () => props.currentHasLocation && stale(props.currentUpdatedAt),
    [props.currentHasLocation, props.currentUpdatedAt],
  );

  // Compute initial reminder state during render to avoid setState in effect
  const getInitialShowReminder = (): boolean => {
    if (!needsStaleReminder) return false;
    if (typeof window === "undefined") return false;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Shanghai" }).format(new Date());
    return localStorage.getItem(REMINDER_DISMISSED_KEY) !== today;
  };
  
  const [showReminder, setShowReminder] = useState(getInitialShowReminder);

  function persistPermissionDeclined(declined: boolean) {
    if (declined) localStorage.setItem(declinedStorageKey, "1");
    else localStorage.removeItem(declinedStorageKey);
    window.dispatchEvent(new Event(PERMISSION_DECLINED_EVENT));
  }

  async function requestLocation(source: "manual" | "stale_confirmed" = "manual") {
    setMessage(null);
    if (!navigator.geolocation) { setRequestState("error"); setMessage("当前浏览器不支持定位，可以换个浏览器试试哦。"); return; }
    setRequestState("loading");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const place = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      const result = await recordLoginLocationAction({ latitude: position.coords.latitude, longitude: position.coords.longitude, ...place, source });
      if (!result.ok) { setRequestState("error"); setMessage("位置暂时没有保存，请稍后再试。"); return; }
      persistPermissionDeclined(false);
      setShowReminder(false); setRequestState("success"); setMessage("位置已更新，新的距离已经算好啦。"); router.refresh();
    }, (error) => {
      setRequestState("error");
      if (error.code === error.PERMISSION_DENIED) {
        persistPermissionDeclined(true);
        setShowReminder(false);
        setMessage("你拒绝了定位权限。可在浏览器设置中允许后再次开启。");
        return;
      }
      setMessage("暂时无法获取位置，请稍后再试。");
    }, { enableHighAccuracy:false, timeout:12000, maximumAge:600000 });
  }
  function dismissReminder() {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Shanghai" }).format(new Date());
    localStorage.setItem(REMINDER_DISMISSED_KEY, today); setShowReminder(false);
  }
  const isFirstEnable = !props.currentHasLocation && !permissionDeclined;
  const buttonLabel = requestState === "loading"
    ? "正在定位"
    : isFirstEnable
      ? "开启位置距离"
      : permissionDeclined && !props.currentHasLocation
        ? "再次开启"
        : "更新位置";
  const title = props.distanceKm !== null
    ? `相距 ${props.distanceKm.toLocaleString("zh-CN", { minimumFractionDigits:1, maximumFractionDigits:1 })} 公里`
    : props.currentHasLocation && !props.otherHasLocation
      ? "等待伴侣开启位置距离"
      : !props.currentHasLocation && props.otherHasLocation
        ? "等待你开启位置距离"
        : "等待两个人的位置";

  return <div className="flex flex-col gap-4" aria-label="我们的距离">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[.18em] text-[var(--rose)]">OUR DISTANCE</p><h2 className="mt-1 font-serif text-xl font-semibold">我们的距离</h2></div><button type="button" onClick={() => requestLocation("manual")} disabled={requestState==="loading"} className="cos-button-secondary min-h-9 px-3 text-xs">{requestState==="loading"?<LoaderCircle className="animate-spin" size={14}/>:<LocateFixed size={14}/>} {buttonLabel}</button></div>
    {isFirstEnable ? <div className="rounded-2xl border border-[var(--rose)]/20 bg-white/60 p-3">
      <h3 className="text-sm font-semibold">开启位置距离</h3>
      <p className="mt-1 text-xs text-[var(--muted-ink)]">位置只用于计算双方距离，不会向对方展示精确位置。</p>
    </div> : null}
    {permissionDeclined && !props.currentHasLocation && !message ? <p className="rounded-2xl border border-[var(--rose)]/20 bg-white/60 p-3 text-xs text-[var(--rose)]/80" role="status">你拒绝了定位权限。可在浏览器设置中允许后再次开启。</p> : null}
    <div className="location-orbit" aria-label="双方当前位置">
      <div className="location-person location-person--left"><div className="location-avatar">{props.userA.avatarUrl?<img src={props.userA.avatarUrl} alt="" className="h-full w-full object-cover"/>:"♡"}</div><strong>{props.userA.displayName}</strong><span>{props.currentLocationLabel ?? "地点确认中"}</span></div>
      <div className="location-route" aria-hidden="true"><span className="location-globe">🌍</span><span className="location-plane">✈</span></div>
      <div className="location-person location-person--right"><div className="location-avatar">{props.userB.avatarUrl?<img src={props.userB.avatarUrl} alt="" className="h-full w-full object-cover"/>:"♡"}</div><strong>{props.userB.displayName}</strong><span>{props.otherLocationLabel ?? "地点确认中"}</span></div>
    </div>
    <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--muted-ink)]">{props.distanceKm!==null?getDistanceCopy(props.distanceKm):"双方更新后，这里会显示地表距离。"}</p></div>
    <div className="grid gap-2 rounded-2xl bg-white/45 p-3 text-xs sm:grid-cols-2">
      <p><strong>{props.currentHasLocation ? "我已开启" : "我未开启"}</strong><span className="mt-0.5 block text-[var(--muted-ink)]">你更新于 {formatShanghai(props.currentUpdatedAt)}</span></p>
      <p><strong>{props.otherHasLocation ? "对方已开启" : "等待对方开启"}</strong><span className="mt-0.5 block text-[var(--muted-ink)]">伴侣更新于 {formatShanghai(props.otherUpdatedAt)}</span></p>
    </div>
    {showReminder?<div className="rounded-2xl border border-[var(--rose)]/20 bg-white/60 p-3 text-xs"><p>你的位置已经超过一个月没有更新，要确认一下现在在哪里吗？</p><div className="mt-2 flex gap-2"><button className="cos-button-primary min-h-8 px-3" onClick={() => requestLocation("stale_confirmed")}>更新位置</button><button className="cos-button-secondary min-h-8 px-3" onClick={dismissReminder}>今天先不</button></div></div>:null}
    <div><h3 className="text-xs font-semibold tracking-[.12em] text-[var(--muted-ink)]">最近足迹</h3><div className="mt-2 space-y-1.5">{recentHistory.length?recentHistory.map(item=><p key={item.id} className="text-xs leading-5"><b>{item.displayName}</b>　{formatShanghai(item.recordedAt)}　在 {placeLabel(item)}</p>):<p className="text-xs text-[var(--muted-ink)]">你们的位置故事，才刚刚开始。</p>}</div></div>
    {message?<p className={`text-xs ${requestState==="error"?"text-[var(--rose)]/80":"text-emerald-700"}`} role="status">{message}</p>:null}
  </div>;
}
