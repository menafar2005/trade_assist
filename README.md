# ژورنال تحلیل پوزیشن (Trade Journal Panel)

پیاده‌سازی اسپک «پنل ژورنال تحلیل پوزیشن»: Go (کامپایل‌شده به WASM) روی Cloudflare Workers + React (Vite) + D1 برای داده + R2 برای تصاویر.

```
cmd/worker      ورودی Worker (D1 + R2)           internal/model  مدل، محاسبات R:R و ریسک، پاک‌سازی ورودی
cmd/server      سرور محلی (SQLite + پوشه)         internal/store  لایه‌ی SQL (سازگار با D1، بدون تراکنش)
web/            فرانت React/TS، RTL، Vazirmatn    internal/api    API، احراز هویت، تصاویر، پشتیبان ZIP
migrations/     اسکیمای D1/SQLite
```

## استقرار روی Cloudflare

```bash
npm install
npx wrangler login

# 1) دیتابیس و باکت (database_id چاپ‌شده را در wrangler.jsonc جایگزین REPLACE_WITH_D1_DATABASE_ID کنید)
npx wrangler d1 create trade-journal
npx wrangler r2 bucket create trade-journal-images

# 2) رمز ورود (ژورنال خصوصی است؛ بدون APP_PASSWORD همه‌ی APIها 503 می‌دهند)
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET      # یک رشته‌ی تصادفی بلند

# 3) مایگریشن و دیپلوی
npm run build:web
npm run db:migrate:remote
npm run deploy
```

نیازمندی‌ها: Go ≥ 1.26، Node ≥ 20. حجم WASM حدود ۲ مگابایت فشرده است (در سقف پلن رایگان).

## توسعه‌ی محلی

```bash
# حالت سریع: سرور بومی Go + Vite
AUTH_DISABLED=true go run ./cmd/server          # API روی http://127.0.0.1:8787
cd web && npm install && npm run dev            # فرانت با پراکسی /api

# شبیه‌ساز واقعی Cloudflare (D1/R2 محلی)
echo 'APP_PASSWORD=dev' > .dev.vars
npm run build:web && npm run db:migrate:local && npm run dev
```

تست‌ها: `go test ./...` و `cd web && npm test`.

## تصمیم‌های طراحی (پاسخ به سوالات باز اسپک)

| سوال | تصمیم |
| --- | --- |
| پلتفرم | وب‌اپ؛ در عرض ۴۸۰px هم کامل کار می‌کند |
| ذخیره‌سازی | سرور (D1 + R2) با یک رمز عبور؛ **یک‌کاربره** |
| ارقام | قیمت‌ها لاتین، متن فارسی؛ تاریخ‌ها میلادی `YYYY/MM/DD` |
| ارز پایه | قابل تنظیم (پیش‌فرض USDT) |
| حجم | «حجم» = تعداد واحد؛ سود و زیان = (خروج − ورود) × جهت × حجم (اهرم فقط ثبت می‌شود) |

**قفل پیش از ورود** در سرور اجرا می‌شود: پس از «وارد شدم»، هر `PUT` که بخش‌های ۱ تا ۷ را بفرستد `409 locked` می‌گیرد و فقط یادداشت تکمیلی (`POST /api/positions/{id}/addenda`) با زمان ثبت می‌شود. پوزیشن «منصرف‌شده» هم با همان شواهد قفل می‌شود.

## وضعیت نسبت به اسپک

P0 کامل است. از P1 فقط «یادآور بازبینی ۷ روزه» و چک‌لیست استراتژی شخصی پیاده شده؛ قالب‌ها، آمار، مقایسه‌ی پلن با اجرا و میانبرهای شواهد باقی مانده‌اند.

## محدودیت‌ها

- D1 تراکنش چندعبارتی ندارد؛ هر نوشتن یک دستور است و تغییر وضعیت با شرط وضعیت قبلی (`409 conflict`) محافظت می‌شود.
- تصویر ≤ ۸MB و فقط PNG/JPEG/GIF/WebP (SVG عمداً رد می‌شود). پشتیبان ≤ ۴۰MB.
- برای جلوگیری از حدس رمز، Cloudflare Rate Limiting روی `/api/login` اضافه کنید.
