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

3. 填写 `.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
COUPLE_USER_A_EMAIL=
COUPLE_USER_A_PASSWORD=
COUPLE_USER_A_DISPLAY_NAME=
COUPLE_USER_B_EMAIL=
COUPLE_USER_B_PASSWORD=
COUPLE_USER_B_DISPLAY_NAME=
NEXT_PUBLIC_RELATIONSHIP_START_DATE=2024-01-01
```

`SUPABASE_SECRET_KEY` 只能放在服务端环境变量里，绝对不要改名成 `NEXT_PUBLIC_*`。

4. 启动：

```powershell
npm run dev
```

## Supabase 设置

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行：

```text
supabase/migrations/202607100001_initial_schema.sql
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
3. 设置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `COUPLE_USER_A_EMAIL`
   - `COUPLE_USER_A_PASSWORD`
   - `COUPLE_USER_A_DISPLAY_NAME`
   - `COUPLE_USER_B_EMAIL`
   - `COUPLE_USER_B_PASSWORD`
   - `COUPLE_USER_B_DISPLAY_NAME`
   - `NEXT_PUBLIC_RELATIONSHIP_START_DATE`
4. 部署。

## 视觉素材

当前代码只放了“小王子手绘风”的色调、纸感、星球/玫瑰氛围和静态素材位，不硬编码第三方版权原图。

后续如果你有自己准备的背景图，可以放入 `public/` 后再接到首页背景。
