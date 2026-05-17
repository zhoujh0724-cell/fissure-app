/* 裂隙速判 - Canvas 渲染 */
'use strict';

// ── 坐标变换 ──
function calcTransform(state, canvas) {
  if (!state.image) return;
  var cw = canvas.width, ch = canvas.height;
  var sx = (cw - 60) / state.imgW, sy = (ch - 60) / state.imgH;
  state.displayScale = Math.min(sx, sy, 2);
  state.offsetX = (cw - state.imgW * state.displayScale) / 2 + state.panX;
  state.offsetY = (ch - state.imgH * state.displayScale) / 2 + state.panY;
}

function imgToScreen(state, ix, iy) {
  return [state.offsetX + ix * state.displayScale, state.offsetY + iy * state.displayScale];
}

function screenToImg(state, sx, sy) {
  return [(sx - state.offsetX) / state.displayScale, (sy - state.offsetY) / state.displayScale];
}

// ── 背景 ──
function drawBackground(ctx, w, h) {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);
}

// ── 占位画面 ──
function drawPlaceholder(ctx, w, h) {
  var cx = w / 2, cy = h / 2;
  ctx.fillStyle = 'rgba(30,58,95,0.15)';
  ctx.beginPath();
  ctx.roundRect(cx - 130, cy - 95, 260, 190, 20);
  ctx.fill();
  ctx.font = '40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(88,166,255,0.3)';
  ctx.fillText('🏔️', cx, cy - 25);
  ctx.font = 'bold 16px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#8b949e';
  ctx.fillText('裂隙速判', cx, cy + 25);
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(88,166,255,0.5)';
  ctx.fillText('点击下方「拍照」加载照片', cx, cy + 60);
}

// ── 主图像 ──
function drawImage(ctx, state) {
  calcTransform(state, canvas);
  var iw = state.imgW * state.displayScale, ih = state.imgH * state.displayScale;
  // 边框
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(state.offsetX - 3, state.offsetY - 3, iw + 6, ih + 6, 10);
  ctx.strokeStyle = '#304357';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 裁剪 + 绘制
  ctx.beginPath();
  ctx.roundRect(state.offsetX, state.offsetY, iw, ih, 8);
  ctx.clip();
  ctx.drawImage(state.image, state.offsetX, state.offsetY, iw, ih);
  ctx.restore();
}

// ── 角点 ──
function drawCorners(ctx, state) {
  if (!state.corners.length) return;
  var labels = ['①','②','③','④'];
  for (var i = 0; i < state.corners.length; i++) {
    var sc = imgToScreen(state, state.corners[i][0], state.corners[i][1]);
    // 外圈
    ctx.beginPath();
    ctx.arc(sc[0], sc[1], 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(88,166,255,0.2)';
    ctx.fill();
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 内点
    ctx.beginPath();
    ctx.arc(sc[0], sc[1], 5, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    // 标签
    if (i < 4) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f0f6fc';
      ctx.fillText(labels[i], sc[0] + 14, sc[1] + 4);
    }
  }
  // 四边形虚线
  if (state.corners.length === 4) {
    ctx.strokeStyle = 'rgba(88,166,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var p = imgToScreen(state, state.corners[i][0], state.corners[i][1]);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── 剖面线 ──
function drawProfile(ctx, state) {
  if (!state.profilePts.length) return;
  var pts = state.profilePts.map(function(p) {
    return imgToScreen(state, p[0], p[1]);
  });
  if (pts.length >= 2) {
    // Glow
    ctx.strokeStyle = 'rgba(248,81,73,0.15)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    // Main line
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // Points
  for (var i = 0; i < pts.length; i++) {
    var isFirst = i === 0, isLast = i === pts.length - 1;
    var size = (isFirst || isLast) ? 7 : 4;
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], size, 0, Math.PI * 2);
    ctx.fillStyle = isFirst ? '#3fb950' : (isLast ? '#f85149' : 'rgba(255,255,255,0.7)');
    ctx.fill();
    if (isFirst || isLast) {
      ctx.strokeStyle = isFirst ? 'rgba(63,185,80,0.4)' : 'rgba(248,81,73,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

// ── 模式标签 ──
function updateBadge(state) {
  var el = document.getElementById('modeBadge');
  if (state.mode === 'corner') {
    el.style.display = 'block';
    el.style.borderColor = '#58a6ff';
    el.innerHTML = '📐 角度校正 (' + state.corners.length + '/4)';
  } else if (state.mode === 'profile') {
    el.style.display = 'block';
    el.style.borderColor = '#f85149';
    el.innerHTML = '✏️ 绘制剖面 (' + state.profilePts.length + '点)';
  } else {
    el.style.display = 'none';
  }
}

// ── 图表绘制 ──
function drawChart(id, xData, yData, color) {
  var c = document.getElementById(id);
  if (!c) return;
  var wrap = c.parentElement;
  c.width = wrap.clientWidth || 400;
  c.height = wrap.clientHeight || 120;
  var cx = c.getContext('2d');
  var w = c.width, h = c.height;
  cx.clearRect(0, 0, w, h);
  cx.fillStyle = '#0d1117';
  cx.fillRect(0, 0, w, h);
  if (!xData || !yData || xData.length < 2) return;
  var m = 8, pt = 22, ph = h - pt - m, pw = w - 2 * m;
  if (pw < 10 || ph < 10) return;
  var xMin = xData[0], xMax = xData[xData.length - 1];
  if (xMax - xMin < 1e-10) return;
  var yMean = 0, n = yData.length;
  for (var i = 0; i < n; i++) yMean += yData[i];
  yMean /= n;
  var yStd = 0;
  for (var i = 0; i < n; i++) yStd += (yData[i] - yMean) * (yData[i] - yMean);
  yStd = Math.sqrt(yStd / n) || 1;
  var pts = [];
  for (var i = 0; i < n; i++) {
    var xn = (xData[i] - xMin) / (xMax - xMin);
    var yn = Math.max(-3, Math.min(3, (yData[i] - yMean) / yStd)) / 3 * 0.85;
    pts.push([m + xn * pw, pt + ph / 2 - yn * ph / 2]);
  }
  // Fill
  cx.beginPath();
  cx.moveTo(pts[0][0], pt + ph / 2);
  for (var i = 0; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
  cx.lineTo(pts[pts.length - 1][0], pt + ph / 2);
  cx.closePath();
  var hex = color.replace('#', '');
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  cx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
  cx.fill();
  // Line
  cx.beginPath();
  cx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
  cx.strokeStyle = color;
  cx.lineWidth = 1.5;
  cx.stroke();
  // Zero line
  cx.strokeStyle = 'rgba(48,67,87,0.5)';
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(m, pt + ph / 2);
  cx.lineTo(m + pw, pt + ph / 2);
  cx.stroke();
}
