# 裂隙速判

> 岩体结构面粗糙度快速鉴别系统 — 基于 Barton JRC 标准剖面

## 功能

- 📷 拍照/上传岩体裂隙照片
- 📐 透视角度自动校正
- ✏️ 沿裂隙迹线绘制剖面
- 🔬 自动计算 JRC 粗糙度系数 + Z₂ 统计参数
- 📊 与 Barton 10 条标准剖面对比匹配
- 📋 六级粗糙度等级判定（I ~ VI）

## 技术栈

- 纯前端 (HTML + CSS + JS)，无需后端
- PWA 离线可用
- WebView APK 打包为 Android 原生应用

## 在线使用

1. 浏览器打开部署地址
2. 点击「拍照」加载裂隙照片
3. 按顺序点击 4 个角点 → 校正
4. 沿裂隙迹线绘制剖面
5. 查看分析报告

## APK 构建

推送代码到 GitHub 后，Actions 自动编译 APK：

```
git push origin main
```

在仓库的 **Actions** 标签页查看构建进度，下载 APK 产物。

## 项目结构

```
├── index.html          # 主页面
├── manifest.json       # PWA 清单
├── sw.js              # Service Worker (离线缓存)
├── css/
│   └── app.css        # 暗色主题样式
├── js/
│   ├── app.js         # 主逻辑 & 状态管理
│   ├── image.js       # 图像处理 (透视校正/剖面提取)
│   ├── profile.js     # Barton 剖面库 & 粗糙度计算
│   └── render.js      # Canvas 渲染器
├── icons/             # PWA 图标
├── android/           # Android 原生包装
└── .github/workflows/ # CI/CD 自动构建
```
