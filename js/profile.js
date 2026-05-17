/* 裂隙速判 - Barton标准剖面库、粗糙度计算与等级判定 */
'use strict';

// ── 多项式拟合 ──
function polyFit(x, y, deg) {
  var n = x.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (var i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i];
  }
  var denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-15) return [0, sy / n];
  var a = (n * sxy - sx * sy) / denom;
  var b = (sy - a * sx) / n;
  return [a, b];
}

function stdDev(arr) {
  var m = 0, n = arr.length;
  for (var i = 0; i < n; i++) m += arr[i];
  m /= n;
  var v = 0;
  for (var i = 0; i < n; i++) v += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(v / n);
}

// ── Barton 标准剖面生成 ──
function genProfile(jrcCenter, ampScale, length) {
  length = length || 200;
  var x = new Float64Array(length);
  var y = new Float64Array(length);
  for (var i = 0; i < length; i++) x[i] = i / (length - 1);
  var A = (jrcCenter / 20) * 0.08 * (ampScale || 1);
  var freqs = [1, 2, 3, 5, 8];
  var amps  = [0.5, 0.8, 0.6, 0.3, 0.15];
  var phases = [0, 1.2, 2.8, 4.1, 0.7];
  for (var i = 0; i < length; i++) {
    var val = 0;
    for (var f = 0; f < freqs.length; f++)
      val += A * amps[f] * Math.sin(2 * Math.PI * freqs[f] * x[i] + phases[f]);
    y[i] = val;
  }
  var rand = A * 0.15;
  for (var i = 0; i < length; i++) y[i] += rand * (Math.random() * 2 - 1);
  var coeffs = polyFit(x, y, 1);
  for (var i = 0; i < length; i++) y[i] -= coeffs[0] * x[i] + coeffs[1];
  var std = stdDev(y);
  var scale = (std > 1e-10) ? A * 2.5 / std : 1;
  for (var i = 0; i < length; i++) y[i] *= scale;
  return { x: x, y: y };
}

// ── Z₂ 计算 ──
function computeZ2(x, y) {
  var sum = 0, n = x.length - 1;
  for (var i = 0; i < n; i++) {
    var dx = x[i + 1] - x[i];
    var dy = y[i + 1] - y[i];
    if (dx !== 0) sum += (dy / dx) * (dy / dx);
  }
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

// ── 10条标准剖面（惰性生成） ──
var BARTON_PROFILES = null;
function getBartonProfiles() {
  if (BARTON_PROFILES) return BARTON_PROFILES;
  BARTON_PROFILES = {};
  var ranges = [[0,2],[2,4],[4,6],[6,8],[8,10],[10,12],[12,14],[14,16],[16,18],[18,20]];
  for (var r = 0; r < ranges.length; r++) {
    var lo = ranges[r][0], hi = ranges[r][1];
    var c = (lo + hi) / 2;
    var amp = 0.5 + c / 20 * 0.5;
    var p = genProfile(c, amp, 200);
    var z2 = computeZ2(p.x, p.y);
    BARTON_PROFILES[lo + '-' + hi] = {
      x: p.x, y: p.y, jrcCenter: c, jrcRange: [lo, hi], z2: z2
    };
  }
  return BARTON_PROFILES;
}

// ── 六级粗糙度标准 ──
var ROUGHNESS_GRADES = [
  {level:'I',   name:'极粗糙', jrcRange:[16,20], z2Range:[0.20,0.50], desc:'起伏强烈，表面极不规则，具大角度起伏，齿状凸起明显。结构面抗剪强度极高，在低法向应力下表现为剪胀破坏。'},
  {level:'II',  name:'粗糙',   jrcRange:[12,16], z2Range:[0.14,0.20], desc:'起伏显著，表面粗糙，具明显起伏角和凸起体。结构面抗剪强度较高，剪切过程中凸起体被剪断或爬坡。'},
  {level:'III', name:'较粗糙', jrcRange:[8,12],  z2Range:[0.09,0.14], desc:'中等起伏，表面不规则程度中等，具一定起伏角。结构面抗剪强度中等，剪切破坏以爬坡和凸起剪断联合作用。'},
  {level:'IV',  name:'较光滑', jrcRange:[4,8],   z2Range:[0.05,0.09], desc:'微起伏，表面较平整，起伏角较小。结构面抗剪强度较低，剪切以滑动摩擦为主。'},
  {level:'V',   name:'光滑',   jrcRange:[2,4],   z2Range:[0.03,0.05], desc:'近于平整，表面光滑，无明显起伏。结构面抗剪强度低，摩擦角接近平直光滑面摩擦角。'},
  {level:'VI',  name:'极光滑', jrcRange:[0,2],   z2Range:[0.0,0.03],  desc:'平整如镜，表面极光滑，如擦痕面、镜面。结构面抗剪强度极低，接近残余摩擦角。'}
];

// ── JRC 估算与分级 ──
function classifyByJRC(jrc) {
  for (var i = 0; i < ROUGHNESS_GRADES.length; i++) {
    var g = ROUGHNESS_GRADES[i];
    if (jrc >= g.jrcRange[0] && jrc < g.jrcRange[1]) return g;
  }
  return ROUGHNESS_GRADES[ROUGHNESS_GRADES.length - 1];
}

function estimateJRCFromZ2(z2) {
  z2 = Math.max(z2, 1e-10);
  return Math.max(0, Math.min(20, 32.2 + 32.47 * Math.log10(z2)));
}

// ── 最佳匹配 ──
function interpolate(xq, x, y) {
  var result = [];
  for (var i = 0; i < xq.length; i++) {
    var xi = xq[i];
    if (xi <= x[0]) { result.push(y[0]); continue; }
    if (xi >= x[x.length - 1]) { result.push(y[y.length - 1]); continue; }
    var lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (x[m] > xi) hi = m; else lo = m; }
    var t = (xi - x[lo]) / (x[hi] - x[lo]);
    result.push(y[lo] + t * (y[hi] - y[lo]));
  }
  return result;
}

function correlation(a, b) {
  var n = a.length, ma = 0, mb = 0;
  for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  var num = 0, da = 0, db = 0;
  for (var i = 0; i < n; i++) {
    var daa = a[i] - ma, dbb = b[i] - mb;
    num += daa * dbb; da += daa * daa; db += dbb * dbb;
  }
  if (da < 1e-15 || db < 1e-15) return 0;
  return num / Math.sqrt(da * db);
}

function findBestMatchZ2(profileY) {
  var profiles = getBartonProfiles();
  var x = [];
  for (var i = 0; i < profileY.length; i++) x.push(i / (profileY.length - 1));
  var z2 = computeZ2(x, profileY);
  var bestKey = null, bestDiff = Infinity;
  for (var key in profiles) {
    var diff = Math.abs(z2 - profiles[key].z2);
    if (diff < bestDiff) { bestDiff = diff; bestKey = key; }
  }
  return { key: bestKey, data: profiles[bestKey], z2: z2 };
}

function findBestMatchCorr(profileY) {
  var profiles = getBartonProfiles();
  var bestKey = null, bestCorr = -Infinity;
  var xRef = [];
  for (var i = 0; i < profileY.length; i++) xRef.push(i / (profileY.length - 1));
  for (var key in profiles) {
    var d = profiles[key];
    var yStd = interpolate(xRef, d.x, d.y);
    var c = correlation(profileY, yStd);
    if (c > bestCorr) { bestCorr = c; bestKey = key; }
  }
  return { key: bestKey, data: profiles[bestKey], corr: bestCorr };
}

// ── 颜色映射 ──
function gradeColor(level) {
  var map = { 'I':'#f85149','II':'#f0883e','III':'#d29922','IV':'#3fb950','V':'#58a6ff','VI':'#bc8cff' };
  return map[level] || '#58a6ff';
}
function gradeBg(level) {
  var map = { 'I':'#3b1d1e,#4a2528','II':'#3b2a1a,#4a3520','III':'#2b2d1a,#3a3d22','IV':'#1a2e1e,#223d28','V':'#1a2438,#22304a','VI':'#221a38,#2e224a' };
  return map[level] || '#1a2438';
}
