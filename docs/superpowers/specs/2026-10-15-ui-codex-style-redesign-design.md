# UI 背景色重构（Codex 风格）设计文档

日期：2026-10-15
状态：已确认（浅色 v3 定稿，深色采用 C 方案）

## 背景与目标

当前 `pi-studio-light` 主题为暖米色底（`#f7f1e6`）+ 卡片堆叠式侧栏，视觉偏旧。参考 Codex 桌面端的浅色设计，对整个 UI 的背景色体系与侧栏导航结构进行重构，目标是更干净、中性的冷灰视觉，并解决侧栏四段平铺（Machines / Projects / Workspaces / Sessions）层级割裂的问题。

确认的范围结论：

- **浅色为主力**：完整采用 Codex 风格新设计（冷灰底 + 悬浮白卡 + 树状侧栏）。
- **深色采用 C 方案**：只把背景族统一为冷灰，保留现有紫色强调色，不做悬浮卡片/阴影重构；结构变化（树状侧栏）深浅色共用。
- **classic 主题保留不动**，作为旧深色主题的回退。
- 输入区（composer）的模型选择与思考深度维持现状两个独立控件，附件按钮保留，本次不合并、不改布局。
- **原有功能尽量全部保留**：本次只重构视觉与导航呈现，不删功能。WORKSPACES / Sessions 等能力并入树状侧栏，机器下拉、状态点、右键菜单、Clean up 等现有交互均在树上找到对应承载。

## 设计稿

确认过的效果图（HTML，可直接浏览器打开查看交互态）：

- 浅色定稿：`~/tools/playwright/targets/pi-studio/mockup-codex-v4.html`（渲染图 `runs/mockup-v4.png`）
- 深色 C 方案：`~/tools/playwright/targets/pi-studio/mockup-dark-c.html`（渲染图 `runs/mockup-dark-c3.png`）

## 视觉设计

### 浅色（Codex 风格）

核心手法：应用底色为冷灰，主内容区为白色圆角卡片浮在灰底上，靠「灰底 vs 白卡 + 细边框 + 轻阴影」分层，而非边框堆叠。

| Token | 值 | 说明 |
| --- | --- | --- |
| `--pi-bg` | `#f4f5f6` | 应用底色（冷灰，替换暖米 `#f7f1e6`） |
| `--pi-surface` | `#ffffff` | 卡片/面板纯白 |
| `--pi-surface-hover` | `#eceef0` | 悬停 |
| 侧栏选中项 | `#e4e6e9` | 圆角选中态（无独立 token，可映射 `--pi-selection-bg`） |
| `--pi-border` | `#e2e4e8` | 细边框 |
| `--pi-border-muted` | `#eceef1` | 分隔线 |
| `--pi-text` | `#1f2328` | 主文字 |
| `--pi-text-secondary` | `#4b5158` | 次级文字 |
| `--pi-muted` | `#6e7681` | 弱提示 |
| `--pi-dim` | `#8b949e` | 最弱提示 |
| `--pi-accent` | `#10a37f` | 强调色（Codex/ChatGPT 绿，状态点等） |
| 阴影 | `0 1px 2px rgba(31,35,40,.06), 0 8px 24px rgba(31,35,40,.08)` | 卡片轻阴影 |
| 卡片圆角 | 12px；输入框 24px（胶囊） | |

其余 token（success/warning/danger/purple/overlay 等）按现有浅色语义做冷调化微调，保持对比度。

### 深色（C 方案）

仅统一背景族为冷灰，保留紫色强调色；不做悬浮卡片、不加阴影，层次仍靠边框分隔。

| Token | 值 | 说明 |
| --- | --- | --- |
| `--pi-bg` | `#16181c` | 冷灰黑底（替换偏蓝紫的 `#070912`） |
| `--pi-surface` | `#1d2025` | 面板 |
| `--pi-surface-hover` | `#262a30` | 悬停 |
| `--pi-border` | `#31363e` | 边框 |
| `--pi-border-muted` | `#282c33` | 分隔线 |
| `--pi-text` | `#e2e5ea` | 主文字 |
| `--pi-text-secondary` | `#b9bfc7` | 次级 |
| `--pi-muted` | `#8d949d` | 弱提示 |
| `--pi-dim` | `#6b727b` | 最弱 |
| `--pi-accent` | `#7c3cff` | 保留现有紫色 |

`--pi-terminal-bg` 等终端 token 随背景族同步冷灰化。

## 侧栏结构：树状导航

现状：Machines / Projects / Workspaces / Sessions 四段平铺，靠选中跳转联动，层级关系不直观。

新结构（深浅色共用）：

```
顶栏：│ PI STUDIO [🖥 本机 hp ▾] [Actions] │  ← 机器下拉沿用现有位置：顶栏品牌右侧，
├─────────────────────────┤     切换后树只显示当前机器内容，机器不进树层级
│ ▾ 📁 pi-studio          ●  │  ← 项目节点：折叠时右侧显示会话数量
│   ▾ ⑂ main [主工作区] ● │  ← 工作区节点：徽章区分 主工作区 / worktree
│   │ 💬 UI 背景色设计  ● │  ← 会话节点：缩进 + 左侧竖线
│   │ 💬 修复重连       ○ │
│   ▸ ⑂ piweb-import   4  │
│ ▸ 📁 crm-server    7 ○  │
│ ▸ 📁 jobs          2 ●  │
├─────────────────────────┤
│      ＋ New session     │  ← 底部固定
└─────────────────────────┘
```

行为规则：

- 节点 ▸/▾ 展开折叠；折叠的项目/工作区节点右侧显示会话总数；活跃状态点（●）沿层级向上冒泡显示。
- 机器下拉选择框保持现有位置（顶栏「PI STUDIO」品牌右侧），不进入侧栏。
- 原 WORKSPACES 独立段落取消，工作区并入树（功能不删，仅改呈现）。
- 原 Sessions 平铺段落取消，会话全部挂到树上。
- 选中态为圆角浅灰块（浅色 `#e4e6e9` / 深色 `#2b3038`）。

## 布局结构（仅浅色完整应用）

- 顶栏：无边框，融入应用底色。
- 侧栏：透明融入底色，列表项无卡片边框，靠圆角 hover/选中态分隔。
- 主内容区：白底圆角卡片（左上圆角贴边），细边框 + 轻阴影。
- 右侧 Info 面板：同为悬浮白卡。
- 深色 C 方案：同样的 DOM 结构，但表面贴边、无阴影、小圆角（8px），视觉差异全部来自 token。

## 实现要点

1. **主题 token**：改 `src/client/src/plugins/themes/index.ts` 的 `piStudioLightTokens`（完整新值）与 `piStudioDarkTokens`（仅背景族冷灰化）。`classicTokens` 不动。theme pair 机制（auto 跟随系统）不变。
2. **AppShell 布局**：主内容区/右侧面板改为悬浮卡片样式（浅色），相关结构样式收敛到主题 token 驱动的类上，避免深浅色各写一套结构。
3. **侧栏树组件**：现有 `AppNavigationPanel` 四段平铺改为单棵树；数据来自现有 navigationState（machines/projects/workspaces/sessions），改为树模型组装。机器下拉保持顶栏现有位置与数据源。
4. **不改动**：composer 控件布局、classic 主题、终端渲染、插件 API（ThemeTokens 结构不变）。

## 验证

按项目测试策略，不做自动化测试，采用：

1. 功能实测：dev 环境真实浏览器验证浅色/深色/auto 三种模式下导航树展开折叠、机器切换、会话选择、新建会话等路径；截图比对设计稿。
2. Code review：关注 token 覆盖完整性（THEME_TOKENS 全量）、插件自定义主题兼容性、树状态（展开/选中）在会话刷新时的保持。
3. `npm run verify`（typecheck + lint + knip）。
