'use strict';
/*
  ناظر بازار: هر بار اجرا می‌شه، ارزهای لیست رو تحلیل می‌کنه و اگه سیگنال جدیدی پیدا شد توی تلگرام خبر می‌ده.
  اجرا:  node notifier.js [run | test | setup]
  توکن و شناسه چت از Secrets گیت‌هاب خونده می‌شن (TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID).
*/

// ====================== تنظیمات (اینجا رو می‌تونی عوض کنی) ======================
const CONFIG = {
  coins: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'],  // ارزها (جفت با USDT)
  style: 'swing',          // 'swing' = نوسانی (۱ ساعت، ۴ ساعت، روزانه)  |  'short' = کوتاه‌مدت (۱۵ دقیقه، ۱ ساعت، ۴ ساعت)
  minStrength: 'weak',     // کمترین قدرت سیگنال برای اعلان: 'weak' | 'medium' | 'strong'
  alertShorts: true,       // سیگنال فروش (شورت) هم خبر بده؟ توی اسپات فقط یعنی «نخر»
  cooldownHours: 12,       // بعد از یه اعلان برای یه ارز، تا این مدت اعلان تازه برای همون ارز نفرسته
  capital: 1000,           // سرمایه (USDT) برای حساب حجم پیشنهادی
  riskPct: 1,              // درصد ریسک هر معامله
  hourlyReport: true,      // هر ساعت یه گزارش کوتاه از وضعیت همه‌ی ارزها بفرسته (برای تمرین). false = فقط سیگنال تازه
  heartbeatHours: 24,      // هر چند ساعت یه پیام «ربات زنده است» بفرسته (۰ = خاموش)
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

  var TF_LABEL = { '15m': '۱۵ دقیقه', '1h': '۱ ساعت', '4h': '۴ ساعت', '1d': 'روزانه' };

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
  function analyze(input) {
    var price = input.price, series = input.series, execTf = input.execTf;
    var tfs = [], i, k;
    var inds = {};
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

  var api = {
    ema: ema, rsi: rsi, macd: macd, atr: atr, bollinger: bollinger, computeIndicators: computeIndicators,
    scoreAt: scoreAt, scoreLabel: scoreLabel, findLevels: findLevels, buildScenario: buildScenario,
    analyze: analyze, positionSize: positionSize, backtest: backtest, fmtPrice: fmtPrice, TF_LABEL: TF_LABEL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TA = api;
})(typeof self !== 'undefined' ? self : this);

  }).call(globalThis);
  return module.exports;
})();

const DIR = process.env.WATCHER_DIR || __dirname;
const STATE_FILE = path.join(DIR, 'state.json');
const MODE = (process.argv[2] || process.env.MODE || 'run').trim();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

const STYLES = {
  short: { label: 'کوتاه‌مدت', exec: '1h', tfs: [['15m', 1], ['1h', 2], ['4h', 3]] },
  swing: { label: 'نوسانی', exec: '4h', tfs: [['1h', 1], ['4h', 2], ['1d', 3]] }
};
const STRENGTH_RANK = { weak: 1, medium: 2, strong: 3 };
const STRENGTH_FA = { weak: 'ضعیف', medium: 'متوسط', strong: 'قوی' };
const SYM_RE = /^[A-Z0-9]{2,10}$/;

// ---------- data sources ----------
async function getJSON(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 10000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const TFMS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
const binanceRows = (rows) => rows.map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));

const SOURCES = {
  okx: async (b, tf, n) => {
    const bar = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc' }[tf];
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
    const iv = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D' }[tf];
    const j = await getJSON('https://api.bybit.com/v5/market/kline?category=spot&symbol=' + b + 'USDT&interval=' + iv + '&limit=' + Math.min(n, 1000));
    if (j.retCode !== 0) throw new Error(j.retMsg || 'bybit');
    return j.result.list.map((r) => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  },
  gate: async (b, tf, n) => {
    const j = await getJSON('https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=' + b + '_USDT&interval=' + tf + '&limit=' + Math.min(n, 1000));
    if (!Array.isArray(j)) throw new Error('gate');
    return j.map((r) => ({ t: +r[0] * 1000, o: +r[5], h: +r[3], l: +r[4], c: +r[2], v: +r[6] }));
  },
  kucoin: async (b, tf, n) => {
    const type = { '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day' }[tf];
    const end = Math.floor(Date.now() / 1000), start = end - Math.min(n, 1500) * TFMS[tf] / 1000;
    const j = await getJSON('https://api.kucoin.com/api/v1/market/candles?type=' + type + '&symbol=' + b + '-USDT&startAt=' + start + '&endAt=' + end);
    if (j.code !== '200000') throw new Error(j.msg || 'kucoin');
    return j.data.map((r) => ({ t: +r[0] * 1000, o: +r[1], c: +r[2], h: +r[3], l: +r[4], v: +r[5] }));
  },
  mexc: async (b, tf, n) => {
    const iv = { '15m': '15m', '1h': '60m', '4h': '4h', '1d': '1d' }[tf];
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
async function candles(sym, tf, n) {
  const ids = CONFIG.sources.filter((id) => SOURCES[id]);
  if (preferred) ids.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0));
  let lastErr = new Error('no source');
  for (const id of ids) {
    try {
      const a = normalize(await SOURCES[id](sym, tf, n));
      if (a.length >= Math.min(n, 60) && sane(a)) { preferred = id; return a.slice(-n); }
      lastErr = new Error(id + ': bad data');
    } catch (e) { lastErr = new Error(id + ': ' + (e && e.message ? e.message : 'error')); }
  }
  throw lastErr;
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
  return res;
}
async function analyzeAll() {
  return Promise.all(CONFIG.coins.map((sym) => analyzeCoin(sym).then((res) => ({ sym, res }), (err) => ({ sym, err }))));
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

const pct = (entry, p) => ((p - entry) >= 0 ? '+' : '−') + Math.abs((p - entry) / entry * 100).toFixed(2) + '%';
const fp = (x) => TA.fmtPrice(x);

function signalMessage(sym, r) {
  const sc = r.scenario, long = r.decision === 'long';
  const L = [];
  L.push((long ? '🟢 ' : '🔴 ') + sym + ' · ' + (long ? 'سیگنال خرید (لانگ)' : 'سیگنال فروش (شورت)') + ' · قدرت: ' + STRENGTH_FA[r.strength]);
  L.push('قیمت الان: ' + fp(r.price) + ' | امتیاز کل: ' + (r.composite >= 0 ? '+' : '') + r.composite + ' | سبک: ' + STYLES[CONFIG.style].label);
  L.push('');
  L.push(sc.mode === 'now' ? 'ورود: در قیمت فعلی' : 'ورود: صبر کن تا قیمت به ناحیه ورود برگرده');
  L.push('ناحیه ورود: ' + fp(sc.zoneLo) + ' تا ' + fp(sc.zoneHi));
  L.push('حد ضرر: ' + fp(sc.stop) + ' (' + pct(sc.entry, sc.stop) + ')');
  L.push('هدف اول: ' + fp(sc.tp1) + ' (' + pct(sc.entry, sc.tp1) + ' | 1:' + sc.rr1.toFixed(1) + ')');
  L.push('هدف دوم: ' + fp(sc.tp2) + ' (' + pct(sc.entry, sc.tp2) + ' | 1:' + sc.rr2.toFixed(1) + ')');
  const ps = TA.positionSize(CONFIG.capital, CONFIG.riskPct, sc.entry, sc.stop);
  if (ps) {
    const q = ps.units >= 100 ? ps.units.toFixed(1) : ps.units >= 1 ? ps.units.toFixed(3) : ps.units.toPrecision(3);
    L.push('حجم پیشنهادی (سرمایه ' + CONFIG.capital + ' و ریسک ' + CONFIG.riskPct + '٪): ' + q + ' ' + sym + ' ≈ ' + ps.notional.toFixed(0) + ' USDT' + (ps.leverage > 1 ? ' (اهرم ' + ps.leverage.toFixed(1) + 'x لازمه)' : ''));
  }
  if (r.warnings.length) { L.push(''); r.warnings.slice(0, 3).forEach((w) => L.push('⚠️ ' + w)); }
  L.push('');
  if (!long) L.push('فروش (شورت) فقط توی فیوچرز ممکنه. توی اسپات یعنی نخر یا اگه داری مراقب باش.');
  L.push('این فقط یه سیگنال است، نه توصیه. قبل از ورود قیمت رو توی صرافی چک کن و حد ضرر رو حتماً بذار.');
  return L.join('\n');
}

// ---------- state ----------
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (s && typeof s === 'object') { s.coins = s.coins || {}; return s; } } catch (e) {}
  return { coins: {} };
}
function saveState(s) {
  const text = JSON.stringify(s, null, 2) + '\n';
  let old = '';
  try { old = fs.readFileSync(STATE_FILE, 'utf8'); } catch (e) {}
  if (old !== text) fs.writeFileSync(STATE_FILE, text);
}
const hoursSince = (iso, now) => (iso ? (now - Date.parse(iso)) / 36e5 : Infinity);

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
  const now = Date.now();
  const results = await analyzeAll();
  const good = results.filter((r) => r.res);
  const failed = results.filter((r) => r.err);
  failed.forEach((r) => console.log('خطا برای ' + r.sym + ': ' + r.err.message));

  if (!good.length) {
    console.error('هیچ ارزی تحلیل نشد.');
    if (hoursSince(state.lastError, now) >= 12) {
      try { await send('⚠️ ربات نتونست داده‌ی هیچ ارزی رو بگیره. شاید صرافی‌ها IP گیت‌هاب رو بستن. دلیل: ' + failed[0].err.message); state.lastError = new Date(now).toISOString(); saveState(state); } catch (e) { console.error(e.message); }
    }
    process.exitCode = 1; return;
  }

  if (MODE === 'test') {
    const lines = ['✅ تست ربات (' + STYLES[CONFIG.style].label + ')'];
    for (const r of good) {
      const x = r.res;
      lines.push(r.sym + ': ' + (x.decision === 'long' ? 'خرید' : x.decision === 'short' ? 'فروش' : 'صبر') + (x.strength ? ' (' + STRENGTH_FA[x.strength] + ')' : '') + ' | امتیاز ' + (x.composite >= 0 ? '+' : '') + x.composite + ' | قیمت ' + fp(x.price));
    }
    failed.forEach((r) => lines.push(r.sym + ': داده گرفته نشد'));
    lines.push('\nاگه این پیام رو می‌بینی، همه‌چیز وصله. از این به بعد فقط وقتی سیگنال جدید باشه پیام می‌گیری.');
    await send(lines.join('\n'));
    console.log('پیام تست فرستاده شد.');
    return;
  }

  let sent = 0;
  for (const { sym, res } of good) {
    const d = res.decision;
    let s = state.coins[sym];
    if (!s) { // اولین بار: فقط وضعیت فعلی رو ثبت می‌کنیم تا سیگنال‌های قدیمی اعلان نشن
      state.coins[sym] = { decision: d, lastAlertedDecision: d === 'wait' ? null : d, lastAlert: null };
      continue;
    }
    s.decision = d;
    if (d === 'wait') { s.lastAlertedDecision = null; continue; }
    const strongEnough = STRENGTH_RANK[res.strength] >= STRENGTH_RANK[CONFIG.minStrength];
    const dirOk = d === 'long' || CONFIG.alertShorts;
    if (strongEnough && dirOk && s.lastAlertedDecision !== d && hoursSince(s.lastAlert, now) >= CONFIG.cooldownHours) {
      await send(signalMessage(sym, res));
      s.lastAlertedDecision = d; s.lastAlert = new Date(now).toISOString(); sent++;
    }
  }

  let reported = false;
  if (CONFIG.hourlyReport) {
    const R = ['🕐 گزارش ساعتی (' + STYLES[CONFIG.style].label + ')'];
    for (const { sym, res: x } of good) {
      const fa = x.decision === 'long' ? '🟢 خرید' : x.decision === 'short' ? '🔴 فروش' : '⚪ صبر';
      let line = sym + ': ' + fa + (x.decision !== 'wait' && x.strength ? ' (' + STRENGTH_FA[x.strength] + ')' : '') + ' | امتیاز ' + (x.composite >= 0 ? '+' : '') + x.composite + ' | قیمت ' + fp(x.price);
      if (x.decision !== 'wait' && x.scenario) {
        const c = x.scenario;
        line += '\n   ورود ' + fp(c.zoneLo) + ' تا ' + fp(c.zoneHi) + ' | ضرر ' + fp(c.stop) + ' | هدف۱ ' + fp(c.tp1);
      }
      R.push(line);
    }
    failed.forEach((r) => R.push(r.sym + ': داده گرفته نشد'));
    R.push('\nاین گزارش برای تمرینه و توصیه نیست.');
    await send(R.join('\n'));
    reported = true;
  }
  if (!reported && CONFIG.heartbeatHours > 0 && hoursSince(state.lastHeartbeat, now) >= CONFIG.heartbeatHours) {
    const sig = good.filter((r) => r.res.decision !== 'wait').map((r) => r.sym + (r.res.decision === 'long' ? ' (خرید)' : ' (فروش)'));
    await send('ربات فعاله ✓ ' + good.length + ' ارز بررسی شد' + (failed.length ? '، ' + failed.length + ' مورد بدون داده' : '') + '.\n' +
      (sig.length ? 'سناریوهای ورودِ الان: ' + sig.join('، ') : 'الان سناریوی ورودی نیست.'));
    state.lastHeartbeat = new Date(now).toISOString();
  }
  saveState(state);
  console.log('تمام شد. ' + good.length + ' ارز تحلیل شد، ' + sent + ' اعلان فرستاده شد.');
}

main().catch((e) => { console.error(e && e.message ? e.message : e); process.exitCode = 1; });
