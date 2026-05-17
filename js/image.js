/* 裂隙速判 - 图像处理：透视校正、剖面提取 */
'use strict';

// ── 距离 ──
function dist2(a, b) { return Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])); }

// ── 平滑 ──
function smooth(y, window) {
  window = Math.max(3, window);
  if (window % 2 === 0) window++;
  var half = Math.floor(window / 2);
  var n = y.length;
  if (n < window) return y.slice();
  // Symmetric reflection padding
  var padded = new Float64Array(n + 2 * half);
  for (var i = 0; i < half; i++) padded[i] = y[half - i];
  for (var i = 0; i < n; i++) padded[half + i] = y[i];
  for (var i = 0; i < half; i++) padded[n + half + i] = y[n - 2 - i];
  var result = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    var sum = 0;
    for (var j = 0; j < window; j++) sum += padded[i + j];
    result[i] = sum / window;
  }
  return result;
}

// ── 灰度转换 ──
function rgbToGray(data) {
  var len = data.length, out = new Float64Array(len / 4);
  for (var i = 0, j = 0; i < len; i += 4, j++)
    out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return out;
}

// ── 8×8 高斯消元（透视矩阵） ──
function gaussElim8(A, b) {
  var n = 8;
  for (var col = 0; col < n; col++) {
    var maxVal = Math.abs(A[col * n + col]), maxRow = col;
    for (var row = col + 1; row < n; row++) {
      var v = Math.abs(A[row * n + col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) {
      for (var i = col; i < n; i++) { var t = A[col * n + i]; A[col * n + i] = A[maxRow * n + i]; A[maxRow * n + i] = t; }
      var t = b[col]; b[col] = b[maxRow]; b[maxRow] = t;
    }
    var piv = A[col * n + col];
    if (Math.abs(piv) < 1e-15) return null;
    for (var row = col + 1; row < n; row++) {
      var f = A[row * n + col] / piv;
      for (var i = col; i < n; i++) A[row * n + i] -= f * A[col * n + i];
      b[row] -= f * b[col];
    }
  }
  var x = new Float64Array(n);
  for (var row = n - 1; row >= 0; row--) {
    var sum = b[row];
    for (var i = row + 1; i < n; i++) sum -= A[row * n + i] * x[i];
    if (Math.abs(A[row * n + row]) < 1e-15) return null;
    x[row] = sum / A[row * n + row];
  }
  return x;
}

function buildPerspectiveMatrix(src, dst) {
  var A = new Float64Array(64), b = new Float64Array(8);
  for (var i = 0; i < 4; i++) {
    var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
    A[2 * i * 8 + 0] = x; A[2 * i * 8 + 1] = y; A[2 * i * 8 + 2] = 1;
    A[2 * i * 8 + 6] = -x * u; A[2 * i * 8 + 7] = -y * u; b[2 * i] = u;
    A[(2 * i + 1) * 8 + 3] = x; A[(2 * i + 1) * 8 + 4] = y; A[(2 * i + 1) * 8 + 5] = 1;
    A[(2 * i + 1) * 8 + 6] = -x * v; A[(2 * i + 1) * 8 + 7] = -y * v; b[2 * i + 1] = v;
  }
  var h = gaussElim8(A, b);
  return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
}

function invert3x3(m) {
  var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  var det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < 1e-15) return null;
  det = 1 / det;
  return [(e*i-f*h)*det, (c*h-b*i)*det, (b*f-c*e)*det,
          (f*g-d*i)*det, (a*i-c*g)*det, (c*d-a*f)*det,
          (d*h-e*g)*det, (b*g-a*h)*det, (a*e-b*d)*det];
}

// ── 透视校正（双线性插值） ──
function perspectiveCorrect(srcImgData, srcPts, dstW, dstH) {
  if (srcPts.length !== 4) return null;
  dstW = dstW || Math.round(Math.max(dist2(srcPts[1], srcPts[0]), dist2(srcPts[2], srcPts[3])));
  dstH = dstH || Math.round(Math.max(dist2(srcPts[3], srcPts[0]), dist2(srcPts[2], srcPts[1])));
  dstW = Math.max(10, dstW); dstH = Math.max(10, dstH);
  var dst = [[0, 0], [dstW-1, 0], [dstW-1, dstH-1], [0, dstH-1]];
  var H = buildPerspectiveMatrix(srcPts, dst);
  if (!H) return null;
  var Hinv = invert3x3(H);
  if (!Hinv) return null;
  var offCanvas = document.createElement('canvas');
  offCanvas.width = dstW; offCanvas.height = dstH;
  var ctx = offCanvas.getContext('2d');
  var outData = ctx.createImageData(dstW, dstH);
  var spx = srcImgData.data, srcW = srcImgData.width, srcH = srcImgData.height;
  var stride = srcW * 4;
  for (var y = 0; y < dstH; y++) {
    for (var x = 0; x < dstW; x++) {
      var sx = Hinv[0]*x + Hinv[1]*y + Hinv[2];
      var sy = Hinv[3]*x + Hinv[4]*y + Hinv[5];
      var sz = Hinv[6]*x + Hinv[7]*y + Hinv[8];
      if (Math.abs(sz) < 1e-10) continue;
      sx /= sz; sy /= sz;
      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        var ix = Math.floor(sx), iy = Math.floor(sy);
        var fx = sx - ix, fy = sy - iy;
        var idx = (iy * srcW + ix) * 4;
        for (var c = 0; c < 4; c++) {
          var v = (1-fx)*(1-fy)*spx[idx+c] + fx*(1-fy)*spx[idx+4+c] + (1-fx)*fy*spx[idx+stride+c] + fx*fy*spx[idx+stride+4+c];
          outData.data[(y * dstW + x) * 4 + c] = Math.round(v);
        }
      }
      outData.data[(y * dstW + x) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(outData, 0, 0);
  return offCanvas;
}

// ── 剖面提取（FIXED: 不再每像素创建canvas） ──
function extractProfile(image, pts, numSamples) {
  numSamples = numSamples || 500;
  if (pts.length < 2) return null;

  // 计算总长度
  var totalLen = 0, segLens = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var d = dist2(pts[i], pts[i + 1]);
    totalLen += d;
    segLens.push(d);
  }
  if (totalLen < 1) return null;

  // 缓存图像像素数据（FIX: 只做一次 getImageData）
  var offCanvas = document.createElement('canvas');
  offCanvas.width = image.width; offCanvas.height = image.height;
  var ocx = offCanvas.getContext('2d');
  ocx.drawImage(image, 0, 0);
  var imgData = ocx.getImageData(0, 0, image.width, image.height);
  var pixels = imgData.data;

  // 沿剖面线采样
  var sampledX = [], sampledY = [], cumDist = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    var n = Math.max(2, Math.round(numSamples * segLens[i] / totalLen));
    for (var j = 0; j < n; j++) {
      var t = (j === n - 1 && i === pts.length - 2) ? 1 : j / n;
      var x = pts[i][0] + t * (pts[i + 1][0] - pts[i][0]);
      var y = pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
      var xi = Math.max(0, Math.min(image.width - 1, Math.round(x)));
      var yi = Math.max(0, Math.min(image.height - 1, Math.round(y)));
      var idx = (yi * image.width + xi) * 4;
      sampledX.push(cumDist + t * segLens[i]);
      sampledY.push(0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]);
    }
    cumDist += segLens[i];
  }

  // 归一化 X 轴
  var xLast = sampledX[sampledX.length - 1];
  if (Math.abs(xLast) < 1e-10) return null;  // FIX: NaN guard
  for (var i = 0; i < sampledX.length; i++) sampledX[i] /= xLast;

  // 平滑
  var winLen = Math.max(3, Math.floor(sampledY.length / 20));
  if (winLen % 2 === 0) winLen++;
  if (winLen >= 3 && winLen < sampledY.length)
    sampledY = smooth(sampledY, winLen);

  // Z-score 归一化
  var mean = 0;
  for (var i = 0; i < sampledY.length; i++) mean += sampledY[i];
  mean /= sampledY.length;
  for (var i = 0; i < sampledY.length; i++) sampledY[i] -= mean;
  var std = 0;
  for (var i = 0; i < sampledY.length; i++) std += sampledY[i] * sampledY[i];
  std = Math.sqrt(std / sampledY.length);
  if (std > 1e-10) for (var i = 0; i < sampledY.length; i++) sampledY[i] /= std;

  return { x: sampledX, y: sampledY };
}

// ── 计算粗糙度参数 ──
function computeRoughnessParams(profileY, profileX) {
  var z2 = computeZ2(profileX, profileY);
  var jrc = estimateJRCFromZ2(z2);
  var sf = 0, n = profileY.length;
  for (var i = 0; i < n - 1; i++) { var dy = profileY[i + 1] - profileY[i]; sf += dy * dy; }
  sf /= (n - 1);
  var rp = 0;
  for (var i = 0; i < n - 1; i++) {
    var dx = profileX[i + 1] - profileX[i];
    var dy = profileY[i + 1] - profileY[i];
    rp += Math.sqrt(dx * dx + dy * dy);
  }
  if (profileX[n - 1] - profileX[0] > 1e-10)
    rp /= (profileX[n - 1] - profileX[0]);
  else rp = 1;
  return { z2: z2, sf: sf, rp: rp, jrc: jrc };
}
