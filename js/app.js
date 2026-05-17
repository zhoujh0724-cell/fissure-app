/* 裂隙速判 - 主应用逻辑 */
'use strict';

// ── 全局状态 ──
var state = {
  step: 0, mode: 'view',
  image: null, imgW: 0, imgH: 0,
  displayScale: 1, offsetX: 0, offsetY: 0,
  panX: 0, panY: 0,
  corners: [], profilePts: [],
  dragStart: null, pinchDist: 0,
  result: null
};

var canvas = document.getElementById('mainCanvas');
var ctx = canvas.getContext('2d');
var wrap = document.getElementById('canvasWrap');

// ── DOM 引用 ──
var $ = function(id) { return document.getElementById(id); };

// ── 工具函数 ──
function enableBtn(id, enabled) { $(id).disabled = !enabled; }
function toast(msg) {
  var el = $('toast');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(function() { el.style.display = 'none'; }, 2000);
}

// ── 渲染入口 ──
function resize() {
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  render();
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(ctx, canvas.width, canvas.height);
  if (state.image) drawImage(ctx, state);
  else drawPlaceholder(ctx, canvas.width, canvas.height);
  drawCorners(ctx, state);
  drawProfile(ctx, state);
  updateBadge(state);
}

// ── 4步流程控制 ──
function updateStep() {
  var steps = document.querySelectorAll('.step');
  for (var i = 0; i < steps.length; i++) {
    steps[i].classList.remove('active', 'done');
    if (i < state.step) steps[i].classList.add('done');
    else if (i === state.step) steps[i].classList.add('active');
  }
}
function updateButtons() {
  var hasImg = state.image !== null;
  enableBtn('btnCorrect', hasImg);
  enableBtn('btnReset', hasImg);
  enableBtn('btnProfile', hasImg && state.corners.length === 0);
  enableBtn('btnDone', state.mode === 'profile');
}

// ── 图片加载 ──
$('fileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (file) { loadFile(file); this.value = ''; }
});
$('btnLoad').addEventListener('click', function() { $('fileInput').click(); });

function loadFile(file) {
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() { loadImage(img); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function loadImage(img) {
  var maxDim = 1600;
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  if (w > maxDim || h > maxDim) {
    var scale = Math.min(maxDim / w, maxDim / h);
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    state.image = c;
  } else {
    state.image = img;
  }
  state.imgW = state.image.width; state.imgH = state.image.height;
  state.panX = 0; state.panY = 0;
  state.corners = []; state.profilePts = [];
  state.mode = 'view'; state.step = 1; state.result = null;
  updateStep(); updateButtons(); resize();
  toast('已加载: ' + state.imgW + '×' + state.imgH);
}

// ── 触摸/鼠标 ──
function getCanvasPos(e) {
  var rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener('mousedown', function(e) {
  if (state.mode === 'view') {
    state.dragStart = getCanvasPos(e);
  } else {
    handleTap(getCanvasPos(e));
  }
  e.preventDefault();
});
canvas.addEventListener('mousemove', function(e) {
  if (state.dragStart && state.mode === 'view') {
    var pos = getCanvasPos(e);
    state.panX += pos[0] - state.dragStart[0];
    state.panY += pos[1] - state.dragStart[1];
    state.dragStart = pos;
    render();
  }
});
canvas.addEventListener('mouseup', function() { state.dragStart = null; });
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  if (!state.image) return;
  state.displayScale *= (e.deltaY > 0 ? 0.9 : 1.1);
  state.displayScale = Math.max(0.2, Math.min(10, state.displayScale));
  render();
}, { passive: false });

// ── 触屏手势 ──
canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  var touches = e.touches;
  if (touches.length === 1) {
    if (state.mode !== 'view') {
      var rect = canvas.getBoundingClientRect();
      handleTap([touches[0].clientX - rect.left, touches[0].clientY - rect.top]);
    } else {
      state.dragStart = [touches[0].clientX, touches[0].clientY];
    }
  } else if (touches.length === 2) {
    state.dragStart = null;
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    state.pinchDist = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  var touches = e.touches;
  if (touches.length === 1 && state.dragStart && state.mode === 'view') {
    state.panX += touches[0].clientX - state.dragStart[0];
    state.panY += touches[0].clientY - state.dragStart[1];
    state.dragStart = [touches[0].clientX, touches[0].clientY];
    render();
  } else if (touches.length === 2 && state.pinchDist) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    state.displayScale *= dist / state.pinchDist;
    state.displayScale = Math.max(0.2, Math.min(10, state.displayScale));
    state.pinchDist = dist;
    render();
    if (state.mode === 'profile' && state.profilePts.length >= 2) {
      finishProfile();
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (e.touches.length === 0) { state.dragStart = null; state.pinchDist = 0; }
});

// ── 点击处理 ──
function handleTap(pos) {
  if (!state.image) return;
  var img = screenToImg(state, pos[0], pos[1]);
  var ix = Math.round(img[0]), iy = Math.round(img[1]);
  if (ix < 0 || iy < 0 || ix >= state.imgW || iy >= state.imgH) return;
  if (state.mode === 'corner' && state.corners.length < 4) {
    state.corners.push([ix, iy]);
    toast('角点 ' + state.corners.length + '/4');
    if (state.corners.length === 4) {
      toast('✓ 4个角点已选择，点击「应用」校正');
      enableBtn('btnApply', true);
    }
    render();
  } else if (state.mode === 'profile') {
    state.profilePts.push([ix, iy]);
    toast('采样点 ' + state.profilePts.length);
    render();
  }
}

function finishProfile() {
  if (state.profilePts.length >= 2) {
    state.mode = 'view';
    enableBtn('btnDone', false);
    enableBtn('btnAnalyze', true);
    toast('✓ 剖面绘制完成 (' + state.profilePts.length + '点)');
    updateButtons(); render();
  }
}

// ── 按钮事件 ──
$('btnCorrect').addEventListener('click', function() {
  if (!state.image) return;
  state.mode = 'corner'; state.corners = [];
  state.profilePts = [];
  enableBtn('btnApply', false);
  enableBtn('btnProfile', false);
  enableBtn('btnAnalyze', false);
  updateButtons(); render();
  toast('按顺序点击4个角点: 左上→右上→右下→左下');
});

$('btnApply').addEventListener('click', function() {
  if (state.corners.length !== 4) { toast('请先选择4个角点'); return; }
  toast('校正中...');
  setTimeout(function() {
    try { applyCorrection(); } catch(e) { toast('校正失败: ' + e.message); console.error(e); }
  }, 50);
});

function applyCorrection() {
  var tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = state.imgW; tmpCanvas.height = state.imgH;
  var tctx = tmpCanvas.getContext('2d');
  tctx.drawImage(state.image, 0, 0);
  var srcData = tctx.getImageData(0, 0, state.imgW, state.imgH);
  var srcPts = state.corners.map(function(p) { return [p[0], p[1]]; });
  var result = perspectiveCorrect(srcData, srcPts);
  if (!result) { toast('校正计算失败'); return; }
  state.image = result;
  state.imgW = result.width; state.imgH = result.height;
  state.corners = []; state.mode = 'view';
  state.panX = 0; state.panY = 0;
  enableBtn('btnApply', false); enableBtn('btnProfile', true);
  state.step = 2; updateStep(); updateButtons(); render();
  toast('✓ 校正完成');
}

$('btnProfile').addEventListener('click', function() {
  if (!state.image) return;
  state.mode = 'profile'; state.profilePts = [];
  enableBtn('btnDone', true); enableBtn('btnAnalyze', false);
  updateButtons(); render();
  toast('沿裂隙迹线点击加点，双指缩放完成绘制');
});

$('btnDone').addEventListener('click', finishProfile);

$('btnAnalyze').addEventListener('click', function() {
  if (state.profilePts.length < 2) { toast('请先绘制剖面线（至少2个点）'); return; }
  toast('分析中...');
  setTimeout(runAnalysis, 80);
});

function runAnalysis() {
  try {
    var profile = extractProfile(state.image, state.profilePts, 500);
    if (!profile) { toast('剖面提取失败'); return; }
    var params = computeRoughnessParams(profile.y, profile.x);
    var match = findBestMatchZ2(profile.y);
    var grade = classifyByJRC(params.jrc);
    state.result = {
      parameters: params, grade: grade,
      bestMatchKey: match.key,
      profileX: profile.x, profileY: profile.y
    };
    showResult();
    state.step = 3; updateStep();
    toast('✓ 完成: JRC=' + params.jrc.toFixed(2) + ' 等级' + grade.level);
  } catch(e) {
    toast('分析失败: ' + e.message);
    console.error(e);
  }
}

$('btnReset').addEventListener('click', function() {
  state.image = null; state.corners = []; state.profilePts = [];
  state.mode = 'view'; state.step = 0; state.result = null;
  state.panX = 0; state.panY = 0;
  $('resultPanel').classList.remove('show');
  updateStep(); updateButtons(); render();
});

// ── 结果显示 ──
function showResult() {
  var r = state.result, p = r.parameters, g = r.grade;
  var color = gradeColor(g.level);
  var grades = ROUGHNESS_GRADES;
  var matchProfile = getBartonProfiles()[r.bestMatchKey];

  var html = '';
  html += '<div class="panel-card" style="background:linear-gradient(135deg,' + gradeBg(g.level) + ');border-color:' + color + '">';
  html += '<h2>📋 岩体结构面粗糙度分析报告</h2>';
  html += '<div class="grade-display">';
  html += '<div class="level" style="color:' + color + '">' + g.level + '</div>';
  html += '<div class="name" style="color:' + color + '">' + g.name + '</div>';
  html += '<div class="desc">' + g.desc + '</div></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">';
  var params = [['JRC', p.jrc.toFixed(2), color], ['Z₂', p.z2.toFixed(4), '#79c0ff'], ['RP', p.rp.toFixed(4), '#d2a8ff'], ['匹配', 'JRC ' + r.bestMatchKey, '#7ee787']];
  for (var i = 0; i < params.length; i++) {
    html += '<div style="background:#161b22;border-radius:8px;border:1px solid #21262d;padding:8px 12px">';
    html += '<div style="font-size:10px;color:#8b949e">' + params[i][0] + '</div>';
    html += '<div style="font-size:16px;font-weight:700;color:' + params[i][2] + '">' + params[i][1] + '</div></div>';
  }
  html += '</div></div>';

  html += '<div class="panel-card"><h2>📊 剖面比对</h2>';
  html += '<div style="font-size:11px;color:#8b949e;margin-bottom:2px">标准剖面 JRC ' + r.bestMatchKey + '</div>';
  html += '<div class="graph-wrap"><canvas id="stdChart"></canvas></div>';
  html += '<div style="font-size:11px;color:#8b949e;margin:8px 0 2px">实测剖面 (Z₂=' + p.z2.toFixed(4) + ')</div>';
  html += '<div class="graph-wrap"><canvas id="extChart"></canvas></div></div>';

  html += '<div class="panel-card"><h2>📋 分级标准</h2><div class="grade-table">';
  for (var i = 0; i < grades.length; i++) {
    var gg = grades[i], isCur = gg.level === g.level, clr = gradeColor(gg.level);
    html += '<div class="grow' + (isCur ? ' current' : '') + '" style="' + (isCur ? 'border-color:' + clr + ';background:' + clr + '10' : '') + '">';
    html += '<span style="font-weight:700;color:' + clr + ';width:20px">' + gg.level + '</span>';
    html += '<span style="width:60px;' + (isCur ? 'font-weight:700;color:' + clr : '') + '">' + gg.name + '</span>';
    html += '<span style="flex:1;font-size:11px;color:#8b949e">JRC ' + gg.jrcRange.join('-') + '</span>';
    html += '<span style="font-size:11px;color:#8b949e">Z₂ ' + gg.z2Range[0].toFixed(2) + '-' + gg.z2Range[1].toFixed(2) + '</span>';
    if (isCur) html += '<span style="font-size:11px;color:' + clr + ';font-weight:700;margin-left:6px">◀</span>';
    html += '</div>';
  }
  html += '</div></div>';

  $('resultContent').innerHTML = html;
  $('resultPanel').classList.add('show');
  setTimeout(function() {
    drawChart('stdChart', matchProfile.x, matchProfile.y, '#7ee787');
    drawChart('extChart', r.profileX, r.profileY, '#58a6ff');
  }, 100);
}

function closeResult() { $('resultPanel').classList.remove('show'); }

// ── 初始化 ──
window.addEventListener('resize', resize);

// roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    var tl = Math.min(r.tl || 0, w/2, h/2), tr = Math.min(r.tr || 0, w/2, h/2);
    var br = Math.min(r.br || 0, w/2, h/2), bl = Math.min(r.bl || 0, w/2, h/2);
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
  };
}

resize();
updateButtons();
