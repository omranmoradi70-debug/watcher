'use strict';
/*
  ناظر بازار (نسخه‌ی کامل)
  هر ۱۵ دقیقه اجرا می‌شه (گیت‌هاب) و این کارها رو می‌کنه:
    - حرکت ناگهانی ارزهای لیست رو چک می‌کنه (کندل ۱۵ دقیقه‌ای)
    - تقریباً هر ساعت: تحلیل ارزهای لیست، اعلان سیگنال تازه، گزارش ساعتی جدولی، اسکنر ۱۰۰ ارز اول، ثبت نتیجه‌ی سیگنال‌ها
    - هر روز، هر هفته، هر ماه: تحلیل روزانه، هفتگی و ماهانه با حمایت و مقاومت و سناریو
  اجرا:  node notifier.js [run | test | setup | full | daily | weekly | monthly | scan | stats | replay]
  توکن و شناسه چت از Secrets گیت‌هاب خونده می‌شن (TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID).
*/

// ====================== تنظیمات (اینجا رو می‌تونی عوض کنی) ======================
const CONFIG = {
  coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],  // ارزهای لیست (جفت با USDT)، حداکثر ۱۵ تا
  style: 'swing',          // 'swing' = نوسانی (۱ ساعت، ۴ ساعت، روزانه)  |  'short' = کوتاه‌مدت (۱۵ دقیقه، ۱ ساعت، ۴ ساعت)
  minStrength: 'medium',   // کمترین قدرت سیگنال برای اعلان جدا: 'weak' | 'medium' | 'strong'
  alertShorts: true,       // سیگنال فروش (شورت) هم خبر بده؟ توی اسپات فقط یعنی «نخر»
  cooldownHours: 12,       // بعد از یه اعلان برای یه ارز، تا این مدت اعلان تازه برای همون ارز نفرسته
  capital: 1000,           // سرمایه (USDT) برای حساب حجم پیشنهادی
  riskPct: 1,              // درصد ریسک هر معامله
  hourlyReport: true,      // هر ساعت یه گزارش جدولی از وضعیت همه‌ی ارزها (برای تمرین). false = فقط سیگنال تازه
  heartbeatHours: 24,      // اگه گزارش ساعتی خاموش باشه، هر چند ساعت یه پیام «ربات زنده است» (۰ = خاموش)

  // حرکت ناگهانی
  spikeAlerts: true,       // اعلان حرکت ناگهانی (کندل ۱۵ دقیقه‌ای)
  spikeAtrMult: 2.5,       // یعنی کندل ۱۵ دقیقه‌ای بیشتر از این‌قدر برابر نوسان عادی حرکت کنه
  spikeCooldownHours: 2,   // بین دو اعلان حرکت ناگهانی برای یه ارز

  // اسکنر ۱۰۰ ارز اول (بر اساس حجم معاملات ۲۴ ساعته)
  scanEnabled: true,
  scanTop: 100,            // از چند ارز اول حجم
  scanCandidates: 20,      // چند ارزِ پرحرکت تحلیل کامل بشن
  scanMinVolUsd: 3000000,  // حداقل حجم ۲۴ ساعته (USDT)، برای فرار از ارزهای کم‌حجم و دستکاری‌شده
  scanMinStrength: 'medium',
  scanMaxAlerts: 3,        // حداکثر اعلان اسکنر در هر بار
  scanCooldownHours: 12,
  scanOnly: [],            // اگه پر باشه، اسکنر فقط همین ارزها رو بررسی می‌کنه (مثلاً لیست ارزهای اوکی‌اکسچنج)
  scanExclude: [],         // ارزهایی که نمی‌خوای اسکنر ببینه

  // گزارش‌های روزانه، هفتگی و ماهانه (ساعت به وقت تهران، تاریخ میلادی)
  dailyReport: true,
  weeklyReport: true,
  monthlyReport: true,
  reportHourTehran: 8,
  weeklyDay: 1,            // روز هفته‌ی گزارش هفتگی: 1 = دوشنبه (کندل هفتگی بازار یکشنبه شب UTC بسته می‌شه)

  // اطلاعات جانبی (روی امتیاز سیگنال اثری ندارن)
  showDerivatives: true,   // فاندینگ و نسبت لانگ به شورت
  showNews: true,          // شاخص ترس و طمع و تیتر خبرها
  eventWarnHours: 24,      // هشدار رویدادهای مهم اقتصادی تا این چند ساعت قبل

  signalValidDays: { swing: 7, short: 2 },  // اعتبار هر سیگنال برای ثبت نتیجه

  // بازپخش تاریخی (سابقه‌ی حالت مشابه و الگوهای کندلی) از کندل‌های گذشته؛ فقط خوندنیه و چیزی توی سیگنال‌های ثبت‌شده عوض نمی‌کنه
  replayEnabled: true,
  replayFrom: '2020-01-01', // تاریخچه از این تاریخ (اگه از صرافی نیومد، خودش به ۴ ماه آخر برمی‌گرده)
  replayEveryDays: 30,     // هر چند روز یه بار خودکار دوباره حساب بشه (دستی: حالت replay)
  replayBudgetMs: 480000,  // سقف زمان بازپخش دستی (۸ دقیقه)
  replayAutoBudgetMs: 150000, // سقف زمان بازپخش خودکار توی اجرای معمولی (۲.۵ دقیقه)
  replayExtra: ['DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'TRX'],  // ارزهای اضافه برای بزرگ‌تر شدن نمونه (به‌علاوه‌ی ارزهای لیست)
  replayFwdCandles: 6,     // برای آمار الگوها: بعد از چند کندل ۴ ساعته نتیجه سنجیده بشه (۶ = ۲۴ ساعت)

  // رویدادهای مهم اقتصادی آمریکا (ساعت UTC). تاریخ‌های ۲۰۲۶ با تقویم رسمی چک شدن؛ FOMC سال ۲۰۲۷ موقتیه. NFP و CPI سال ۲۰۲۷ هنوز اضافه نشده. هر چند ماه یه بار باید به‌روز بشه.
  events: [
    { name: 'FOMC (تصمیم نرخ بهره‌ی فدرال رزرو)', at: '2026-10-28T18:00:00Z' },
    { name: 'NFP (گزارش اشتغال آمریکا)', at: '2026-11-06T13:30:00Z' },
    { name: 'CPI (گزارش تورم آمریکا)', at: '2026-11-10T13:30:00Z' },
    { name: 'NFP (گزارش اشتغال آمریکا)', at: '2026-12-04T13:30:00Z' },
    { name: 'FOMC (تصمیم نرخ بهره‌ی فدرال رزرو)', at: '2026-12-09T19:00:00Z' },
    { name: 'CPI (گزارش تورم آمریکا)', at: '2026-12-10T13:30:00Z' },
    { name: 'FOMC (تصمیم نرخ بهره‌ی فدرال رزرو)', at: '2027-01-27T19:00:00Z' },
    { name: 'FOMC (تصمیم نرخ بهره‌ی فدرال رزرو)', at: '2027-03-17T18:00:00Z' }
  ],

  sources: ['okx', 'gate', 'kucoin', 'mexc', 'bybit', 'binance']  // ترتیب امتحان صرافی‌ها
};
// ================================================================================

const fs = require('fs');
const path = require('path');

const TA = (() => {
  const module = { exports: {} };
  (function () {
/* Pure analysis engine: indicators, multi-timeframe scoring, scenario builder, risk sizing, simple backtest.
   No DOM, no network. Works in browser (global TA) and Node (module.exports). */
(function (root) {
  'use strict';

  var TF_LABEL = { '15m': '۱۵ دقیقه', '1h': '۱ ساعت', '4h': '۴ ساعت', '1d': 'روزانه', '1w': 'هفتگی', '1M': 'ماهانه' };
  var TF_ADJ = { '15m': 'پانزده‌دقیقه‌ای', '1h': 'یک‌ساعته', '4h': 'چهار‌ساعته', '1d': 'روزانه', '1w': 'هفتگی', '1M': 'ماهانه' };

  // ---------- helpers ----------
  function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ok(x) { return typeof x === 'number' && isFinite(x); }
  function fixed(x, d) { return ok(x) ? x.toFixed(d) : '-'; }
  function fmtPrice(p) {
    if (!ok(p)) return '-';
    var a = Math.abs(p);
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
    return p.toFixed(d);
  }

  // ---------- indicators ----------
  function emaFrom(v, p, start) {
    var out = new Array(v.length).fill(NaN);
    if (v.length - start < p) return out;
    var k = 2 / (p + 1), s = 0, i;
    for (i = start; i < start + p; i++) s += v[i];
    out[start + p - 1] = s / p;
    for (i = start + p; i < v.length; i++) out[i] = v[i] * k + out[i - 1] * (1 - k);
    return out;
  }
  function ema(v, p) { return emaFrom(v, p, 0); }

  function rsi(c, p) {
    p = p || 14;
    var out = new Array(c.length).fill(NaN), i, d;
    if (c.length <= p) return out;
    var g = 0, l = 0;
    for (i = 1; i <= p; i++) { d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= p; l /= p;
    out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = p + 1; i < c.length; i++) {
      d = c[i] - c[i - 1];
      g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
      l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }

  function macd(c, f, s, sg) {
    f = f || 12; s = s || 26; sg = sg || 9;
    var ef = ema(c, f), es = ema(c, s), n = c.length, i;
    var line = new Array(n).fill(NaN);
    for (i = 0; i < n; i++) if (ok(ef[i]) && ok(es[i])) line[i] = ef[i] - es[i];
    var firstValid = line.findIndex(ok);
    var signal = firstValid < 0 ? new Array(n).fill(NaN) : emaFrom(line, sg, firstValid);
    var hist = new Array(n).fill(NaN);
    for (i = 0; i < n; i++) if (ok(line[i]) && ok(signal[i])) hist[i] = line[i] - signal[i];
    return { line: line, signal: signal, hist: hist };
  }

  function atr(h, l, c, p) {
    p = p || 14;
    var n = c.length, out = new Array(n).fill(NaN), i;
    if (n <= p) return out;
    var tr = new Array(n).fill(0);
    tr[0] = h[0] - l[0];
    for (i = 1; i < n; i++) tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    var s = 0;
    for (i = 1; i <= p; i++) s += tr[i];
    out[p] = s / p;
    for (i = p + 1; i < n; i++) out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
    return out;
  }

  function bollinger(c, p, k) {
    p = p || 20; k = k || 2;
    var n = c.length, pb = new Array(n).fill(NaN), bw = new Array(n).fill(NaN), i, j;
    for (i = p - 1; i < n; i++) {
      var m = 0;
      for (j = i - p + 1; j <= i; j++) m += c[j];
      m /= p;
      var v = 0;
      for (j = i - p + 1; j <= i; j++) v += (c[j] - m) * (c[j] - m);
      var sd = Math.sqrt(v / p), up = m + k * sd, lo = m - k * sd;
      pb[i] = up > lo ? (c[i] - lo) / (up - lo) : 0.5;
      bw[i] = m > 0 ? (up - lo) / m : NaN;
    }
    return { pb: pb, bw: bw };
  }

  function volAverage(v, p) {
    p = p || 20;
    var n = v.length, out = new Array(n).fill(NaN), i, j;
    for (i = p; i < n; i++) {
      var s = 0;
      for (j = i - p; j < i; j++) s += v[j];
      out[i] = s / p;
    }
    return out;
  }

  function computeIndicators(candles) {
    var o = candles.map(function (x) { return x.o; });
    var h = candles.map(function (x) { return x.h; });
    var l = candles.map(function (x) { return x.l; });
    var c = candles.map(function (x) { return x.c; });
    var v = candles.map(function (x) { return x.v; });
    var bb = bollinger(c, 20, 2);
    return {
      n: c.length, o: o, h: h, l: l, c: c, v: v,
      ema20: ema(c, 20), ema50: ema(c, 50), ema200: ema(c, 200),
      rsi: rsi(c, 14), macd: macd(c, 12, 26, 9), atr: atr(h, l, c, 14),
      bb: bb, volAvg: volAverage(v, 20)
    };
  }

  // ---------- scoring ----------
  function rsiValue(r) {
    var f = function (x) { return x <= 70 ? (x - 50) / 20 * 0.8 : Math.max(-0.6, 0.8 - (x - 70) / 15 * 1.2); };
    return r >= 50 ? f(r) : -f(100 - r);
  }
  function bollValue(pb) {
    var h = function (x) { return x <= 1 ? (x - 0.5) * 1.4 : Math.max(-0.3, 0.7 - (x - 1) * 2); };
    return pb >= 0.5 ? h(pb) : -h(1 - pb);
  }

  function scoreLabel(s) {
    if (s >= 45) return 'صعودی قوی';
    if (s >= 20) return 'صعودی';
    if (s > -20) return 'خنثی';
    if (s > -45) return 'نزولی';
    return 'نزولی قوی';
  }

  // Score at candle index i (uses data up to and including i).
  function scoreAt(ind, i) {
    var c = ind.c[i], e20 = ind.ema20[i], e50 = ind.ema50[i], e200 = ind.ema200[i];
    var r = ind.rsi[i], hist = ind.macd.hist[i], a = ind.atr[i], pb = ind.bb.pb[i];
    if (!ok(e50) || !ok(e20) || !ok(r) || !ok(hist) || !ok(a) || !ok(pb)) return null;

    var tSum = 0, tMax = 0;
    tSum += c > e50 ? 0.35 : -0.35; tMax += 0.35;
    tSum += e20 > e50 ? 0.25 : -0.25; tMax += 0.25;
    if (ok(e200)) { tSum += c > e200 ? 0.25 : -0.25; tMax += 0.25; }
    if (i >= 10 && ok(ind.ema50[i - 10])) { tSum += ind.ema50[i] > ind.ema50[i - 10] ? 0.15 : -0.15; tMax += 0.15; }
    var trend = tSum / tMax;

    var histPrev = ind.macd.hist[i - 1];
    var mom = 0.5 * sgn(hist) + (ok(histPrev) ? 0.5 * sgn(hist - histPrev) : 0);

    var rs = rsiValue(r);

    var vr = ok(ind.volAvg[i]) && ind.volAvg[i] > 0 ? ind.v[i] / ind.volAvg[i] : 1;
    var candleDir = sgn(c - ind.o[i]);
    var vol = vr > 1.5 ? candleDir : vr > 1.1 ? candleDir * 0.5 : 0;

    var bo = bollValue(pb);

    var score = 40 * trend + 20 * mom + 15 * rs + 10 * vol + 15 * bo;
    return {
      score: Math.round(clamp(score, -100, 100)),
      trend: trend, mom: mom, rsiV: rs, vol: vol, boll: bo, volRatio: vr
    };
  }

  // ---------- support / resistance ----------
  function findLevels(ind, i, lookback, left, right) {
    lookback = lookback || 300; left = left || 3; right = right || 3;
    var a = ind.atr[i];
    var start = Math.max(0, i + 1 - lookback), pts = [], j, k;
    for (j = start + left; j <= i - right; j++) {
      var isH = true, isL = true;
      for (k = j - left; k <= j + right; k++) {
        if (k === j) continue;
        if (ind.h[k] >= ind.h[j] && !(k > j && ind.h[k] === ind.h[j])) isH = false;
        if (ind.l[k] <= ind.l[j] && !(k > j && ind.l[k] === ind.l[j])) isL = false;
      }
      if (isH) pts.push({ p: ind.h[j], i: j });
      if (isL) pts.push({ p: ind.l[j], i: j });
    }
    pts.sort(function (x, y) { return x.p - y.p; });
    var tol = ok(a) ? 0.5 * a : ind.c[i] * 0.004;
    var clusters = [];
    pts.forEach(function (pt) {
      var cl = clusters[clusters.length - 1];
      if (cl && Math.abs(pt.p - cl.sum / cl.n) <= tol) { cl.sum += pt.p; cl.n++; cl.last = Math.max(cl.last, pt.i); }
      else clusters.push({ sum: pt.p, n: 1, last: pt.i });
    });
    return clusters.map(function (cl) {
      return { price: cl.sum / cl.n, touches: cl.n, last: cl.last, recent: cl.last > i - 80 };
    });
  }

  function mergeLevels(listA, listB, tol) {
    var all = listA.concat(listB).sort(function (x, y) { return x.price - y.price; });
    var out = [];
    all.forEach(function (lv) {
      var prev = out[out.length - 1];
      if (prev && Math.abs(lv.price - prev.price) <= tol) {
        var n = prev.touches + lv.touches;
        prev.price = (prev.price * prev.touches + lv.price * lv.touches) / n;
        prev.touches = n; prev.last = Math.max(prev.last, lv.last); prev.recent = prev.recent || lv.recent;
      } else out.push({ price: lv.price, touches: lv.touches, last: lv.last, recent: lv.recent });
    });
    return out;
  }

  // ---------- scenario ----------
  function buildScenario(dir, price, a, e20, levels) {
    var ext = dir * (price - e20) / a;
    var mode, lo, hi, entry;
    if (ext > 1.5) {
      mode = 'pullback';
      lo = e20 - 0.3 * a; hi = e20 + 0.3 * a; entry = e20;
    } else {
      mode = 'now';
      if (dir > 0) { lo = price - 0.5 * a; hi = price; } else { lo = price; hi = price + 0.5 * a; }
      entry = price;
    }

    // stop
    var behind = levels.filter(function (lv) { return dir > 0 ? lv.price < entry - 0.3 * a : lv.price > entry + 0.3 * a; })
      .sort(function (x, y) { return dir > 0 ? y.price - x.price : x.price - y.price; });
    var pick = null, b;
    for (b = 0; b < behind.length; b++) {
      if (Math.abs(entry - behind[b].price) > 3.5 * a) break;
      if (behind[b].touches >= 2) { pick = behind[b]; break; }
    }
    if (!pick && behind.length && Math.abs(entry - behind[0].price) <= 3.5 * a) pick = behind[0];
    var dist = pick ? Math.abs(entry - pick.price) + 0.35 * a : 1.5 * a;
    dist = clamp(dist, 1.0 * a, 3.5 * a);
    var stop = entry - dir * dist;
    var risk = dist;

    // targets
    var ahead = levels.filter(function (lv) { return dir > 0 ? lv.price > entry : lv.price < entry; })
      .sort(function (x, y) { return dir > 0 ? x.price - y.price : y.price - x.price; });
    var obstacle = ahead.find(function (lv) { return Math.abs(lv.price - entry) < 1.2 * risk && Math.abs(lv.price - entry) > 0.25 * a; }) || null;
    var cand = ahead.filter(function (lv) { var d = Math.abs(lv.price - entry); return d >= 1.2 * risk && d <= 6 * risk; });
    var tp1, tp1src, tp2, tp2src;
    if (cand.length) { tp1 = cand[0].price; tp1src = 'level'; } else { tp1 = entry + dir * 1.5 * risk; tp1src = 'rr'; }
    var cand2 = cand.filter(function (lv) { return Math.abs(lv.price - tp1) >= 0.5 * risk; });
    if (cand2.length && tp1src === 'level') { tp2 = cand2[0].price; tp2src = 'level'; }
    else {
      var rr1 = Math.abs(tp1 - entry) / risk;
      tp2 = entry + dir * Math.max(2.5, rr1 + 1) * risk; tp2src = 'rr';
    }
    return {
      dir: dir, mode: mode, entry: entry, zoneLo: lo, zoneHi: hi, stop: stop, risk: risk,
      tp1: tp1, tp1src: tp1src, tp2: tp2, tp2src: tp2src,
      rr1: Math.abs(tp1 - entry) / risk, rr2: Math.abs(tp2 - entry) / risk,
      stopSrc: pick ? 'level' : 'atr', obstacle: obstacle ? obstacle.price : null,
      stretch: ext
    };
  }

  // ---------- multi-timeframe analysis ----------
  // input: { price, execTf, series: [{tf, weight, candles(closed only)}] }  (series ordered low -> high timeframe)
  function buildTfs(series) {
    var tfs = [], inds = {}, i;
    for (i = 0; i < series.length; i++) {
      var s = series[i];
      if (!s.candles || s.candles.length < 60) continue;
      var ind = computeIndicators(s.candles);
      var last = ind.n - 1;
      var sc = scoreAt(ind, last);
      if (!sc) continue;
      inds[s.tf] = ind;
      var bwWin = ind.bb.bw.slice(Math.max(0, last - 99), last + 1).filter(ok);
      var bwNow = ind.bb.bw[last];
      var bwRank = bwWin.length > 20 ? bwWin.filter(function (x) { return x <= bwNow; }).length / bwWin.length : 0.5;
      tfs.push({
        tf: s.tf, label: TF_LABEL[s.tf] || s.tf, weight: s.weight, score: sc.score, state: scoreLabel(sc.score),
        close: ind.c[last], ema20: ind.ema20[last], ema50: ind.ema50[last], ema200: ind.ema200[last],
        rsi: ind.rsi[last], hist: ind.macd.hist[last], histPrev: ind.macd.hist[last - 1],
        atr: ind.atr[last], atrPct: ind.atr[last] / ind.c[last] * 100, pctB: ind.bb.pb[last],
        volRatio: sc.volRatio, bwRank: bwRank, idx: last
      });
    }
    return { tfs: tfs, inds: inds };
  }

  function analyze(input) {
    var price = input.price, series = input.series, execTf = input.execTf;
    var i, k;
    var built = buildTfs(series), tfs = built.tfs, inds = built.inds;
    if (tfs.length < 2) return { error: 'داده کافی نیست' };

    var wSum = 0, comp = 0;
    tfs.forEach(function (t) { wSum += t.weight; comp += t.weight * t.score; });
    comp = comp / wSum;
    var top = tfs[tfs.length - 1];
    var exec = tfs.find(function (t) { return t.tf === execTf; }) || tfs[Math.floor(tfs.length / 2)];

    var dir = 0;
    if (comp >= 25 && top.score >= 10) dir = 1;
    else if (comp <= -25 && top.score <= -10) dir = -1;

    var agreeN = tfs.filter(function (t) { return dir !== 0 ? sgn(t.score) === dir && Math.abs(t.score) >= 15 : false; }).length;
    var agreement = dir !== 0 ? agreeN / tfs.length : 0;

    var reasons = [], warnings = [], scenario = null, strength = null;
    var execInd = inds[exec.tf], topInd = inds[top.tf];

    if (dir !== 0) {
      var a = exec.atr;
      var levelsExec = findLevels(execInd, exec.idx);
      var levelsTop = top.tf !== exec.tf ? findLevels(topInd, top.idx) : [];
      var levels = mergeLevels(levelsExec, levelsTop, 0.5 * a);
      scenario = buildScenario(dir, price, a, exec.ema20, levels);

      var ac = Math.abs(comp);
      strength = ac >= 50 && agreement >= 0.75 ? 'strong' : ac >= 35 && agreement >= 0.66 ? 'medium' : 'weak';
      var down = function () { strength = strength === 'strong' ? 'medium' : 'weak'; };

      if (scenario.mode === 'pullback') {
        warnings.push('قیمت ' + fixed(scenario.stretch, 1) + ' برابر ATR از میانگین ۲۰ تایی دور شده؛ دنبال کردن قیمت ریسک بالایی داره و بهتره منتظر برگشت به ناحیه ورود بمونی.');
        down();
      }
      if (scenario.obstacle) {
        warnings.push('یه ' + (dir > 0 ? 'مقاومت' : 'حمایت') + ' نزدیک (' + fmtPrice(scenario.obstacle) + ') بین ورود و هدف اول هست و ممکنه جلوی حرکت رو بگیره.');
        down();
      }
      if ((dir > 0 && exec.rsi > 72) || (dir < 0 && exec.rsi < 28)) {
        warnings.push('RSI در ' + exec.label + ' به ' + fixed(exec.rsi, 0) + ' رسیده؛ حرکت خسته به نظر می‌رسه.');
        down();
      }
      if (exec.volRatio < 0.7) warnings.push('حجم کندل آخر ' + exec.label + ' کمتر از میانگینه؛ اعتماد به حرکت کمتره.');
      if (exec.atrPct > 4) warnings.push('نوسان ' + exec.label + ' بالاست (ATR حدود ' + fixed(exec.atrPct, 1) + '٪ قیمت)؛ حجم معامله رو کم بگیر.');
      if (scenario.rr1 < 1.2) { warnings.push('نسبت ریسک به ریوارد هدف اول زیر ۱.۲ است.'); down(); }
      if (exec.bwRank <= 0.2) warnings.push('باندهای بولینگر فشرده‌ان؛ ممکنه حرکت شدید بیاد ولی جهتش قطعی نیست.');

      var same = tfs.filter(function (t) { return sgn(t.score) === dir && Math.abs(t.score) >= 15; }).map(function (t) { return t.label; });
      reasons.push(agreeN + ' از ' + tfs.length + ' تایم‌فریم ' + (dir > 0 ? 'صعودی' : 'نزولی') + ' هستن' + (same.length ? ' (' + same.join('، ') + ')' : '') + '.');
      var up = top.close > top.ema50 === (dir > 0);
      reasons.push('روند تایم‌فریم بالاتر (' + top.label + '): قیمت ' + (top.close > top.ema50 ? 'بالای' : 'پایین') + ' میانگین ۵۰ تاییه' +
        (ok(top.ema200) ? ' و ' + (top.close > top.ema200 ? 'بالای' : 'پایین') + ' میانگین ۲۰۰ تایی' : '') + (up ? '، هم‌جهت با سناریو.' : '، ولی خلاف سناریوئه.'));
      reasons.push('MACD در ' + exec.label + ' ' + (exec.hist > 0 ? 'مثبته' : 'منفیه') + ' و ' +
        (ok(exec.histPrev) && Math.abs(exec.hist) > Math.abs(exec.histPrev) ? 'قوی‌تر' : 'ضعیف‌تر') + ' می‌شه.');
      reasons.push('RSI در ' + exec.label + ' برابر ' + fixed(exec.rsi, 0) + ' است' +
        ((dir > 0 && exec.rsi <= 70) || (dir < 0 && exec.rsi >= 30) ? ' و هنوز جا برای ادامه حرکت داره.' : '.'));
      if (exec.volRatio >= 1.3) reasons.push('حجم کندل آخر ' + fixed(exec.volRatio, 1) + ' برابر میانگینه که حرکت رو تأیید می‌کنه.');
      reasons.push('حد ضرر ' + (scenario.stopSrc === 'level' ? 'پشت نزدیک‌ترین ' + (dir > 0 ? 'حمایت' : 'مقاومت') : 'بر اساس ۱.۵ برابر ATR') +
        ' تعیین شده و هدف اول ' + (scenario.tp1src === 'level' ? 'روی یک سطح قیمتی' : 'با نسبت ۱.۵ به ۱') + ' است.');
    } else {
      var sameSign = tfs.every(function (t) { return sgn(t.score) === sgn(tfs[0].score) && Math.abs(t.score) >= 15; });
      if (Math.abs(comp) < 25) reasons.push('امتیاز کل ' + fixed(comp, 0) + ' است و برای ورود حداقل ۲۵ لازمه؛ بازار جهت روشنی نداره.');
      else reasons.push('امتیاز کل ' + fixed(comp, 0) + ' است ولی تایم‌فریم بالاتر (' + top.label + ') با اون هم‌جهت نیست؛ با روند بزرگ‌تر نمی‌جنگیم.');
      if (!sameSign) reasons.push('تایم‌فریم‌ها با هم هم‌جهت نیستن (' + tfs.map(function (t) { return t.label + ' ' + (t.score > 0 ? '+' : '') + t.score; }).join('، ') + ').');
      reasons.push('بهترین کار فعلاً صبره؛ معامله نکردن هم یک تصمیمه.');
    }

    return {
      price: price, composite: Math.round(comp), agreement: agreement,
      decision: dir > 0 ? 'long' : dir < 0 ? 'short' : 'wait', strength: strength,
      execTf: exec.tf, tfs: tfs, scenario: scenario, reasons: reasons, warnings: warnings
    };
  }

  // ---------- risk sizing ----------
  function positionSize(capital, riskPct, entry, stop) {
    var d = Math.abs(entry - stop);
    if (!(capital > 0) || !(riskPct > 0) || !(d > 0)) return null;
    var riskAmt = capital * riskPct / 100;
    var units = riskAmt / d;
    var notional = units * entry;
    return { riskAmt: riskAmt, units: units, notional: notional, leverage: notional / capital };
  }

  // ---------- simple backtest on one timeframe ----------
  function backtest(candles, opts) {
    opts = opts || {};
    var T = opts.threshold || 35, fee = opts.fee != null ? opts.fee : 0.001, slip = opts.slip != null ? opts.slip : 0.0005;
    var stopMult = opts.stopAtr || 1.5, tpMult = opts.tpAtr || 3.0, maxBars = opts.maxBars || 40;
    var n = candles.length;
    if (n < 320) return { error: 'برای تست حداقل ۳۲۰ کندل لازمه (فعلاً ' + n + ')' };
    var ind = computeIndicators(candles);
    var trades = [], i = 205;
    while (i < n - 2) {
      var sc = scoreAt(ind, i);
      var dir = sc ? (sc.score >= T ? 1 : sc.score <= -T ? -1 : 0) : 0;
      var a = ind.atr[i];
      if (!dir || !ok(a)) { i++; continue; }
      var entry = candles[i + 1].o * (1 + dir * slip);
      var risk = stopMult * a, stop = entry - dir * risk, tp = entry + dir * tpMult * a;
      var exit = null, j, end = Math.min(n - 1, i + 1 + maxBars);
      for (j = i + 1; j <= end; j++) {
        var cd = candles[j];
        if (dir > 0) {
          if (cd.o <= stop) { exit = cd.o; break; }
          if (cd.l <= stop) { exit = stop; break; }
          if (cd.h >= tp) { exit = tp; break; }
        } else {
          if (cd.o >= stop) { exit = cd.o; break; }
          if (cd.h >= stop) { exit = stop; break; }
          if (cd.l <= tp) { exit = tp; break; }
        }
      }
      if (exit === null) { j = end; exit = candles[end].c; }
      exit = exit * (1 - dir * slip);
      var pnl = dir * (exit - entry) - entry * fee - exit * fee;
      trades.push({ i: i + 1, dir: dir, R: pnl / risk });
      i = Math.max(j, i + 1);
    }
    var wins = trades.filter(function (t) { return t.R > 0; });
    var gw = wins.reduce(function (s, t) { return s + t.R; }, 0);
    var gl = trades.filter(function (t) { return t.R <= 0; }).reduce(function (s, t) { return s - t.R; }, 0);
    var eq = [0], peak = 0, dd = 0, cum = 0;
    trades.forEach(function (t) { cum += t.R; eq.push(cum); peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); });
    return {
      trades: trades.length, longs: trades.filter(function (t) { return t.dir > 0; }).length,
      winRate: trades.length ? wins.length / trades.length * 100 : 0,
      avgR: trades.length ? cum / trades.length : 0, totalR: cum,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0), maxDD: dd, equity: eq,
      holdChangePct: (candles[n - 1].c / candles[205].c - 1) * 100, candles: n - 205
    };
  }

  // ---------- outlook per horizon (day / week / month) ----------
  var HORIZONS = {
    day:   { key: 'day',   label: 'روزانه', next: 'در ۲۴ ساعت آینده', tfs: [['1h', 1], ['4h', 2], ['1d', 3]], exec: '4h', rangeTf: '1d', ms: 864e5 },
    week:  { key: 'week',  label: 'هفتگی',  next: 'در هفته‌ی آینده',   tfs: [['4h', 1], ['1d', 2], ['1w', 3]], exec: '1d', rangeTf: '1w', ms: 6048e5 },
    month: { key: 'month', label: 'ماهانه', next: 'در ماه آینده',      tfs: [['1d', 1], ['1w', 2], ['1M', 3]], exec: '1w', rangeTf: '1M', ms: 2592e6 }
  };

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // input: { price, horizon, series:[{tf, weight, candles(closed only)}] }
  function outlook(input) {
    var H = HORIZONS[input.horizon];
    if (!H) return { error: 'بازه نامعتبر' };
    var price = input.price;
    var built = buildTfs(input.series), tfs = built.tfs, inds = built.inds;
    if (tfs.length < 2) return { error: 'داده کافی نیست', horizon: H.key };
    var missing = H.tfs.map(function (t) { return t[0]; }).filter(function (tf) { return !tfs.some(function (x) { return x.tf === tf; }); });

    var wSum = 0, comp = 0;
    tfs.forEach(function (t) { wSum += t.weight; comp += t.weight * t.score; });
    comp = comp / wSum;
    var top = tfs[tfs.length - 1];
    var exec = tfs.find(function (t) { return t.tf === H.exec; }) || tfs[Math.floor(tfs.length / 2)];
    var bias = comp >= 20 ? 'up' : comp <= -20 ? 'down' : 'flat';
    var d = bias === 'up' ? 1 : bias === 'down' ? -1 : 0;
    var agreeN = d !== 0 ? tfs.filter(function (t) { return sgn(t.score) === d && Math.abs(t.score) >= 15; }).length : 0;
    var agreement = d !== 0 ? agreeN / tfs.length : 0;
    var conflict = d !== 0 && sgn(top.score) === -d && Math.abs(top.score) >= 15;
    var strength = null;
    if (d !== 0) {
      var ac = Math.abs(comp);
      strength = ac >= 45 && agreement >= 0.66 ? 'strong' : ac >= 30 && agreement >= 0.5 ? 'medium' : 'weak';
      if (conflict) strength = strength === 'strong' ? 'medium' : 'weak';
    }

    var a = exec.atr, execInd = inds[exec.tf], topInd = inds[top.tf];
    var lv = findLevels(execInd, exec.idx);
    if (top.tf !== exec.tf) lv = mergeLevels(lv, findLevels(topInd, top.idx), 0.5 * a);
    var sup = lv.filter(function (x) { return x.price < price - 0.1 * a; }).sort(function (x, y) { return y.price - x.price; }).slice(0, 3);
    var res = lv.filter(function (x) { return x.price > price + 0.1 * a; }).sort(function (x, y) { return x.price - y.price; }).slice(0, 3);
    var floorP = price * 0.02;
    var s1 = sup[0] ? sup[0].price : Math.max(price - 2 * a, floorP), s1approx = !sup[0];
    var r1 = res[0] ? res[0].price : price + 2 * a, r1approx = !res[0];
    var s2 = sup[1] ? sup[1].price : Math.max(s1 - 1.5 * a, floorP * 0.5), s2approx = !sup[1];
    var r2 = res[1] ? res[1].price : r1 + 1.5 * a, r2approx = !res[1];

    var range = null, rInd = inds[H.rangeTf];
    var rc = null;
    input.series.forEach(function (s) { if (s.tf === H.rangeTf) rc = s.candles; });
    if (rc && rc.length >= 25) {
      var rets = [], j, from = Math.max(1, rc.length - 100);
      for (j = from; j < rc.length; j++) rets.push(rc[j].c / rc[j - 1].c - 1);
      var sorted = rets.slice().sort(function (x, y) { return x - y; });
      var abs = rets.map(Math.abs).sort(function (x, y) { return x - y; });
      range = { lo: price * (1 + quantile(sorted, 0.15)), hi: price * (1 + quantile(sorted, 0.85)), n: rets.length, medMovePct: quantile(abs, 0.5) * 100 };
    }
    return {
      horizon: H.key, label: H.label, next: H.next, price: price, bias: bias, strength: strength,
      composite: Math.round(comp), agreeN: agreeN, nTf: tfs.length, conflict: conflict, execTf: exec.tf, topTf: top.tf,
      tfs: tfs.map(function (t) { return { tf: t.tf, label: t.label, score: t.score }; }),
      supports: sup, resistances: res,
      s1: s1, r1: r1, s2: s2, r2: r2, s1approx: s1approx, r1approx: r1approx, s2approx: s2approx, r2approx: r2approx,
      range: range, atrPct: exec.atrPct, bwRank: exec.bwRank, missing: missing
    };
  }

  var BIAS_FA = { up: 'صعودی', down: 'نزولی', flat: 'بدون جهت (رنج)' };
  var STR_FA = { weak: 'ضعیف', medium: 'متوسط', strong: 'قوی' };

  function volState(bwRank) { return bwRank <= 0.2 ? 'tight' : bwRank >= 0.8 ? 'wide' : 'normal'; }
  var VOL_FA = { tight: 'فشرده', normal: 'عادی', wide: 'باز' };

  // Human-readable Persian lines. fmt(price) -> string (caller may wrap in markup).
  function outlookLines(o, fmt) {
    var f = fmt || fmtPrice, L = [];
    var adj = TF_ADJ[o.execTf] || o.execTf;
    L.push('جهت کلی: ' + BIAS_FA[o.bias] + (o.strength ? ' (قدرت: ' + STR_FA[o.strength] + ')' : '') + ' — امتیاز ' + (o.composite > 0 ? '+' : '') + o.composite);
    if (o.bias !== 'flat') {
      L.push(o.agreeN + ' از ' + o.nTf + ' تایم‌فریم هم‌جهت هستن.' + (o.conflict ? ' ولی تایم‌فریم بالاتر خلاف این جهته؛ اعتماد به سناریو کمتره.' : ''));
    } else {
      L.push('تایم‌فریم‌ها جهت مشخصی ندارن یا با هم نمی‌خونن.');
    }
    var dist = function (x) { return ' (' + (x.price < o.price ? '−' : '+') + Math.abs((x.price / o.price - 1) * 100).toFixed(1) + '٪)'; };
    if (o.supports.length) L.push('حمایت‌ها: ' + o.supports.map(function (x) { return f(x.price) + dist(x) + (x.touches >= 3 ? '★' : ''); }).join(' ، '));
    else L.push('حمایت مشخصی زیر قیمت پیدا نشد (قیمت نزدیک کف تاریخچه است یا ناحیه‌ی تازه‌ایه).');
    if (o.resistances.length) L.push('مقاومت‌ها: ' + o.resistances.map(function (x) { return f(x.price) + dist(x) + (x.touches >= 3 ? '★' : ''); }).join(' ، '));
    else L.push('مقاومت مشخصی بالای قیمت پیدا نشد (قیمت نزدیک سقف تاریخچه است).');

    var s1 = f(o.s1) + (o.s1approx ? ' (تقریبی)' : ''), s2 = f(o.s2) + (o.s2approx ? ' (تقریبی)' : '');
    var r1 = f(o.r1) + (o.r1approx ? ' (تقریبی)' : ''), r2 = f(o.r2) + (o.r2approx ? ' (تقریبی)' : '');
    if (o.bias === 'down') {
      L.push('سناریوی اصلی: اگه کندل ' + adj + ' زیر ' + s1 + ' بسته بشه، ریزش احتمالاً تا ' + s2 + ' ادامه پیدا می‌کنه. تا وقتی بالای ' + s1 + ' بمونه، ریزش هنوز تأیید نشده.');
      L.push('ابطال: اگه کندل ' + adj + ' بالای ' + r1 + ' بسته بشه، سناریوی نزولی باطله و احتمال حرکت تا ' + r2 + ' بیشتر می‌شه.');
    } else if (o.bias === 'up') {
      L.push('سناریوی اصلی: اگه کندل ' + adj + ' بالای ' + r1 + ' بسته بشه، صعود احتمالاً تا ' + r2 + ' ادامه پیدا می‌کنه. تا وقتی زیر ' + r1 + ' بمونه، صعود هنوز تأیید نشده.');
      L.push('ابطال: اگه کندل ' + adj + ' زیر ' + s1 + ' بسته بشه، سناریوی صعودی باطله و احتمال ریزش تا ' + s2 + ' بیشتر می‌شه.');
    } else {
      L.push('سناریوی اصلی: قیمت بین ' + s1 + ' و ' + r1 + ' در رنجه. تا قبل از شکست، سیگنال قوی نداریم.');
      L.push('شکست: بسته شدن کندل ' + adj + ' بالای ' + r1 + ' یعنی احتمال حرکت تا ' + r2 + '؛ و زیر ' + s1 + ' یعنی احتمال ریزش تا ' + s2 + '.');
    }
    if (o.range) {
      L.push('محدوده‌ی احتمالی ' + o.next + ': ' + f(o.range.lo) + ' تا ' + f(o.range.hi) + '. این بر پایه‌ی رفتار ' + o.range.n + ' بازه‌ی گذشته است و در حدود ۷۰٪ اون بازه‌ها قیمت داخل چنین محدوده‌ای بسته شده؛ تضمین نیست.');
    }
    L.push('نوسان (' + adj + '): ATR حدود ' + o.atrPct.toFixed(1) + '٪ قیمت؛ باندهای بولینگر ' + VOL_FA[volState(o.bwRank)] +
      (volState(o.bwRank) === 'tight' ? ' (ممکنه حرکت بزرگ نزدیک باشه، ولی جهتش مشخص نیست)' : volState(o.bwRank) === 'wide' ? ' (پرنوسان؛ احتیاط)' : '') + '.');
    if (o.missing && o.missing.length) L.push('توجه: تاریخچه‌ی کافی برای تایم‌فریم ' + o.missing.map(function (tf) { return TF_ADJ[tf] || tf; }).join('، ') + ' نبود و تحلیل بدون اون انجام شد.');
    return L;
  }

  // ---------- spike detection on the last CLOSED candle ----------
  // candles: closed candles only (oldest -> newest), typically 15m
  function detectSpike(candles, opts) {
    opts = opts || {};
    var n = candles.length;
    if (n < 40) return null;
    var ind = computeIndicators(candles), i = n - 1;
    var a = ind.atr[i - 1], va = ind.volAvg[i];
    if (!ok(a) || a <= 0) return null;
    var c = candles[i], move = c.c - c.o;
    var atrMult = Math.abs(move) / a;
    var volRatio = ok(va) && va > 0 ? c.v / va : 1;
    var bigMove = opts.atrMult || 2.5, bigVolMove = opts.volMoveAtr || 1.2, bigVol = opts.volRatio || 3;
    if (!(atrMult >= bigMove || (volRatio >= bigVol && atrMult >= bigVolMove))) return null;
    return { dir: move > 0 ? 1 : -1, pct: move / c.o * 100, atrMult: atrMult, volRatio: volRatio, t: c.t, price: c.c };
  }

  // ---------- signal outcome tracking ----------
  // sig: {dir(1/-1), mode('now'|'pullback'), entry, stop, tp1, tp2, t(ms signal time), validUntil(ms), status, ...}
  // candles: 1h (or any) closed candles. Only candles with open time >= sig.t are used. Stop is assumed hit first
  // when stop and target are touched inside the same candle (conservative).
  // status: pending -> open -> tp1 / stop / timeout ; pending -> missed / expired
  function evaluateSignal(sig, candles) {
    var s = {}; for (var k in sig) s[k] = sig[k];
    if (s.status === 'tp1' || s.status === 'stop' || s.status === 'timeout' || s.status === 'missed' || s.status === 'expired') {
      if (!s.watchTp2 || s.tp2Reached) return s;
    }
    var d = s.dir, risk = Math.abs(s.entry - s.stop), i, cd;
    if (!s.status) s.status = s.mode === 'now' ? 'open' : 'pending';
    if (s.status === 'open' && !s.openedAt) s.openedAt = s.t;
    var from = s.lastT || s.t;
    for (i = 0; i < candles.length; i++) {
      cd = candles[i];
      if (cd.t < from || (s.lastT && cd.t <= s.lastT)) continue;
      if (cd.t < s.t) continue;
      var expired = cd.t >= s.validUntil;
      if (s.status === 'pending') {
        var touch = d > 0 ? cd.l <= s.entry : cd.h >= s.entry;
        var runaway = d > 0 ? cd.h >= s.tp1 : cd.l <= s.tp1;
        var broke = d > 0 ? cd.l <= s.stop : cd.h >= s.stop;
        if (broke) { s.status = 'missed'; s.closedAt = cd.t; s.lastT = cd.t; return s; }
        if (touch) { s.status = 'open'; s.openedAt = cd.t; }
        else if (runaway) { s.status = 'missed'; s.closedAt = cd.t; s.lastT = cd.t; return s; }
        else if (expired) { s.status = 'expired'; s.closedAt = cd.t; s.lastT = cd.t; return s; }
        if (s.status === 'pending') { s.lastT = cd.t; continue; }
      }
      if (s.status === 'open') {
        var stopHit = d > 0 ? cd.l <= s.stop : cd.h >= s.stop;
        var tpHit = d > 0 ? cd.h >= s.tp1 : cd.l <= s.tp1;
        if (stopHit) { s.status = 'stop'; s.R = -1; s.closedAt = cd.t; s.lastT = cd.t; return s; }
        if (tpHit) {
          s.status = 'tp1'; s.R = Math.abs(s.tp1 - s.entry) / risk; s.closedAt = cd.t; s.watchTp2 = true; s.lastT = cd.t;
          if (d > 0 ? cd.h >= s.tp2 : cd.l <= s.tp2) { s.tp2Reached = true; s.watchTp2 = false; }
          return s;
        }
        if (expired) { s.status = 'timeout'; s.R = d * (cd.c - s.entry) / risk; s.closedAt = cd.t; s.lastT = cd.t; return s; }
        s.lastT = cd.t;
        continue;
      }
      if (s.status === 'tp1' && s.watchTp2) {
        var back = d > 0 ? cd.l <= s.stop : cd.h >= s.stop;
        if (d > 0 ? cd.h >= s.tp2 : cd.l <= s.tp2) { s.tp2Reached = true; s.watchTp2 = false; s.lastT = cd.t; return s; }
        if (back || expired) { s.watchTp2 = false; s.lastT = cd.t; return s; }
        s.lastT = cd.t;
      }
    }
    return s;
  }

  // ---------- candle patterns ----------
  // detectPatterns(cs, i, fl): cs = candles (closed), i = index of the candle that just closed (default last),
  // fl = optional precomputed pivot flags from pivotFlags(cs) (used by the replay for speed).
  // Returns [{id, name, dir}] (dir: 1 bullish, -1 bearish, 0 indecision). Only data up to index i is used (no look-ahead):
  // a pivot at j is only used once candle j+PK has closed. Big patterns fire on the candle that breaks the neckline/line.
  var PK = 4;
  var PATTERN_NAMES = {
    engulf_bull: 'Bullish Engulfing', engulf_bear: 'Bearish Engulfing', hammer: 'Hammer', shooting_star: 'Shooting Star',
    morning_star: 'Morning Star', evening_star: 'Evening Star', doji: 'Doji',
    hs_top: 'Head&Shoulders', hs_bottom: 'Inv Head&Shldrs', double_top: 'Double Top', double_bottom: 'Double Bottom',
    triple_top: 'Triple Top', triple_bottom: 'Triple Bottom', tri_up: 'Triangle Up', tri_down: 'Triangle Down',
    wedge_fall_up: 'Falling Wedge Up', wedge_rise_down: 'Rising Wedge Dn'
  };
  var BIG_PATTERNS = { hs_top: 1, hs_bottom: 1, double_top: 1, double_bottom: 1, triple_top: 1, triple_bottom: 1, tri_up: 1, tri_down: 1, wedge_fall_up: 1, wedge_rise_down: 1 };

  function pivotFlags(cs, k) {
    k = k || PK;
    var n = cs.length, hi = new Uint8Array(n), lo = new Uint8Array(n), j, m, isH, isL;
    for (j = k; j < n - k; j++) {
      isH = true; isL = true;
      for (m = j - k; m <= j + k; m++) {
        if (m === j) continue;
        if (cs[m].h >= cs[j].h) isH = false;
        if (cs[m].l <= cs[j].l) isL = false;
        if (!isH && !isL) break;
      }
      if (isH) hi[j] = 1;
      if (isL) lo[j] = 1;
    }
    return { hi: hi, lo: lo, k: k };
  }
  // newest-first list of confirmed pivots of one type within `look` candles of i
  function pivotList(cs, fl, i, type, look, max) {
    var out = [], j, from = Math.max(0, i - look), flags = type === 'h' ? fl.hi : fl.lo;
    for (j = i - fl.k; j >= from && out.length < max; j--) {
      if (flags[j]) out.push({ j: j, p: type === 'h' ? cs[j].h : cs[j].l });
    }
    return out;
  }
  function minLow(cs, a, b) { var m = Infinity, x; for (x = a; x <= b; x++) if (cs[x].l < m) m = cs[x].l; return m; }
  function maxHigh(cs, a, b) { var m = -Infinity, x; for (x = a; x <= b; x++) if (cs[x].h > m) m = cs[x].h; return m; }
  function argMinLow(cs, a, b) { var m = Infinity, r = a, x; for (x = a; x <= b; x++) if (cs[x].l < m) { m = cs[x].l; r = x; } return r; }
  function argMaxHigh(cs, a, b) { var m = -Infinity, r = a, x; for (x = a; x <= b; x++) if (cs[x].h > m) { m = cs[x].h; r = x; } return r; }

  // double / triple tops and bottoms: break of the lowest trough (tops) / highest peak (bottoms) soon after the last extreme
  function detMulti(cs, fl, i, a, top) {
    var pv = pivotList(cs, fl, i, top ? 'h' : 'l', 90, 3);
    if (pv.length < 2) return null;
    var price = cs[i].c, tol = Math.max(0.8 * a, 0.004 * price), sgnT = top ? 1 : -1;
    var P2 = pv[0], P1 = pv[1], P0 = pv.length > 2 ? pv[2] : null;
    var sep = P2.j - P1.j;
    if (sep < 6 || sep > 60 || i - P2.j > 25) return null;
    if (Math.abs(P2.p - P1.p) > tol) return null;
    var triple = !!(P0 && P1.j - P0.j >= 6 && P1.j - P0.j <= 60 && Math.abs(P0.p - P1.p) <= tol && Math.abs(P0.p - P2.p) <= tol);
    var firstJ = triple ? P0.j : P1.j;
    var lvl = (P2.p + P1.p) / 2;
    var neck = top ? minLow(cs, firstJ, P2.j) : maxHigh(cs, firstJ, P2.j);
    if (sgnT * (lvl - neck) < 2.5 * a) return null;
    // price must not have pushed through the tops since the last one
    var beyond = top ? maxHigh(cs, P2.j + 1, i) : minLow(cs, P2.j + 1, i);
    if (sgnT * (beyond - Math.max(P1.p * sgnT, P2.p * sgnT) * sgnT) > tol) return null;
    var broke = top ? (cs[i].c < neck && cs[i - 1].c >= neck) : (cs[i].c > neck && cs[i - 1].c <= neck);
    if (!broke) return null;
    return top ? { id: triple ? 'triple_top' : 'double_top', dir: -1 } : { id: triple ? 'triple_bottom' : 'double_bottom', dir: 1 };
  }

  // head and shoulders (top) / inverse (bottom): sloped neckline through the two troughs (peaks), fresh break
  function detHS(cs, fl, i, a, top) {
    var pv = pivotList(cs, fl, i, top ? 'h' : 'l', 120, 3);
    if (pv.length < 3) return null;
    var S2 = pv[0], H = pv[1], S1 = pv[2], s = top ? 1 : -1;
    if (i - S2.j > 25) return null;
    if (H.j - S1.j < 4 || S2.j - H.j < 4 || S2.j - S1.j > 110) return null;
    var shoulder = (S1.p + S2.p) / 2;
    var hgt = s * (H.p - shoulder);
    if (hgt < 1.2 * a) return null;
    if (s * (H.p - S1.p) < 0.8 * a || s * (H.p - S2.p) < 0.8 * a) return null;
    if (Math.abs(S1.p - S2.p) > 0.4 * hgt) return null;
    var t1 = top ? argMinLow(cs, S1.j, H.j) : argMaxHigh(cs, S1.j, H.j);
    var t2 = top ? argMinLow(cs, H.j, S2.j) : argMaxHigh(cs, H.j, S2.j);
    if (t2 <= t1) return null;
    var v1 = top ? cs[t1].l : cs[t1].h, v2 = top ? cs[t2].l : cs[t2].h;
    var line = function (x) { return v1 + (v2 - v1) * (x - t1) / (t2 - t1); };
    var beyond = top ? maxHigh(cs, S2.j + 1, i) : minLow(cs, S2.j + 1, i);
    if (s * (beyond - H.p) > 0) return null;
    var broke = top ? (cs[i].c < line(i) && cs[i - 1].c >= line(i - 1)) : (cs[i].c > line(i) && cs[i - 1].c <= line(i - 1));
    if (!broke) return null;
    return top ? { id: 'hs_top', dir: -1 } : { id: 'hs_bottom', dir: 1 };
  }

  // converging triangles and wedges, fresh break of one trend line
  function detTriangle(cs, fl, i, a) {
    var ph = pivotList(cs, fl, i, 'h', 70, 3), pl = pivotList(cs, fl, i, 'l', 70, 3);
    if (ph.length < 2 || pl.length < 2 || ph.length + pl.length < 5) return null;
    var h2 = ph[0], h1 = ph[ph.length - 1], l2 = pl[0], l1 = pl[pl.length - 1];
    if (h2.j - h1.j < 14 || l2.j - l1.j < 14) return null;
    var su = (h2.p - h1.p) / (h2.j - h1.j), sl = (l2.p - l1.p) / (l2.j - l1.j);
    var up = function (x) { return h1.p + su * (x - h1.j); }, lo = function (x) { return l1.p + sl * (x - l1.j); };
    var j0 = Math.min(h1.j, l1.j);
    var w0 = up(j0) - lo(j0), wi = up(i) - lo(i), wp = up(i - 1) - lo(i - 1);
    if (!(w0 >= 4 * a) || !(wi > 0) || wi > 0.6 * w0 || !(wp > 0)) return null;
    // the middle pivot of a 3-pivot side must really touch the line (otherwise it is not a clean trend line)
    if (ph.length === 3 && Math.abs(ph[1].p - up(ph[1].j)) > 0.6 * a) return null;
    if (pl.length === 3 && Math.abs(pl[1].p - lo(pl[1].j)) > 0.6 * a) return null;
    var du = su * 40, dl = sl * 40, fl1 = 1.0 * a;
    var uFlat = Math.abs(du) < fl1, lFlat = Math.abs(dl) < fl1;
    var kind = null;
    if (uFlat && dl > fl1) kind = 'tri';
    else if (lFlat && du < -fl1) kind = 'tri';
    else if (du < -fl1 && dl > fl1) kind = 'tri';
    else if (du > fl1 && dl > fl1 && dl > du) kind = 'wedge_rise';
    else if (du < -fl1 && dl < -fl1 && du < dl) kind = 'wedge_fall';
    if (!kind) return null;
    var c = cs[i].c, pc = cs[i - 1].c;
    var brokeUp = c > up(i) + 0.15 * a && pc <= up(i - 1) && pc >= lo(i - 1);
    var brokeDn = c < lo(i) - 0.15 * a && pc >= lo(i - 1) && pc <= up(i - 1);
    if (brokeUp) return kind === 'wedge_fall' ? { id: 'wedge_fall_up', dir: 1 } : kind === 'tri' ? { id: 'tri_up', dir: 1 } : null;
    if (brokeDn) return kind === 'wedge_rise' ? { id: 'wedge_rise_down', dir: -1 } : kind === 'tri' ? { id: 'tri_down', dir: -1 } : null;
    return null;
  }

  function detectPatterns(cs, i, fl) {
    if (i == null) i = cs.length - 1;
    if (i < 16) return [];
    var c = cs[i], p = cs[i - 1], q = cs[i - 2], k, avgR = 0;
    for (k = i - 15; k < i; k++) avgR += cs[k].h - cs[k].l;
    avgR /= 15;
    if (!(avgR > 0)) return [];
    var body = function (x) { return Math.abs(x.c - x.o); };
    var rng = function (x) { return x.h - x.l; };
    var top = function (x) { return Math.max(x.o, x.c); }, bot = function (x) { return Math.min(x.o, x.c); };
    var out = [];
    var bc = body(c), bp = body(p), rc = rng(c);
    // engulfing: previous candle has a real body, current body covers it in the opposite colour
    if (bp >= 0.3 * avgR && bc >= 0.8 * avgR * 0.6 && bc > bp) {
      if (p.c < p.o && c.c > c.o && c.o <= p.c && c.c >= p.o) out.push({ id: 'engulf_bull', name: PATTERN_NAMES.engulf_bull, dir: 1 });
      if (p.c > p.o && c.c < c.o && c.o >= p.c && c.c <= p.o) out.push({ id: 'engulf_bear', name: PATTERN_NAMES.engulf_bear, dir: -1 });
    }
    // pin bars: long wick on one side (>= 2x body), tiny wick on the other, after a 5-candle move the other way
    if (rc >= 0.6 * avgR && rc > 0) {
      var lw = bot(c) - c.l, uw = c.h - top(c), bd = Math.max(bc, rc * 0.05);
      var prior = c.c - cs[i - 5].c;
      if (lw >= 2 * bd && uw <= 0.5 * bd + 0.1 * rc && top(c) >= c.l + 0.6 * rc && prior < 0) out.push({ id: 'hammer', name: PATTERN_NAMES.hammer, dir: 1 });
      if (uw >= 2 * bd && lw <= 0.5 * bd + 0.1 * rc && bot(c) <= c.h - 0.6 * rc && prior > 0) out.push({ id: 'shooting_star', name: PATTERN_NAMES.shooting_star, dir: -1 });
    }
    // three-candle stars
    var bq = body(q);
    if (bq >= 0.6 * avgR && bp <= 0.35 * bq && bc >= 0.5 * bq) {
      var mid = (q.o + q.c) / 2;
      if (q.c < q.o && c.c > c.o && c.c > mid && top(p) < q.c + 0.3 * bq) out.push({ id: 'morning_star', name: PATTERN_NAMES.morning_star, dir: 1 });
      if (q.c > q.o && c.c < c.o && c.c < mid && bot(p) > q.c - 0.3 * bq) out.push({ id: 'evening_star', name: PATTERN_NAMES.evening_star, dir: -1 });
    }
    if (rc >= 0.5 * avgR && bc <= 0.1 * rc) out.push({ id: 'doji', name: PATTERN_NAMES.doji, dir: 0 });
    // big swing-based patterns
    if (i >= 40) {
      var f = fl || pivotFlags(cs, PK), r;
      var big = [detHS(cs, f, i, avgR, true), detHS(cs, f, i, avgR, false), detMulti(cs, f, i, avgR, true), detMulti(cs, f, i, avgR, false), detTriangle(cs, f, i, avgR)];
      for (k = 0; k < big.length; k++) { r = big[k]; if (r) out.push({ id: r.id, name: PATTERN_NAMES[r.id], dir: r.dir }); }
    }
    return out;
  }

  // ---------- historical replay of the signal engine (approximate) ----------
  // o: { series: {tf: candles[]}, tfs: [[tf, weight]...], execTf, tfMs: {tf: ms}, validMs, warm, fwd, window }
  // Walks forward candle by candle on execTf, re-running analyze() with only data that was closed at that time,
  // tracks a signal whenever the decision changes (same rule as the live bot) and scores it with evaluateSignal.
  // Also scans every candle for patterns and measures what price did `fwd` candles later (with a no-pattern baseline).
  // Everything is also split by UTC year so consistency over time can be checked.
  function yearOf(t) { return new Date(t).getUTCFullYear(); }
  function replay(o) {
    var ex = o.series[o.execTf], exMs = o.tfMs[o.execTf], warm = o.warm || 210, fwd = o.fwd || 6, win = o.window || 299;
    var out = { signals: [], patterns: {}, base: { n: 0, up: 0, yr: {} }, steps: 0, from: null };
    if (!ex || ex.length < warm + fwd + 10) return out;
    var ptr = {}, prevDec = 'wait', busyUntil = { 1: 0, '-1': 0 }, lastSeen = {}, i, j, tf;
    var fl = pivotFlags(ex, PK);
    o.tfs.forEach(function (t) { ptr[t[0]] = 0; });
    out.from = ex[warm].t;
    for (i = warm; i < ex.length - 1; i++) {
      var T = ex[i].t + exMs;
      // pattern / baseline statistics
      if (i + fwd < ex.length) {
        var mv = ex[i + fwd].c / ex[i].c - 1, yr = yearOf(ex[i].t);
        out.base.n++; if (mv > 0) out.base.up++;
        var by = out.base.yr[yr] || (out.base.yr[yr] = { n: 0, up: 0 });
        by.n++; if (mv > 0) by.up++;
        detectPatterns(ex, i, fl).forEach(function (pt) {
          if (BIG_PATTERNS[pt.id]) { if (lastSeen[pt.id] != null && i - lastSeen[pt.id] < 8) { lastSeen[pt.id] = i; return; } lastSeen[pt.id] = i; }
          var g = out.patterns[pt.id] || (out.patterns[pt.id] = { n: 0, hit: 0, sum: 0, dir: pt.dir, up: 0, yr: {} });
          var gy = g.yr[yr] || (g.yr[yr] = { n: 0, hit: 0 });
          g.n++; gy.n++; if (mv > 0) g.up++;
          if (pt.dir !== 0) { if (pt.dir * mv > 0) { g.hit++; gy.hit++; } g.sum += pt.dir * mv; }
        });
      }
      // engine replay
      var series = [], okAll = true;
      for (j = 0; j < o.tfs.length; j++) {
        tf = o.tfs[j][0];
        var arr = o.series[tf], ms = o.tfMs[tf];
        if (!arr) { okAll = false; break; }
        var k = ptr[tf];
        while (k < arr.length && arr[k].t + ms <= T) k++;
        ptr[tf] = k;
        if (k < 60) { okAll = false; break; }
        series.push({ tf: tf, weight: o.tfs[j][1], candles: arr.slice(Math.max(0, k - win), k) });
      }
      if (!okAll) continue;
      out.steps++;
      var res = analyze({ price: ex[i].c, execTf: o.execTf, series: series });
      if (res.error) continue;
      var d = res.decision;
      if (d !== prevDec && d !== 'wait' && res.scenario) {
        var dir = d === 'long' ? 1 : -1;
        if (busyUntil[dir] <= T) {
          var sc = res.scenario;
          var sig = { dir: dir, mode: sc.mode, entry: sc.entry, zoneLo: sc.zoneLo, zoneHi: sc.zoneHi, stop: sc.stop, tp1: sc.tp1, tp2: sc.tp2,
            t: T, validUntil: T + o.validMs, status: sc.mode === 'now' ? 'open' : 'pending' };
          var fut = ex.slice(i + 1, i + 1 + Math.ceil(o.validMs / exMs) + 40);
          var y = evaluateSignal(sig, fut);
          if (y.watchTp2) y = evaluateSignal(y, fut);
          var done = y.status === 'tp1' || y.status === 'stop' || y.status === 'timeout' || y.status === 'missed' || y.status === 'expired';
          busyUntil[dir] = done ? (y.closedAt || T) + exMs : Infinity;
          if (done) {
            var pats = detectPatterns(ex, i, fl), al = null;
            pats.forEach(function (pt) { if (pt.dir === dir && !al) al = pt.id; });
            out.signals.push({ t: T, dir: dir, strength: res.strength, status: y.status, R: y.R == null ? null : +y.R.toFixed(3), tp2: !!y.tp2Reached, pat: al });
          }
        }
      }
      prevDec = d;
    }
    return out;
  }

  var api = {
    ema: ema, rsi: rsi, macd: macd, atr: atr, bollinger: bollinger, computeIndicators: computeIndicators,
    scoreAt: scoreAt, scoreLabel: scoreLabel, findLevels: findLevels, buildScenario: buildScenario,
    analyze: analyze, positionSize: positionSize, backtest: backtest, fmtPrice: fmtPrice, TF_LABEL: TF_LABEL, TF_ADJ: TF_ADJ,
    HORIZONS: HORIZONS, outlook: outlook, outlookLines: outlookLines, volState: volState, VOL_FA: VOL_FA, detectSpike: detectSpike, evaluateSignal: evaluateSignal,
    detectPatterns: detectPatterns, PATTERN_NAMES: PATTERN_NAMES, BIG_PATTERNS: BIG_PATTERNS, pivotFlags: pivotFlags, replay: replay
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TA = api;
})(typeof self !== 'undefined' ? self : this);

  }).call(globalThis);
  return module.exports;
})();

const DIR = process.env.WATCHER_DIR || __dirname;
const STATE_FILE = path.join(DIR, 'state.json');
let MODE = (process.argv[2] || process.env.MODE || 'run').trim();
if (MODE === 'run' && process.env.EVENT === 'workflow_dispatch') MODE = 'full'; // اجرای دستی = گزارش کامل همین الان
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const NOW = () => (process.env.NOW_OVERRIDE ? Date.parse(process.env.NOW_OVERRIDE) : Date.now());
const FAST = !!process.env.NO_THROTTLE;

const STYLES = {
  short: { label: 'کوتاه‌مدت', exec: '1h', tfs: [['15m', 1], ['1h', 2], ['4h', 3]] },
  swing: { label: 'نوسانی', exec: '4h', tfs: [['1h', 1], ['4h', 2], ['1d', 3]] }
};
const STRENGTH_RANK = { weak: 1, medium: 2, strong: 3 };
const STRENGTH_FA = { weak: 'ضعیف', medium: 'متوسط', strong: 'قوی' };
const SYM_RE = /^[A-Z0-9]{2,10}$/;
const HOUR = 36e5, TEHRAN = 12600000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- data sources ----------
const nextSlot = {};
async function slot(host) {
  if (FAST) return;
  const gap = host.includes('okx') ? 130 : 60;
  const now = Date.now(), t = Math.max(now, nextSlot[host] || 0);
  nextSlot[host] = t + gap;
  if (t > now) await sleep(t - now);
}
async function fetchWith(url, ms, kind) {
  await slot(new URL(url).host);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 10000);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: kind === 'text' ? { 'user-agent': 'Mozilla/5.0 (compatible; market-watch)' } : undefined });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return kind === 'text' ? await r.text() : await r.json();
  } finally { clearTimeout(t); }
}
const getJSON = (url, ms) => fetchWith(url, ms, 'json');
const getText = (url, ms) => fetchWith(url, ms, 'text');
const TFMS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 2592e6 };
const binanceRows = (rows) => rows.map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
const need = (map, tf) => { if (!map[tf]) throw new Error('تایم‌فریم پشتیبانی نمی‌شه'); return map[tf]; };

const SOURCES = {
  okx: async (b, tf, n) => {
    const bar = need({ '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc', '1M': '1Mutc' }, tf);
    let all = [], after = '';
    while (all.length < n) {
      const lim = Math.min(300, n - all.length);
      const j = await getJSON('https://www.okx.com/api/v5/market/candles?instId=' + b + '-USDT&bar=' + bar + '&limit=' + lim + (after ? '&after=' + after : ''));
      if (j.code !== '0') throw new Error(j.msg || 'okx');
      const d = j.data || [];
      if (!d.length) break;
      all = all.concat(d); after = d[d.length - 1][0];
      if (d.length < lim) break;
    }
    return all.map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  },
  bybit: async (b, tf, n) => {
    const iv = need({ '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W', '1M': 'M' }, tf);
    const j = await getJSON('https://api.bybit.com/v5/market/kline?category=spot&symbol=' + b + 'USDT&interval=' + iv + '&limit=' + Math.min(n, 1000));
    if (j.retCode !== 0) throw new Error(j.retMsg || 'bybit');
    return j.result.list.map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  },
  gate: async (b, tf, n) => {
    const iv = need({ '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '7d', '1M': '30d' }, tf);
    const j = await getJSON('https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=' + b + '_USDT&interval=' + iv + '&limit=' + Math.min(n, 1000));
    if (!Array.isArray(j)) throw new Error('gate');
    return j.map((r) => ({ t: +r[0] * 1000, o: +r[5], h: +r[3], l: +r[4], c: +r[2], v: +r[6] }));
  },
  kucoin: async (b, tf, n) => {
    const type = need({ '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day', '1w': '1week', '1M': '1month' }, tf);
    const end = Math.floor(Date.now() / 1000), start = end - Math.min(n, 1500) * TFMS[tf] / 1000;
    const j = await getJSON('https://api.kucoin.com/api/v1/market/candles?type=' + type + '&symbol=' + b + '-USDT&startAt=' + Math.floor(start) + '&endAt=' + end);
    if (j.code !== '200000') throw new Error(j.msg || 'kucoin');
    return j.data.map((r) => ({ t: +r[0] * 1000, o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] }));
  },
  mexc: async (b, tf, n) => {
    const iv = need({ '15m': '15m', '1h': '60m', '4h': '4h', '1d': '1d', '1w': '1W', '1M': '1M' }, tf);
    const j = await getJSON('https://api.mexc.com/api/v3/klines?symbol=' + b + 'USDT&interval=' + iv + '&limit=' + Math.min(n, 1000));
    if (!Array.isArray(j)) throw new Error('mexc');
    return binanceRows(j);
  },
  binance: async (b, tf, n) => {
    const q = '/api/v3/klines?symbol=' + b + 'USDT&interval=' + tf + '&limit=' + Math.min(n, 1000);
    let j;
    try { j = await getJSON('https://data-api.binance.vision' + q); } catch (e) { j = await getJSON('https://api.binance.com' + q); }
    if (!Array.isArray(j)) throw new Error('binance');
    return binanceRows(j);
  }
};

function normalize(raw) {
  const m = new Map();
  for (const x of raw) {
    if ([x.t, x.o, x.h, x.l, x.c].every(Number.isFinite) && x.c > 0) { if (!Number.isFinite(x.v)) x.v = 0; m.set(x.t, x); }
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}
// ستون‌های جابه‌جا (مثلاً های کمتر از اوپن/کلوز) رو رد می‌کنه
function sane(a) {
  let bad = 0;
  for (const x of a) {
    const hi = Math.max(x.o, x.c), lo = Math.min(x.o, x.c);
    if (x.h < hi * 0.9999 || x.l > lo * 1.0001 || x.h < x.l) bad++;
  }
  return bad <= a.length * 0.05;
}

let preferred = null;
const candleCache = new Map();
function candles(sym, tf, n, minN) {
  const key = sym + '|' + tf + '|' + n;
  if (candleCache.has(key)) return candleCache.get(key);
  const p = (async () => {
    const ids = CONFIG.sources.filter((id) => SOURCES[id]);
    if (preferred) ids.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));
    let lastErr = new Error('no source');
    for (const id of ids) {
      try {
        const a = normalize(await SOURCES[id](sym, tf, n));
        if (a.length >= Math.min(n, minN || 60) && sane(a)) { preferred = id; return a.slice(-n); }
        lastErr = new Error(id + ': bad data');
      } catch (e) { lastErr = new Error(id + ': ' + (e && e.message ? e.message : 'error')); }
    }
    throw lastErr;
  })();
  candleCache.set(key, p);
  p.catch(() => candleCache.delete(key));
  return p;
}

let active = 0; const waiting = [];
function limited(fn) {
  return new Promise((res, rej) => {
    const go = () => {
      active++;
      Promise.resolve().then(fn).then(res, rej).then(() => { active--; if (waiting.length) waiting.shift()(); });
    };
    if (active < 6) go(); else waiting.push(go);
  });
}

// ---------- analysis ----------
async function analyzeCoin(sym) {
  const cfg = STYLES[CONFIG.style];
  const series = await Promise.all(cfg.tfs.map(([tf, w]) => limited(() => candles(sym, tf, 300).then((all) => ({ tf, w, all })))));
  const low = series[0].all;
  const res = TA.analyze({
    price: low[low.length - 1].c, execTf: cfg.exec,
    series: series.map((s) => ({ tf: s.tf, weight: s.w, candles: s.all.slice(0, -1) }))
  });
  if (res.error) throw new Error(res.error);
  try {
    const ex = series.find((s) => s.tf === cfg.exec);
    res.patterns = ex ? TA.detectPatterns(ex.all.slice(0, -1)) : [];
  } catch (e) { res.patterns = []; }
  return res;
}
const settle =(sym, extra) => analyzeCoin(sym).then((res) => Object.assign({ sym, res }, extra), (err) => Object.assign({ sym, err }, extra));
async function analyzeAll() { return Promise.all(CONFIG.coins.map((sym) => settle(sym))); }

async function getOutlook(sym, hz) {
  const H = TA.HORIZONS[hz];
  const series = await Promise.all(H.tfs.map(([tf, w]) => limited(() =>
    candles(sym, tf, tf === '1M' ? 120 : 300, tf === '1M' || tf === '1w' ? 20 : 60).then((all) => ({ tf, w, all }), (err) => ({ tf, w, all: null, err })))));
  const ok = series.filter((s) => s.all);
  if (!ok.length) throw new Error(series[0].err ? series[0].err.message : 'داده نیومد');
  const price = ok[0].all[ok[0].all.length - 1].c;
  const o = TA.outlook({ price, horizon: hz, series: ok.map((s) => ({ tf: s.tf, weight: s.w, candles: s.all.slice(0, -1) })) });
  if (o.error) throw new Error(o.error);
  return o;
}

// ---------- tickers (برای اسکنر) ----------
const NOT_COINS = /^(USDT|USDC|FDUSD|TUSD|DAI|USDE|USDD|PYUSD|BUSD|USDP|EURI|EURT|AEUR|XUSD|USD1|UST|USDS|WBTC|WETH|STETH|WSTETH|WEETH|CBBTC|BTCB)$/;
const TICKERS = {
  okx: async () => {
    const j = await getJSON('https://www.okx.com/api/v5/market/tickers?instType=SPOT', 15000);
    if (j.code !== '0') throw new Error('okx');
    return j.data.filter((x) => /-USDT$/.test(x.instId)).map((x) => ({ sym: x.instId.split('-')[0], last: +x.last, chg: x.open24h > 0 ? x.last / x.open24h - 1 : NaN, qvol: +x.volCcy24h }));
  },
  bybit: async () => {
    const j = await getJSON('https://api.bybit.com/v5/market/tickers?category=spot', 15000);
    if (j.retCode !== 0) throw new Error('bybit');
    return j.result.list.filter((x) => /USDT$/.test(x.symbol)).map((x) => ({ sym: x.symbol.replace(/USDT$/, ''), last: +x.lastPrice, chg: x.prevPrice24h > 0 ? x.lastPrice / x.prevPrice24h - 1 : NaN, qvol: +x.turnover24h }));
  },
  gate: async () => {
    const j = await getJSON('https://api.gateio.ws/api/v4/spot/tickers', 15000);
    if (!Array.isArray(j)) throw new Error('gate');
    return j.filter((x) => /_USDT$/.test(x.currency_pair)).map((x) => ({ sym: x.currency_pair.split('_')[0], last: +x.last, chg: +x.change_percentage / 100, qvol: +x.quote_volume }));
  },
  kucoin: async () => {
    const j = await getJSON('https://api.kucoin.com/api/v1/market/allTickers', 15000);
    if (j.code !== '200000') throw new Error('kucoin');
    return j.data.ticker.filter((x) => /-USDT$/.test(x.symbol)).map((x) => ({ sym: x.symbol.split('-')[0], last: +x.last, chg: +x.changeRate, qvol: +x.volValue }));
  },
  mexc: async () => {
    const j = await getJSON('https://api.mexc.com/api/v3/ticker/24hr', 15000);
    if (!Array.isArray(j)) throw new Error('mexc');
    return j.filter((x) => /USDT$/.test(x.symbol)).map((x) => ({ sym: x.symbol.replace(/USDT$/, ''), last: +x.lastPrice, chg: x.openPrice > 0 ? x.lastPrice / x.openPrice - 1 : NaN, qvol: +x.quoteVolume }));
  },
  binance: async () => {
    let j;
    try { j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr', 20000); } catch (e) { j = await getJSON('https://api.binance.com/api/v3/ticker/24hr', 20000); }
    if (!Array.isArray(j)) throw new Error('binance');
    return j.filter((x) => /USDT$/.test(x.symbol)).map((x) => ({ sym: x.symbol.replace(/USDT$/, ''), last: +x.lastPrice, chg: x.openPrice > 0 ? x.lastPrice / x.openPrice - 1 : NaN, qvol: +x.quoteVolume }));
  }
};
async function fetchTickers() {
  const ids = CONFIG.sources.filter((id) => TICKERS[id]);
  if (preferred) ids.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));
  let lastErr = new Error('no source');
  for (const id of ids) {
    try {
      const list = (await TICKERS[id]()).filter((x) => SYM_RE.test(x.sym) && !NOT_COINS.test(x.sym) && !/\d[LS]$/.test(x.sym) && Number.isFinite(x.chg) && x.qvol > 0);
      if (list.length > 30) return list;
      lastErr = new Error(id + ': bad data');
    } catch (e) { lastErr = new Error(id + ': ' + (e && e.message ? e.message : 'error')); }
  }
  throw lastErr;
}

// ---------- derivatives info (فقط اطلاعات) ----------
async function derivInfo(sym) {
  const out = { funding: null, ls: null };
  try {
    const j = await getJSON('https://www.okx.com/api/v5/public/funding-rate?instId=' + sym + '-USDT-SWAP');
    if (j.code === '0' && j.data && j.data[0] && j.data[0].fundingRate !== '') out.funding = +j.data[0].fundingRate;
  } catch (e) {}
  try {
    const j = await getJSON('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=' + sym + '&period=1H');
    if (j.code === '0' && j.data && j.data[0]) out.ls = +j.data[0][1];
  } catch (e) {}
  if (out.funding === null) {
    try {
      const j = await getJSON('https://api.bybit.com/v5/market/tickers?category=linear&symbol=' + sym + 'USDT');
      if (j.retCode === 0 && j.result.list[0] && j.result.list[0].fundingRate !== '') out.funding = +j.result.list[0].fundingRate;
    } catch (e) {}
  }
  if (out.ls === null) {
    try {
      const j = await getJSON('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=' + sym + 'USDT&period=1h&limit=1');
      if (j.retCode === 0 && j.result.list[0]) out.ls = +j.result.list[0].buyRatio / +j.result.list[0].sellRatio;
    } catch (e) {}
  }
  if (!Number.isFinite(out.funding)) out.funding = null;
  if (!Number.isFinite(out.ls)) out.ls = null;
  return out;
}

// ---------- news ----------
const FNG_FA = { 'Extreme Fear': 'ترس شدید', 'Fear': 'ترس', 'Neutral': 'خنثی', 'Greed': 'طمع', 'Extreme Greed': 'طمع شدید' };
async function fearGreed() {
  const j = await getJSON('https://api.alternative.me/fng/?limit=2');
  const d = j.data || [];
  if (!d[0]) throw new Error('fng');
  return { value: +d[0].value, cls: d[0].value_classification, prev: d[1] ? +d[1].value : null };
}
const decodeEnt = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, '').trim();
function parseRss(xml) {
  const items = [];
  for (const m of (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [])) {
    const t = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(m), d = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(m);
    if (t && t[1].trim()) items.push({ title: decodeEnt(t[1]), t: d ? Date.parse(d[1]) : NaN });
  }
  return items;
}
const FEEDS = [['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'], ['Cointelegraph', 'https://cointelegraph.com/rss']];
async function headlines(now) {
  const out = [];
  for (const [name, url] of FEEDS) {
    try {
      const items = parseRss(await getText(url, 12000));
      const fresh = items.filter((x) => Number.isFinite(x.t) && now - x.t < 30 * HOUR);
      (fresh.length ? fresh : items).slice(0, 3).forEach((x) => out.push({ src: name, title: x.title }));
    } catch (e) {}
  }
  return out;
}

// ---------- events ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');
function fmtDT(ms) {
  const u = new Date(ms), t = new Date(ms + TEHRAN);
  return MON[u.getUTCMonth()] + ' ' + u.getUTCDate() + ' ' + two(u.getUTCHours()) + ':' + two(u.getUTCMinutes()) + ' UTC';
}
const fmtTehran = (ms) => { const t = new Date(ms + TEHRAN); return two(t.getUTCHours()) + ':' + two(t.getUTCMinutes()); };
function upcomingEvents(now, withinHours) {
  return CONFIG.events.map((e) => ({ name: e.name, t: Date.parse(e.at) })).filter((e) => e.t > now && e.t - now <= withinHours * HOUR).sort((a, b) => a.t - b.t);
}
function eventLines(now, withinHours) {
  return upcomingEvents(now, withinHours).map((e) => '⚠️ رویداد مهم نزدیکه: <b>' + esc(e.name) + '</b> — <code>' + fmtDT(e.t) + '</code> (ساعت ' + fmtTehran(e.t) + ' به وقت تهران). نوسان شدید ممکنه؛ قبل از اون با احتیاط وارد شو.');
}

// ---------- telegram ----------
async function tg(method, body) {
  let r;
  try {
    r = await fetch('https://api.telegram.org/bot' + TOKEN + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch (e) { throw new Error('telegram: اتصال برقرار نشد'); }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('telegram: ' + (j.description || 'HTTP ' + r.status));
  return j.result;
}
const send = (text) => tg('sendMessage', { chat_id: CHAT, text, disable_web_page_preview: true });
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (t) => '<code>' + esc(t) + '</code>';
const pre = (lines) => '<pre>' + esc(lines.join('\n')) + '</pre>';
const stripHtml = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
async function sendHtml(html) {
  try { return await tg('sendMessage', { chat_id: CHAT, text: html, parse_mode: 'HTML', disable_web_page_preview: true }); }
  catch (e) {
    if (/parse entities|can't parse/i.test(e.message)) return tg('sendMessage', { chat_id: CHAT, text: stripHtml(html), disable_web_page_preview: true });
    throw e;
  }
}
// چند بلوک HTML رو تا سقف ۳۸۰۰ کاراکتر توی یه پیام جمع می‌کنه
async function sendBlocks(blocks) {
  const msgs = []; let cur = '';
  for (const b of blocks.filter(Boolean)) {
    if (cur && (cur.length + b.length + 1) > 3800) { msgs.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + b;
  }
  if (cur) msgs.push(cur);
  for (let i = 0; i < msgs.length; i++) { await sendHtml(msgs[i]); if (i < msgs.length - 1 && !FAST) await sleep(400); }
  return msgs.length;
}

const fp = (x) => TA.fmtPrice(x);
const pad = (t, n) => { t = String(t); return t.length >= n ? t : t + ' '.repeat(n - t.length); };
const padL = (t, n) => { t = String(t); return t.length >= n ? t : ' '.repeat(n - t.length) + t; };
const pctA = (entry, p) => ((p - entry) >= 0 ? '+' : '-') + Math.abs((p - entry) / entry * 100).toFixed(1) + '%';
const SIG = { long: 'BUY', short: 'SELL', wait: 'WAIT' };
const STR1 = { weak: 'W', medium: 'M', strong: 'S' };
const sigCode = (x) => SIG[x.decision] + (x.decision !== 'wait' && x.strength ? '-' + STR1[x.strength] : '');
const sgnNum = (n) => (n >= 0 ? '+' : '') + n;
const LEGEND = 'راهنما: BUY خرید · SELL فروش · WAIT صبر · W ضعیف · M متوسط · S قوی';
const LEGEND_SCEN = 'Entry ناحیه‌ی ورود · Stop حد ضرر · TP1 هدف اول · TP2 هدف دوم · عدد آخر (مثل 1:1.5) نسبت سود به ضرر';
const DISCLAIMER = 'این فقط یه تحلیل آماریه، نه توصیه و نه پیش‌بینی قطعی. حد ضرر رو حتماً بذار.';

function scenarioBlock(sym, x, extraTitle) {
  const c = x.scenario;
  const wv = Math.max(...[c.zoneLo, c.zoneHi, c.stop, c.tp1, c.tp2].map((v) => fp(v).length));
  const row = (k, v, d) => pad(k, 6) + padL(v, wv) + (d ? '  ' + d : '');
  return pre([sym + '  ' + sigCode(x) + '  (' + (x.decision === 'long' ? 'long' : 'short') + ')' + (extraTitle ? '  ' + extraTitle : ''),
    row('Entry', fp(c.zoneLo), '-> ' + fp(c.zoneHi)),
    row('Stop', fp(c.stop), pctA(c.entry, c.stop)),
    row('TP1', fp(c.tp1), pctA(c.entry, c.tp1) + '  1:' + c.rr1.toFixed(1)),
    row('TP2', fp(c.tp2), pctA(c.entry, c.tp2) + '  1:' + c.rr2.toFixed(1))]);
}
function sizingLine(sym, c) {
  const ps = TA.positionSize(CONFIG.capital, CONFIG.riskPct, c.entry, c.stop);
  if (!ps) return '';
  const q = ps.units >= 100 ? ps.units.toFixed(1) : ps.units >= 1 ? ps.units.toFixed(3) : ps.units.toPrecision(3);
  return 'حجم پیشنهادی (سرمایه ' + CONFIG.capital + ' و ریسک ' + CONFIG.riskPct + '٪): ' + code(q + ' ' + sym) + ' ≈ ' + code(ps.notional.toFixed(0) + ' USDT') + (ps.leverage > 1 ? ' (اهرم ' + ps.leverage.toFixed(1) + 'x لازمه)' : '');
}

function signalBlocks(sym, r, now, title, extraLines) {
  const long = r.decision === 'long', sc = r.scenario;
  const B = [];
  B.push((long ? '🟢 ' : '🔴 ') + '<b>' + (title || (long ? 'سیگنال خرید (لانگ)' : 'سیگنال فروش (شورت)')) + '</b> — ' + sym + ' · قدرت: ' + STRENGTH_FA[r.strength] + ' · سبک: ' + STYLES[CONFIG.style].label);
  B.push(pre([pad('COIN', 6) + pad('SIGNAL', 8) + padL('SCORE', 6) + padL('PRICE', Math.max(7, fp(r.price).length) + 1),
    pad(sym, 6) + pad(sigCode(r), 8) + padL(sgnNum(r.composite), 6) + padL(fp(r.price), Math.max(7, fp(r.price).length) + 1)]));
  B.push(scenarioBlock(sym, r));
  B.push(sc.mode === 'now' ? 'ورود: در قیمت فعلی.' : 'ورود: صبر کن قیمت به ناحیه‌ی ورود برگرده؛ دنبال قیمت ندو.');
  const sl = sizingLine(sym, sc); if (sl) B.push(sl);
  (extraLines || []).forEach((l) => B.push(l));
  if (r.warnings.length) B.push(r.warnings.slice(0, 3).map((w) => '⚠️ ' + esc(w)).join('\n'));
  eventLines(now, CONFIG.eventWarnHours).forEach((l) => B.push(l));
  if (!long) B.push('فروش (شورت) فقط توی فیوچرز ممکنه. توی اسپات یعنی نخر یا اگه داری مراقب باش.');
  B.push('<i>' + LEGEND + '\n' + LEGEND_SCEN + '\n' + DISCLAIMER + '</i>');
  return B;
}

function outlookBlocks(sym, o, now) {
  const f = (p) => code(fp(p));
  const lines = TA.outlookLines(o, f);
  const dateStr = new Date(now).toISOString().slice(0, 10);
  const bw = Math.max(7, fp(o.price).length) + 1;
  const tbl = pre([pad('COIN', 6) + pad('BIAS', 7) + padL('SCORE', 6) + padL('PRICE', bw),
    pad(sym, 6) + pad(o.bias === 'up' ? 'UP' : o.bias === 'down' ? 'DOWN' : 'FLAT', 7) + padL(sgnNum(o.composite), 6) + padL(fp(o.price), bw),
    o.tfs.map((t) => t.tf + ' ' + sgnNum(t.score)).join(' | '),
    'S1 ' + fp(o.s1) + (o.s1approx ? '~' : '') + '   S2 ' + fp(o.s2) + (o.s2approx ? '~' : ''),
    'R1 ' + fp(o.r1) + (o.r1approx ? '~' : '') + '   R2 ' + fp(o.r2) + (o.r2approx ? '~' : ''),
    o.range ? 'Range ' + fp(o.range.lo) + ' -> ' + fp(o.range.hi) : 'Range n/a']);
  const body = lines.map((l, i) => (i === 0 ? '<b>' + l + '</b>' : l)).join('\n');
  return [
    '📅 <b>تحلیل ' + o.label + '</b> — ' + sym + ' · ' + dateStr + ' (UTC)',
    tbl,
    body,
    '<i>UP صعودی · DOWN نزولی · FLAT بدون جهت · S حمایت · R مقاومت · ★ سطحی که چند بار لمس شده · ~ تقریبی\nاین یه سناریوئه نه پیش‌بینی قطعی. کیفیتش با ثبت نتیجه‌ها سنجیده می‌شه.</i>'
  ];
}

// ---------- state ----------
function loadState() {
  let s = { coins: {} };
  try { const t = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (t && typeof t === 'object') s = t; } catch (e) {}
  s.coins = s.coins || {}; s.signals = s.signals || []; s.outlooks = s.outlooks || []; s.scan = s.scan || {}; s.spike = s.spike || {};
  return s;
}
function saveState(s) {
  s.signals = s.signals.filter((x) => !isFinal(x) || (x.closedAt || 0) > NOW() - 120 * 24 * HOUR).slice(-400);
  s.outlooks = s.outlooks.slice(-400);
  const text = JSON.stringify(s, null, 2) + '\n';
  let old = '';
  try { old = fs.readFileSync(STATE_FILE, 'utf8'); } catch (e) {}
  if (old !== text) fs.writeFileSync(STATE_FILE, text);
}
const hoursSince = (iso, now) => (iso ? (now - Date.parse(iso)) / HOUR : Infinity);
const isFinal = (x) => ['tp1', 'stop', 'timeout', 'missed', 'expired'].includes(x.status) && !x.watchTp2;

// ---------- tracked signals & outlooks ----------
function track(state, src, sym, r, now, alerted) {
  const sc = r.scenario; if (!sc) return;
  const dir = r.decision === 'long' ? 1 : -1;
  if (state.signals.some((x) => x.sym === sym && x.dir === dir && !isFinal(x) && x.status !== 'tp1')) return;
  state.signals.push({
    id: sym + '|' + now, sym, src, dir, strength: r.strength, mode: sc.mode, entry: sc.entry, zoneLo: sc.zoneLo, zoneHi: sc.zoneHi,
    stop: sc.stop, tp1: sc.tp1, tp2: sc.tp2, rr1: sc.rr1, rr2: sc.rr2, t: now, validUntil: now + CONFIG.signalValidDays[CONFIG.style] * 24 * HOUR,
    status: sc.mode === 'now' ? 'open' : 'pending', alerted: !!alerted,
    patChk: true, pat: ((r.patterns || []).find((p) => p.dir === dir) || {}).id || null  // الگوی کندلی هم‌جهت لحظه‌ی سیگنال (فقط سیگنال‌های جدید)
  });
}
async function evaluateSignals(state) {
  const notes = [];
  const live = state.signals.filter((x) => !isFinal(x));
  const syms = [...new Set(live.map((x) => x.sym))];
  const data = {};
  await Promise.all(syms.map((s) => limited(() => candles(s, '1h', 300).then((c) => { data[s] = c.slice(0, -1); }, () => {}))));
  state.signals = state.signals.map((x) => {
    if (isFinal(x) || !data[x.sym]) return x;
    const y = TA.evaluateSignal(x, data[x.sym]);
    if (y.status !== x.status && ['tp1', 'stop', 'timeout'].includes(y.status)) notes.push(y);
    return y;
  });
  return notes;
}
function outcomeLines(notes) {
  return notes.map((y) => {
    const side = y.dir > 0 ? 'خرید' : 'فروش';
    const tag = (y.alerted ? '' : ' (ضعیف/بدون اعلان)');
    if (y.status === 'tp1') return '✅ ' + y.sym + ' (' + side + ', ' + (STRENGTH_FA[y.strength] || '') + ')' + tag + ' به هدف اول رسید: ' + code(sgnNum(+y.R.toFixed(2)) + 'R');
    if (y.status === 'stop') return '❌ ' + y.sym + ' (' + side + ', ' + (STRENGTH_FA[y.strength] || '') + ')' + tag + ' حد ضرر خورد: ' + code('-1R');
    return '⏱ ' + y.sym + ' (' + side + ')' + tag + ' بدون رسیدن به هدف یا ضرر منقضی شد: ' + code(sgnNum(+y.R.toFixed(2)) + 'R');
  });
}
function recordOutlook(state, sym, o, now) {
  const H = TA.HORIZONS[o.horizon], id = sym + '|' + o.horizon + '|' + new Date(now).toISOString().slice(0, 10);
  if (state.outlooks.some((x) => x.id === id)) return;
  state.outlooks.push({ id, sym, hz: o.horizon, bias: o.bias, strength: o.strength, price: o.price, t: now, due: now + H.ms, s1: o.s1approx ? null : o.s1, r1: o.r1approx ? null : o.r1, done: false });
}
function resolveOutlooks(state, prices, now) {
  for (const x of state.outlooks) {
    if (x.done || now < x.due || !(prices[x.sym] > 0)) continue;
    const p = prices[x.sym];
    x.done = true; x.price1 = p; x.movePct = +((p / x.price - 1) * 100).toFixed(2);
    if (x.bias === 'up') x.correct = p > x.price;
    else if (x.bias === 'down') x.correct = p < x.price;
    else x.correct = x.s1 && x.r1 ? (p >= x.s1 && p <= x.r1) : null;
  }
}
function statsBlocks(state) {
  const filled = state.signals.filter((x) => ['tp1', 'stop', 'timeout'].includes(x.status) && Number.isFinite(x.R));
  const row = (name, arr) => {
    const w = arr.filter((x) => x.R > 0).length, avg = arr.length ? arr.reduce((s, x) => s + x.R, 0) / arr.length : 0;
    return pad(name, 8) + padL(arr.length, 4) + padL(arr.length ? Math.round(w / arr.length * 100) + '%' : '-', 6) + padL(arr.length ? sgnNum(+avg.toFixed(2)) : '-', 8);
  };
  const B = ['📊 <b>آمار نتیجه‌ی سیگنال‌ها</b>'];
  B.push(pre([pad('GROUP', 8) + padL('N', 4) + padL('WIN%', 6) + padL('AVG-R', 8), row('all', filled), row('weak', filled.filter((x) => x.strength === 'weak')),
    row('medium', filled.filter((x) => x.strength === 'medium')), row('strong', filled.filter((x) => x.strength === 'strong')),
    row('long', filled.filter((x) => x.dir > 0)), row('short', filled.filter((x) => x.dir < 0))]));
  const open = state.signals.filter((x) => !isFinal(x) && x.status !== 'tp1').length, pend = state.signals.filter((x) => x.status === 'pending').length;
  const missed = state.signals.filter((x) => x.status === 'missed' || x.status === 'expired').length;
  const t2 = state.signals.filter((x) => x.status === 'tp1');
  B.push('باز یا در انتظار ورود: ' + open + ' (از اون ' + pend + ' تا منتظر برگشت قیمت به ناحیه‌ی ورود). ورود نشده یا منقضی: ' + missed + '.' +
    (t2.length ? ' از ' + t2.length + ' سیگنالی که به هدف اول رسیدن، ' + t2.filter((x) => x.tp2Reached).length + ' تا به هدف دوم هم رسیدن.' : ''));
  B.push('N تعداد · WIN% درصدی که سود کردن (هدف اول قبل از حد ضرر) · AVG-R میانگین سود یا ضرر بر حسب R (R = فاصله‌ی ورود تا حد ضرر)');
  if (filled.length < 30) B.push('⚠️ نمونه کمه (' + filled.length + ' از حداقل ۳۰). با این تعداد نمی‌شه درباره‌ی کیفیت تحلیل قضاوت کرد؛ صبر کن جمع بشه.');
  const done = state.outlooks.filter((x) => x.done);
  const orow = (hz, name) => {
    const a = done.filter((x) => x.hz === hz && x.bias !== 'flat' && x.correct !== null), c = a.filter((x) => x.correct).length;
    const fl = done.filter((x) => x.hz === hz && x.bias === 'flat' && x.correct !== null), fc = fl.filter((x) => x.correct).length;
    return pad(name, 8) + padL(a.length, 4) + padL(a.length ? Math.round(c / a.length * 100) + '%' : '-', 6) + padL(fl.length, 5) + padL(fl.length ? Math.round(fc / fl.length * 100) + '%' : '-', 6);
  };
  B.push('🧭 <b>درستی جهتِ تحلیل‌های روزانه، هفتگی و ماهانه</b>');
  B.push(pre([pad('HORIZON', 8) + padL('N', 4) + padL('HIT%', 6) + padL('FLAT', 5) + padL('HELD', 6), orow('day', 'day'), orow('week', 'week'), orow('month', 'month')]));
  B.push('N تعداد تحلیل صعودی یا نزولی که مهلتش تموم شده · HIT% درصدی که جهت درست بوده (قیمت بعد از مهلت بالاتر یا پایین‌تر از قیمت اول بوده) · FLAT تعداد تحلیل رنج · HELD درصدی که قیمت بین حمایت و مقاومت اول مونده. ۵۰٪ برای جهت یعنی شانسی.');
  return B;
}

// ---------- آمار تفکیکی، سابقه، بازپخش تاریخی و الگوهای کندلی (همه فقط خوندنی/اضافه‌کردنی) ----------
const REPLAY_TFS = [['4h', 2], ['1d', 3]];
const filledSignals = (state) => state.signals.filter((x) => ['tp1', 'stop', 'timeout'].includes(x.status) && Number.isFinite(x.R));
function aggR(arr) {
  const n = arr.length, w = arr.filter((x) => x.R > 0).length, sum = arr.reduce((s, x) => s + x.R, 0);
  return { n, w, avg: n ? sum / n : 0, pct: n ? Math.round(w / n * 100) : null };
}
const pctS = (a) => (a.n ? a.pct + '%' : '-');
const avgS = (a) => (a.n ? sgnNum(+a.avg.toFixed(2)) : '-');
const patName = (id) => (TA.PATTERN_NAMES && TA.PATTERN_NAMES[id]) || id;

function historyLines(state, sym, r) {
  const L = [];
  try {
    const dir = r.decision === 'long' ? 1 : -1, side = dir > 0 ? 'خرید' : 'فروش';
    const mine = filledSignals(state).filter((x) => x.sym === sym), g = aggR(mine), same = aggR(mine.filter((x) => x.dir === dir));
    if (!g.n) L.push('📒 سابقه‌ی ' + sym + ' با این ربات: هنوز سیگنال بسته‌ای نداره.');
    else L.push('📒 سابقه‌ی ' + sym + ' با این ربات: ' + g.n + ' سیگنال بسته، ' + g.pct + '٪ برد، میانگین ' + code(avgS(g) + 'R') +
      (same.n ? ' · فقط ' + side + ': ' + same.w + ' برد از ' + same.n : '') + (g.n < 10 ? ' (نمونه کمه، فقط یه اشاره‌ست)' : ''));
    const rp = state.replay;
    if (rp && rp.groups) {
      const gg = rp.groups[(dir > 0 ? 'long' : 'short') + '|' + r.strength];
      if (gg && gg.n) L.push('🕰 بازپخش تاریخی (حدود ' + rp.days + ' روز، ' + rp.nCoins + ' ارز، تقریبی): سیگنال ' + side + ' ' + STRENGTH_FA[r.strength] + ': ' + gg.n + ' مورد، ' +
        Math.round(gg.w / gg.n * 100) + '٪ به هدف اول رسید، میانگین ' + code(sgnNum(+(gg.sum / gg.n).toFixed(2)) + 'R') + (gg.n < 30 ? ' (نمونه کمه)' : ''));
    }
    const pats = r.patterns || [], al = pats.find((p) => p.dir === dir), opp = pats.find((p) => p.dir === -dir), dj = pats.find((p) => p.dir === 0);
    const tfl = STYLES[CONFIG.style].exec;
    let pl;
    if (al) pl = '🕯 الگوی کندلی ' + tfl + ': ' + code(al.name) + ' هم‌جهت با سیگنال.';
    else if (opp) pl = '🕯 الگوی کندلی ' + tfl + ': ' + code(opp.name) + ' خلاف جهت سیگنال (احتیاط).';
    else if (dj) pl = '🕯 الگوی کندلی ' + tfl + ': ' + code('Doji') + ' (تردید بازار).';
    else pl = '🕯 الگوی کندلی ' + tfl + ' هم‌جهت با سیگنال: ندارد.';
    const py = rp && rp.groups && rp.groups.patY, pn = rp && rp.groups && rp.groups.patN;
    if (py && pn && py.n && pn.n) pl += ' در بازپخش: با الگوی هم‌جهت ' + Math.round(py.w / py.n * 100) + '٪ (' + py.n + ' مورد) · بدون الگو ' + Math.round(pn.w / pn.n * 100) + '٪ (' + pn.n + ' مورد).';
    L.push(pl);
  } catch (e) { /* خط سابقه نباید جلوی سیگنال رو بگیره */ }
  return L;
}

// تاریخچه‌ی بلند فقط برای بازپخش: صفحه‌به‌صفحه از صرافی (binance-vision و mexc) از تاریخ مشخص تا الان
const DEEP = {
  binance: async (b, tf, since) => {
    let all = [], start = since, pages = 0;
    while (pages++ < 40) {
      const q = '/api/v3/klines?symbol=' + b + 'USDT&interval=' + tf + '&startTime=' + start + '&limit=1000';
      let j;
      try { j = await getJSON('https://data-api.binance.vision' + q, 20000); } catch (e) { j = await getJSON('https://api.binance.com' + q, 20000); }
      if (!Array.isArray(j)) throw new Error('binance');
      if (!j.length) break;
      all = all.concat(binanceRows(j));
      if (j.length < 1000) break;
      start = +j[j.length - 1][0] + 1;
    }
    return all;
  },
  mexc: async (b, tf, since) => {
    let all = [], start = since, pages = 0;
    while (pages++ < 40) {
      const j = await getJSON('https://api.mexc.com/api/v3/klines?symbol=' + b + 'USDT&interval=' + tf + '&startTime=' + start + '&limit=1000', 20000);
      if (!Array.isArray(j)) throw new Error('mexc');
      if (!j.length) break;
      all = all.concat(binanceRows(j));
      if (j.length < 1000) break;
      start = +j[j.length - 1][0] + 1;
    }
    return all;
  }
};
async function deepCandles(sym, tf, sinceMs) {
  let lastErr = new Error('no source');
  for (const id of ['binance', 'mexc']) {
    try {
      const a = normalize(await DEEP[id](sym, tf, sinceMs));
      if (a.length >= 400 && sane(a)) return a;
      lastErr = new Error(id + ': bad data');
    } catch (e) { lastErr = new Error(id + ': ' + (e && e.message ? e.message : 'error')); }
  }
  throw lastErr;
}

async function runReplay(state, now, budgetMs) {
  const syms = [...new Set(CONFIG.coins.concat(CONFIG.replayExtra || []))].filter((s) => SYM_RE.test(s));
  const tfMs = { '4h': TFMS['4h'], '1d': TFMS['1d'] };
  const validMs = CONFIG.signalValidDays.swing * 24 * HOUR;
  const since = Date.parse(CONFIG.replayFrom || '2020-01-01') || Date.parse('2020-01-01');
  const fwd = CONFIG.replayFwdCandles || 6;
  const groups = {}, pat = {}, base = { n: 0, up: 0, yr: {} }, yrs = {};
  const G = (o, k) => o[k] || (o[k] = { n: 0, w: 0, sum: 0, t2: 0 });
  let nCoins = 0, steps = 0, from = Infinity; const failedCoins = [], shallow = [], skipped = [];
  const t0 = Date.now();
  await Promise.all(syms.map((sym) => limited(async () => {
    if (Date.now() - t0 > (budgetMs || CONFIG.replayBudgetMs || 480000)) { skipped.push(sym); return; }  // سقف زمان، تا اجرا از مهلت گیت‌هاب رد نشه
    try {
      let c4, c1, deep = true;
      try {
        [c4, c1] = await Promise.all([deepCandles(sym, '4h', since), deepCandles(sym, '1d', since - 320 * 864e5)]);
      } catch (e) {
        deep = false;  // اگه تاریخچه‌ی بلند نیومد، با ۱۰۰۰ کندل آخر (حدود ۴ ماه) ادامه می‌دیم
        [c4, c1] = await Promise.all([candles(sym, '4h', 1000, 400), candles(sym, '1d', 1000, 300)]);
      }
      if (!deep) shallow.push(sym);
      // کندل آخرِ هر تایم‌فریم هنوز بازه (ناقص) پس حذفش می‌کنیم
      const out = TA.replay({ series: { '4h': c4.slice(0, -1), '1d': c1.slice(0, -1) }, tfs: REPLAY_TFS, execTf: '4h', tfMs, validMs, fwd });
      nCoins++; steps += out.steps; if (out.from) from = Math.min(from, out.from);
      base.n += out.base.n; base.up += out.base.up;
      for (const [y, b] of Object.entries(out.base.yr)) { const q = base.yr[y] || (base.yr[y] = { n: 0, up: 0 }); q.n += b.n; q.up += b.up; }
      for (const [id, p] of Object.entries(out.patterns)) {
        const q = pat[id] || (pat[id] = { n: 0, hit: 0, sum: 0, dir: p.dir, up: 0, yr: {} });
        q.n += p.n; q.hit += p.hit; q.sum += p.sum; q.up += p.up;
        for (const [y, v] of Object.entries(p.yr || {})) { const z = q.yr[y] || (q.yr[y] = { n: 0, hit: 0 }); z.n += v.n; z.hit += v.hit; }
      }
      for (const s of out.signals) {
        if (!['tp1', 'stop', 'timeout'].includes(s.status) || !Number.isFinite(s.R)) continue;
        const add = (o, k) => { const g = G(o, k); g.n++; if (s.R > 0) g.w++; g.sum += s.R; if (s.tp2) g.t2++; };
        add(groups, (s.dir > 0 ? 'long' : 'short') + '|' + s.strength);
        add(groups, s.dir > 0 ? 'long|all' : 'short|all'); add(groups, 'all|all');
        add(groups, s.pat ? 'patY' : 'patN');
        const y = new Date(s.t).getUTCFullYear(), yo = yrs[y] || (yrs[y] = {});
        add(yo, 'all'); if (s.strength !== 'weak') add(yo, 'ms');
      }
    } catch (e) { failedCoins.push(sym); }
  })));
  if (!nCoins) throw new Error('بازپخش: داده‌ی کندل گرفته نشد');
  state.replay = { t: new Date(now).toISOString(), nCoins, failed: failedCoins, shallow, skipped, days: Math.round(steps / nCoins * 4 / 24), from: Number.isFinite(from) ? new Date(from).toISOString().slice(0, 10) : null, groups, pat, base, yrs, fwd };
  console.log('بازپخش تاریخی: ' + nCoins + ' ارز، ' + (Date.now() - t0) + ' میلی‌ثانیه' + (shallow.length ? '، فقط تاریخچه‌ی کوتاه برای: ' + shallow.join(',') : '') + (failedCoins.length ? '، بدون داده: ' + failedCoins.join(',') : '') + (skipped.length ? '، رد شده (کمبود زمان): ' + skipped.join(',') : ''));
  return state.replay;
}

function replayBlocks(state) {
  const rp = state.replay;
  if (!rp || !rp.groups || !rp.groups['all|all']) return ['🕰 بازپخش تاریخی هنوز اجرا نشده. حالت replay رو اجرا کن (یا صبر کن خودکار حساب بشه).'];
  const B = ['🕰 <b>بازپخش تاریخی (تقریبی)</b> — ' + rp.groups['all|all'].n + ' سیگنال فرضی' + (rp.from ? ' از ' + rp.from : ' از حدود ' + rp.days + ' روز') + ' تا الان روی ' + rp.nCoins + ' ارز (میانگین ' + rp.days + ' روز برای هر ارز)'];
  const row = (name, g) => pad(name, 9) + padL(g ? g.n : 0, 5) + padL(g && g.n ? Math.round(g.w / g.n * 100) + '%' : '-', 6) + padL(g && g.n ? sgnNum(+(g.sum / g.n).toFixed(2)) : '-', 8);
  const gr = rp.groups;
  B.push(pre([pad('GROUP', 9) + padL('N', 5) + padL('WIN%', 6) + padL('AVG-R', 8), row('all', gr['all|all']), row('long', gr['long|all']), row('short', gr['short|all']),
    row('long-M', gr['long|medium']), row('short-M', gr['short|medium']), row('long-S', gr['long|strong']), row('short-S', gr['short|strong']),
    row('long-W', gr['long|weak']), row('short-W', gr['short|weak']), row('pat-yes', gr.patY), row('pat-no', gr.patN)]));
  B.push('pat-yes سیگنال‌هایی که لحظه‌ی صدور یه الگوی هم‌جهت داشتن · pat-no بدون الگو. اگه این دو نزدیک باشن یعنی الگو کمکی نکرده.');
  const years = Object.keys(rp.yrs || {}).sort();
  if (years.length) {
    const yr = (y) => { const a = rp.yrs[y].all, m = rp.yrs[y].ms; return pad(y, 6) + padL(a ? a.n : 0, 5) + padL(a && a.n ? Math.round(a.w / a.n * 100) + '%' : '-', 6) + padL(a && a.n ? sgnNum(+(a.sum / a.n).toFixed(2)) : '-', 7) + padL(m ? m.n : 0, 5) + padL(m && m.n ? sgnNum(+(m.sum / m.n).toFixed(2)) : '-', 7); };
    B.push('📆 <b>روش به تفکیک سال</b>');
    B.push(pre([pad('YEAR', 6) + padL('N', 5) + padL('WIN%', 6) + padL('AVG-R', 7) + padL('N-MS', 5) + padL('R-MS', 7)].concat(years.map(yr))));
    B.push('N-MS و R-MS فقط سیگنال‌های متوسط و قوی. اگه سودِ روش فقط توی یکی دو سال بوده و بقیه صفر یا منفیه، یعنی بیشتر شرایط بازار بوده تا خود روش.');
  }
  const ids = Object.keys(rp.pat || {}).filter((id) => rp.pat[id].dir !== 0 && rp.pat[id].n >= 5);
  if (ids.length && rp.base && rp.base.n) {
    const bu = rp.base.up / rp.base.n;
    const info = (id) => {
      const p = rp.pat[id], b = p.dir > 0 ? bu : 1 - bu, hit = p.hit / p.n, z = (hit - b) / Math.sqrt(b * (1 - b) / p.n);
      let ok = 0, el = 0;
      for (const [y, v] of Object.entries(p.yr || {})) {
        const by = rp.base.yr && rp.base.yr[y]; if (!by || !by.n || v.n < 15) continue;
        const bb = p.dir > 0 ? by.up / by.n : 1 - by.up / by.n; el++; if (v.hit / v.n > bb) ok++;
      }
      return { id, p, b, hit, z, ok, el };
    };
    const rows = ids.map(info).sort((x, y) => Math.abs(y.z) - Math.abs(x.z)).map((r) =>
      pad(patName(r.id), 16) + padL(r.p.n, 5) + padL(Math.round(r.hit * 100) + '%', 5) + padL(Math.round(r.b * 100) + '%', 5) + padL(sgnNum(+r.z.toFixed(1)), 5) + padL(r.el ? r.ok + '/' + r.el : '-', 5));
    B.push('🕯 <b>الگوهای کندلی و شکلی (۴ ساعته)</b> — نتیجه ' + ((rp.fwd || 6) * 4) + ' ساعت بعد');
    B.push(pre([pad('PATTERN', 16) + padL('N', 5) + padL('HIT%', 5) + padL('BASE', 5) + padL('Z', 5) + padL('YRS', 5)].concat(rows)));
    B.push('HIT% درصدی که قیمت بعد از الگو در جهت الگو رفته · BASE همون درصد برای یه کندل معمولی بی‌الگو · Z یعنی اختلاف HIT و BASE چند برابر خطای تصادفیه (زیر ۳ رو جدی نگیر) · YRS تعداد سال‌هایی که الگو از BASE همون سال بهتر بوده نسبت به کل سال‌های قابل‌سنجش. چون چندین الگو تست شد، چند تاشون فقط شانسی خوب درمیان؛ الگوی واقعی باید Z بالا و YRS تقریباً همه‌ی سال‌ها رو داشته باشه.');
  }
  const notes = [];
  if (rp.shallow && rp.shallow.length) notes.push('برای ' + rp.shallow.join('، ') + ' فقط تاریخچه‌ی کوتاه (حدود ۴ ماه) گرفته شد');
  if (rp.failed && rp.failed.length) notes.push('بدون داده: ' + rp.failed.join('، '));
  if (rp.skipped && rp.skipped.length) notes.push('کمبود زمان، رد شد: ' + rp.skipped.join('، '));
  if (notes.length) B.push('ℹ️ ' + esc(notes.join(' · ')));
  B.push('<i>این یه بازپخش تقریبیه: فقط تایم‌فریم ۴ ساعته و روزانه (بدون ۱ ساعته)، ارزیابی با کندل ۴ ساعته (هر وقت حد ضرر و هدف توی یه کندل بودن، ضرر حساب می‌شه)، بدون کارمزد و لغزش. گذشته تضمین آینده نیست و بازار عوض می‌شه. نمونه‌ی زیر ۳۰ فقط یه اشاره‌ست.</i>');
  return B;
}

function extendedStatsBlocks(state) {
  const B = [];
  const filled = filledSignals(state);
  if (filled.length) {
    const rowS = (name, a) => pad(name, 8) + padL(a.n, 4) + padL(pctS(a), 6) + padL(avgS(a), 8);
    const bySrc = (s) => aggR(filled.filter((x) => (x.src || 'watch') === s));
    B.push('🔀 <b>به تفکیک منبع</b>');
    B.push(pre([pad('SOURCE', 8) + padL('N', 4) + padL('WIN%', 6) + padL('AVG-R', 8), rowS('watch', bySrc('watch')), rowS('scan', bySrc('scan'))]));
    B.push('watch ارزهای لیست خودت · scan ارزهایی که اسکنر ۱۰۰ ارز اول پیدا کرده');
    const syms = [...new Set(filled.map((x) => x.sym))].map((s) => ({ s, a: aggR(filled.filter((x) => x.sym === s)) })).sort((x, y) => y.a.n - x.a.n || y.a.avg - x.a.avg);
    const LS = (arr) => (arr.length ? arr.filter((x) => x.R > 0).length + '/' + arr.length : '-');
    const rows = syms.slice(0, 20).map(({ s, a }) => pad(s, 6) + padL(a.n, 3) + padL(pctS(a), 6) + padL(avgS(a), 7) + padL(LS(filled.filter((x) => x.sym === s && x.dir > 0)), 6) + padL(LS(filled.filter((x) => x.sym === s && x.dir < 0)), 6));
    B.push('🪙 <b>به تفکیک ارز</b>');
    B.push(pre([pad('COIN', 6) + padL('N', 3) + padL('WIN%', 6) + padL('AVG-R', 7) + padL('LONG', 6) + padL('SHORT', 6)].concat(rows)));
    B.push('LONG و SHORT یعنی «برد/کل» برای اون جهت (مثلاً 2/4 یعنی از ۴ خرید، ۲ تا سود کرد)' + (syms.length > 20 ? ' · ' + (syms.length - 20) + ' ارز دیگه با نمونه‌ی کمتر نشون داده نشد' : '') + '. با کمتر از ۲۰ سیگنال برای هر ارز، عددها بیشتر نویزن تا سابقه.');
    const chk = filled.filter((x) => x.patChk);
    if (chk.length) {
      const y = aggR(chk.filter((x) => x.pat)), n = aggR(chk.filter((x) => !x.pat));
      B.push('🕯 <b>سیگنال‌ها با و بدون الگوی کندلی هم‌جهت</b> (فقط سیگنال‌های ثبت‌شده بعد از این آپدیت)');
      B.push(pre([pad('GROUP', 8) + padL('N', 4) + padL('WIN%', 6) + padL('AVG-R', 8), rowS('pat-yes', y), rowS('pat-no', n)]));
    }
  }
  B.push(...replayBlocks(state));
  return B;
}

// ---------- blocks: hourly / spike / scan ----------
async function derivBlocks(good) {
  if (!CONFIG.showDerivatives) return [];
  const rows = await Promise.all(good.map((r) => derivInfo(r.sym).then((d) => ({ sym: r.sym, d }))));
  if (!rows.some((x) => x.d.funding !== null || x.d.ls !== null)) return [];
  const T = [pad('COIN', 6) + padL('FUND%', 9) + padL('L/S', 7)];
  const warn = [];
  for (const { sym, d } of rows) {
    T.push(pad(sym, 6) + padL(d.funding === null ? 'n/a' : (d.funding * 100 >= 0 ? '+' : '') + (d.funding * 100).toFixed(4), 9) + padL(d.ls === null ? 'n/a' : d.ls.toFixed(2), 7));
    if (d.funding !== null && d.funding * 100 >= 0.05) warn.push(sym + ': فاندینگ خیلی مثبته، یعنی لانگ‌ها شلوغن و ریسک ریزش ناگهانی (اسکوییز) بالاست.');
    if (d.funding !== null && d.funding * 100 <= -0.03) warn.push(sym + ': فاندینگ منفیه، یعنی شورت‌ها شلوغن و ریسک جهش ناگهانی بالاست.');
  }
  return ['<b>فاندینگ و لانگ/شورت</b> (فقط اطلاعات)', pre(T), 'FUND% نرخ فاندینگ: مثبت یعنی لانگ‌ها شلوغ‌ترن · L/S نسبت حساب‌های لانگ به شورت: بالای ۱ یعنی لانگ بیشتر. روی سیگنال اثر نداره و پیش‌بینی نیست.'].concat(warn.map((w) => '⚠️ ' + esc(w)));
}
function volBlocks(good) {
  const T = [pad('COIN', 6) + padL('ATR%', 7) + padL('BAND', 8)];
  for (const { sym, res: x } of good) {
    const t = x.tfs.find((z) => z.tf === x.execTf) || x.tfs[0];
    T.push(pad(sym, 6) + padL(t.atrPct.toFixed(1), 7) + padL(TA.volState(t.bwRank), 8));
  }
  return ['<b>نوسان</b> (' + (TA.TF_ADJ[good[0].res.execTf] || '') + ')', pre(T), 'ATR% میانگین حرکت هر کندل نسبت به قیمت · BAND وضعیت باندهای بولینگر: tight فشرده (بازار کم‌جون، ممکنه حرکت بزرگ نزدیک باشه)، wide باز (پرنوسان).'];
}
function hourlyBlocks(state, good, failed, now, extra) {
  const wp = Math.max(7, ...good.map((r) => fp(r.res.price).length)) + 1;
  const T = [pad('COIN', 6) + pad('SIGNAL', 8) + padL('SCORE', 6) + padL('PRICE', wp)];
  for (const { sym, res: x } of good) T.push(pad(sym, 6) + pad(sigCode(x), 8) + padL(sgnNum(x.composite), 6) + padL(fp(x.price), wp));
  failed.forEach((r) => T.push(pad(r.sym, 6) + 'no data'));
  const B = ['🕐 <b>گزارش ساعتی</b> · ' + STYLES[CONFIG.style].label, pre(T), '<i>' + LEGEND + '</i>'];
  const act = good.filter((r) => r.res.decision !== 'wait' && r.res.scenario);
  if (act.length) { B.push('<b>سناریوها</b>'); act.forEach((r) => B.push(scenarioBlock(r.sym, r.res))); B.push('<i>' + LEGEND_SCEN + '</i>'); }
  if (good.length) volBlocks(good).forEach((b) => B.push(b));
  (extra.deriv || []).forEach((b) => B.push(b));
  if (extra.scanLine) B.push(extra.scanLine);
  eventLines(now, CONFIG.eventWarnHours).forEach((l) => B.push(l));
  B.push('<i>این گزارش برای تمرینه و توصیه نیست.</i>');
  return B;
}

async function checkSpikes(state, now) {
  const fired = [];
  const res = await Promise.all(CONFIG.coins.map((sym) => limited(() => candles(sym, '15m', 100).then((c) => ({ sym, c }), () => null))));
  for (const r of res) {
    if (!r) continue;
    const sp = TA.detectSpike(r.c.slice(0, -1), { atrMult: CONFIG.spikeAtrMult });
    if (!sp) continue;
    const s = state.spike[r.sym] || {};
    if (s.t === sp.t || hoursSince(s.lastAlert, now) < CONFIG.spikeCooldownHours) continue;
    state.spike[r.sym] = { t: sp.t, lastAlert: new Date(now).toISOString() };
    fired.push({ sym: r.sym, sp });
  }
  for (const { sym, sp } of fired) {
    const st = state.coins[sym] && state.coins[sym].decision;
    const status = st === 'long' ? 'خرید' : st === 'short' ? 'فروش' : st === 'wait' ? 'صبر' : null;
    const up = sp.dir > 0;
    await sendBlocks([
      '⚡ <b>حرکت ناگهانی</b> — ' + sym + ' ' + (up ? '🟢 صعودی' : '🔴 نزولی'),
      pre(['COIN  MOVE     ATRx  VOLx', pad(sym, 6) + pad(sgnNum(+sp.pct.toFixed(2)) + '%', 9) + pad(sp.atrMult.toFixed(1), 6) + sp.volRatio.toFixed(1), 'Price ' + fp(sp.price)]),
      'قیمت توی یه کندل ۱۵ دقیقه‌ای ' + code(sp.atrMult.toFixed(1) + ' برابر') + ' نوسان عادی حرکت کرد و حجم ' + code(sp.volRatio.toFixed(1) + ' برابر') + ' میانگین بود.' +
        (status ? ' وضعیت آخرین تحلیل این ارز: ' + status + '.' : ''),
      'دنبال حرکت دویدن معمولاً گرونه. بهتره منتظر برگشت یا تثبیت قیمت بمونی و قبل از ورود تحلیل ساعتی رو ببینی.',
      '<i>MOVE تغییر کندل · ATRx چند برابر نوسان عادی · VOLx چند برابر حجم میانگین</i>'
    ]);
    if (!FAST) await sleep(400);
  }
  return fired.length;
}

async function runScan(state, now) {
  const info = { t: new Date(now).toISOString(), universe: 0, analyzed: 0, signals: [] };
  const tick = await fetchTickers();
  const watch = new Set(CONFIG.coins), only = new Set(CONFIG.scanOnly.map((s) => s.toUpperCase())), excl = new Set(CONFIG.scanExclude.map((s) => s.toUpperCase()));
  let uni = tick.slice().sort((a, b) => b.qvol - a.qvol).slice(0, CONFIG.scanTop).filter((x) => x.qvol >= CONFIG.scanMinVolUsd);
  info.universe = uni.length;
  uni = uni.filter((x) => !watch.has(x.sym) && !excl.has(x.sym) && (!only.size || only.has(x.sym)));
  const cand = uni.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, CONFIG.scanCandidates);
  const results = await Promise.all(cand.map((c) => settle(c.sym, { tk: c })));
  const good = results.filter((r) => r.res);
  info.analyzed = good.length;
  const minRank = STRENGTH_RANK[CONFIG.scanMinStrength];
  const hits = [];
  for (const r of good) {
    const d = r.res.decision, s = state.scan[r.sym] || (state.scan[r.sym] = { decision: null, lastAlertedDecision: null, lastAlert: null });
    s.decision = d;
    if (d === 'wait') { s.lastAlertedDecision = null; continue; }
    if (STRENGTH_RANK[r.res.strength] < minRank || !(d === 'long' || CONFIG.alertShorts)) continue;
    info.signals.push(r.sym + (d === 'long' ? ' (خرید)' : ' (فروش)'));
    if (s.lastAlertedDecision !== d && hoursSince(s.lastAlert, now) >= CONFIG.scanCooldownHours) hits.push(r);
  }
  hits.sort((a, b) => Math.abs(b.res.composite) - Math.abs(a.res.composite));
  for (const r of hits.slice(0, CONFIG.scanMaxAlerts)) {
    const tk = r.tk, vol = tk.qvol >= 1e6 ? (tk.qvol / 1e6).toFixed(1) + 'M' : (tk.qvol / 1e3).toFixed(0) + 'K';
    const extra = ['حجم ۲۴ ساعته: ' + code(vol + ' USDT') + ' · تغییر ۲۴ ساعته: ' + code(sgnNum(+(tk.chg * 100).toFixed(1)) + '%'),
      '🔎 این ارز از بیرون لیست تو پیدا شده. قبل از هر کاری چک کن توی اوکی‌اکسچنج لیست باشه.'];
    if (tk.qvol < 2e7) extra.push('⚠️ حجم نسبتاً کمه؛ احتمال لغزش قیمت و دستکاری بیشتره. حجم معامله رو کوچیک بگیر.');
    await sendBlocks(signalBlocks(r.sym, r.res, now, 'اسکنر: ' + (r.res.decision === 'long' ? 'سیگنال خرید' : 'سیگنال فروش'), extra.concat(historyLines(state, r.sym, r.res))));
    const s = state.scan[r.sym]; s.lastAlertedDecision = r.res.decision; s.lastAlert = new Date(now).toISOString();
    track(state, 'scan', r.sym, r.res, now, true);
    if (!FAST) await sleep(400);
  }
  const rest = hits.length - Math.min(hits.length, CONFIG.scanMaxAlerts);
  if (rest > 0) await sendHtml('🔎 اسکنر ' + rest + ' سیگنال دیگه هم پیدا کرد که این بار نفرستاد: ' + esc(hits.slice(CONFIG.scanMaxAlerts).map((r) => r.sym).join('، ')));
  state.lastScan = info;
  return info;
}

// ---------- scheduled reports ----------
async function sendOutlooks(state, hz, now) {
  let sent = 0;
  const T = new Date(now).toISOString().slice(0, 10);
  const results = await Promise.all(CONFIG.coins.map((sym) => getOutlook(sym, hz).then((o) => ({ sym, o }), (err) => ({ sym, err }))));
  for (const r of results) {
    if (r.err) { await sendHtml('📅 ' + r.sym + ' — تحلیل ' + TA.HORIZONS[hz].label + ' ساخته نشد: ' + esc(r.err.message)); continue; }
    recordOutlook(state, r.sym, r.o, now);
    await sendBlocks(outlookBlocks(r.sym, r.o, now)); sent++;
    if (!FAST) await sleep(400);
  }
  return sent;
}
async function dailyIntro(now) {
  const B = ['📅 <b>تحلیل روزانه</b> · ' + new Date(now).toISOString().slice(0, 10) + ' (UTC)'];
  if (CONFIG.showNews) {
    try {
      const f = await fearGreed();
      B.push('شاخص ترس و طمع: ' + code(String(f.value)) + ' (' + (FNG_FA[f.cls] || esc(f.cls)) + ')' + (f.prev !== null ? ' · دیروز: ' + code(String(f.prev)) : '') + '\n<i>۰ ترس شدید و ۱۰۰ طمع شدید. فقط حال کلی بازاره، نه سیگنال.</i>');
    } catch (e) {}
    const h = await headlines(now);
    if (h.length) B.push('<b>تیتر خبرها</b> (انگلیسی، از ' + [...new Set(h.map((x) => x.src))].join(' و ') + ')\n' + h.map((x) => '• ' + esc(x.title)).join('\n'));
    else B.push('تیتر خبرها الان در دسترس نبود.');
  }
  const ev = upcomingEvents(now, 24 * 7);
  if (ev.length) B.push('<b>رویدادهای مهم تا یک هفته‌ی آینده</b>\n' + ev.slice(0, 4).map((e) => '• ' + esc(e.name) + ' — ' + code(fmtDT(e.t)) + ' (' + fmtTehran(e.t) + ' تهران)').join('\n'));
  else if (!CONFIG.events.some((e) => Date.parse(e.at) > now)) B.push('⚠️ لیست رویدادهای اقتصادی تموم شده و باید به‌روز بشه.');
  return B;
}

// ---------- modes ----------
async function setup() {
  const ups = await tg('getUpdates', { limit: 50 });
  const chats = ups.filter((u) => u.message && u.message.chat && u.message.chat.type === 'private').map((u) => u.message.chat);
  if (!chats.length) { console.log('هنوز هیچ پیامی به ربات نرسیده. اول توی تلگرام به رباتت Start بزن و یه پیام بنویس، بعد دوباره این مرحله رو اجرا کن.'); process.exitCode = 1; return; }
  const chat = chats[chats.length - 1];
  await tg('sendMessage', { chat_id: chat.id, text: 'اتصال برقرار شد ✓\nشناسه‌ی چت تو: ' + chat.id + '\nاین عدد رو توی گیت‌هاب، بخش Settings > Secrets and variables > Actions، با اسم TELEGRAM_CHAT_ID ذخیره کن.' });
  console.log('شناسه‌ی چت به تلگرامت فرستاده شد. اونجا رو ببین.');
}

async function main() {
  if (!STYLES[CONFIG.style]) throw new Error('style نامعتبر');
  CONFIG.coins = CONFIG.coins.map((s) => String(s).toUpperCase().trim()).filter((s) => SYM_RE.test(s)).slice(0, 15);
  if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN تنظیم نشده'); process.exitCode = 1; return; }
  if (MODE === 'setup') return setup();
  if (!CHAT) { console.error('TELEGRAM_CHAT_ID تنظیم نشده. اول مرحله setup رو اجرا کن.'); process.exitCode = 1; return; }

  const state = loadState();
  const now = NOW();
  const log = (m) => console.log(m);
  const guard = async (name, fn) => { try { return await fn(); } catch (e) { log('خطا در ' + name + ': ' + (e && e.message ? e.message : e)); return null; } };

  if (MODE === 'test') {
    const results = await analyzeAll();
    const lines = ['✅ تست ربات (' + STYLES[CONFIG.style].label + ')'];
    for (const r of results) {
      if (!r.res) { lines.push(r.sym + ': داده گرفته نشد'); continue; }
      const x = r.res;
      lines.push(r.sym + ': ' + (x.decision === 'long' ? 'خرید' : x.decision === 'short' ? 'فروش' : 'صبر') + (x.strength ? ' (' + STRENGTH_FA[x.strength] + ')' : '') + ' | امتیاز ' + sgnNum(x.composite) + ' | قیمت ' + fp(x.price));
    }
    lines.push('\nاگه این پیام رو می‌بینی، همه‌چیز وصله.');
    await send(lines.join('\n'));
    log('پیام تست فرستاده شد.');
    return;
  }

  // 1) حرکت ناگهانی (هر اجرا)
  let spikes = 0;
  if (CONFIG.spikeAlerts && ['run', 'full'].includes(MODE)) spikes = (await guard('حرکت ناگهانی', () => checkSpikes(state, now))) || 0;

  // 2) تحلیل کامل (تقریباً ساعتی)
  const fullDue = MODE === 'full' || (MODE === 'run' && hoursSince(state.lastFull, now) >= 0.8);
  let results = null, good = [], failed = [], prices = {};
  if (fullDue) {
    results = await analyzeAll();
    good = results.filter((r) => r.res);
    failed = results.filter((r) => r.err);
    failed.forEach((r) => log('خطا برای ' + r.sym + ': ' + r.err.message));
    if (!good.length) {
      console.error('هیچ ارزی تحلیل نشد.');
      if (hoursSince(state.lastError, now) >= 12) {
        try { await send('⚠️ ربات نتونست داده‌ی هیچ ارزی رو بگیره. شاید صرافی‌ها IP گیت‌هاب رو بستن. دلیل: ' + failed[0].err.message); state.lastError = new Date(now).toISOString(); } catch (e) { console.error(e.message); }
      }
      saveState(state); process.exitCode = 1; return;
    }
    good.forEach((r) => { prices[r.sym] = r.res.price; });

    // نتیجه‌ی سیگنال‌های قبلی و تحلیل‌های بازه‌ای
    const notes = (await guard('ارزیابی سیگنال‌ها', () => evaluateSignals(state))) || [];
    resolveOutlooks(state, prices, now);

    // سیگنال تازه
    let sent = 0;
    const minRank = STRENGTH_RANK[CONFIG.minStrength];
    for (const { sym, res } of good) {
      const d = res.decision;
      const s = state.coins[sym];
      if (!s) { state.coins[sym] = { decision: d, lastAlertedDecision: d === 'wait' ? null : d, lastAlert: null }; continue; } // اولین بار: فقط ثبت وضعیت
      const prev = s.decision;
      s.decision = d;
      if (d === 'wait') { s.lastAlertedDecision = null; continue; }
      const strongEnough = STRENGTH_RANK[res.strength] >= minRank;
      const dirOk = d === 'long' || CONFIG.alertShorts;
      const willAlert = strongEnough && dirOk && s.lastAlertedDecision !== d && hoursSince(s.lastAlert, now) >= CONFIG.cooldownHours;
      if (prev !== d && res.scenario) track(state, 'watch', sym, res, now, willAlert);
      if (willAlert) {
        await sendBlocks(signalBlocks(sym, res, now, undefined, historyLines(state, sym, res)));
        s.lastAlertedDecision = d; s.lastAlert = new Date(now).toISOString(); sent++;
        if (!FAST) await sleep(400);
      }
    }

    // اسکنر
    let scanLine = '';
    if (CONFIG.scanEnabled) {
      const info = await guard('اسکنر', () => runScan(state, now));
      if (info) scanLine = '🔎 اسکنر: ' + info.analyzed + ' ارز پرحرکت از ' + info.universe + ' ارز پرحجم بررسی شد؛ سیگنال ' + (CONFIG.scanMinStrength === 'weak' ? '' : 'متوسط یا قوی') + ': ' + (info.signals.length ? esc(info.signals.join('، ')) : 'نداشت') + '.';
      else scanLine = '🔎 اسکنر این بار اجرا نشد (خطا در گرفتن داده).';
    }

    // گزارش ساعتی
    if (CONFIG.hourlyReport) {
      const deriv = (await guard('فاندینگ', () => derivBlocks(good))) || [];
      await sendBlocks(hourlyBlocks(state, good, failed, now, { deriv, scanLine }));
    } else if (CONFIG.heartbeatHours > 0 && hoursSince(state.lastHeartbeat, now) >= CONFIG.heartbeatHours) {
      const sig = good.filter((r) => r.res.decision !== 'wait').map((r) => r.sym + (r.res.decision === 'long' ? ' (خرید)' : ' (فروش)'));
      await send('ربات فعاله ✓ ' + good.length + ' ارز بررسی شد' + (failed.length ? '، ' + failed.length + ' مورد بدون داده' : '') + '.\n' + (sig.length ? 'سناریوهای ورودِ الان: ' + sig.join('، ') : 'الان سناریوی ورودی نیست.'));
      state.lastHeartbeat = new Date(now).toISOString();
    }
    if (notes.length) await sendHtml('<b>نتیجه‌ی سیگنال‌های قبلی</b>\n' + outcomeLines(notes).join('\n'));
    // بازپخش تاریخی (ماهی یه بار، آخر کار و بعد از ارسال همه‌ی پیام‌ها؛ با سقف زمان کم تا ثبت وضعیت و مهلت گیت‌هاب به خطر نیفته)
    if (CONFIG.replayEnabled && hoursSince(state.replay && state.replay.t, now) >= CONFIG.replayEveryDays * 24) await guard('بازپخش تاریخی', () => runReplay(state, now, CONFIG.replayAutoBudgetMs || 150000));
    state.lastFull = new Date(now).toISOString();
    log('تحلیل کامل انجام شد: ' + good.length + ' ارز، ' + sent + ' اعلان، ' + spikes + ' حرکت ناگهانی.');
  }

  // 3) اسکنر یا آمار دستی
  if (MODE === 'scan') {
    const info = await guard('اسکنر', () => runScan(state, now));
    if (info) await sendHtml('🔎 اسکنر: ' + info.analyzed + ' ارز پرحرکت از ' + info.universe + ' ارز پرحجم بررسی شد؛ سیگنال: ' + (info.signals.length ? esc(info.signals.join('، ')) : 'نداشت') + '.');
    else await send('اسکنر اجرا نشد (خطا در گرفتن داده).');
  }
  if (MODE === 'stats') {
    resolveOutlooks(state, prices, now);
    await sendBlocks(statsBlocks(state).concat(extendedStatsBlocks(state)));
  }
  if (MODE === 'replay') {
    try { await runReplay(state, now); } catch (e) { await send('بازپخش تاریخی اجرا نشد: ' + e.message); saveState(state); return; }
    await sendBlocks(replayBlocks(state));
  }

  // 4) گزارش‌های روزانه، هفتگی، ماهانه
  const T = new Date(now + TEHRAN), todayKey = T.toISOString().slice(0, 10), hr = T.getUTCHours();
  const afterHour = hr >= CONFIG.reportHourTehran;
  const run = MODE === 'run' || MODE === 'full';
  const dailyDue = MODE === 'daily' || (run && CONFIG.dailyReport && afterHour && state.lastDaily !== todayKey);
  const weeklyDue = MODE === 'weekly' || (run && CONFIG.weeklyReport && afterHour && T.getUTCDay() === CONFIG.weeklyDay && state.lastWeekly !== todayKey);
  const monthlyDue = MODE === 'monthly' || (run && CONFIG.monthlyReport && afterHour && T.getUTCDate() === 1 && state.lastMonthly !== todayKey.slice(0, 7));
  if (dailyDue) {
    const ok = await guard('تحلیل روزانه', async () => { await sendBlocks(await dailyIntro(now)); await sendOutlooks(state, 'day', now); return true; });
    if (ok && run) state.lastDaily = todayKey;
  }
  if (weeklyDue) {
    const ok = await guard('تحلیل هفتگی', async () => { await sendOutlooks(state, 'week', now); resolveOutlooks(state, prices, now); await sendBlocks(statsBlocks(state).concat(extendedStatsBlocks(state))); return true; });
    if (ok && run) state.lastWeekly = todayKey;
  }
  if (monthlyDue) {
    const ok = await guard('تحلیل ماهانه', async () => { await sendOutlooks(state, 'month', now); return true; });
    if (ok && run) state.lastMonthly = todayKey.slice(0, 7);
  }

  saveState(state);
}

main().catch((e) => { console.error(e && e.message ? e.message : e); process.exitCode = 1; });
