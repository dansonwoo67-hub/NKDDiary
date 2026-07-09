import type { Profile } from "@/lib/auth/require-user";
import { updateProfileAction } from "@/features/profile/actions";

async function submitProfileForm(formData: FormData) {
  "use server";

  await updateProfileAction(formData);
}

export function ProfileForm({ profile }: { profile: Profile }) {
  return (
    <form action={submitProfileForm} className="hand-card rounded-[2rem] p-6">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white text-2xl shadow-sm">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
          ) : (
            "♡"
          )}
        </div>
        <div>
          <p className="text-sm tracking-[0.25em] text-[var(--muted-ink)]">个人资料</p>
          <h1 className="mt-1 text-2xl font-semibold">昵称和头像</h1>
        </div>
      </div>

      <label className="mt-6 block text-sm text-[var(--ink)]">
        昵称
        <input
          name="displayName"
          defaultValue={profile.display_name}
          required
          maxLength={24}
          className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
        />
      </label>

      <label className="mt-4 block text-sm text-[var(--ink)]">
        上传头像
        <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm" />
      </label>

      <button className="mt-6 rounded-full bg-[var(--ink)] px-5 py-3 text-white" type="submit">
        保存资料
      </button>
    </form>
  );
}
