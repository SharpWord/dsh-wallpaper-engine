# 发布清单（插件市场）

这份文件是提交给 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的完整投稿包，
也是「谁能做哪一步」的说明。代码侧的东西都已经就位，剩下的两步需要你的 GitHub 账号。

## 1. 已经做好的

| 要求 | 仓库里的东西 |
| --- | --- |
| `dsh.bundle` manifest（可被 `dsh plugin add` 安装） | `package.json` → `dsh.bundle.patch: ./cordis.patch.yml` |
| `cordis.patch.yml` 与其同目录 | `cordis.patch.yml`（`- insert: [{ id: wallpaper-engine, name: dsh-wallpaper-engine }]`） |
| `dsh.client`（只有带前端 UI 时才需要） | `package.json` → `dsh.client`（`platform: web`, `immediately`, 三个 slot 注入） |
| 真实可用的代码 | `index.js`（Host：发现 + API + Range 流）、`discovery.js`、`client.js`（壁纸层 + 设置页） |
| 许可证 | `LICENSE`（MIT） |
| `package.json` 里可发布字段 | `version 1.0.0`、`description`、`keywords`、`repository`、`homepage`、`files`、无 `private` |
| 一个 `theme` 分类下的条目 | 见下面第 3 节的 YAML |
| 截图（可选） | 还没放。`screenshots.json` + `assets/*.png` 随时可加，下一次夜间构建生效 |

`npm pack` 出来的 tarball 只包含运行时需要的文件（`index.js`、`discovery.js`、`client.js`、`cordis.patch.yml`、
`locale/*.json`、`icon.svg`、`README.md`、`LICENSE`）。

## 2. 需要你做的（两选一）

### A. 让我代跑（推荐）

在这个会话里执行一次登录，之后我把仓库推上去并提 PR：

```powershell
gh auth login          # 选 GitHub.com → HTTPS → 浏览器授权
```

或者给我一个有 `repo` 权限的 token（不建议贴进聊天，`gh auth login` 更稳）。
登录后我会：

1. `gh repo create SharpWord/dsh-wallpaper-engine --public --source . --push`（仓库名可改）
2. 给仓库打 `dsh-plugin` topic
3. fork `awesome-dsh-plugin`，加 `data/plugins/SharpWord__dsh-wallpaper-engine.yml`，提 PR

### B. 你自己做（三步，约 3 分钟）

```powershell
cd <插件目录>
git init
git add .
git commit -m "feat: Wallpaper Engine wallpapers behind DeepSeek Harness"
gh repo create dsh-wallpaper-engine --public --source . --push
```

然后在 GitHub 网页上给仓库加 `dsh-plugin` topic，再：

```powershell
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
# 新建 data/plugins/SharpWord__dsh-wallpaper-engine.yml，内容见第 3 节
git checkout -b add-dsh-wallpaper-engine
git add data/plugins/SharpWord__dsh-wallpaper-engine.yml
git commit -m "Add dsh-wallpaper-engine"
git push -u origin add-dsh-wallpaper-engine
gh pr create --title "Add dsh-wallpaper-engine" --body "见 PR 正文（第 4 节）"
```

## 3. 条目文件（`data/plugins/SharpWord__dsh-wallpaper-engine.yml`）

```yaml
url: https://github.com/SharpWord/dsh-wallpaper-engine
name: SharpWord/dsh-wallpaper-engine
category: theme
description:
  en: Paints the wallpaper Wallpaper Engine currently has active, or one pinned from the local Workshop and project library, behind DeepSeek Harness, with translucent panels, per-block backdrop blur, wallpaper-derived text contrast and a settings page that lists the wallpapers found on the machine.
  zh: 把 Steam 壁纸引擎（Wallpaper Engine）当前启用的壁纸，或你从本机创意工坊 / 项目壁纸库里固定的那一张，铺在 DeepSeek Harness 窗口背后：面板半透明、按布局分区高斯模糊、文字颜色按壁纸明暗自动匹配，设置页里还列出本机找到的全部壁纸。
```

分类取 `theme`：它改的是外观（壁纸 + 皮肤），按官方说明会进插件市场的「主题」Tab。
如果维护者认为该归 `ui`，他们自己会改，不会因此打回。

## 4. PR 正文

```markdown
## dsh-wallpaper-engine

Wallpaper Engine (Steam) integration for DeepSeek Harness — and it still works without Wallpaper Engine.

- Host half finds Steam + Wallpaper Engine from the registry / `libraryfolders.vdf`, reads the per-monitor
  active wallpaper out of WE's `config.json`, and lists Workshop (`content/431960`) + local project wallpapers.
  It serves media through a `webServer` prefix route with `Range` support, fenced to the WE install root.
- Without Wallpaper Engine it creates `%USERPROFILE%\Pictures\dsh-wallpapers`, scans the pictures and videos
  dropped into it, and shows that path in the settings page so the user never has to find Steam themselves.
  The folder is added to the `/media` allow-list.
- Client half paints one layer behind the whole window (`shell.overlay` → portal, `z-index: -3`), overrides the
  theme's fill tokens so panels become translucent glass, adds per-block `backdrop-filter` blur, and solves text
  colours against the measured wallpaper luminance (black/white/grey ladder, WCAG contrast).
- Settings page (`settings.section`, label 壁纸): follow what WE has active or pin one from the library,
  a drop-in folder card (path, open / copy / rescan), density / blur / scrim / fit / video / look presets,
  per-block blur, and a hook for WE's own playback.
- Nothing is written to Wallpaper Engine; the drop-in folder is only created once, and never modified after that.

Install:

```
dsh plugin --profile desktop add github:SharpWord/dsh-wallpaper-engine
```

Verified on dsh-desktop 0.2.1-rc.2 (Windows, Wallpaper Engine 2.x, scene + video wallpapers, and no-WE mode).
The repo also contains an in-page self test (`POST /wallpaper-engine/api/verify`) covering 28 checks.
```

## 5. 提交前的自检

- [x] `package.json` 声明 `dsh.bundle`（不是只有 `dsh.client`）
- [x] `cordis.patch.yml` 在仓库根
- [x] 真实代码，非占位
- [ ] 仓库创建满 1 天（CI 自动检查，急不得）
- [ ] 仓库加 `dsh-plugin` topic
- [x] `description` 只写功能、没有营销词、没有数字夸大
- [x] PR 只加 1 个条目文件
- [ ] 截图（可选，之后推自己的仓库即可）

## 6. 以后更新条目

改自己的 `data/plugins/SharpWord__dsh-wallpaper-engine.yml` 再提 PR；不要手工改 README（那是生成的）。
换截图只推自己的仓库，不用再来提 PR。
