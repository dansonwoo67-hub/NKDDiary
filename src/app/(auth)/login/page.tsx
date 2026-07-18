import { signInAction } from "@/features/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorCopy: Record<string, string> = {
  missing: "邮箱和密码都要填喔。",
  invalid: "登录失败，检查一下账号或密码。",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorCopy[params.error] : null;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-6">
      <form action={signInAction} className="hand-card w-full rounded-[2rem] p-8">
        <p className="text-sm tracking-[0.3em] text-[var(--muted-ink)]">NKD DIARY</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">欢迎回到玫瑰星球</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">这里只给两个人打开，不提供注册入口。</p>

        <label className="mt-8 block text-sm text-[var(--ink)]">
          邮箱
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
          />
        </label>

        <label className="mt-4 block text-sm text-[var(--ink)]">
          密码
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            className="mt-2 w-full rounded-2xl border border-[rgb(71_56_45_/_18%)] bg-white/70 px-4 py-3 outline-none"
          />
        </label>

        {error ? <p id="login-error" className="mt-4 rounded-2xl bg-[rgb(229_139_143_/_18%)] px-4 py-3 text-sm text-[var(--ink)]">{error}</p> : null}

        <button className="mt-6 w-full rounded-full bg-[var(--ink)] px-5 py-3 text-white" type="submit">
          进入日记
        </button>
      </form>
    </main>
  );
}
