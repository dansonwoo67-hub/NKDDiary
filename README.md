# NKD Diary

一个只给两个人使用的私密情侣日记站。

第一版核心闭环：

写信 → 七字引子 → 三字接住 → 展信 → 划线评点 → 回复提醒 → 月历回看

## 本地运行

1. 安装依赖：

```powershell
npm install
```

2. 复制环境变量：

```powershell
Copy-Item .env.local.example .env.local
```

3. 填写 `.env.local`。前两项是 Supabase 的公开配置；`SUPABASE_SERVICE_ROLE_KEY` 仅供服务端执行经过终端用户校验的评论写入，`SUPABASE_SECRET_KEY` 和两个人账号只用于本地执行种子脚本：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
COUPLE_USER_A_EMAIL=
COUPLE_USER_A_PASSWORD=
COUPLE_USER_A_DISPLAY_NAME=
COUPLE_USER_B_EMAIL=
COUPLE_USER_B_PASSWORD=
COUPLE_USER_B_DISPLAY_NAME=
NEXT_PUBLIC_RELATIONSHIP_START_DATE=2024-01-01
```

`SUPABASE_SERVICE_ROLE_KEY` 和 `SUPABASE_SECRET_KEY` 只能放在服务端环境变量里，绝对不要改名成 `NEXT_PUBLIC_*`，也不要提交到 Git。缺少 `SUPABASE_SERVICE_ROLE_KEY` 时，评论创建和更新会安全失败，不会降级使用公开密钥。

4. 启动：

```powershell
npm run dev
```

## Supabase 设置

1. 创建 Supabase 项目。
2. 在 SQL Editor 按文件名顺序执行 `supabase/migrations/` 里的迁移文件。当前包括：

```text
supabase/migrations/202607100001_initial_schema.sql
supabase/migrations/202607100002_harden_security_and_indexes.sql
```

3. 回到本地运行：

```powershell
npm run seed:couple-users
```

这会创建或更新两个固定账号，并写入 `profiles`。

## 常用命令

```powershell
npm run test
npm run lint
npm run build
npm run test:e2e
```

如果没有配置真实 Supabase 项目和两人账号，E2E 中需要真实账号的场景会自动跳过。

## 部署到 Vercel

1. 把仓库推到 GitHub。
2. 在 Vercel 导入项目。
3. 设置网页运行需要的环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
   - `NEXT_PUBLIC_RELATIONSHIP_START_DATE`
4. 部署。

两个人的邮箱、密码和 `SUPABASE_SECRET_KEY` 只用于本地执行 `npm run seed:couple-users`，不需要放进 Vercel。`SUPABASE_SERVICE_ROLE_KEY` 则是评论创建/更新所需的服务端运行变量。

## 视觉素材

当前代码只放了“小王子手绘风”的色调、纸感、星球/玫瑰氛围和静态素材位，不硬编码第三方版权原图。

后续如果你有自己准备的背景图，可以放入 `public/` 后再接到首页背景。
