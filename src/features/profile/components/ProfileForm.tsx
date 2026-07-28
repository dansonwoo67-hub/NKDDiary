import { CircleHelp, Heart, Info, Palette, UserRound } from "lucide-react";
import type { Profile } from "@/lib/auth/require-user";
import { updateProfileAction } from "@/features/profile/actions";

async function submitProfileForm(formData: FormData) {
  "use server";
  await updateProfileAction(formData);
}

export function ProfileForm({
  profile,
  spaceName,
  partnerName,
}: {
  profile: Profile;
  spaceName: string;
  partnerName: string | null;
}) {
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm font-semibold tracking-[0.22em] text-[var(--rose)]">SETTINGS</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">设置</h1>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">你的资料、偏好与我们的共同空间。</p>
      </header>

      <form action={submitProfileForm} className="grid gap-6">
        <section className="cos-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><UserRound size={19} />个人资料</h2>
          <div className="mt-5 flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white text-2xl shadow-sm">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
              ) : "♡"}
            </div>
            <label className="flex-1 text-sm">昵称<input name="displayName" defaultValue={profile.display_name} required maxLength={24} className="cos-input mt-2 px-4" /></label>
          </div>
          <label className="mt-4 block text-sm">上传头像<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm" /></label>
        </section>

        <section className="cos-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><Heart size={19} />共同空间</h2>
          <label className="mt-5 block text-sm">空间名称<input name="spaceName" defaultValue={spaceName} required maxLength={40} className="cos-input mt-2 px-4" /></label>
          <label className="mt-4 block text-sm">在一起的纪念日<input name="relationshipStartedOn" type="date" required defaultValue={profile.relationship_started_on} className="cos-input mt-2 px-4" /></label>
          <div className="mt-4 rounded-2xl bg-white/60 px-4 py-3 text-sm">
            <span className="text-[var(--muted-ink)]">伴侣连接：</span>{partnerName ?? "等待对方"}
          </div>
        </section>

        <section className="cos-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><Palette size={19} />显示偏好</h2>
          <label className="mt-5 flex min-h-11 items-center gap-3 text-sm">
            <input name="compactCalendar" type="checkbox" defaultChecked={profile.display_preferences?.compactCalendar ?? false} className="h-5 w-5 accent-[var(--rose)]" />
            使用紧凑日历显示
          </label>
        </section>

        <button className="cos-button-primary w-fit px-6" type="submit">保存设置</button>
      </form>

      <section className="cos-card grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <div className="rounded-2xl bg-white/60 p-4"><CircleHelp size={19} /><h2 className="mt-2 font-semibold">帮助与说明</h2><p className="mt-1 text-sm text-[var(--muted-ink)]">这是仅属于两个人的私人空间。</p></div>
        <div className="rounded-2xl bg-white/60 p-4"><Info size={19} /><h2 className="mt-2 font-semibold">关于 NKD Diary</h2><p className="mt-1 text-sm text-[var(--muted-ink)]">网页核心版本 · 2026</p></div>
      </section>
    </div>
  );
}
