# Fumo Travel Map

一个基于 Nuxt 4、Supabase、MapLibre GL JS 和 Vercel 的 Fumo 世界地图站。  
站点允许东方 Project 爱好者上传在世界各地拍摄的 fumo 照片，用地图坐标把旅程钉到同一张世界地图上。

## 当前能力

- 全屏世界地图首页，按视野范围加载已审核照片
- 地图聚类图钉，放大后切换为缩略图标记
- 邮箱 magic link 登录
- 首次登录强制设置公开作者 ID
- 投稿页支持：
  - 图片上传
  - 浏览器端生成缩略图
  - EXIF 坐标 / 拍摄时间读取
  - 地点搜索与逆地理编码
  - 精确位置与公开位置分离
- 公开详情页
- 站内管理员审核台
- 私有 Cloudflare R2 + 服务端签名 URL

## 技术栈

- Nuxt 4
- Supabase Auth / Database
- Cloudflare R2 Storage
- MapLibre GL JS
- Vercel
- EXIF 解析：`exifr`

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板

```bash
copy .env.example .env
```

3. 在 Supabase SQL Editor 中执行 [`supabase/schema.sql`](./supabase/schema.sql)

4. 配置 `.env`

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`（可选；留空时按 `R2_ACCOUNT_ID` 推导）
- `R2_SIGNED_URL_TTL_SECONDS`（可选）
- `NUXT_PUBLIC_SITE_URL`
- `NUXT_PUBLIC_MAP_STYLE_URL` 可保留默认免费底图
- `GEOCODE_BASE_URL` / `GEOCODE_USER_AGENT` 可保留默认值

5. 手动设置第一个管理员

```sql
update public.profiles
set role = 'admin'
where username = 'your_admin_id';
```

6. 启动开发环境

```bash
npm run dev
```

## GitHub OAuth

To enable GitHub login in Supabase:

1. Go to Supabase Dashboard -> Authentication -> Providers -> GitHub, then enable GitHub.
2. Create or reuse a GitHub OAuth App, and fill its Client ID / Client Secret into Supabase.
3. In the GitHub OAuth App settings, set the callback URL to the URL required by Supabase.
4. In Supabase Authentication settings, make sure Site URL and Redirect URLs include:
   - your local dev URL
   - your Vercel production / preview domain
   - the in-site login return URL used by this app, such as `https://your-site/?panel=login`

The app uses Supabase browser OAuth redirect flow and returns to the existing login panel. Users without a username will continue into onboarding after GitHub sign-in.

## Google OAuth

To enable Google login in Supabase:

1. Go to Supabase Dashboard -> Authentication -> Providers -> Google, then enable Google.
2. Create or reuse a Google OAuth client in Google Cloud, and fill its Client ID / Client Secret into Supabase.
3. In Google Cloud, add the callback URL required by Supabase to the authorized redirect URIs.
4. In Supabase Authentication settings, make sure Site URL and Redirect URLs include:
   - your local dev URL
   - your Vercel production / preview domain
   - the in-site login return URL used by this app, such as `https://your-site/?panel=login`

The app uses the same browser redirect flow as GitHub. Users without a username will continue into onboarding after Google sign-in.

## Microsoft OAuth

To enable Microsoft login in Supabase:

1. Go to Supabase Dashboard -> Authentication -> Providers -> Azure, then enable Azure.
2. Create or reuse an app registration in Microsoft Entra / Azure, and fill its Client ID / Client Secret into Supabase.
3. In the Microsoft app registration, add the callback URL required by Supabase.
4. Keep the provider as the default Microsoft social login unless you specifically want to lock it to a single tenant later.
5. In Supabase Authentication settings, make sure Site URL and Redirect URLs include:
   - your local dev URL
   - your Vercel production / preview domain
   - the in-site login return URL used by this app, such as `https://your-site/?panel=login`

The app uses Supabase browser OAuth redirect flow here as well. Microsoft sign-in is wired through the Supabase `azure` provider and requests the `email` scope so the returned identity includes a usable email address.

## 重要约定

- `fumo` bucket 必须保持私有
- 浏览器只直接操作 Auth；图片上传通过服务端签名 URL 直传 R2
- 所有数据库写入都通过 Nuxt server API
- 公开接口只返回 `approved` 投稿，且不会暴露精确坐标
- 公开地图使用 `public_lat/public_lng`
- 后台审核使用 `exact_lat/exact_lng` + `public_lat/public_lng` 双坐标

## 主要页面

- `/` 地图首页
- `/login` 邮箱登录
- `/onboarding` 设置作者 ID
- `/submit` 投稿
- `/posts/:id` 公开详情
- `/admin/review` 审核台

## 已验证

```bash
npm run build
```

## Vercel Security Baseline

Set these private environment variables in Vercel Project Settings -> Environment Variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SECURITY_ALERTS_ENABLED` (set to `true` only when webhook traffic alerts should be sent)
- `SECURITY_ALERT_WEBHOOK_URL`
- `SECURITY_ALERT_WEBHOOK_TOKEN` (optional)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Security headers are emitted by Nitro middleware. CSP starts in `Content-Security-Policy-Report-Only` mode and reports to `/api/security/csp-report`; review reports before switching to an enforcing CSP header. Traffic alert webhooks are disabled unless `SECURITY_ALERTS_ENABLED=true`.

Telegram submission notifications use `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. When a new post is submitted, the bot sends the submission time and the current pending review count.

当前仓库已可通过生产构建。构建阶段会提示较大的客户端 chunk，这是 MapLibre 与图片处理依赖带来的体积警告，不会阻止产物生成。
