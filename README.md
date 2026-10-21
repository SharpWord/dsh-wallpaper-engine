# dsh-wallpaper-engine

把 Steam 上的 **Wallpaper Engine（壁纸引擎）** 接进 DeepSeek Harness：插件读取 Wallpaper Engine
当前激活的壁纸（以及整个创意工坊壁纸库），在 Harness Web UI 背后绘制一层壁纸，并把界面调成
半透明，让壁纸透出来。

- 只读：插件**从不修改** Wallpaper Engine 的配置，只读取 `config.json` 与创意工坊目录。
- 支持 `scene` / `video` / `web` / `application` 四类壁纸；视频壁纸会真的播放（可静音/暂停）。
- 两种模式：**跟随**（用 Wallpaper Engine 里当前激活的那张，支持多显示器）或**固定**（从壁纸库里挑一张）。

## 安装

```powershell
# 装到当前 profile（从 GitHub 安装）
dsh plugin add github:SharpWord/dsh-wallpaper-engine

# 或从本地目录装（开发时）
plugin_manager install_bundle target=<插件目录的绝对路径>
```

安装后重启（或刷新）Harness Web UI，打开 **设置 → 壁纸**。

## 它读了什么（隐私）

| 读取 | 用途 |
| --- | --- |
| Steam 路径（注册表 `HKCU\Software\Valve\Steam\SteamPath`、`libraryfolders.vdf`） | 定位 Wallpaper Engine 安装目录 |
| `<WE>/config.json` | 当前每台显示器激活的壁纸、播放设置 |
| `<WE>/projects`、创意工坊 `content/431960` | 壁纸库列表 |
| 当前 Windows 账户名（`os.userInfo().username`） | **只**用来定位 `config.json` 里属于你那个用户的那一段 |

除此之外不读任何个人文件、不写 Wallpaper Engine 的配置、不发任何遥测或网络请求；
壁纸文件通过本机回环地址（`127.0.0.1` 上的 Harness 端口）以 `Range` 流式返回给页面，
且只允许 Wallpaper Engine 安装目录与创意工坊根目录内的路径。
`POST /state` 会返回渲染器的自检数据（构建号、计算后的颜色、壁纸亮度等），只留在本机内存里。

## 界面

| 位置 | 作用 |
| --- | --- |
| `shell.overlay` | 壁纸层。通过 `createPortal` 挂到 `document.body`，`z-index:-1`，在应用框架之下、画布之上。 |
| `settings.section` | 「壁纸」设置页：开关、模式、显示器、库、滤镜、透明度。 |

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
（`placement()` 决定裁剪/留边 + 模糊副本垫底 → 漂移/饱和 → 环境色 → 边缘压暗 → 遮罩 →
侧栏/阅读区/底栏三层玻璃 → 输入胶囊）。预览盒的宽高比直接取窗口比例，改任一滑杆它立刻重画，
所以看到的就是窗口里的样子。

预览上**只画真东西**：一条 23% 宽的侧栏、它右边的阅读区、底部 13% 的输入行，透明度来自
和真实窗口同一套 `surfaces()` / `blockBlur()`。不画假文字、假线条、假按钮 —— 那些只会让
「预览」和窗口看起来不一样。

「高级画面设置」默认折叠：分块模糊、漂移、边缘压暗、饱和度、壁纸本体模糊都在里面，
再加一个「恢复默认画面」按钮（只重置画面参数，不动开关/壁纸选择）。

### 在预览上直接调大小和取景

预览本身就是操作面板，行为和壁纸引擎一致：

| 操作 | 效果 |
| --- | --- |
| 拖动预览 | 移动取景（左右 / 上下），松手才写盘；画面跟手走 |
| **Alt+滚轮** | 缩放 100%–300%（普通滚轮不拦截，页面照常滚动） |
| 右下角 `−  100%  ＋` | 同一步进 10%，点一次存一次 |
| 双击 | 缩放与取景一起复位 |
| 「缩放 / 左右 / 上下」滑杆 | 同一组数值的精确调节 |

普通滚轮**故意不绑定缩放**：设置页要滚动，鼠标划过预览就缩小壁纸是说不通的，
所以缩放只认 Alt+滚轮和角落按钮。

真实壁纸层和预览用**同一个** `framing()`：`zoom` 转成外层容器的 `transform: scale()`（裁剪由容器
`overflow:hidden` 负责，所以放大不会溢出窗口），`posX/posY` 转成 `object-position` 的百分比偏移。
两处都从同一份设置读，所以滑杆动、预览动、窗口背后的壁纸也一起动。自测里的 `frame.clamps` /
`frame.applied` 分别断言上下限和「设置值 = 实际生效值」。

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
| 自适应 | — | 图片与窗口比例差 `|ln(比例比)| > 0.22` 时用「适合」，否则「填充」 |

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

### 文字颜色跟着壁纸自动走

不用手调：壁纸加载后量一次平均亮度，再按每个面各自的填充不透明度算出
「填充压在壁纸上」的合成亮度 `L = a × tint + (1 − a) × L_wallpaper`，然后在**黑白灰阶梯**里解对比度。

| 面 | 合成用的填充 | 说明 |
| --- | --- | --- |
| 内容（正文、卡片） | `bg-layer-1` | 默认 47% |
| 外框（侧栏、底栏） | `bg-base` / sidebar 取更薄的那个 | 默认 16% |
| 浮层（输入框、胶囊、对话框、设置面板） | `--dsh-we-glass` | 默认 58% |

求解规则：
- 两套阶梯（深字 `#0b0d11 #3a3f4a #5d6370 #838a97` / 浅字 `#f8f9fb #ccd1da #a4aab6 #7f8693`），
  先选主题本来那套；只有当它达不到 4.5:1 时，才切到另一套 —— 所以浅色主题压深色壁纸会自动变浅字。
- 一级文字目标 4.5:1、二级 4.5:1、三级 3:1，达不到就往回退到更极端的那一级。
- 全部是灰度：这是「先用黑白灰，看不清再说」的实现方式；实测这套阶梯在本机整个壁纸库上都过 4.5:1，
  所以彩色兜底没有触发过（真要兜底时会退到纯黑/纯白，仍然不是彩色）。
- 覆盖的 token：`--dsw-alias-label-primary/secondary/tertiary/caption/quaternary`。


### 隐藏「预览版」

Harness 新会话首屏的 hero 徽标（locale 键 `hero.preview`，class 后缀 `_previewBadge`）
在壁纸背景下是块多余的白字，插件启用时会隐藏它：`[class*="_previewBadge"] { display: none }`。
停用插件后立刻恢复。

### 遮罩只在极端亮度时才出现

壁纸加载后会在 32×32 画布上量一次平均亮度（`sampleWallpaper`），顺手取两个饱和色当环境色。
遮罩（`--dsh-we-scrim`）现在只当保险用：

| 主题 | 触发条件 | 强度 |
| --- | --- | --- |
| 浅色 | 壁纸亮度 < 0.30 | 按缺口线性升到最多 38% |
| 深色 | 壁纸亮度 > 0.62 | 按超出量线性升到最多 42% |

中间亮度**完全不遮**：清晰度交给分块模糊和面板填充，可读性交给自动配字。
这样壁纸本身的对比度、颜色都不会被一层白/黑糊掉——之前 36% 的白罩就是「画面发灰、看着没效果」的原因。
「压暗」滑块在这之上做 ±0.15 偏置（想手动压暗就拉它）。

### 画面（新卡片）

壁纸本身怎么画，单独一张卡片控制：

| 控件 | 默认 | 作用 |
| --- | --- | --- |
| 缓慢漂移 | 开 | 48 秒一循环的极慢平移+缩放（`@keyframes dsh-we-drift`，1.03→1.11），静态壁纸不再是死图；`prefers-reduced-motion` 下自动关；「完整显示」模式不漂移 |
| 边缘压暗 | 26% | 上下+四角的渐变压暗（`--dsh-we-vignette` 由内联渐变算），让窗口边框和顶部标签页更稳，中间不动 |
| 饱和度 | 108% | 壁纸自身的 `saturate()`；画面偏灰时可以拉到 130–140 |

另有环境色层：从壁纸里取两个饱和色做 `radial-gradient`，`soft-light`（浅色）/ `screen`（深色）
叠在画面上，玻璃面板就有了壁纸的色调，而不是压上去的一块白。

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

### 自测（37 项）

页面里内置了一套自检：`POST /verify` 发一个 token，页面每 5 秒 `POST /ping` 轮询到新 token 就跑一遍，
把结果发回 `/report`，之后 `POST /state` 里的 `value.renderer.selfTest` 就是完整结论：

```bash
curl.exe -s -X POST -H "Content-Type: application/json" --data '{}' http://127.0.0.1:<端口>/wallpaper-engine/api/verify
curl.exe -s -X POST -H "Content-Type: application/json" --data '{}' http://127.0.0.1:<端口>/wallpaper-engine/api/state
```

覆盖：Host 三条接口、壁纸层与媒体是否真的加载（`<video readyState=4>`）、主题半透明与文字反差、
标题栏方角、徽标隐藏、分块模糊、侧栏「无包含块 / 收起 / 收起后按钮可点 / 再展开」、开关关掉后主题回滚为不透明、
深色主题的自动配字（纯算术，不再临时切换页面主题）、浓度与分块模糊两个旋钮是否真的改变生成规则、
壁纸库排序规则（`library.usageOrder`，合成数据）、五种显示方式（`fit.modes`）、缩放与取景的上下限
（`frame.clamps`）及「设置值 = 实际生效值」（`frame.applied`）、`Range` 206 流式取字节、页面运行时错误。

设置页开着时还会真派发事件：`preview.drag`（合成 pointerdown/move/up 后断言取景变了）、
`preview.zoomButtons`（点角落 + 断言放大）、`preview.wheelNeutral`（普通滚轮必须不改缩放）、
`preview.wheelAlt`（Alt+滚轮必须放大）。设置页关着时这四行记 `settings closed` 并通过。

**自测不会改你的设置**：滑块两项是对 `surfaces()` / `blockBlur()` 的纯算术断言；
开关那三项走 `previewSettings()`（只重绘、不写 `localStorage`），结束一律按内存快照还原。
所以即使自测中途页面重载，也不会把你的浓度、开关留在测试值上。


### 方角

Windows 标题栏布局下，布局样式会给主区左上角加 16px 圆角（`--dsh-windows-content-radius`）。
壁纸铺满时那个圆角看起来是个多余的缺口，所以开启壁纸时会把它和主区圆角一起压成 0。

## Host API

前缀路由 `/wallpaper-engine/api`（`webServer.register({ kind: 'prefix' })`）：

| 方法 | 请求 | 返回 |
| --- | --- | --- |
| `POST /state` | `{}` | 安装状态、当前每台显示器激活的壁纸、计数、最近请求、渲染器自检 |
| `POST /library` | `{"refresh":true}` | 全部壁纸（创意工坊 + 本地项目） |
| `POST /refresh` | `{}` | 丢弃缓存后重扫 |
| `POST /report` | 渲染器自检 | `{"received":true}` |
| `POST /ping` | `{}` | 当前自测 token（页面每 5 秒轮询） |
| `POST /verify` | `{}` | 下发新自测 token |
| `GET /media?p=<绝对路径>` | 可选 `Range` | 文件流，支持 `206 Partial Content` |

`/media` 只允许 Wallpaper Engine 安装目录与创意工坊根目录里的文件（`realpath` + 相对路径校验），
防止越权读取任意路径。

## 发现逻辑（`discovery.js`）

1. Steam 根目录：`STEAM_PATH` 环境变量 → `HKCU\Software\Valve\Steam\SteamPath` → `HKLM\...\WOW6432Node` → 常见盘符。
2. 库目录：`steamapps/libraryfolders.vdf`。
3. Wallpaper Engine：各库里 `steamapps/common/wallpaper_engine`，需要一个可读的 `config.json`。
4. 当前壁纸：`config.json` → 当前 Windows 用户段 → `general.wallpaperconfig.selectedwallpapers.MonitorN.file`。
5. 壁纸条目：创意工坊 `content/431960/<id>/project.json`（+ 本地 `projects/myprojects`）。
6. 配置里的 `scene.pkg` 与项目里的 `scene.json` 名字不一致，所以按「主文件 → 目录 → 创意工坊 id」三级回退匹配。

## 渲染

- `scene` / `web` / `application` 用 `project.json` 里的预览图（`preview.gif` 会动）。
- `video` 用真实视频文件，`<video muted loop autoplay playsinline>`。
- 视口铺满用 `object-fit: cover|contain`；默认不再模糊壁纸本身（`blur: 0`），清晰度交给分块模糊。
- 四层叠起来：媒体（可漂移 + `saturate()`）→ 环境色（壁纸取色，`soft-light`/`screen`）→ 边缘压暗 → 遮罩（只在极端亮度时非 0）。
- 遮罩/配字都在壁纸 `onLoad` / `onLoadedData` 里量一次后重算，换壁纸自动重算。

## 排障

`POST /wallpaper-engine/api/state` 里的 `renderer` 字段是页面自检：构建号（`build`）、主题规则长度、
`data-dsh-wallpaper` 标记、计算后的 `body` / 框架 / 侧栏 / 阅读区背景色、壁纸层的 `z-index`、
量到的壁纸亮度（`luminance`）和取到的环境色（`ambientA` / `ambientB`）、两个主题下算出的遮罩
（`scrimLight` / `scrimDark`）、漂移是否在跑（`driftActive`）、媒体元素的 `complete` /
`naturalWidth` / `error`。页面加载后 2.5 秒发一次（`tag:"boot"`），之后状态变化、媒体加载成功/失败、
以及每次超过 60 秒没有新报告时补发一次（`tag:"heartbeat"`）。

`state.mount` 说明 Host 半是怎么挂上的：`mode:"injected"` 表示插件比 `webServer` 先加载、靠
`ctx.inject(['webServer'], …)` 等到了服务；`mode:"direct"` 表示加载时服务已经就绪。

## 自检（宿主侧触发）

`POST /wallpaper-engine/api/verify` 会下发一次性令牌；页面每 5 秒 `ping` 一次，读到新令牌就跑一遍
30 项自检（主题、注入的 CSS 长度、两个主题的规则、遮罩、文字阶梯、分块模糊是否只作用在伪元素上、
侧栏收起/展开后按钮是否仍可点、开关关闭后 token 是否完全还原、媒体 Range 请求、预览卡是否画出、
页面错误），结果以 `selfTest` 字段回传。全部通过时 `ok:true`。设置页没打开时 `preview.card`
一行记为 skip（`detail:"settings closed"`），不算失败。

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