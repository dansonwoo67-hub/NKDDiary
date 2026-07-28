import { signInAction } from "@/features/auth/actions";
import { Heart, LockKeyhole, Sparkles } from "lucide-react";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorCopy: Record<string, string> = {
  missing: "邮箱和密码都要填喔。",
  invalid: "登录失败，请检查邮箱或密码。",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorCopy[params.error] : null;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
      <section className="hidden min-h-[36rem] flex-col justify-between rounded-[2.25rem] bg-[linear-gradient(145deg,#ed315b,#ee8b08)] p-10 text-white shadow-[var(--shadow-soft)] lg:flex">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
          <Heart aria-hidden="true" fill="currentColor" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[0.3em] text-white/75">NKD DIARY</p>
          <h2 className="mt-5 max-w-lg font-serif text-5xl font-semibold leading-tight">
            把平凡的日子，
            <br />
            慢慢写成我们的故事。
          </h2>
          <div className="mt-8 flex items-center gap-3 text-sm text-white/80">
            <Sparkles aria-hidden="true" size={18} />
            <span>心情、回忆、日记与共同计划，都在这里。</span>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--rose)] text-white">
            <Heart aria-hidden="true" size={21} fill="currentColor" />
          </span>
          <span className="font-serif text-xl font-semibold">NKD Diary</span>
        </div>

        <form action={signInAction} className="cos-card w-full p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(237_49_91_/_10%)] text-[var(--rose)]">
            <LockKeyhole aria-hidden="true" size={21} />
          </div>
          <h1 className="mt-6 font-serif text-3xl font-semibold text-[var(--ink)] sm:text-4xl">欢迎回到我们的空间</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">这里只属于我们两个人</p>

          <label className="mt-8 block text-sm font-medium text-[var(--ink)]">
            邮箱
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={Boolean(error)}
              className="cos-input mt-2 px-4 py-3 outline-none"
              placeholder="name@example.com"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-[var(--ink)]">
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={Boolean(error)}
              className="cos-input mt-2 px-4 py-3 outline-none"
              placeholder="输入密码"
            />
          </label>

          {error ? (
            <p id="login-error" role="alert" className="mt-4 rounded-xl bg-[rgb(237_49_91_/_10%)] px-4 py-3 text-sm text-[var(--ink)]">
              {error}
            </p>
          ) : null}

          <button className="cos-button-primary mt-6 w-full px-5 py-3" type="submit">
            进入日记
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-[var(--muted-ink)]">
            私密空间不提供公开注册入口
          </p>
        </form>
      </section>
    </main>
  );
}
