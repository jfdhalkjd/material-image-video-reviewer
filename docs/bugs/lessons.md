# 视频播放不稳定排查记录

## 问题

飞书多维表格审核插件中，部分 MP4 可以直接播放，部分由后台生成的 MP4 在插件内失败；直接打开视频链接通常可以播放。

## 最终有效修复

- 播放源优先使用业务表的“素材链接”字段，不优先使用“素材原始链接”。
- 保留“素材原始链接”作为失败后的备用源。
- 移除封面和视频上的 `referrerPolicy="no-referrer"`，避免视频服务端因请求来源策略导致嵌入播放失败。
- 保留视频错误后的备用播放逻辑和打开原视频链接功能。

## 关键文件与版本

- 修改文件：`src/main.tsx`
- Git 提交：`6fb8c0d prefer direct material source for video playback`
- 已推送到 GitHub，V5 页面继续使用原链接：`https://jfdhalkjd.github.io/material-image-video-reviewer/v5/`

## 后续遇到同类问题的优先顺序

1. 先检查插件读取的字段是否确实是“素材链接”。
2. 检查是否错误优先使用了“素材原始链接”。
3. 检查 `referrerPolicy`、`crossOrigin` 和 iframe fallback 等嵌入策略。
4. 重新构建并推送 GitHub Pages，确认页面加载了新的 `dist/assets/index-*.js`。
5. 只有直接源和嵌入策略都确认无误后，才考虑增加代理服务；不要优先引入 Cloudflare Worker。

## 经验

Cloudflare Worker 方案在本次问题中没有必要，并且编辑器输入状态不稳定，造成了额外时间成本。以后应先修正插件字段映射和浏览器请求策略。
