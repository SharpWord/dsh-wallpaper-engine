# dsh-wallpaper-engine

把 Steam 上的 **Wallpaper Engine（壁纸引擎）** 接进 DeepSeek Harness：插件读取 Wallpaper Engine
当前激活的壁纸（以及整个创意工坊壁纸库），在 Harness Web UI 背后绘制一层壁纸，并把界面调成
半透明，让壁纸透出来。

**没装 Wallpaper Engine 也能用**：插件会自动建一个投放文件夹，把图片或视频丢进去就是壁纸，
不依赖 Steam、不依赖创意工坊，也不需要任何额外配置。

- 只读：插件**从不修改** Wallpaper Engine 的配置，只读取 `config.json` 与创意工坊目录。
- 支持 `scene` / `video` / `web` / `application` 四类壁纸；视频壁纸会真的播放（可静音/暂停）。
- 两种模式：**跟随**（用 Wallpaper Engine 里当前激活的那张，支持多显示器）或**固定**（从壁纸库里挑一张）。

## 安装

```powershell
# 装到桌面版 profile（从 GitHub 安装）
dsh plugin --profile desktop add github:SharpWord/dsh-wallpaper-engine

# 或从本地打包文件装
dsh plugin --profile desktop add "C:\path\to\dsh-wallpaper-engine-1.1.0.tgz"

# 或从本地目录装（开发时）
plugin_manager install_bundle target=<插件目录的绝对路径>
```

安装后重启（或刷新）Harness Web UI，打开 **设置 → 壁纸**。

## 没装 Wallpaper Engine 也能用（投放文件夹）

插件启动时会把下面这个文件夹建好（已经存在就什么都不动），路径在设置页「壁纸」顶部原样显示，
旁边有「打开文件夹 / 复制路径 / 重新扫描」三个按钮：

```
%USERPROFILE%\Pictures\dsh-wallpapers      # 例如 C:\Users\你\Pictures\dsh-wallpapers
```

- 把图片（`.jpg .jpeg .png .gif .webp .bmp .avif`）或视频（`.mp4 .m4v .webm .mov .ogv .mkv .avi`）
  放进去，回到设置页点「重新扫描」即可出现在壁纸库里，标记为「本地文件夹」。
- 只扫这一层，不递归子文件夹；文件夹首次创建时会写入一份 `README.txt` 说明同样的事。
- 你原来的壁纸文件不会被移动或改动，插件只读取。
- 文件夹同时被加入 `/media` 的读取白名单，所以页面能直接播放里面的视频。
- 不想要了：清空文件夹即可，插件不会自己删东西。

Steam 版 Wallpaper Engine 仍然可用——两者共存，库里会同时列出创意工坊壁纸和投放文件夹里的壁纸。

路径细节：

- 位置跟随系统真正的「图片」文件夹（`HKCU\...\Explorer\User Shell Folders\My Pictures`），
  所以 Pictures 被 OneDrive「已知文件夹移动」搬走过也认得，不会在 `%USERPROFILE%` 下另建一个空文件夹。
- 想换地方：设环境变量 `DSH_WALLPAPER_FOLDER=<目录绝对路径>`，插件就改用那个目录当投放文件夹。
- 设置页显示的永远是解析后的真实路径，不是猜的。

## 它读了什么（隐私）

| 读取 | 用途 |
| --- | --- |
| Steam 路径（注册表 `HKCU\Software\Valve\Steam\SteamPath`、`libraryfolders.vdf`） | 定位 Wallpaper Engine 安装目录 |
| `<WE>/config.json` | 当前每台显示器激活的壁纸、播放设置 |
| `<WE>/projects`、创意工坊 `content/431960` | 壁纸库列表 |
| `%USERPROFILE%\Pictures\dsh-wallpapers` | 投放文件夹：没有 Wallpaper Engine 时的壁纸来源（只读，除首次创建文件夹与 `README.txt`） |
| 当前 Windows 账户名（`os.userInfo().username`） | **只**用来定位 `config.json` 里属于你那个用户的那一段 |

除此之外不读任何个人文件、不写 Wallpaper Engine 的配置、不发任何遥测或网络请求；
壁纸文件通过本机回环地址（`127.0.0.1` 上的 Harness 端口）以 `Range` 流式返回给页面，
且只允许 Wallpaper Engine 安装目录、创意工坊根目录与投放文件夹内的路径。
`POST /state` 会返回渲染器的自检数据（构建号、计算后的颜色、壁纸亮度等），只留在本机内存里。

## 界面

| 位置 | 作用 |
| --- | --- |
| `shell.overlay` | 壁纸层。通过 `createPortal` 挂到 `document.body`，`z-index:-1`，在应用框架之下、画布之上。 |
| — | 没有单独的设置页：入口只有侧栏那一行，避免同一套界面出现两处 |
| `sidebar.panellist` + `main` | 侧栏里的壁纸入口：点一下把**侧栏列表区**换成壁纸列表，中间对话区不动；面板里点「返回」恢复会话列表。 |

### 侧栏面板

侧栏那一行图标是唯一入口（设置里不再有「壁纸」页）：点它，左侧列表区换成壁纸面，
中间对话不动，顶部「返回」把会话列表换回来。窄栏里从上到下只放四样东西：

1. **预览**：按窗口比例撑满栏宽，拖动画幅、滚轮/双指缩放、双击复位、右下角 `− 100% ＋`；
2. **显示方式**：自适应 / 填充 / 适合 / 拉伸 / 居中 五个按钮；
3. **壁纸库**：搜索、筛选、点一下即换；
4. **更多**（折叠）：浓度、压暗、分块模糊、复位取景、恢复默认。

状态那一块只在出错时出现，平时不占地方——窄栏里先看到壁纸，而不是先看到一堆说明。

实现上只有两条规则值得记住：

- **单实例槽位（`single`）同优先级只能有一个注册**，抢占会抛
  `single slot "sidebar.workspaces" already has a registration at priority 0`。
  所以先注册 `main`（`key: 'wallpaper-engine'`，让侧栏出现这一行），再在
  `slots.inject('sidebar.workspaces', …)` 的分支里以**更低优先级**（`-10`）注册替换面板——
  单实例槽位只渲染优先级最低的那个，关闭时把它注销，官方会话列表就自己回来了。
- 用户点侧栏行时 Harness 会调 `selectPanel(id)` 切走中间面板。壁纸面板挂载后立刻用
  `selectPanel(null)` 切回对话（`null` 是官方「显示对话」的方式，传 `'conversation'` 会抛错），
  所以中间永远是对话，只有左栏在换内容；万一 `layout` 服务取不到，仍会渲染一份完整界面，
  不会把中间区留成空白。
- `layout` 只能通过 `ctx.get('layout')` 取：本插件只 `inject: ['slots']`，直接读
  `ctx.layout` 会抛 `cannot get property "layout" without inject`（这一条曾让点侧栏行后中间区变空白）。

面板是独立组件，不依赖设置页的数据：自己 `loadLibrary()`，自己按用量排序，瓦片可点即固定为壁纸。


半透明的做法是把主题 token 在 `html[data-dsh-wallpaper="on"] body` 上覆写为
`color-mix(in srgb, var(--dsw-static-neutral-bluish-NN) N%, transparent) !important`：

| token | 浅色来源 | 深色来源 |
| --- | --- | --- |
| `--dsw-alias-bg-base` | `bluish-00` | `bluish-950` |
| `--dsw-specific-sidebar-fill` | `bluish-50` | `bluish-900` |
| `--dsw-alias-bg-layer-1` | `bluish-00` | `bluish-875` |
| `--dsw-alias-bg-layer-2` | `bluish-00` | `bluish-850` |

关闭开关时移除 `data-dsh-wallpaper` 属性并清空规则，界面立刻恢复原样。

### 调预览（不闭眼调参）

设置页顶部有一张**实时预览**：不是画的假框，而是用**真壁纸**、和窗口完全一样的处理链
（`placement()` 决定裁剪/留边 → 遮罩 → 侧栏/阅读区/底栏三层玻璃 → 输入胶囊）。
预览盒的宽高比直接取窗口比例，改任一滑杆它立刻重画，所以看到的就是窗口里的样子。

预览上**只有一张壁纸**：一个媒体元素 + 三层真实的半透明色块（23% 侧栏、阅读区、底部 13% 的输入行），
透明度来自和真实窗口同一套 `surfaces()` / `blockBlur()`。不画假文字、假线条、假按钮，也不在壁纸后面
再垫一张模糊副本 —— 那些都会让「预览」和窗口看起来不一样（曾经的「预览里出现两个壁纸」就是这么来的，
自测 `preview.singleMedia` / `backdrop.singleMedia` 负责防回归）。

「高级画面设置」默认折叠：壁纸本体模糊、分块模糊四块、漂移边距与「恢复默认画面」都在里面
（只重置画面参数，不动开关/壁纸选择）。缩放和取景**没有滑杆**：滑杆调不出来效果，只有拖动/滚轮/角落按钮
能对上你看到的画面，所以这里只留提示文字。

### 在预览上直接调大小和取景

预览本身就是操作面板，行为和壁纸引擎一致：

| 操作 | 效果 |
| --- | --- |
| 拖动预览 | 移动取景（左右 / 上下），松手才写盘；画面跟手走。只有放大后才有可移动的余量 |
| **滚轮 / 双指捏合** | 缩放 100%–300%；缩到上限时不再拦截，页面照常滚动 |
| 右下角 `−  100%  ＋` | 同一步进 10%，点一次存一次 |
| 双击 | 缩放与取景一起复位 |

100% 时拖不动是有意的：没有放大余量就没有可移动的区域，面板会提示「先放大再拖动取景」，
这和壁纸引擎、图片裁剪器一致（拖动只移动溢出部分，不会把图拖出画框）。

真实壁纸层和预览用**同一个** `framing()`：缩放是**改媒体本身的尺寸**（`width/height` 百分比）再用
`left/top` 平移，不是给祖先加 `transform`。这条很关键：祖先一旦带 `transform`，前面那些
`backdrop-filter` 的列会在错位的坐标系里采样背景，结果是同一张壁纸在侧栏位置**又出现一次**
（而且不带模糊）——自测里的 `frame.noTransform` 就是防这个回归的。平移量按放大余量算，
所以 100% 时拖不动（面板会提示「先放大再拖动取景」）。

### 壁纸库会记住你用过的

壁纸多了以后找不到：库里的顺序是**最近用过的排第一，然后按用的次数从多到少**，
没用过的按标题跟在后面。用过的瓦片在类型后面标 `×N`。

- 「最近」筛选钮只显示用过的壁纸（括号里是数量）。
- 一次「使用」= 一次切换，不是一次重绘：同一张壁纸 6 小时内再次上屏不算新的一次，
  所以反复刷新页面不会把计数刷上去；点一下（`pick`）和随后上屏（`display`）也只算一次。
- 记录存在 `localStorage` 的 `dsh-wallpaper-engine:usage`（带 `schema` 版本号，升级会重置）
  和 `dsh-wallpaper-engine:usage-last`（最后一张，用于去重）；不上传、不发网络请求。
- 自测里的 `library.usageOrder` 用合成数据断言这条排序规则。

### 不同比例的壁纸（照壁纸引擎的四种摆法）

壁纸不只是 16:9：壁纸库里方形、竖屏都不少（截图里就有 1:1 的）。「显示方式」按壁纸引擎的
四种摆放方式实现，另加一个自适应：

| 选项 | 对应壁纸引擎 | 行为 |
| --- | --- | --- |
| 填充 | Fill | `object-fit: cover`，铺满窗口，超出部分裁掉 |
| 适合 | Fit | `object-fit: contain`，整张显示，四周垫它的模糊副本（不是纯黑） |
| 拉伸 | Stretch | `object-fit: fill`，无视原始比例拉满 |
| 居中 | Centre | `object-fit: none`，原始像素大小居中，垫模糊副本 |
| 自适应 | — | 默认「填充」（和壁纸引擎一样铺满裁切）；只有比例差极大（`|ln(比例比)| > 0.75`，例如 32:9 塞进竖窗）才退到「适合」，避免把图切得只剩一条 |

三种垫底/裁切决定都由同一个纯函数 `placement(fitSetting, mediaAspect, boxAspect)` 算出，
真实壁纸层和预览卡调用的是同一个函数、同一个窗口比例 —— 所以预览里看到的裁剪/留边就是窗口里的结果。
壁纸库每个瓦片右下角标出真实比例（`16:9` / `1:1` / `9:16` / 具体像素），点进去前就知道是方的。
报告里的 `fit` / `fitSetting` / `fitBackdrop` / `mediaAspect` 能确认当前走的是哪条分支。

### 每块面板的浓度

「浓度」是一个 20–100 的总强度，按曲线分成三层：外框和侧栏保持很薄（壁纸整窗可见），
内容面（卡片、代码、气泡）中等玻璃，浮层面（胶囊、输入框、菜单、弹层）最实 —— 但**没有一处是实心白**：
列背后的壁纸本来就被分块模糊过，半透明填充压上去就是磨砂效果。

| 层 | 位置 | 用到的 token | 浓度 52（默认） | 浓度 100 |
| --- | --- | --- | --- | --- |
| 外框 | 主框架、会话底色 | `--dsw-alias-bg-base` | 16% | 26% |
| 外框 | 左侧栏 | `--dsw-specific-sidebar-fill` | 25% | 38% |
| 阅读区 | 中间列本身（轨迹/正文直接坐在这上面） | `--dsh-we-content-fill` | 28% | 44% |
| 内容 | 卡片、气泡、平台模块 | `--dsw-alias-bg-layer-1`、`--dsw-specific-bubble`、`--dsw-alias-bg-module-platform` | 47% | 84% |
| 内容 | 代码块 | `--dsw-alias-markdown-code-block` | 53% | 90% |
| 内容 | 行内代码、代码块横幅 | `--dsw-alias-markdown-inline-code`、`markdown-code-block-banner` | 53% | 90% |
| 内容 | 弹窗、设置卡片 | `--dsw-alias-bg-layer-2` | 55% | 92% |
| 浮层 | 选中项、浮起卡片 | `--dsw-alias-bg-layer-3`、`--dsw-alias-bg-overlay` | 58% | 96% |
| 浮层 | 输入框、统计胶囊、菜单、设置面板 | `--dsw-specific-input-major`、`--dsh-we-glass`、`--dsw-specific-menu` | 58% | 96% |
| 浮层 | 「新会话」按钮、浮起按钮 | `--dsw-alias-button-elevated-fill`、`--dsw-alias-button-floating-fill` | 58% | 96% |
| 浮层 | 菜单分组标题、layer-4 悬停 | `--dsw-alias-menu-group-header-fill`、`--dsw-alias-bg-layer-4` | 58% | 96% |
| 浮层 | 侧栏选中/悬停 | `--dsw-specific-sidebar-nav-item-active/-hover` | 56% / 43% | 94% / 72% |

### 玻璃质感

输入框和统计胶囊原本是实心白（`--dsw-specific-input-major` = `bluish-00`），压在壁纸上很突兀。
现在这个 token 被改成同一条浓度曲线上的半透明填充，再补上 `backdrop-filter`：

| 目标 | 选择器（不依赖 hash） | 处理 |
| --- | --- | --- |
| 输入框卡片 | `[data-composer-card]` | `blur(18px) saturate(1.12)` + 内高光 + 外投影 |
| 缓存命中等胶囊 | `[data-composer-stat] > :is(button, span)` | 半透明底 + `blur(12px)` + 1px 描边，文字提到 `label-secondary` |
| 对话框、菜单、浮层 | `[role="dialog"]`、`[class*="_menu"]`、`[class*="_popover"]`、`[class*="_dropdown"]` | `blur(18px) saturate(1.12)` |
| 设置弹层 | `[class*="_overlay"] [class*="_panel"]` | 应用自己把设置面板画成实心 `bg-layer-2`，这里改成玻璃填充 + `blur(18px)` |
| 四个布局块 | `centerCol` / `sidebarCol` / `[data-rightbar-col]` / `bottomRow` | 分块模糊，默认各 18px |
| 插件自己的控件 | `.dsh-we-*` | 同一配方（`--dsh-we-glass`），回退到 `bg-layer-3` |

浓度滑块同时管面板和玻璃：浓度越高玻璃越实，越低越透。
> 注意：胶囊在「紧凑」变体里是 `<span>`，在「点开详情」变体里是 `<button>`，
> 所以选择器必须写成 `:is(button, span)`，只写 `span` 会匹配 0 个。

### 文件改动卡片也给模糊，不再实心

diff / 文件改动卡片（`[data-changed-files]`）和它的悬停预览（`[data-changes-hover-preview]`）
一开始跟着 `bg-layer-1` 半透明，背后的正文会透上来变成两层字重叠。
现在的做法是**比周围卡片再实一点 + 自己带 `blur(22px)`**：填充 61%（浓度 52 时），
并通过 `--dsh-we-sheet` 下发（浅色 `bluish-00` / 深色 `bluish-850`）。
模糊把那层正文糊成一块色雾，所以既有壁纸质感，也不会再出现两层字。

### 字体颜色（一个颜色，三个层级）

设置里的「字体颜色」一行控制整个窗口的字色，三档可选：

| 模式 | 行为 |
| --- | --- |
| 跟随壁纸（默认） | 量壁纸平均亮度，在**纯黑**和**纯白**之间挑一个 —— 挑的是「在四种面上都还能看」的那个，不是只在正文上能看的那个 |
| 自定义 | 用你选的颜色，预设白/浅灰/墨黑三颗，也可以开取色器选任意颜色 |
| 主题默认 | 完全不动字色，交回 Harness 自己的 token |

关键点：**整个窗口只有一种基色**。以前是每个面各自解一套阶梯，侧栏、正文、输入框会解出三种不同的灰，
同一屏看起来像三种主题。现在只解一次基色，三个层级都是这个颜色降透明度，所以不会再各块各调。

层级怎么分：`inkLevels`（层级对比，0–100，默认 62）决定二级、三级相对一级保留多少不透明度 ——
0 是三档完全一样，100 是三级最淡。透明度设好之后还有 4.5:1 / 3:1 的对比度地板：
某个层级在某个面上真看不清时，它只把**这一档**往回调，颜色和色相不变。

```
基色 = autoInkBase(主题)          // 纯黑 / 纯白，取在两个极端里「最差面」更高的那个
层级 = inkOpacity(档位, 面亮度, 基色亮度)   // 先按 inkLevels 给透明度，再按地板回调
落地 = inkPaint(基色, 档位, 面亮度)        // 满强度给 hex，否则给 rgba
```

层级透明度统一在**最难的那个面**（对比度最低的那个）上解一次，四个面共用同一组值 ——
这样侧栏和正文的二级文字是同一个灰，同时每一面都还在自己的地板之上。
覆盖的 token：`--dsw-alias-label-primary/secondary/tertiary/caption/quaternary`。

自测里的 `ink.unified`（四个面解出来的三级色必须完全相同）、`ink.levels`（滑块真能拉开层级）、
`ink.custom`（选的白就是白）、`ink.contrastFloor`（每个面都过地板）、`ink.ui`（三个按钮一个不少）
`ink.off`（选「主题默认」时一条覆盖规则都不生成）就是这行的回归保护。设置里那一行会实时显示当前对比度，例如 `对比度 13.22:1 · #0b0d11`。


### 隐藏「预览版」

Harness 新会话首屏的 hero 徽标（locale 键 `hero.preview`，class 后缀 `_previewBadge`）
在壁纸背景下是块多余的白字，插件启用时会隐藏它：`[class*="_previewBadge"] { display: none }`。
停用插件后立刻恢复。

### 遮罩只在极端亮度时才出现

壁纸加载后会在 24×24 画布上量一次平均亮度（`sampleLuminance`）。
遮罩（`--dsh-we-scrim`）只当保险用：

| 主题 | 触发条件 | 强度 |
| --- | --- | --- |
| 浅色 | 壁纸亮度 < 0.30 | 按缺口线性升到最多 38% |
| 深色 | 壁纸亮度 > 0.62 | 按超出量线性升到最多 42% |

中间亮度**完全不遮**：清晰度交给分块模糊和面板填充，可读性交给自动配字。
这样壁纸本身的对比度、颜色都不会被一层白/黑糊掉——之前 36% 的白罩就是「画面发灰、看着没效果」的原因。
「压暗」滑块在这之上做 ±0.15 偏置（想手动压暗就拉它）。

### 画面只有一层

壁纸层里只有一个媒体元素：`width/height` 百分比决定缩放，`left/top` 决定取景，
`object-fit` 由 `placement()` 决定，需要时再叠一层遮罩。没有漂移动画、没有环境色、
没有边缘压暗、没有模糊垫底——这些层曾经让预览和窗口对不上，也让人分不清「哪张才是壁纸」。
多出来的观感全部由玻璃（分块模糊 + 面板浓度 + 自动配字）提供。

### 预设

设置页顶部有三个一键效果：**磨砂**（浓度 52 / 模糊 0 / 压暗 10%）、
**通透**（34 / 0 / 4%）、**清晰**（74 / 6 / 20%）。

### 分块模糊

「分块模糊」对四个布局块分别设 `backdrop-filter`，每块只模糊自己背后的壁纸：

| 滑块 | 选择器（不依赖 hash） | 说明 |
| --- | --- | --- |
| 主区 | `[class*="centerCol"]` | 会话主区 |
| 侧栏 | `[class*="sidebarCol"]` | 左侧栏 |
| 右栏 | `[data-rightbar-col]` | 右侧栏 |
| 底栏 | `[class*="bottomRow"]` | 底部行 |

四个值默认 18（「全部高斯模糊」）；设 0 就是该块完全通透。

**不能用元素自身做模糊**：`backdrop-filter` 一旦不是 `none`，该元素就**成为 `position:fixed` 子元素的包含块**。
侧栏的收起按钮、折叠后的「新会话」按钮都是 `position:fixed`，一旦被侧栏捕获，就会被 `overflow:hidden` 裁掉、点不到
（这就是「收起侧边栏后再也打不开」的根因）。所以每个块改成两层：

```css
html[data-dsh-wallpaper="on"] [class*="sidebarCol"]        { position: relative; }
html[data-dsh-wallpaper="on"] [class*="sidebarCol"]::before { content:""; position:absolute; inset:0;
  z-index:-1; pointer-events:none; backdrop-filter: blur(18px) !important; }
```

`position: relative` **不会**建立 fixed 包含块，模糊效果由伪元素承担，两者互不干扰。

伪元素的 `z-index: -1` 还有一个约束：**壁纸层必须比它更低**。壁纸是用 `createPortal` 挂到 `document.body`
的固定层，一旦也是 `-1`，两者同级时后进 DOM 的壁纸会盖住模糊层，于是「分块模糊」滑块看着完全没反应
（这就是「分块模糊无法调节」的根因）。所以壁纸层固定用 `z-index: -3`：

| 层 | z-index | 谁 |
| --- | --- | --- |
| 壁纸 | `-3` | `.dsh-we-backdrop`（图片/视频 + 自适应遮罩） |
| 分块模糊 | `-1` | 四列的 `::before`、输入框卡片的 `::before` |
| 内容 | 正常流 | 列背景、文字、卡片 |
输入框卡片（`[data-composer-card]`）用同样的写法。

### 自测（49 项）

页面里内置了一套自检：`POST /verify` 发一个 token，页面每 5 秒 `POST /ping` 轮询到新 token 就跑一遍，
把结果发回 `/report`，之后 `POST /state` 里的 `value.renderer.selfTest` 就是完整结论：

```bash
curl.exe -s -X POST -H "Content-Type: application/json" --data '{}' http://127.0.0.1:<端口>/wallpaper-engine/api/verify
curl.exe -s -X POST -H "Content-Type: application/json" --data '{}' http://127.0.0.1:<端口>/wallpaper-engine/api/state
```

覆盖：Host 三条接口、壁纸层与媒体是否真的加载（`<video readyState=4>`）、主题半透明与文字反差、
标题栏方角、徽标隐藏、分块模糊、侧栏「无包含块 / 收起 / 收起后按钮可点 / 再展开」、开关关掉后主题回滚为不透明、
深色主题的自动配字（纯算术，不再临时切换页面主题）、字体颜色六项（`ink.unified` / `ink.levels` /
`ink.custom` / `ink.off` / `ink.contrastFloor` / `ink.ui`）、浓度与分块模糊两个旋钮是否真的改变生成规则、
壁纸库排序规则（`library.usageOrder`，合成数据）、五种显示方式（`fit.modes`）、缩放与取景的上下限
（`frame.clamps`）及「设置值 = 实际生效值」（`frame.applied`）、`Range` 206 流式取字节、页面运行时错误。

自测会自己打开侧栏面板，然后真派发事件：`preview.drag`（合成 pointerdown/move/up 后断言取景变了）、
`preview.zoomButtons`（点角落 + 断言放大）、`preview.wheel`（滚轮必须改变缩放）、
`preview.wheelLimit`（到 300% 后不再拦截页面滚动）。打不开面板时这些行记 `settings closed` 并通过。

侧栏两行不看状态变量，而是真派发点击：

- `sidebar.panel`：点图标 → 列表区换成壁纸列表、会话列表消失、点「返回」后会话列表回来、
  中间对话区始终没被切走（`mainKept`）。
- `sidebar.rowClick`：点这一行的**文字**（`PanelRow` 会先 `selectPanel` 切走中间面板）→
  侧栏面板必须打开、中间必须回到对话（`active=conversation`）、不能停在壁纸页。
  这一行就是「点侧栏行后中间变空白」那个 bug 的回归测试。

同一时刻只允许跑一轮自测（`selfTestRunning` 互斥）：两轮并行时会互相改 `settings`，
一轮把壁纸层关掉、另一轮正在断言半透明，结果就会假失败。


### 方角

Windows 标题栏布局下，布局样式会给主区左上角加 16px 圆角（`--dsh-windows-content-radius`）。
壁纸铺满时那个圆角看起来是个多余的缺口，所以开启壁纸时会把它和主区圆角一起压成 0。

## Host API

前缀路由 `/wallpaper-engine/api`（`webServer.register({ kind: 'prefix' })`）：

| 方法 | 请求 | 返回 |
| --- | --- | --- |
| `POST /state` | `{}` | 安装状态、当前每台显示器激活的壁纸、计数、投放文件夹、最近请求、渲染器自检 |
| `POST /library` | `{"refresh":true}` | 全部壁纸（创意工坊 + 本地项目 + 投放文件夹） |
| `POST /refresh` | `{}` | 丢弃缓存后重扫 |
| `POST /folder` | `{}` | 确保投放文件夹存在并重扫，返回 `{path, created, writable, count, installed, items}` |
| `POST /openFolder` | `{}` | 在资源管理器里打开投放文件夹 |
| `POST /report` | 渲染器自检 | `{"received":true}` |
| `POST /ping` | `{}` | 当前自测 token（页面每 5 秒轮询） |
| `POST /verify` | `{}` | 下发新自测 token |
| `GET /media?p=<绝对路径>` | 可选 `Range` | 文件流，支持 `206 Partial Content` |

`/media` 只允许 Wallpaper Engine 安装目录、创意工坊根目录与投放文件夹里的文件（`realpath` + 相对路径校验），
防止越权读取任意路径。

## 发现逻辑（`discovery.js`）

1. 投放文件夹：`%USERPROFILE%\Pictures\dsh-wallpapers`，不存在就创建（不需要 Wallpaper Engine）。
2. Steam 根目录：`STEAM_PATH` 环境变量 → `HKCU\Software\Valve\Steam\SteamPath` → `HKLM\...\WOW6432Node` → 常见盘符。
3. 库目录：`steamapps/libraryfolders.vdf`。
4. Wallpaper Engine：各库里 `steamapps/common/wallpaper_engine`，需要一个可读的 `config.json`；找不到只记一条 warning，不影响文件夹里的壁纸。
5. 当前壁纸：`config.json` → 当前 Windows 用户段 → `general.wallpaperconfig.selectedwallpapers.MonitorN.file`。
6. 壁纸条目：创意工坊 `content/431960/<id>/project.json`（+ 本地 `projects/myprojects` + 投放文件夹这一层）。
7. 配置里的 `scene.pkg` 与项目里的 `scene.json` 名字不一致，所以按「主文件 → 目录 → 创意工坊 id」三级回退匹配。

## 渲染

- `scene` / `web` / `application` 用 `project.json` 里的预览图（`preview.gif` 会动）。
- `video` 用真实视频文件，`<video muted loop autoplay playsinline>`。
- `image`（投放文件夹里的图片）直接当壁纸，`object-fit` 同样跟随摆法设置。
- 一个媒体元素：`object-fit` 由 `placement()` 决定，缩放/取景由 `framing()` 算出的
  `width/height/left/top` 百分比决定；默认不模糊壁纸本身（`blur: 0`），清晰度交给分块模糊。
- 需要时再叠一层遮罩（只在极端亮度时非 0）。没有别的装饰层。
- 遮罩/配字都在壁纸 `onLoad` / `onLoadedData` 里量一次后重算，换壁纸自动重算。

## 排障

没装 Wallpaper Engine 是正常用法，不算故障：设置页状态会显示「用本地文件夹」并给出路径。
只有当「既没装 Wallpaper Engine、投放文件夹也是空的」时才会提示安装或放图。

`POST /wallpaper-engine/api/state` 里的 `renderer` 字段是页面自检：构建号（`build`）、主题规则长度、
`data-dsh-wallpaper` 标记、计算后的 `body` / 框架 / 侧栏 / 阅读区背景色、壁纸层的 `z-index`、
量到的壁纸亮度（`luminance`）、两个主题下算出的遮罩（`scrimLight` / `scrimDark`）、
裁剪模式与缩放取景（`fit` / `zoom` / `posX` / `posY`）、媒体元素的 `complete` /
`naturalWidth` / `error`。页面加载后 2.5 秒发一次（`tag:"boot"`），之后状态变化、媒体加载成功/失败、
以及每次超过 60 秒没有新报告时补发一次（`tag:"heartbeat"`）。

`state.mount` 说明 Host 半是怎么挂上的：`mode:"injected"` 表示插件比 `webServer` 先加载、靠
`ctx.inject(['webServer'], …)` 等到了服务；`mode:"direct"` 表示加载时服务已经就绪。

## 自检（宿主侧触发）

`POST /wallpaper-engine/api/verify` 会下发一次性令牌；页面每 5 秒 `ping` 一次，读到新令牌就跑一遍
42 项自检（主题、注入的 CSS 长度、两个主题的规则、遮罩、文字阶梯、分块模糊是否只作用在伪元素上、
侧栏收起/展开后按钮是否仍可点、开关关闭后 token 是否完全还原、媒体 Range 请求、预览卡是否画出、
**壁纸只有一张**（`preview.singleMedia` / `backdrop.singleMedia`）、拖动/角落按钮/滚轮绑定、
页面错误），结果以 `selfTest` 字段回传。全部通过时 `ok:true`。设置页没打开时预览相关的行记为
skip（`detail:"settings closed"`），不算失败。

## 已知限制：右上角窗口按钮条

`最小化 / 最大化 / 关闭` 三个按钮是 Electron 的原生 **Window Controls Overlay**，不是页面画的：
主进程创建窗口时给定初始底色（`chromeFallbackFill()` = 浅色 `#f9fafb` / 深色 `#1b1b1c`），
之后只由桌面 preload 在语言或主题变化时通过 `windowsAppearance` IPC 用渲染层量到的
`--dsw-specific-sidebar-fill` 覆盖。插件改完 token 不会触发那次上报，所以这条玻璃带会保持启动时的
实心底色。

试过的办法：从页面把 `html[lang]` 触发一次、并在同一微任务里把该 token 临时置为 `transparent`，
让 preload 采到「透明」再上报。已验证 preload 的 observer 确实读到了 `rgba(0, 0, 0, 0)`，
但 Windows 侧没有把新颜色画上去，所以这段实验代码已移除，避免在别的机器上出现实心黑条。
要真正统一，需要在桌面外壳（`lib/main.js` / `preload-app.cjs`）里改，而不是插件能做的范围。