/**
 * dsh-wallpaper-engine — Client half.
 *
 * Two slot occupants:
 *  - `shell.overlay` hosts a portal into `document.body` that paints the
 *    chosen wallpaper at `z-index: -1`, i.e. behind the app frame. The frame,
 *    sidebar and card surfaces are made translucent through the host theme
 *    tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`), so the
 *    wallpaper shows through the whole window.
 *  - `sidebar.panellist` + `sidebar.workspaces` own the picker: the sidebar
 *    row swaps the session list for the wallpaper surface (follow the active
 *    Wallpaper Engine wallpaper, or pin one from the Workshop library), while
 *    the conversation column stays put.
 *
 * No DOM outside the slot subtree is written: the only global artifacts are one
 * scoped <style> pair in <head> and the portaled backdrop element React owns.
 */
window.__ModuleLoader__.load({
  id: 'dsh-wallpaper-engine',
  factory: (require) => {
    const React = require('react')
    const reactDom = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef } = React
// Layout effect where available: switching the main column back must happen
// before the browser paints, otherwise the panel flashes for a frame.
const useLayoutEffect = React.useLayoutEffect || useEffect

    /** Set by apply(); components read client services through it. */
    let hostCtx = null

    const SETTINGS_KEY = 'dsh-wallpaper-engine:settings'
    const POLL_MS = 12_000

    /** Build stamp: every renderer report carries it, so a stale bundle shows. */
    const BUILD = 'b104'

    /** Defaults. `follow` mirrors Wallpaper Engine out of the box. */
    const DEFAULTS = {
      v: 10,
      enabled: true,
      mode: 'follow',
      monitor: 'Monitor0',
      pinned: null,
      fit: 'auto',
      blur: 0,
      blurMain: 18,
      blurSide: 18,
      blurRight: 18,
      blurBottom: 18,
      scrim: 0.1,
      surface: 52,
      zoom: 100,
      posX: 0,
      posY: 0,
      muted: true,
      paused: false,
      inkMode: 'auto',
      inkColor: '#ffffff',
      inkLevels: 62,
    }

    /**
     * The placement modes, in the order Wallpaper Engine lists them. `auto`
     * keeps the picture whole only when it is far from the screen's shape.
     */
    const FIT_MODES = ['auto', 'cover', 'contain', 'stretch', 'center']

    /** One-click looks: surface opacity, blur, and dim tuned together. */
    const PRESETS = [
      { id: 'frost', labelKey: 'presetFrost', surface: 52, blur: 0, scrim: 0.1 },
      { id: 'clear', labelKey: 'presetClear', surface: 34, blur: 0, scrim: 0.04 },
      { id: 'readable', labelKey: 'presetReadable', surface: 74, blur: 6, scrim: 0.2 },
    ]

    /** What "reset to defaults" writes back: the look knobs only. */
    const LOOK_DEFAULTS = {
      surface: DEFAULTS.surface,
      blur: DEFAULTS.blur,
      scrim: DEFAULTS.scrim,
      fit: DEFAULTS.fit,
      blurMain: DEFAULTS.blurMain,
      blurSide: DEFAULTS.blurSide,
      blurRight: DEFAULTS.blurRight,
      blurBottom: DEFAULTS.blurBottom,
      zoom: DEFAULTS.zoom,
      posX: DEFAULTS.posX,
      posY: DEFAULTS.posY,
      inkMode: DEFAULTS.inkMode,
      inkColor: DEFAULTS.inkColor,
      inkLevels: DEFAULTS.inkLevels,
    }

    // ------------------------------------------------------------------
    // Copy (English + Simplified Chinese; follows the locale service)
    // ------------------------------------------------------------------

    const STRINGS = {
      en: {
        sectionTitle: 'Wallpaper',
        sectionSubtitle: 'Use a Steam Wallpaper Engine wallpaper behind DeepSeek Harness.',
        enable: 'Wallpaper',
        enableHint: 'Show the wallpaper behind the app; panels turn translucent so it stays visible.',
        mode: 'Source',
        modeHint: 'Follow what Wallpaper Engine has active, or pin one wallpaper from the library.',
        modeFollow: 'Follow Wallpaper Engine',
        modePin: 'Pick manually',
        monitor: 'Monitor',
        surface: 'Density',
        surfaceHint: 'How solid panels and glass inputs are; lower shows more wallpaper.',
        preset: 'Look',
        presetFrost: 'Frosted',
        presetClear: 'Clear',
        presetReadable: 'Readable',
        blur: 'Background blur',
        blurHint: 'Blurs the wallpaper itself, edge to edge.',
        blockBlur: 'Per-block blur',
        blockBlurHint: 'Frosted glass per layout block: each column blurs what is behind itself.',
        blurMain: 'Main area',
        blurSide: 'Sidebar',
        blurRight: 'Right rail',
        blurBottom: 'Bottom bar',
        zoom: 'Zoom',
        framingHint: 'Wheel or pinch to zoom, drag to move the picture, double-click to reset.',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        framingZoomFirst: 'Wheel to zoom, then drag to move the picture',
        resetFraming: 'Reset picture',
        sidebarPanel: 'Wallpaper',
        sidebarOnlyHint: 'This panel lives in the sidebar, so the conversation stays in view.',
        openSidebarPanel: 'Open in the sidebar',
        back: 'Back',
        recentEmpty: 'Nothing here yet',
        ink: 'Text colour',
        inkHint: 'The whole window shares one colour; the tiers are that colour at lower opacity.',
        inkAuto: 'Match wallpaper',
        inkCustom: 'Pick',
        inkOff: 'Theme default',
        inkLevels: 'Tier contrast',
        inkRatio: 'Contrast',
        inkFallback: 'too pale here, using the solved colour',
        scrim: 'Dim',
        fit: 'Fit',
        fitAuto: 'Auto',
        fitCover: 'Fill',
        fitContain: 'Fit',
        fitStretch: 'Stretch',
        fitCenter: 'Centre',
        preview: 'Live preview',
        previewHint: 'The real wallpaper, drawn with the same fills, frost and dimming the window gets — drag a slider and watch it.',
        advanced: 'Advanced',
        advancedHint: 'Blur and per-block frosting.',
        reset: 'Reset to defaults',
        fitAutoHint: 'Same shapes as Wallpaper Engine: Fill crops to fill, Fit shows the whole picture, Stretch ignores the aspect, Centre keeps 1:1 pixels. Auto picks Fill unless the picture is far from your screen shape.',
        fitCoverHint: 'Fill the window, cropping the overflow (Wallpaper Engine: Fill).',
        fitContainHint: 'Show the whole picture, edges filled with a blurred copy of it (Wallpaper Engine: Fit).',
        fitStretchHint: 'Fill the window without keeping the aspect — the picture stretches.',
        fitCenterHint: 'Draw at the original pixel size in the middle, blurred copy behind.',
        mute: 'Mute video',
        pause: 'Pause video',
        library: 'Library',
        search: 'Search wallpapers',
        all: 'All',
        scene: 'Scene',
        video: 'Video',
        web: 'Web',
        local: 'Local',
        image: 'Picture',
        folder: 'Folder',
      recent: 'Recent',
        refresh: 'Rescan',
        scanning: 'Scanning…',
        empty: 'No wallpapers match this filter.',
        notInstalled: 'Wallpaper Engine was not found in any Steam library.',
        notInstalledHint: 'That is fine — you do not need it. The folder below is yours: drop pictures or videos in it and rescan.',
        folderTitle: 'Your own wallpaper folder',
        folderHint: 'No Wallpaper Engine needed. Put .jpg / .png / .gif / .webp pictures or .mp4 / .webm videos in this folder, then press Rescan.',
        folderCount: '{count} files in this folder',
        folderEmpty: 'This folder is empty right now.',
        openFolder: 'Open folder',
        copyPath: 'Copy path',
        copied: 'Copied',
        openFolderFailed: 'Could not open Explorer — copy the path and open it yourself.',
        statusFolder: '{count} local wallpapers',
        scanningNow: 'Scanning the Steam libraries…',
        unreachable: 'The wallpaper host API is unreachable.',
        unreachableHint: 'Finish installing the plugin and reload this page, then rescan.',
        statusReady: '{count} wallpapers',
        statusActive: 'Active: {title}',
        statusNoActive: 'Wallpaper Engine has no active wallpaper yet.',
        statusScanned: 'Scanned {time}',
        retry: 'Retry',
        selected: 'Selected',
        activeNow: 'Active in Wallpaper Engine',
        unknown: 'Untitled',
        previewMissing: 'No preview',
        applyFailed: 'Could not load the wallpaper.',
        useIt: 'Use this wallpaper',
        playing: 'Playing live preview',
        stillPreview: 'Scene wallpapers use their preview image',
        loadFailed: 'Could not load the library.',
        disabledNotice: 'The wallpaper layer is off.',
      },
      zh: {
        sectionTitle: '壁纸',
        sectionSubtitle: '把 Steam 壁纸引擎（Wallpaper Engine）的壁纸放到 DeepSeek Harness 背后。',
        enable: '启用壁纸',
        enableHint: '在界面背后显示壁纸；面板会变成半透明，让壁纸透出来。',
        mode: '壁纸来源',
        modeHint: '跟随壁纸引擎当前壁纸，或从壁纸库里固定一张。',
        modeFollow: '跟随壁纸引擎',
        modePin: '手动选择',
        monitor: '显示器',
        surface: '浓度',
        surfaceHint: '面板与输入框玻璃的浓度：越高越实，越低壁纸越明显。',
        preset: '效果',
        presetFrost: '磨砂',
        presetClear: '通透',
        presetReadable: '清晰',
        blur: '背景模糊',
        blurHint: '模糊壁纸本身，整幅生效。',
        blockBlur: '分块模糊',
        blockBlurHint: '按界面分区做磨砂玻璃：每一块只模糊自己背后的壁纸。',
        blurMain: '主区',
        blurSide: '侧栏',
        blurRight: '右栏',
        blurBottom: '底栏',
        zoom: '缩放',
        framingHint: '滚轮或双指缩放整张图，拖动画面移动位置，双击复位。',
        zoomIn: '放大',
        zoomOut: '缩小',
        framingZoomFirst: '先用滚轮或双指放大，再拖动画面',
        resetFraming: '复位画面',
        sidebarPanel: '壁纸',
        sidebarOnlyHint: '这个面板显示在左侧栏，会话界面保持可见。',
        openSidebarPanel: '在侧栏打开',
        back: '返回',
        recentEmpty: '还没有用过壁纸',
        ink: '字体颜色',
        inkHint: '整个窗口共用一个颜色，层级只是它的透明度，不再各块各调一种灰。',
        inkAuto: '跟随壁纸',
        inkCustom: '自定义',
        inkOff: '主题默认',
        inkLevels: '层级对比',
        inkRatio: '对比度',
        inkFallback: '在这里太淡，已改用自动色',
        scrim: '压暗',
        fit: '显示方式',
        fitAuto: '自适应',
        fitCover: '填充',
        fitContain: '适合',
        fitStretch: '拉伸',
        fitCenter: '居中',
        preview: '实时预览',
        previewHint: '真壁纸 + 真实的玻璃填充/磨砂/压暗，拖动滑杆直接看差别。',
        advanced: '高级',
        advancedHint: '模糊、漂移、饱和度与分块磨砂。',
        reset: '恢复默认',
        fitAutoHint: '和壁纸引擎一样的四种摆法：填充裁满、适合整张、拉伸不管比例、居中原始像素。自适应按屏幕形状在填充/适合之间自动选。',
        fitCoverHint: '铺满窗口，超出的部分裁掉（壁纸引擎：填充）。',
        fitContainHint: '完整显示整张图，四周用它自己的模糊副本补满（壁纸引擎：适合）。',
        fitStretchHint: '不管原始比例，直接拉满窗口。',
        fitCenterHint: '按原始像素大小居中，背后垫它的模糊副本。',
        mute: '视频静音',
        pause: '暂停视频',
        library: '壁纸库',
        search: '搜索壁纸',
        all: '全部',
        scene: '场景',
        video: '视频',
        web: '网页',
        local: '本地',
        image: '图片',
        folder: '文件夹',
      recent: '最近',
        refresh: '重新扫描',
        scanning: '扫描中…',
        empty: '没有符合条件的壁纸。',
        notInstalled: '没有在 Steam 库中找到 Wallpaper Engine。',
        notInstalledHint: '没装也没关系，不用装。下面这个文件夹就是给你用的：把图片或视频放进去，点「重新扫描」。',
        folderTitle: '你自己的壁纸文件夹',
        folderHint: '不需要 Wallpaper Engine。把 .jpg / .png / .gif / .webp 图片，或 .mp4 / .webm 视频放进这个文件夹，然后点「重新扫描」。',
        folderCount: '这个文件夹里有 {count} 个文件',
        folderEmpty: '这个文件夹现在还是空的。',
        openFolder: '打开文件夹',
        copyPath: '复制路径',
        copied: '已复制',
        openFolderFailed: '打不开资源管理器，请手动复制路径打开。',
        statusFolder: '本地壁纸 {count} 张',
        scanningNow: '正在扫描 Steam 库…',
        unreachable: '无法连接壁纸主机接口。',
        unreachableHint: '确认插件已经安装完成，刷新页面后重试。',
        statusReady: '共 {count} 张壁纸',
        statusActive: '当前：{title}',
        statusNoActive: '壁纸引擎还没有设置当前壁纸。',
        statusScanned: '扫描于 {time}',
        retry: '重试',
        selected: '已选择',
        activeNow: '壁纸引擎当前使用',
        unknown: '未命名',
        previewMissing: '没有预览图',
        applyFailed: '无法加载壁纸。',
        useIt: '使用这张壁纸',
        playing: '正在播放动态预览',
        stillPreview: '场景壁纸使用其预览图',
        loadFailed: '无法加载壁纸库。',
        disabledNotice: '壁纸层已关闭。',
      },
    }

    /**
     * Resolve the layout service without a hard dependency. `hostCtx.layout`
     * throws ("cannot get property ... without inject") because this plugin only
     * injects `slots`, so always go through `get()`.
     */
    function layoutService() {
      try {
        return hostCtx && typeof hostCtx.get === 'function' ? hostCtx.get('layout') : undefined
      } catch {
        return undefined
      }
    }

    /** Resolve the locale id without assuming a snapshot shape. */
    function localeId() {
      try {
        const service = hostCtx && hostCtx.get ? hostCtx.get('locale') : undefined
        const snapshot =
          service && typeof service.getSnapshot === 'function'
            ? service.getSnapshot()
            : service && typeof service.getLocale === 'function'
              ? service.getLocale()
              : undefined
        if (typeof snapshot === 'string' && snapshot !== '') return snapshot
        if (snapshot && typeof snapshot === 'object') {
          const candidate = snapshot.id || snapshot.locale || snapshot.language || snapshot.current
          if (typeof candidate === 'string' && candidate !== '') return candidate
        }
      } catch {
        /* fall through to the browser hint */
      }
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language) {
          return navigator.language
        }
      } catch {
        /* ignore */
      }
      return 'en'
    }

    /** The copy dictionary for the current locale. */
    function dict() {
      return String(localeId()).toLowerCase().startsWith('zh') ? STRINGS.zh : STRINGS.en
    }

    /** Translate one key for the current locale. */
    function t(key) {
      const table = dict()
      const value = table[key]
      return typeof value === 'string' ? value : key
    }

    /** Fill `{name}` placeholders. */
    function fmt(template, vars) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => {
        const value = vars && Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : undefined
        return value === undefined ? match : String(value)
      })
    }

    /** Re-render subscribers of the locale service. */
    function useLocaleVersion() {
      const [, setVersion] = useState(0)
      useEffect(() => {
        const service = hostCtx && hostCtx.get ? hostCtx.get('locale') : undefined
        if (!service || typeof service.subscribe !== 'function') return undefined
        let dispose
        try {
          dispose = service.subscribe(() => setVersion((n) => n + 1))
        } catch {
          dispose = undefined
        }
        return () => {
          if (typeof dispose === 'function') {
            try {
              dispose()
            } catch {
              /* ignore */
            }
          }
        }
      }, [])
      return dict()
    }

    // ------------------------------------------------------------------
    // Settings store
    // ------------------------------------------------------------------

    const listeners = new Set()

    /** Notify every mounted subscriber. */
    function emit() {
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          /* one broken subscriber must not stop the rest */
        }
      }
    }

    /** Subscribe to settings/data changes. */
    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    /** Re-render on every store change. */
    function useStoreVersion() {
      const [, setVersion] = useState(0)
      useEffect(() => subscribe(() => setVersion(n => n + 1)), [])
    }

    // ---------------------------------------------------------------- sidebar
    // The wallpaper panel lives in the sidebar column: while it is open it takes
    // over the list region (the shipped browser registers at priority 0, so this
    // one outranks it), and closing it disposes the registration so the session
    // list comes straight back — nothing of the shipped sidebar is rewritten.
    const SIDEBAR_PANEL_ID = 'wallpaper-engine-sidebar'
    let sidebarSlotHost = null
    let sidebarOpen = false
    let sidebarRegistration = null
    let lastSlotError = ''

    /** Register or drop the sidebar occupant to match `sidebarOpen`. */
    function syncSidebarSlot() {
      if (!sidebarSlotHost) return
      if (sidebarOpen && !sidebarRegistration) {
        sidebarRegistration = registerSlot(
          () =>
            sidebarSlotHost.register(
              { name: 'sidebar.workspaces', id: SIDEBAR_PANEL_ID, order: 0, priority: -10 },
              SidebarWallpaperPanel,
            ),
          'sidebar.workspaces',
        )
        return
      }
      if (!sidebarOpen && sidebarRegistration) {
        const drop = sidebarRegistration
        sidebarRegistration = null
        try {
          drop()
        } catch {
          /* the entry may already be gone with the plugin fiber */
        }
      }
    }

    /** Open/close the sidebar panel and keep the slot registration in step. */
    function setSidebarOpen(next) {
      const wanted = Boolean(next)
      if (wanted === sidebarOpen) return
      sidebarOpen = wanted
      syncSidebarSlot()
      emit()
    }

    /** Read persisted settings, staying on defaults for bad values. */
    function loadSettings() {
      let stored = null
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (raw) stored = JSON.parse(raw)
      } catch {
        stored = null
      }
      const next = { ...DEFAULTS }
      if (stored && typeof stored === 'object') {
        // A stored sheet from an older build keeps only what the user chose on
        // purpose; the surface look resets so a new default is actually seen.
        const sameSheet = stored.v === DEFAULTS.v
        for (const key of Object.keys(DEFAULTS)) {
          if (!Object.prototype.hasOwnProperty.call(stored, key)) continue
          if (!sameSheet && (key === 'surface' || key === 'blur' || key === 'scrim' || key === 'fit' ||
            key === 'blurMain' || key === 'blurSide' || key === 'blurRight' || key === 'blurBottom')) continue
          next[key] = stored[key]
        }
      }
      if (next.mode !== 'follow' && next.mode !== 'pin') next.mode = DEFAULTS.mode
      if (FIT_MODES.indexOf(next.fit) < 0) next.fit = DEFAULTS.fit
      next.surface = clamp(Number(next.surface), 20, 100, DEFAULTS.surface)
      next.blur = clamp(Number(next.blur), 0, 32, DEFAULTS.blur)
      next.blurMain = clamp(Number(next.blurMain), 0, 32, DEFAULTS.blurMain)
      next.blurSide = clamp(Number(next.blurSide), 0, 32, DEFAULTS.blurSide)
      next.blurRight = clamp(Number(next.blurRight), 0, 32, DEFAULTS.blurRight)
      next.blurBottom = clamp(Number(next.blurBottom), 0, 32, DEFAULTS.blurBottom)
      next.scrim = clamp(Number(next.scrim), 0, 0.75, DEFAULTS.scrim)
      next.zoom = clamp(Number(next.zoom), 100, 300, DEFAULTS.zoom)
      next.posX = clamp(Number(next.posX), -50, 50, DEFAULTS.posX)
      next.posY = clamp(Number(next.posY), -50, 50, DEFAULTS.posY)
      next.enabled = next.enabled !== false
      next.muted = next.muted !== false
      next.paused = next.paused === true
      next.pinned = next.pinned && typeof next.pinned === 'object' && typeof next.pinned.playFile === 'string' ? next.pinned : null
      if (next.inkMode !== 'auto' && next.inkMode !== 'custom' && next.inkMode !== 'off') next.inkMode = DEFAULTS.inkMode
      if (!/^#[0-9a-fA-F]{6}$/.test(String(next.inkColor))) next.inkColor = DEFAULTS.inkColor
      next.inkLevels = clamp(Number(next.inkLevels), 0, 100, DEFAULTS.inkLevels)
      return next
    }

    /** Clamp a number, falling back when it is not finite. */
    function clamp(value, min, max, fallback) {
      if (!Number.isFinite(value)) return fallback
      return Math.min(max, Math.max(min, value))
    }

    let settings = loadSettings()

    /** Merge one patch into settings, persist, and repaint. */
    function updateSettings(patch) {
      settings = { ...settings, ...patch }
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* private mode: the session keeps the value in memory */
      }
      paintTheme()
      emit()
    }

    /**
     * Repaint from a temporary value WITHOUT persisting it.
     *
     * The self test toggles the switch and measures the pixels; it must be able
     * to put the old value back even if the page reloads mid-test, so those
     * probes never touch localStorage.
     */
    function previewSettings(patch) {
      settings = { ...settings, ...patch }
      paintTheme()
      emit()
    }

    // ------------------------------------------------------------------
    // Usage memory: which wallpapers were used, how often, and when.
    // The library is sorted "last used first, then most used", so a big
    // collection stays findable without searching.
    //
    // A *use* is a switch, not a paint: reloading the page while the same
    // wallpaper is showing must not count again, otherwise the counter would
    // measure reloads instead of choices.
    // ------------------------------------------------------------------

    const USAGE_KEY = 'dsh-wallpaper-engine:usage'
    const USAGE_LAST_KEY = 'dsh-wallpaper-engine:usage-last'
    const USAGE_SCHEMA = 1
    const PICK_DEDUPE_MS = 10000
    const DISPLAY_DEDUPE_MS = 6 * 60 * 60 * 1000

    function readUsage() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(USAGE_KEY) || 'null')
        if (!parsed || typeof parsed !== 'object' || parsed.schema !== USAGE_SCHEMA) return {}
        const clean = {}
        for (const [id, value] of Object.entries(parsed.items || {})) {
          if (!value || typeof value !== 'object') continue
          clean[id] = { count: Math.max(0, Math.round(Number(value.count) || 0)), last: Number(value.last) || 0 }
        }
        return clean
      } catch {
        return {}
      }
    }

    let usage = readUsage()

    let usageLast = (() => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(USAGE_LAST_KEY) || 'null')
        if (!parsed || typeof parsed !== 'object') return { id: '', at: 0 }
        return { id: String(parsed.id || ''), at: Number(parsed.at) || 0 }
      } catch {
        return { id: '', at: 0 }
      }
    })()

    /** Bumped whenever `usage` changes so memos that read it recompute. */
    let usageVersion = 0

    /** Counts for one wallpaper, or a zeroed record. */
    function usageOf(id) {
      return usage[id] || { count: 0, last: 0 }
    }

    function persistUsage() {
      try {
        window.localStorage.setItem(USAGE_KEY, JSON.stringify({ schema: USAGE_SCHEMA, items: usage }))
        window.localStorage.setItem(USAGE_LAST_KEY, JSON.stringify(usageLast))
      } catch (error) {
        noteError('usage-save', error)
      }
    }

    /**
     * Remember that a wallpaper was used. `reason` is `pick` for a click in the
     * library and `display` for whatever the backdrop actually painted (follow
     * mode changes the wallpaper without any click).
     */
    function recordUse(item, reason) {
      if (!item || !item.id) return
      const now = Date.now()
      const dedupe = reason === 'pick' ? PICK_DEDUPE_MS : DISPLAY_DEDUPE_MS
      if (usageLast.id === item.id && now - usageLast.at < dedupe) {
        usageLast = { id: item.id, at: now }
        persistUsage()
        return
      }
      const previous = usageOf(item.id)
      usage[item.id] = { count: previous.count + 1, last: now }
      usageLast = { id: item.id, at: now }
      persistUsage()
      usageVersion += 1
      emit()
    }

    /**
     * Sort a library list the way it is asked for: the wallpaper used last comes
     * first, then the ones used most often; untouched ones follow in their
     * natural (title) order.
     */
    function sortByUsage(items) {
      let lastId = ''
      let lastAt = 0
      for (const item of items) {
        const entry = usageOf(item.id)
        if (entry.last > lastAt) {
          lastAt = entry.last
          lastId = item.id
        }
      }
      return items.slice().sort((left, right) => {
        if (left.id === lastId) return -1
        if (right.id === lastId) return 1
        const a = usageOf(left.id)
        const b = usageOf(right.id)
        if (b.count !== a.count) return b.count - a.count
        if (b.last !== a.last) return b.last - a.last
        return String(left.title || '').localeCompare(String(right.title || ''))
      })
    }

    // ------------------------------------------------------------------
    // Host API
    // ------------------------------------------------------------------

    /** Resolve the API base relative to the page base (desktop `dsh-app://`). */
    function apiBase() {
      let href = ''
      try {
        href = String(document.baseURI || window.location.href)
      } catch {
        href = ''
      }
      const clean = href.split('#')[0].split('?')[0]
      const slash = clean.lastIndexOf('/')
      if (slash < 0) return '/'
      return clean.slice(0, slash + 1)
    }

    /** One JSON-RPC call against the Host half. */
    async function callHost(method, body) {
      const url = `${apiBase()}wallpaper-engine/api/${method}`
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
          // A Host that stops answering must not freeze the caller forever
          // (the self test runs inside a single await chain).
          signal: AbortSignal.timeout(6000),
        })
      } catch (error) {
        const failure = new Error((error && error.message) || 'network error')
        failure.code = 'network'
        throw failure
      }
      let payload
      try {
        payload = await response.json()
      } catch {
        const failure = new Error(`host answered HTTP ${response.status} with no JSON body`)
        failure.code = `http-${response.status}`
        throw failure
      }
      if (!payload || payload.ok !== true) {
        const info = (payload && payload.error) || {}
        const failure = new Error(info.message || `HTTP ${response.status}`)
        failure.code = info.code || `http-${response.status}`
        throw failure
      }
      return payload.value
    }

    /** Page-relative media URL for one absolute host path. */
    function mediaUrl(file) {
      if (typeof file !== 'string' || file === '') return ''
      return `${apiBase()}wallpaper-engine/api/media?p=${encodeURIComponent(file)}`
    }

    // ------------------------------------------------------------------
    // Renderer self-report: the Host owns a real process and cannot inspect
    // the page, so the page describes itself to the Host instead.
    // ------------------------------------------------------------------

    const pageErrors = []

    /** Remember one uncaught page error for the next report. */
    function noteError(kind, detail) {
      const text = String((detail && (detail.message || detail.reason)) || detail || '').slice(0, 200)
      pageErrors.push(`${kind}: ${text}`)
      if (pageErrors.length > 6) pageErrors.shift()
    }

    /** One computed background colour, or a marker when the node is absent. */
    function computedBackground(selector) {
      try {
        const element = document.querySelector(selector)
        return element ? getComputedStyle(element).backgroundColor : 'missing'
      } catch {
        return 'error'
      }
    }

    /** One computed property, for the diagnostics report. */
    function computedValue(selector, property) {
      try {
        const element = document.querySelector(selector)
        if (!element) return 'missing'
        return String(getComputedStyle(element).getPropertyValue(property) || 'none')
      } catch {
        return 'error'
      }
    }

    /** One computed property of a pseudo-element (`::before`) of a selector. */
    function computedPseudo(selector, pseudo, property) {
      try {
        const element = document.querySelector(selector)
        if (!element) return 'missing'
        return String(getComputedStyle(element, pseudo).getPropertyValue(property) || 'none')
      } catch {
        return 'error'
      }
    }

    /** Describe the backdrop layer and its media element as they exist now. */
    function describeLayer() {
      let layer = null
      try {
        layer = document.querySelector('.dsh-we-backdrop')
      } catch {
        return { backdrop: 'error' }
      }
      if (!layer) return { backdrop: 'absent' }
      const media = layer.querySelector('.dsh-we-backdrop-media')
      const out = {
        backdrop: 'present',
        mediaTag: media ? media.tagName.toLowerCase() : 'none',
        layerZ: getComputedStyle(layer).zIndex,
        layerOpacity: getComputedStyle(layer).opacity,
      }
      if (media) {
        out.src = String(media.getAttribute('src') || '').slice(-90)
        out.complete = Boolean(media.complete)
        out.naturalWidth = Number(media.naturalWidth || 0)
        out.videoWidth = Number(media.videoWidth || 0)
        out.readyState = Number(media.readyState || 0)
        out.error = media.error ? Number(media.error.code || 0) : 0
      }
      return out
    }

    let lastReport = ''
    let lastReportAt = 0


    /** POST one renderer snapshot so the Host can show what the page sees. */
    async function reportRenderer(tag) {
      const item = currentItem()
      const payload = {
        tag,
        build: BUILD,
        href: String(location.href || '').slice(0, 140),
        base: apiBase(),
        enabled: Boolean(settings.enabled),
        mode: String(settings.mode),
        monitor: String(settings.monitor),
        surface: Number(settings.surface),
        stateReady: Boolean(data.state),
        stateError: String(data.error || ''),
        monitors: data.state && data.state.monitors ? data.state.monitors.length : 0,
        item: item ? String(item.id) : '',
        kind: item ? String(item.kind) : '',
        playFile: item ? String(item.playFile).slice(-90) : '',
        playKind: item ? String(item.playKind) : '',
        mediaUrl: item ? mediaUrl(item.playFile).slice(-150) : '',
        styleBase: styleRefs.base ? styleRefs.base.textContent.length : -1,
        stylePaint: styleRefs.paint ? styleRefs.paint.textContent.length : -1,
        luminance: wallpaperLuminance === null ? -1 : wallpaperLuminance,
        fit: reportFit.mode,
        fitSetting: reportFit.setting,
        fitBackdrop: reportFit.backdrop,
        slotError: lastSlotError,
        selftestStep: selfTestStep,
        usageTop: Object.entries(usage)
          .sort((a, b) => b[1].last - a[1].last || b[1].count - a[1].count)
          .slice(0, 3)
          .map(([id, entry]) => `${id}:${entry.count}`)
          .join(' '),
        usageCount: Object.keys(usage).length,
        mediaAspect: reportFit.aspect === null ? -1 : reportFit.aspect,
        zoom: reportFit.zoom,
        posX: reportFit.posX,
        posY: reportFit.posY,
        previewCard: (() => {
          try {
            const card = document.querySelector('[data-dsh-preview="true"]')
            if (!card) return 'none'
            const image = card.querySelector('.dsh-we-preview-media')
            const side = card.querySelector('.dsh-we-preview-side')
            const box = card.querySelector('.dsh-we-preview')
            return [
              image ? (image.getAttribute('src') ? 'img' : 'blank') : 'missing',
              side ? getComputedStyle(side).backgroundColor : 'noside',
              box ? box.getAttribute('data-fit') : 'nobox',
            ].join('/')
          } catch {
            return 'error'
          }
        })(),
        scrimLight: Number(scrimAlpha('light').toFixed(3)),
        scrimDark: Number(scrimAlpha('dark').toFixed(3)),
        blocks: JSON.stringify(blockBlur()),
        verifyPoll: pingTimer === null ? 'off' : 'on',
        winTitlebar: document.documentElement.getAttribute('data-windows-titlebar') === null ? 'null' : 'set',
        centerRadius: computedValue('[class*="centerCol"]', 'border-top-left-radius'),
        centerFilter: computedPseudo('[class*="centerCol"]', '::before', 'backdrop-filter'),
        sideFilter: computedPseudo('[class*="sidebarCol"]', '::before', 'backdrop-filter'),
        flag: computedFlag(),
        bodyBg: computedBackground('body'),
        frameBg: computedBackground('#root > *'),
        sidebarBg: computedBackground('[class*="sidebarCol"]'),
        centerBg: computedBackground('[class*="centerCol"]'),
        glassToken: computedValue('body', '--dsw-specific-input-major'),
        inputBg: computedBackground('[data-composer-seat] [class*="_card"]'),
        inputFilter: computedPseudo('[data-composer-card]', '::before', 'backdrop-filter'),
        pillBg: computedBackground('[data-composer-stat] > :is(button, span)'),
        pillColor: computedValue('[data-composer-stat] > :is(button, span)', 'color'),
        pillCount: (() => {
          try {
            const all = document.querySelectorAll('[data-composer-stat]').length
            const hit = document.querySelectorAll('[data-composer-stat] > :is(button, span)').length
            return `${all}/${hit}`
          } catch {
            return 'error'
          }
        })(),
        badgeDisplay: computedValue('[class*="_previewBadge"]', 'display'),
        inkLight: JSON.stringify(inkFor(effectiveLuminance('light', surfaces().layer1), 'light')),
        inkChrome: JSON.stringify(inkFor(effectiveLuminance('light', surfaces().sidebar), 'light')),
        inkDarkTheme: JSON.stringify(inkFor(effectiveLuminance('dark', surfaces().layer1), 'dark')),
        bodyInk: computedValue('body', '--dsw-alias-label-primary'),
        pillInk: computedValue('[data-composer-stat] > :is(button, span)', '--dsw-alias-label-primary'),
        diffBg: computedBackground('[data-changed-files]'),
        diffFilter: computedValue('[data-changed-files]', 'backdrop-filter'),
        codeToken: computedValue('body', '--dsw-alias-markdown-code-block'),
        bubbleToken: computedValue('body', '--dsw-specific-bubble'),
        moduleToken: computedValue('body', '--dsw-alias-bg-module-platform'),
        inlineToken: computedValue('body', '--dsw-alias-markdown-inline-code'),
        inlineBg: computedBackground('code'),
        menuBg: computedBackground('[class*="_menu"]'),
        dialogFilter: computedValue('[role="dialog"]', 'backdrop-filter'),
        panelBg: computedBackground('[class*="_overlay"] [class*="_panel"]'),
        panelFilter: computedValue('[class*="_overlay"] [class*="_panel"]', 'backdrop-filter'),
        panelInk: computedValue('[class*="_overlay"] [class*="_panel"]', '--dsw-alias-label-primary'),
        errors: pageErrors.join(' | ').slice(0, 400),
        wide: widePainters().join(' | ').slice(0, 460),
        selfTest: selfTestResult ? JSON.stringify(selfTestResult).slice(0, 6000) : '',
      }
      Object.assign(payload, describeLayer())
      const signature = JSON.stringify(payload)
      if (tag !== 'heartbeat' && signature === lastReport) return
      lastReport = signature
      lastReportAt = Date.now()
      try {
        await callHost('report', payload)
      } catch {
        /* diagnostics are best effort */
      }
    }

    /**
     * Enumerate everything that paints a fill wide enough to read as a film
     * across the window. Naming the element beats guessing which token the app
     * painted with — the wallpaper layer is below all of them, so anything on
     * this list with a light background is what makes a wallpaper look milky.
     */
    function widePainters() {
      try {
        const area = window.innerWidth * window.innerHeight
        if (!area || !document.body) return []
        const out = []
        const push = (label, element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const areaPercent = Math.round(((rect.width * rect.height) / area) * 100)
          if (areaPercent < 20) return
          const image = style.backgroundImage || 'none'
          const filter = style.backdropFilter || 'none'
          out.push(
            `${label} ${areaPercent}% bg=${style.backgroundColor}` +
              `${image !== 'none' ? ' img=' + image.slice(0, 28) : ''}` +
              `${filter !== 'none' && filter ? ' bf=' + filter.slice(0, 20) : ''} ` +
              `z=${style.zIndex} op=${style.opacity} pos=${style.position} blend=${style.mixBlendMode}`,
          )
        }
        push('html', document.documentElement)
        push('body', document.body)
        for (const element of document.body.querySelectorAll('*')) {
          const rect = element.getBoundingClientRect()
          if (rect.width * rect.height < area * 0.45) continue
          const className = typeof element.className === 'string' ? element.className.slice(0, 30) : ''
          push(`${element.tagName.toLowerCase()}${className ? '.' + className.replace(/\s+/g, '.') : ''}`, element)
          if (out.length >= 16) break
        }
        return out
      } catch {
        return ['error']
      }
    }

    /** The html flag that switches the translucency rules on. */
    function computedFlag() {
      try {
        const value = document.documentElement.getAttribute('data-dsh-wallpaper')
        return value === null ? 'null' : String(value)
      } catch {
        return 'error'
      }
    }

    // ------------------------------------------------------------------
    // In-page self test
    //
    // The Host owns a real process but cannot drive the UI, and the desktop
    // window exposes no accessibility tree to an outside automation tool. So
    // the page tests itself on request: real DOM clicks, real computed styles,
    // real HTTP calls, and a JSON verdict posted back to the Host.
    // ------------------------------------------------------------------

    let lastVerifyToken = ''
    let selfTestBusy = false
    let selfTestRunning = false
    let selfTestStartedAt = 0
    let selfTestProgress = []
    let selfTestResult = null
    let selfTestStep = ''
    let pingTimer = null

    /** Resolve after `ms`, so a UI transition has time to settle. */
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    /**
     * Poll `predicate` until it holds. Fixed sleeps make the self test flaky on a
     * busy main thread: the click is handled, React re-renders a tick later, and
     * a 260 ms guess sometimes looks at the old DOM.
     */
    async function until(predicate, timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 1600)
      while (Date.now() < deadline) {
        if (predicate()) return true
        await wait(60)
      }
      return Boolean(predicate())
    }

    /** Alpha channel of a computed colour (`color(srgb … / a)` or `rgba()`). */
    function alphaOf(color) {
      const text = String(color || '')
      const slash = text.match(/\/\s*([\d.]+)\s*\)/)
      if (slash) return Number(slash[1])
      const rgba = text.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/)
      if (rgba) return Number(rgba[1])
      return text.startsWith('rgb(') || text.startsWith('color(') ? 1 : 0
    }

    /** Geometry, visibility and hit-test for one selector. */
    function probe(selector) {
      try {
        const element = document.querySelector(selector)
        if (!element) return { found: false }
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const cx = Math.round(rect.left + rect.width / 2)
        const cy = Math.round(rect.top + rect.height / 2)
        let hit = false
        if (rect.width > 0 && rect.height > 0 && cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
          const top = document.elementFromPoint(cx, cy)
          hit = Boolean(top && (top === element || element.contains(top) || (top.closest && top.closest(selector) === element)))
        }
        return {
          found: true,
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          inView: rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05,
          hit,
        }
      } catch (error) {
        return { found: false, error: String((error && error.message) || error) }
      }
    }

    /** The sidebar is collapsed when the layout frame carries the marker. */
    function sidebarCollapsed() {
      try {
        return Boolean(document.querySelector('[data-sidebar-collapsed="true"]'))
      } catch {
        return false
      }
    }

    /**
     * Collapse and reopen the sidebar with the app's own button.
     *
     * This is the regression the user hit: a `backdrop-filter` on the sidebar
     * column turns it into a containing block for fixed children, the collapse
     * toggle is `position: fixed`, and once clipped by the collapsing column it
     * could never be clicked again. The test asserts the button stays inside the
     * viewport and is the topmost element at its own centre while collapsed.
     */
    async function testSidebar() {
      const out = []
      const add = (name, ok, detail) => out.push({ name, ok: Boolean(ok), detail: String(detail ?? '').slice(0, 160) })
      const column = document.querySelector('[class*="sidebarCol"]')
      if (!column) {
        add('sidebar.toggle', false, 'no sidebar column')
        return out
      }
      // Root cause guard: the column itself must not create a containing block.
      add(
        'sidebar.noContainingBlock',
        getComputedStyle(column).backdropFilter === 'none' && getComputedStyle(column).filter === 'none',
        `filter=${getComputedStyle(column).backdropFilter}`,
      )
      const startCollapsed = sidebarCollapsed()
      let button = document.querySelector('[class*="_toggle"]')
      if (!button) {
        add('sidebar.toggle', false, 'toggle button not found')
        return out
      }
      // Normalise to expanded without assuming the start state.
      if (startCollapsed) {
        button.click()
        await wait(450)
        button = document.querySelector('[class*="_toggle"]')
      }
      add('sidebar.expand', !sidebarCollapsed(), 'starting state normalised to expanded')

      button = document.querySelector('[class*="_toggle"]')
      if (!button) {
        add('sidebar.collapse', false, 'toggle vanished while expanded')
        return out
      }
      button.click()
      await wait(520)
      const collapsed = sidebarCollapsed()
      add('sidebar.collapse', collapsed, `collapsed=${collapsed}`)

      const shape = probe('[class*="_toggle"]')
      // With a modal open (settings, market, …) the overlay legitimately sits on
      // top of the toggle, so the hit test cannot be judged — treat that as a
      // skip rather than a failure, but say so in the detail.
      let covered = ''
      let hitInfo = 'none'
      try {
        const node = document.elementFromPoint(shape.left + shape.w / 2, shape.top + shape.h / 2)
        if (node) {
          const name = typeof node.className === 'string' ? node.className : ''
          hitInfo = `${node.tagName.toLowerCase()}${name ? '.' + name.split(/\s+/).slice(0, 2).join('.') : ''}`
          if (node.closest('[role="dialog"]')) covered = 'dialog'
          else if (/_overlay|_mask/i.test(name)) covered = 'overlay'
          else if (node === button || button.contains(node) || node.contains(button)) covered = 'self'
        }
      } catch {
        covered = ''
      }
      add(
        'sidebar.toggleReachable',
        shape.found && shape.visible && shape.inView && (shape.hit || covered !== ''),
        JSON.stringify({ w: shape.w, h: shape.h, left: shape.left, top: shape.top, inView: shape.inView, hit: shape.hit, covered, hitInfo }),
      )

      const again = document.querySelector('[class*="_toggle"]')
      if (again) {
        again.click()
        await wait(520)
      }
      let reopened = !sidebarCollapsed()
      if (!reopened) {
        // Second attempt: the app may need a beat after the transition.
        const retry = document.querySelector('[class*="_toggle"]')
        if (retry) {
          retry.click()
          await wait(520)
          reopened = !sidebarCollapsed()
        }
      }
      add('sidebar.reopen', reopened, `collapsed=${sidebarCollapsed()}`)
      if (startCollapsed && !sidebarCollapsed()) {
        const restore = document.querySelector('[class*="_toggle"]')
        if (restore) {
          restore.click()
          await wait(450)
        }
      }
      return out
    }

    /** Exercise the plugin end to end and remember the verdict. */
    async function runSelfTest(token) {
      // One run at a time: two overlapping runs fight over `settings` (one turns
      // the layer off while the other asserts the translucent styles) and both
      // results land in the same slot.
      if (selfTestRunning) return null
      selfTestRunning = true
      try {
        return await runSelfTestOnce(token)
      } finally {
        selfTestRunning = false
      }
    }

    async function runSelfTestOnce(token) {
      const results = []
      selfTestProgress = results
      const add = (name, ok, detail) => {
        selfTestStep = name
        results.push({ name, ok: Boolean(ok), detail: String(detail ?? '').slice(0, 160) })
        reportRenderer('progress')
      }
      const snapshot = { ...settings }
      try {
        // Host half reachable and aware of Wallpaper Engine.
        try {
          const value = await callHost('state')
          add('host.state', Boolean(value && value.installed) && Number(value.counts && value.counts.all) > 0,
            `installed=${value && value.installed} items=${value && value.counts && value.counts.all}`)
          add('host.mount', Boolean(value && value.mount && value.mount.mode !== 'none'), JSON.stringify(value && value.mount))
        } catch (error) {
          add('host.state', false, (error && error.message) || 'state failed')
        }
        try {
          const value = await callHost('library')
          add('host.library', Boolean(value && value.items && value.items.length > 20), `items=${value && value.items && value.items.length}`)
        } catch (error) {
          add('host.library', false, (error && error.message) || 'library failed')
        }

        // Backdrop layer and its media element.
        const layer = probe('.dsh-we-backdrop')
        add('renderer.backdrop', layer.found && layer.w > 100 && layer.h > 100, JSON.stringify({ w: layer.w, h: layer.h }))
        const media = document.querySelector('.dsh-we-backdrop-media')
        const mediaOk = media
          ? media.tagName === 'VIDEO'
            ? Number(media.readyState) > 0
            : Boolean(media.complete) && Number(media.naturalWidth) > 0
          : false
        add('renderer.media', mediaOk, media ? `${media.tagName} ready=${media.readyState}` : 'no media element')

        // Translucency, ink and layout rules.
        const bodyBg = getComputedStyle(document.body).backgroundColor
        add('theme.translucent', alphaOf(bodyBg) < 0.92, bodyBg)
        // The window shell has no fill of its own any more: the constant frame
        // fill was the white film a light theme showed over the wallpaper.
        add('shell.clear', alphaOf(bodyBg) < 0.06, `body ${bodyBg}`)
        // …and nothing wide may paint over it either. The app fills its
        // outermost `_frame` element with the sidebar token, so a translucent
        // sidebar fill veiled the entire window: the wallpaper looked milky in
        // this build and crisp in the preview card, which paints no frame.
        try {
          const viewport = window.innerWidth * window.innerHeight
          let widest = null
          for (const element of document.body.querySelectorAll('*')) {
            const rect = element.getBoundingClientRect()
            const area = rect.width * rect.height
            if (area < viewport * 0.9) continue
            if (!widest || area > widest.area) widest = { element, area }
          }
          const framePaint = widest ? getComputedStyle(widest.element).backgroundColor : 'none'
          add(
            'shell.frame',
            !widest || alphaOf(framePaint) < 0.06,
            widest ? `${widest.element.tagName.toLowerCase()} ${framePaint}` : 'no wide element',
          )
        } catch (error) {
          add('shell.frame', false, (error && error.message) || 'frame check failed')
        }
        const ink = inkFor(effectiveLuminance('light', surfaces().layer1), 'light')
        add('theme.ink', Number(ink.contrast) >= 4.4, JSON.stringify(ink))

        // The three surfaces the one ink colour has to survive.
        const inkScopes = [
          ['content', surfaces().content],
          ['sidebar', surfaces().sidebar],
          ['glass', surfaces().glass],
        ]

        // One colour, five scopes: the whole triad must match everywhere, or the
        // window still shows several greys at once — the bug this replaced.
        try {
          const triads = inkScopes.map(([name, alpha]) => {
            const row = inkFor(effectiveLuminance('light', alpha), 'light')
            return `${name}:${row.primary}|${row.secondary}|${row.tertiary}`
          })
          const distinct = new Set(triads.map((row) => row.split(':')[1]))
          add('ink.unified', distinct.size === 1, `scopes=${distinct.size} ${triads.join(' ')}`)
        } catch (error) {
          add('ink.unified', false, (error && error.message) || 'ink scopes failed')
        }

        // The tier knob must widen the gap (higher = more difference) and must
        // not persist: preview-only writes, restored right after.
        try {
          const inkSnapshot = { inkMode: settings.inkMode, inkColor: settings.inkColor, inkLevels: settings.inkLevels }
          const theme = 'light'
          const background = () => effectiveLuminance(theme, surfaces().layer1)
          previewSettings({ inkLevels: 0 })
          const flat = inkFor(background(), theme)
          previewSettings({ inkLevels: 100 })
          const deep = inkFor(background(), theme)
          const alphaOfInk = (paint) => {
            const match = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(String(paint))
            return match ? Number(match[1]) : 1
          }
          const flatGap = 1 - alphaOfInk(flat.tertiary)
          const deepGap = 1 - alphaOfInk(deep.tertiary)
          add('ink.levels', flatGap < 0.05 && deepGap > flatGap + 0.12,
            `flat=${flatGap.toFixed(2)} deep=${deepGap.toFixed(2)} ${deep.tertiary}`)
          // A picked colour really is used, verbatim as the primary.
          previewSettings({ inkMode: 'custom', inkColor: '#0b0d11' })
          const picked = inkFor(background(), theme)
          add('ink.custom', picked.primary === '#0b0d11' && picked.ladder === 'dark',
            `${picked.primary} ladder=${picked.ladder}`)
          // …but a pick the theme cannot carry gives way to the solved extreme,
          // and says so: white text on a light theme's glass is invisible.
          previewSettings({ inkMode: 'custom', inkColor: '#ffffff' })
          const weak = inkFor(background(), theme)
          add('ink.fallback', weak.base !== '#ffffff' && weak.fellBack === true && weak.contrast >= 4.4,
            `picked=#ffffff used=${weak.base} contrast=${weak.contrast} fellBack=${weak.fellBack}`)
          previewSettings(inkSnapshot)
        } catch (error) {
          add('ink.levels', false, (error && error.message) || 'ink levels failed')
          add('ink.custom', false, (error && error.message) || 'ink custom failed')
          add('ink.fallback', false, (error && error.message) || 'ink fallback failed')
        }

        // `off` must hand the label tokens back to the theme: no override in the
        // generated sheet at all, not an override that happens to look the same.
        try {
          const snapshot = { inkMode: settings.inkMode }
          previewSettings({ inkMode: 'off' })
          const offSheet = styleRefs.paint ? styleRefs.paint.textContent : ''
          previewSettings(snapshot)
          const stillThere = /--dsw-alias-label-primary/.test(offSheet)
          add('ink.off', !stillThere, `labelRules=${stillThere}`)
        } catch (error) {
          add('ink.off', false, (error && error.message) || 'ink off failed')
        }

        // Every scope the solved colour paints must clear the WCAG floor — or,
        // where the wallpaper sits right at the readability crossover, at least
        // be the better of the two extremes (nothing more is possible there).
        try {
          const theme = 'light'
          const rows = inkScopes.map(([name, alpha]) => {
            const background = effectiveLuminance(theme, alpha)
            const auto = inkFor(background, theme)
            const other = auto.base === INK_BASE.dark ? INK_BASE.light : INK_BASE.dark
            const otherRatio = contrastOf(luminanceOf(other), background)
            return { name, ratio: auto.contrast, otherRatio }
          })
          const ok = rows.every((row) => row.ratio >= 4.4 || row.ratio >= row.otherRatio)
          add(
            'ink.contrastFloor',
            ok,
            rows.map((row) => `${row.name}=${row.ratio.toFixed(2)}`).join(' '),
          )
        } catch (error) {
          add('ink.contrastFloor', false, (error && error.message) || 'ink floor failed')
        }
        add('theme.flag', computedFlag() === 'on', computedFlag())
        const titlebar = document.documentElement.getAttribute('data-windows-titlebar') !== null
        const radius = computedValue('[class*="centerCol"]', 'border-top-left-radius')
        add('layout.corner', !titlebar || radius === '0px', `titlebar=${titlebar} radius=${radius}`)
        const badge = computedValue('[class*="_previewBadge"]', 'display')
        add('layout.badge', badge === 'missing' || badge === 'none', badge)
        const fade = computedValue('[class*="_treeBody"] > [class*="_fade"]', 'display')
        add('layout.sidebarFade', fade === 'missing' || fade === 'none', fade)
        add('block.frost', computedPseudo('[class*="sidebarCol"]', '::before', 'backdrop-filter') !== 'none',
          computedPseudo('[class*="sidebarCol"]', '::before', 'backdrop-filter'))
        // The blur layer paints above the wallpaper; if the wallpaper layer
        // wins the stacking order the sliders look dead (this regressed once).
        const wallZ = computedValue('.dsh-we-backdrop', 'z-index')
        const blurZ = computedPseudo('[class*="sidebarCol"]', '::before', 'z-index')
        add('block.frostOnWallpaper', Number(blurZ) > Number(wallZ) && Number.isFinite(Number(wallZ)),
          `wallpaper=${wallZ} blur=${blurZ}`)

        // The reported regression.
        for (const row of await testSidebar()) results.push(row)

        // The enable switch paints and unpaints. Preview only — never persisted.
        previewSettings({ enabled: false })
        await wait(150)
        add('switch.off', document.documentElement.getAttribute('data-dsh-wallpaper') === null,
          String(document.documentElement.getAttribute('data-dsh-wallpaper')))
        // Turning the plugin off must hand the original opaque theme back.
        const offAlpha = alphaOf(getComputedStyle(document.body).backgroundColor)
        add('switch.restoresOpaque', offAlpha >= 0.99, `alpha=${offAlpha}`)
        previewSettings({ enabled: true })
        await wait(150)
        add('switch.on', document.documentElement.getAttribute('data-dsh-wallpaper') === 'on',
          String(document.documentElement.getAttribute('data-dsh-wallpaper')))

        // Both themes carry their own rules; a light-only build would break
        // dark mode after a theme switch.
        const paint = styleRefs.paint ? styleRefs.paint.textContent : ''
        const darkRules = (paint.match(/data-ds-dark-theme/g) || []).length
        add('theme.darkRules', darkRules >= 4, `darkRules=${darkRules}`)

        // Force the *other* theme for a moment: the paint sheet must swap both the
        // fills and the ink ladder, and it must swap back cleanly.
        // The other theme must still solve to a legible pair. Computed rather
        // than by flipping the attribute: a temporary flip flashes the whole UI
        // (and the desktop caption) for a check that is pure arithmetic anyway.
        try {
          const chrome = surfaces().sidebar
          const lightPick = inkFor(effectiveLuminance('light', chrome), 'light')
          const darkPick = inkFor(effectiveLuminance('dark', chrome), 'dark')
          const darkRatio = contrastOf(luminanceOf(darkPick.primary), effectiveLuminance('dark', chrome))
          add(
            'theme.darkFlip',
            darkRatio >= 4.5 && lightPick.contrast >= 4.5,
            `dark=${darkPick.primary}@${darkRatio.toFixed(2)} ladder=${darkPick.ladder} · ` +
              `light=${lightPick.primary}@${lightPick.contrast.toFixed(2)} ladder=${lightPick.ladder}`,
          )
        } catch (error) {
          add('theme.darkFlip', false, (error && error.message) || 'ink solve failed')
        }

        // The strength knob and the per-block blur knob really do change the
        // numbers the paint rules are generated from. Pure arithmetic on
        // purpose: a self test must never move the user's settings.
        try {
          const high = surfaces(100)
          const low = surfaces(20)
          add(
            'slider.strength',
            high.sidebar > low.sidebar && high.layer1 > low.layer1 && high.glass > low.glass && high.content > low.content,
            `sidebar ${low.sidebar}→${high.sidebar} · layer1 ${low.layer1}→${high.layer1} · ` +
              `content ${low.content}→${high.content} · glass ${low.glass}→${high.glass}`,
          )
          // …and the bottom of the knob means NOTHING is filled: "everything at
          // the lowest" has to look like the bare wallpaper, not like a 15%
          // white veil, so every tier must reach zero there.
          add(
            'slider.floor',
            Object.values(low).every((value) => value === 0),
            `low=${JSON.stringify(low)}`,
          )
        } catch (error) {
          add('slider.strength', false, (error && error.message) || 'surfaces() failed')
          add('slider.floor', false, (error && error.message) || 'surfaces() failed')
        }
        try {
          const blurOn = blockBlur()
          const blurOff = blockBlur({ blurSide: 0 })
          add(
            'slider.blockBlur',
            blurOff.side === 0 && blurOn.side > 0,
            `side ${blurOff.side} → ${blurOn.side} (px)`,
          )
        } catch (error) {
          add('slider.blockBlur', false, (error && error.message) || 'blockBlur() failed')
        }
        // Fit modes must map onto the four Wallpaper Engine placements, and the
        // auto mode must actually decide from the picture's shape.
        try {
          const wide = 16 / 9
          const square = 1
          const cases = [
            ['cover', wide, 'cover', false],
            ['contain', wide, 'contain', true],
            ['stretch', wide, 'fill', false],
            ['center', square, 'none', true],
            ['auto', wide, 'cover', false],
            ['auto', square, 'cover', false],
          ]
          const rows = cases.map(([setting, aspect, fit, backdrop]) => {
            const got = placement(setting, aspect, wide)
            return got.objectFit === fit && got.backdrop === backdrop
          })
          add(
            'fit.modes',
            rows.every(Boolean),
            cases.map((c, i) => `${c[0]}${c[1] === 1 ? '(1:1)' : ''}${rows[i] ? '✓' : '✗'}`).join(' '),
          )
        } catch (error) {
          add('fit.modes', false, (error && error.message) || 'placement() failed')
        }

        // Zoom/position are clamped in one pure function, so the limits can be
        // asserted without touching the page (a drag can never leave the range).
        try {
          const high = framing(9999, 9999, -9999)
          const low = framing(0, -9999, 9999)
          add(
            'frame.clamps',
            high.zoom === 300 && high.posX === 50 && high.posY === -50 &&
              low.zoom === 100 && low.posX === -50 && low.posY === 50,
            `high=${high.zoom}/${high.posX}/${high.posY} low=${low.zoom}/${low.posX}/${low.posY}`,
          )
        } catch (error) {
          add('frame.clamps', false, (error && error.message) || 'framing() failed')
        }

        // The layer must apply the same numbers the settings store holds, or a
        // slider would move without the picture moving.
        add(
          'frame.applied',
          reportFit.zoom === Math.round(clamp(Number(settings.zoom), 100, 300, DEFAULTS.zoom)) &&
            reportFit.posX === clamp(Number(settings.posX), -50, 50, DEFAULTS.posX) &&
            reportFit.posY === clamp(Number(settings.posY), -50, 50, DEFAULTS.posY),
          `applied=${reportFit.zoom}/${reportFit.posX}/${reportFit.posY} settings=${settings.zoom}/${settings.posX}/${settings.posY}`,
        )

        // A transformed ancestor makes the glass columns sample a shifted copy
        // of the wallpaper (the picture appears twice), so the zoom must be
        // layout-only: assert that nothing wrapping the media has a transform.
        try {
          const wrappers = [
            document.querySelector('.dsh-we-backdrop-viewport'),
            document.querySelector('.dsh-we-preview-viewport'),
          ].filter(Boolean)
          const bad = wrappers.filter((node) => {
            const transform = getComputedStyle(node).transform
            return transform && transform !== 'none'
          })
          add(
            'frame.noTransform',
            bad.length === 0,
            wrappers.length === 0 ? 'no layer mounted' : `${wrappers.length} wrapper(s), transformed=${bad.length}`,
          )
        } catch (error) {
          add('frame.noTransform', false, (error && error.message) || 'transform probe failed')
        }

        // The library order is "used last first, then used most" — assert it on
        // synthetic records so the rule is checked even on a fresh profile.
        try {
          const probe = [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
            { id: 'c', title: 'C' },
            { id: 'd', title: 'D' },
          ]
          const saved = usage
          const savedVersion = usageVersion
          usage = {
            a: { count: 1, last: 300 },
            b: { count: 9, last: 200 },
            c: { count: 4, last: 100 },
          }
          const order = sortByUsage(probe).map((item) => item.id)
          usage = saved
          usageVersion = savedVersion
          add('library.usageOrder', order.join('') === 'abcd', `order=${order.join('')} (want abcd: last used, then most used, then untouched)`)
        } catch (error) {
          add('library.usageOrder', false, (error && error.message) || 'sortByUsage() failed')
        }

        // Media streaming with a Range header, from the page origin.
        try {
          const item = currentItem()
          if (item && item.playFile) {
            const response = await fetch(mediaUrl(item.playFile), {
              headers: { Range: 'bytes=0-99' },
              signal: AbortSignal.timeout(6000),
            })
            add('media.range', response.status === 206, `status=${response.status}`)
            const body = await response.arrayBuffer()
            add('media.bytes', body.byteLength === 100, `bytes=${body.byteLength}`)
          } else {
            add('media.range', false, 'no current item to stream')
          }
        } catch (error) {
          add('media.range', false, (error && error.message) || 'media failed')
        }
      } catch (error) {
        add('selftest.crash', false, (error && error.message) || String(error))
      } finally {
        // Nothing above persisted to localStorage, so putting the snapshot back
        // in memory (and repainting) is a complete restore.
        previewSettings(snapshot)
        await wait(150)
      }
      add('page.errors', pageErrors.length === 0, pageErrors.join(' | '))
      // The preview lives in the sidebar panel, so open it when the self test
      // runs from a closed sidebar and close it again afterwards.
      let openedPreviewPanel = false
      if (!document.querySelector('[data-dsh-preview="true"]')) {
        setSidebarOpen(true)
        openedPreviewPanel = true
        await wait(500)
      }
      try {
        const card = document.querySelector('[data-dsh-preview="true"]')
        if (card) {
          const side = card.querySelector('.dsh-we-preview-side')
          const media = card.querySelector('.dsh-we-preview-media')
          const sideFill = side ? getComputedStyle(side).backgroundColor : 'none'
          const opaque = /rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\.\d+/.test(sideFill) || /rgb\(/.test(sideFill)
          add('preview.card', Boolean(media) && Boolean(side) && opaque, `${media ? media.tagName.toLowerCase() : 'none'}/${sideFill}`)
        } else {
          add('preview.card', true, 'settings closed')
        }
      } catch (error) {
        add('preview.card', false, (error && error.message) || 'preview probe failed')
      }
      // The colour row must offer all three modes, keep exactly one active, and
      // show a ratio: that is the whole control, so a missing button is a bug.
      try {
        const card = document.querySelector('[data-dsh-ink="card"]')
        if (!card) {
          add('ink.ui', true, 'settings closed')
        } else {
          const segs = card.querySelectorAll('.dsh-we-seg button').length
          const active = card.querySelectorAll('.dsh-we-seg button[data-active="true"]').length
          const sliders = card.querySelectorAll('input[type="range"]').length
          const readout = /:1\b/.test(card.textContent || '')
          add('ink.ui', segs === 3 && active === 1 && sliders === 1 && readout,
            `segs=${segs} active=${active} sliders=${sliders} readout=${readout}`)
        }
      } catch (error) {
        add('ink.ui', false, (error && error.message) || 'ink ui probe failed')
      }
      // One wallpaper means one picture: a second media node or a blurred copy
      // behind it is exactly what made the preview look like two wallpapers.
      try {
        const card = document.querySelector('[data-dsh-preview="true"]')
        if (card) {
          const media = card.querySelectorAll('.dsh-we-preview-media').length
          const copies = card.querySelectorAll('.dsh-we-preview-fill').length
          add('preview.singleMedia', media === 1 && copies === 0, `media=${media} copies=${copies}`)
        } else {
          add('preview.singleMedia', true, 'settings closed')
        }
      } catch (error) {
        add('preview.singleMedia', false, (error && error.message) || 'preview probe failed')
      }
      try {
        const media = document.querySelectorAll('.dsh-we-backdrop-media').length
        const copies = document.querySelectorAll('.dsh-we-backdrop-fill').length
        add('backdrop.singleMedia', media === 1 && copies === 0, `media=${media} copies=${copies}`)
      } catch (error) {
        add('backdrop.singleMedia', false, (error && error.message) || 'backdrop probe failed')
      }
      // A binding is only proven by dispatching the real events: dragging must
      // move the crop, the corner + button must zoom, and neither may throw.
      // Both rows skip (and pass) while the settings page is closed.
      try {
        const box = document.querySelector('[data-dsh-preview="true"] .dsh-we-preview')
        if (!box) {
          add('preview.drag', true, 'settings closed')
          add('preview.zoomButtons', true, 'settings closed')
          add('preview.wheel', true, 'settings closed')
          add('preview.wheelLimit', true, 'settings closed')
        add('preview.parity', true, 'settings closed')
        } else {
          const original = { zoom: settings.zoom, posX: settings.posX, posY: settings.posY }
          // Panning needs overflow: at 100% the media exactly fills the box and
          // a drag is deliberately inert, so zoom in first the way a user must.
          updateSettings({ zoom: 200, posX: 0, posY: 0 })
          await wait(160)
          const before = { zoom: settings.zoom, posX: settings.posX, posY: settings.posY }
          const boxRect = box.getBoundingClientRect()
          const base = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, isPrimary: true }
          const centerX = boxRect.left + boxRect.width / 2
          const centerY = boxRect.top + boxRect.height / 2
          box.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: centerX, clientY: centerY }))
          box.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: centerX - boxRect.width * 0.18, clientY: centerY }))
          box.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: centerX - boxRect.width * 0.18, clientY: centerY }))
          await wait(80)
          add('preview.drag', settings.posX !== before.posX, `posX ${before.posX} → ${settings.posX} at zoom ${before.zoom}`)
          const zoomIn = box.querySelector('.dsh-we-preview-zoom button:last-of-type')
          if (zoomIn) zoomIn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await wait(80)
          add('preview.zoomButtons', settings.zoom > before.zoom, `zoom ${before.zoom} → ${settings.zoom}${zoomIn ? '' : ' (button missing)'}`)
          // The wheel over the picture zooms it (a trackpad pinch arrives as
          // ctrl+wheel and is steered by the same handler).
          const wheelBase = settings.zoom
          box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }))
          await wait(360)
          add('preview.wheel', settings.zoom > wheelBase, `zoom ${wheelBase} → ${settings.zoom}`)
          // At the upper limit the wheel must NOT be swallowed, or the settings
          // page could not be scrolled with the pointer over the preview.
          updateSettings({ zoom: 300 })
          await wait(120)
          const limitEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 })
          box.dispatchEvent(limitEvent)
          await wait(300)
          add('preview.wheelLimit', settings.zoom === 300 && !limitEvent.defaultPrevented, `zoom=${settings.zoom} prevented=${limitEvent.defaultPrevented}`)
          // Parity: the preview and the real layer must agree on how much of the
          // box the picture covers (this is what "居中时预览和窗口对不上" was).
          const previewBox = document.querySelector('.dsh-we-preview')
          const previewMedia = document.querySelector('.dsh-we-preview .dsh-we-preview-media')
          const backBox = document.querySelector('.dsh-we-backdrop-viewport')
          const backMedia = document.querySelector('.dsh-we-backdrop-media')
          if (previewBox && previewMedia && backBox && backMedia) {
            // Coverage = how much of the box width the picture itself takes. The
            // element path is width%, the background path is a pixel size that
            // already carries the box/window ratio; both divide by the box width.
            const coverage = (box, media) => {
              const boxRect = box.getBoundingClientRect()
              if (!boxRect.width || !boxRect.height) return 0
              const size = getComputedStyle(media).backgroundSize
              if (size && size !== 'auto' && size.indexOf('px') > 0) {
                return parseFloat(size) / boxRect.width
              }
              return media.getBoundingClientRect().width / boxRect.width
            }
            const ratio = Number(settings.zoom) / 100
            const previewCover = coverage(previewBox, previewMedia)
            const backCover = coverage(backBox, backMedia)
            const same = Math.abs(previewCover - backCover) < 0.03
            const previewRect = previewBox.getBoundingClientRect()
            const mediaRect = previewMedia.getBoundingClientRect()
            const mediaStyle = getComputedStyle(previewMedia)
            add(
              'preview.parity',
              same,
              `preview=${previewCover.toFixed(3)} window=${backCover.toFixed(3)} zoom=${ratio.toFixed(2)} ` +
                `box=${Math.round(previewRect.width)}x${Math.round(previewRect.height)} ` +
                `media=${Math.round(mediaRect.width)}x${Math.round(mediaRect.height)} ` +
                `css=${mediaStyle.width}/${mediaStyle.height} bg=${mediaStyle.backgroundSize}`,
            )
          } else {
            add('preview.parity', true, 'surface missing')
          }
          updateSettings({ zoom: original.zoom, posX: original.posX, posY: original.posY })
          await wait(60)
        }
      } catch (error) {
        add('preview.drag', false, (error && error.message) || 'dispatch failed')
        add('preview.zoomButtons', false, (error && error.message) || 'dispatch failed')
        add('preview.wheel', false, (error && error.message) || 'dispatch failed')
        add('preview.wheelLimit', false, (error && error.message) || 'dispatch failed')
        add('preview.parity', false, (error && error.message) || 'dispatch failed')
      }
      if (openedPreviewPanel) {
        setSidebarOpen(false)
        await wait(320)
      }
      // The sidebar panel is proven the same way: the glyph opens it, the region
      // shows the wallpaper list instead of the session list, the back button
      // closes it, and the shipped list is back afterwards.
      try {
        const glyph = document.querySelector('.dsh-we-glyph')
        const composerBefore = Boolean(document.querySelector('[data-composer-card], [data-composer-seat]'))
        if (!glyph) {
          add('sidebar.panel', false, 'glyph missing')
        } else {
          selfTestStep = 'sidebar.panel: click'
          glyph.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          await until(() => Boolean(document.querySelector('.dsh-we-side')))
          selfTestStep = 'sidebar.panel: opened'
          const opened = Boolean(document.querySelector('.dsh-we-side'))
          const rows = document.querySelectorAll('.dsh-we-side .dsh-we-tile').length
          const panelPreview = Boolean(document.querySelector('.dsh-we-side .dsh-we-preview'))
          const sessionsHidden = !document.querySelector('[class*="_treeBody"] [class*="_sessionRow"]')
          const back = document.querySelector('.dsh-we-side-back')
          selfTestStep = 'sidebar.panel: back'
          if (back) back.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          await until(() => !document.querySelector('.dsh-we-side'))
          selfTestStep = 'sidebar.panel: closed'
          const closed = !document.querySelector('.dsh-we-side')
          const sessionsBack = Boolean(document.querySelector('[class*="_treeBody"]'))
          const composerAfter = Boolean(document.querySelector('[data-composer-card], [data-composer-seat]'))
          const mainKept = composerBefore === composerAfter
          add(
            'sidebar.panel',
            opened && rows > 0 && panelPreview && sessionsHidden && closed && sessionsBack && mainKept,
            `open=${opened} rows=${rows} preview=${panelPreview} listHidden=${sessionsHidden} close=${closed} listBack=${sessionsBack} mainKept=${mainKept}`,
          )
          if (!closed) setSidebarOpen(false)
        }
      } catch (error) {
        setSidebarOpen(false)
        add('sidebar.panel', false, (error && error.message) || 'dispatch failed')
      }
      // Clicking the row's label (not the glyph) must still open the sidebar and
      // must never leave the main column showing our panel.
      try {
        const glyph = document.querySelector('.dsh-we-glyph')
        const row = glyph && glyph.closest('button')
        if (!row) {
          add('sidebar.rowClick', true, 'row missing')
        } else {
          row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          await until(() => Boolean(document.querySelector('.dsh-we-side')))
          const opened = Boolean(document.querySelector('.dsh-we-side'))
          const mainStuck = Boolean(document.querySelector('.dsh-we-page:not(.dsh-we-compact)'))
          const layout = layoutService()
          const active = layout && layout.panelInfo && typeof layout.panelInfo.getSnapshot === 'function' ? layout.panelInfo.getSnapshot().activePanelId : ''
          add(
            'sidebar.rowClick',
            opened && !mainStuck && !active,
            `open=${opened} mainStuck=${mainStuck} active=${active || 'conversation'}`,
          )
          if (opened) {
            setSidebarOpen(false)
            await wait(240)
          }
        }
      } catch (error) {
        setSidebarOpen(false)
        add('sidebar.rowClick', false, (error && error.message) || 'row click failed')
      }
      selfTestResult = {
        token,
        at: new Date().toISOString(),
        build: BUILD,
        ok: results.every((row) => row.ok),
        failed: results.filter((row) => !row.ok).map((row) => row.name),
        results,
      }
      return selfTestResult
    }

    /** Ask the Host for verify requests on a slow timer. */
    function startVerifyPolling() {
      stopVerifyPolling()
      pingTimer = window.setInterval(async () => {
        // A run that never settles (for example a fetch the shell never
        // resolves) must not block every later run: give it one deadline.
        if (selfTestBusy && Date.now() - selfTestStartedAt > 25000) {
          selfTestBusy = false
          selfTestResult = {
            token: lastVerifyToken,
            at: new Date().toISOString(),
            build: BUILD,
            ok: false,
            failed: ['selftest.timeout'],
            results: [
              {
                name: 'selftest.timeout',
                ok: false,
                detail: `no verdict after ${Math.round((Date.now() - selfTestStartedAt) / 1000)}s`,
              },
              ...selfTestProgress.slice(0, 60).map((row) => ({ name: `stalled-after ${row.name}`, ok: row.ok, detail: row.detail })),
            ],
          }
          reportRenderer('self-test')
        }
        if (selfTestBusy) return
        let value = null
        try {
          value = await callHost('ping')
        } catch {
          return
        }
        if (!value || !value.verify || value.verify === lastVerifyToken) return
        lastVerifyToken = String(value.verify)
        selfTestBusy = true
        selfTestStartedAt = Date.now()
        reportRenderer('self-test-start')
        try {
          await runSelfTest(lastVerifyToken)
        } catch (error) {
          noteError('selftest', error)
          selfTestResult = {
            token: lastVerifyToken,
            at: new Date().toISOString(),
            build: BUILD,
            ok: false,
            failed: ['selftest.crash'],
            results: [{ name: 'selftest.crash', ok: false, detail: String((error && error.stack) || error).slice(0, 900) }],
          }
        } finally {
          selfTestBusy = false
        }
        reportRenderer('self-test')
      }, 5000)
    }

    /** Stop the verify poll. */
    function stopVerifyPolling() {
      if (pingTimer !== null) window.clearInterval(pingTimer)
      pingTimer = null
    }

    // ------------------------------------------------------------------
    // Shared data store (state + library), polled while following
    // ------------------------------------------------------------------

    const data = { state: null, library: null, error: '', loading: false, busy: false }

    // A cold boot can mount the Host half before its web server exists, so a
    // failed state read retries on its own instead of waiting for a click.
    let stateRetryDelay = 0
    let stateRetryTimer = null

    // Renderer reports fire once per milestone (first state, first item) so the
    // Host can tell what the page resolved without a report per poll.
    let stateReported = false
    let lastItemId = null

    /** Stop the failed-state retry loop. */
    function stopStateRetry() {
      if (stateRetryTimer !== null) clearTimeout(stateRetryTimer)
      stateRetryTimer = null
    }

    /** Schedule the next state read after a failure, backing off to 20 s. */
    function scheduleStateRetry() {
      if (stateRetryTimer !== null) return
      stateRetryDelay = stateRetryDelay === 0 ? 1500 : Math.min(stateRetryDelay * 2, 20000)
      stateRetryTimer = setTimeout(() => {
        stateRetryTimer = null
        loadState()
      }, stateRetryDelay)
    }

    /** Fetch the small state view. */
    async function loadState() {
      try {
        const value = await callHost('state')
        data.state = value
        data.error = ''
        stopStateRetry()
        stateRetryDelay = 0
        if (!stateReported) {
          stateReported = true
          reportRenderer('state-ok')
        } else if (Date.now() - lastReportAt > 60_000) {
          // A Host reload forgets the last report, so re-send one per minute.
          reportRenderer('heartbeat')
        }
        const next = currentItem()
        const nextId = next ? String(next.id) : ''
        if (nextId !== lastItemId) {
          lastItemId = nextId
          if (nextId !== '') reportRenderer('item-change')
        }
      } catch (error) {
        data.error = (error && error.message) || 'state failed'
        scheduleStateRetry()
      }
      emit()
    }

    /** Fetch the library, optionally rescanning the host first. */
    async function loadLibrary(force) {
      if (data.busy) return
      data.busy = true
      data.loading = true
      emit()
      try {
        const value = await callHost(force ? 'refresh' : 'library', {})
        data.library = value
        data.error = ''
      } catch (error) {
        data.error = (error && error.message) || 'library failed'
      }
      data.busy = false
      data.loading = false
      emit()
    }

    /** Fetch whatever the current mode needs. */
    function ensureData() {
      loadState()
      if (!data.library && !data.busy) loadLibrary(false)
    }

    // ------------------------------------------------------------------
    // Theme painting
    // ------------------------------------------------------------------

    /** Token palette the translucency is mixed from, per theme. */
    const PALETTE = {
      sidebar: { light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-900' },
      layer1: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-875' },
      layer2: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-850' },
      layer3: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-800' },
      overlay: { light: '--dsw-static-neutral-bluish-150', dark: '--dsw-static-neutral-bluish-700' },
      navActive: { light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' },
      navHover: { light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-850' },
      // Surfaces the app paints as opaque sheets with their own tokens.
      module: { light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' },
      code: { light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-900' },
      menu: { light: '--dsw-menu-surface-fill', dark: '--dsw-menu-surface-fill' },
      elevated: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-750' },
      floating: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-850' },
      bubble: { light: '--dsw-static-deepseek-50', dark: '--dsw-static-neutral-bluish-850' },
      ghost: { light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' },
      hoverSolid: { light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' },
      // Rendered-markdown surfaces: inline `code` chips, code-block banner, code tabs, tags, citations.
      mdInline: { light: '--dsw-static-neutral-50', dark: '--dsw-static-neutral-800' },
      mdBanner: { light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-850' },
      mdSegmentOn: { light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-800' },
      mdSegmentOff: { light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-900' },
      mdTag: { light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-850' },
      mdCitation: { light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-800' },
    }

    /** Mix one palette token with transparency at `percent` opacity. */
    function mix(token, percent) {
      return `color-mix(in srgb, var(${token}) ${percent}%, transparent)`
    }

    /** Numeric luminance of each theme's fill tint, used to solve the text colour. */
    const TINT = { light: 0.97, dark: 0.05 }

    /**
     * Grayscale ink. Plain black / white / grey first — the window resolves ONE
     * base colour per theme, and every tier is that same colour at a lower
     * opacity, so the sidebar can never come out a different grey than the
     * reading column. A tier only steps back toward the base when its own
     * surface would starve it of contrast.
     */
    const INK_BASE = { dark: '#0b0d11', light: '#f8f9fb' }

    /** Relative luminance of a `#rrggbb` colour. */
    function luminanceOf(color) {
      const value = String(color).replace('#', '')
      const channels = [0, 2, 4].map((offset) => {
        const channel = parseInt(value.slice(offset, offset + 2), 16) / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }

    /** `#rrggbb` → `[r, g, b]`. */
    function channelsOf(color) {
      const value = String(color).replace('#', '')
      return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
    }

    /** WCAG contrast ratio between two relative luminances. */
    function contrastOf(a, b) {
      const high = Math.max(a, b)
      const low = Math.min(a, b)
      return (high + 0.05) / (low + 0.05)
    }

    /**
     * Luminance a surface actually shows: its fill composited over the wallpaper
     * *as the veil leaves it*. A 16% frame over a bright image is bright; the
     * same fill over a night scene is dark. The veil is included because that is
     * what ends up behind the glass, not the raw image.
     */
    function effectiveLuminance(themeKey, alphaPercent) {
      const alpha = clamp(Number(alphaPercent), 0, 100, 50) / 100
      const raw = wallpaperLuminance === null ? 0.5 : wallpaperLuminance
      const veil = scrimAlpha(themeKey)
      const visible = themeKey === 'light' ? veil + (1 - veil) * raw : (1 - veil) * raw
      return alpha * TINT[themeKey] + (1 - alpha) * visible
    }

    /**
     * The base colour one theme paints with. `custom` uses the user's colour
     * verbatim; `auto` (and `off`, which still needs a colour for diagnostics)
     * picks whichever of black / white survives the worst panel — the sidebar,
     * the reading column, a card and the glass input are all scored, so the one
     * colour has to work on all of them, not just on the one it was solved for.
     */
    function autoInkBase(themeKey) {
      const levels = surfaces()
      const panels = [levels.sidebar, levels.content, levels.glass]
      const worst = (color) => {
        const ink = luminanceOf(color)
        return panels.reduce(
          (low, panel) => Math.min(low, contrastOf(ink, effectiveLuminance(themeKey, panel))),
          99,
        )
      }
      const dark = worst(INK_BASE.dark)
      const light = worst(INK_BASE.light)
      // A tie keeps the theme's own direction; otherwise the surviving extreme wins.
      if (Math.abs(dark - light) < 0.05) return INK_BASE[themeKey === 'dark' ? 'light' : 'dark']
      return dark > light ? INK_BASE.dark : INK_BASE.light
    }

    /**
     * The colour in force: the user's pick in `custom`, the solved extreme
     * otherwise.
     *
     * A pick that cannot clear 3:1 on any panel is not used — white on a light
     * theme's 58% glass is 1.3:1, which reads as white text on white and is
     * exactly what the "white film" complaint looked like. The window keeps
     * working text and says so in the readout instead of trusting the pick.
     */
    function inkBaseFor(themeKey) {
      const solved = autoInkBase(themeKey)
      if (settings.inkMode !== 'custom') return solved
      const custom = String(settings.inkColor)
      if (!/^#[0-9a-fA-F]{6}$/.test(custom)) return solved
      const levels = surfaces()
      const ink = luminanceOf(custom)
      const worst = [levels.sidebar, levels.content, levels.glass].reduce(
        (low, alpha) => Math.min(low, contrastOf(ink, effectiveLuminance(themeKey, alpha))),
        99,
      )
      return worst >= 3 ? custom : solved
    }

    /** True when the user picked a colour this theme cannot carry. */
    function inkFellBack(themeKey) {
      if (settings.inkMode !== 'custom') return false
      const custom = String(settings.inkColor)
      if (!/^#[0-9a-fA-F]{6}$/.test(custom)) return false
      return inkBaseFor(themeKey) !== custom
    }

    /**
     * Opacity one tier keeps on one surface. The knob sets the gap between the
     * tiers; the contrast floor then pulls a tier back toward the base when its
     * own surface would otherwise make it unreadable. Same colour, same formula,
     * everywhere — that is what "统一" means here.
     */
    function inkOpacity(tier, background, baseLuminance) {
      const gap = clamp(Number(settings.inkLevels), 0, 100, 62) / 100
      const wanted = tier === 0 ? 1 : tier === 1 ? 1 - gap * 0.42 : 1 - gap * 0.68
      const floor = tier === 2 ? 3 : 4.5
      for (let pct = wanted; pct < 1; pct += 0.04) {
        if (contrastOf(background + (baseLuminance - background) * pct, background) >= floor) return pct
      }
      return 1
    }

    /** One tier of one colour as CSS: an opaque hex at full strength, `rgba` below it. */
    function inkPaint(base, tier, background) {
      const pct = inkOpacity(tier, background, luminanceOf(base))
      if (pct >= 0.995) return base
      const [r, g, b] = channelsOf(base)
      return `rgba(${r}, ${g}, ${b}, ${Math.round(pct * 100) / 100})`
    }

    /**
     * The panel that makes the ink work hardest: lowest contrast there decides
     * the tier alphas for every panel. Solving per panel would give the sidebar
     * a different grey than the reading column again — one basis, every scope.
     */
    function inkBasis(themeKey) {
      const levels = surfaces()
      const base = inkBaseFor(themeKey)
      const ink = luminanceOf(base)
      const panels = [
        ['content', levels.content],
        ['sidebar', levels.sidebar],
        ['glass', levels.glass],
      ]
      let worst = null
      for (const [name, alpha] of panels) {
        const background = effectiveLuminance(themeKey, alpha)
        const ratio = contrastOf(ink, background)
        if (!worst || ratio < worst.ratio) worst = { name, alpha, background, ratio }
      }
      return { ...worst, base }
    }

    /**
     * The triad for one composed background. The colours come from the shared
     * basis (so all scopes are identical); `contrast` still reports the ratio
     * this particular background gets, which is what the panel displays.
     */
    function inkFor(background, themeKey) {
      const basis = inkBasis(themeKey)
      const base = basis.base
      return {
        base,
        primary: inkPaint(base, 0, basis.background),
        secondary: inkPaint(base, 1, basis.background),
        tertiary: inkPaint(base, 2, basis.background),
        contrast: Math.round(contrastOf(luminanceOf(base), background) * 100) / 100,
        basis: basis.name,
        fellBack: inkFellBack(themeKey),
        ladder: luminanceOf(base) < 0.5 ? 'dark' : 'light',
      }
    }

    /** The ink override block for one surface (defaults override the theme). */
    function inkRule(selector, themeKey, alphaPercent) {
      // `off` leaves the theme's own ink alone; nothing to override.
      if (settings.inkMode === 'off') return ''
      const ink = inkFor(effectiveLuminance(themeKey, alphaPercent), themeKey)
      return [
        `${selector} {`,
        `  --dsw-alias-label-primary: ${ink.primary} !important;`,
        `  --dsw-alias-label-secondary: ${ink.secondary} !important;`,
        `  --dsw-alias-label-tertiary: ${ink.tertiary} !important;`,
        `  --dsw-alias-label-caption: ${ink.tertiary} !important;`,
        `  --dsw-alias-label-quaternary: ${ink.tertiary} !important;`,
        '}',
      ].join('\n')
    }

    /**
     * How the wallpaper is placed inside a box, mirroring Wallpaper Engine's
     * own fit modes: fill / fit / stretch / centre, plus an auto mode that
     * switches to fit only when the picture is far from the screen's shape.
     * `backdrop` means "draw a blurred copy of the picture behind it", so the
     * borders are never a flat void.
     */
    function placement(fitSetting, mediaAspect, boxAspect) {
      const setting = FIT_MODES.includes(fitSetting) ? fitSetting : 'auto'
      const box = Number(boxAspect) > 0 ? Number(boxAspect) : 16 / 9
      const gap = Number(mediaAspect) > 0 ? Math.abs(Math.log(Number(mediaAspect) / box)) : 0
      const mode = setting === 'auto' ? (Number(mediaAspect) > 0 && gap > 0.75 ? 'contain' : 'cover') : setting
      const objectFit = mode === 'stretch' ? 'fill' : mode === 'center' ? 'none' : mode === 'contain' ? 'contain' : 'cover'
      return { setting, mode, objectFit, backdrop: mode === 'contain' || mode === 'center' }
    }

    /**
     * Zoom and framing: the same numbers drive the real layer and the preview,
     * so dragging in the preview is the same as dragging in the window.
     * The media is made larger than its viewport (`widthPct`/`heightPct`) and
     * moved with `left`/`top`, which is a pure layout change: no ancestor gets
     * a transform, so the `backdrop-filter` columns keep sampling the right
     * region. `posX`/`posY` are −50..50: at ±50 the picture edge meets the
     * window edge, and at 100% zoom there is nothing to move.
     */
    function framing(zoom, posX, posY) {
      const scale = clamp(Number(zoom), 100, 300, DEFAULTS.zoom) / 100
      const x = clamp(Number(posX), -50, 50, DEFAULTS.posX)
      const y = clamp(Number(posY), -50, 50, DEFAULTS.posY)
      // Zoom SIZES the media instead of transforming an ancestor. A transformed
      // ancestor changes the coordinate space every `backdrop-filter` column
      // samples in, which shows the wallpaper twice (once shifted, unblurred).
      const grow = scale - 1
      return {
        scale: scale.toFixed(3),
        widthPct: (scale * 100).toFixed(2),
        heightPct: (scale * 100).toFixed(2),
        leftPct: (grow * (x - 50)).toFixed(2),
        topPct: (grow * (y - 50)).toFixed(2),
        objectPosition: '50% 50%',
        zoom: Math.round(scale * 100),
        posX: x,
        posY: y,
      }
    }

    /**
     * Fills derived from one strength knob, in tiers: the window itself is never
     * filled (the wallpaper would turn milky), the sidebar stays thin, content
     * surfaces (cards, code, bubbles) sit mid-glass, floating surfaces (inputs,
     * pills, menus, sheets) are the most solid — all of them still show the
     * wallpaper, because the columns behind them are blurred.
     *
     * There is deliberately no `frame` tier: a constant fill over the whole
     * window reads as a white film in a light theme, and the adaptive veil
     * (`scrimAlpha`) already lifts the picture when it is too dark for black
     * text.
     */
    function surfaces(strengthOverride) {
      const strength = clamp(
        strengthOverride === undefined ? settings.surface : strengthOverride,
        20,
        100,
        DEFAULTS.surface,
      )
      // The knob reaches ZERO at the bottom: at the minimum the wallpaper is the
      // interface, nothing is filled — which is the only reading of "全部调到最低"
      // that means anything. A square root keeps 52 on exactly the numbers this
      // build had before, so the default look does not move, while the low end
      // now runs all the way down instead of stopping at a 15% floor.
      const t = Math.sqrt(clamp((strength - 20) / 80, 0, 1, 0.4))
      const scale = (max) => Math.round(max * t)
      return {
        sidebar: scale(40),
        layer1: scale(74),
        layer2: scale(87),
        layer3: scale(92),
        glass: scale(92),
        code: scale(84),
        // The reading column itself: thin enough to keep the picture, thick
        // enough that tertiary trace text is not floating straight on the photo.
        content: scale(44),
        navActive: scale(89),
        navHover: scale(68),
      }
    }

    /** Build the token-override rule block for one theme. */
    function themeRule(selector, themeKey) {
      const levels = surfaces()
      const fill = mix(PALETTE.layer1[themeKey], levels.glass)
      const lines = [
        `${selector} {`,
        // The window shell itself stays clear. A constant fill here was the
        // white film a light theme showed over every wallpaper; the adaptive
        // veil inside the wallpaper layer already handles dark pictures.
        `  --dsw-alias-bg-base: rgba(0, 0, 0, 0) !important;`,
        // …and the sidebar fill belongs to the sidebar, not to the frame: the
        // app paints its outermost `_frame` element with this same token, so a
        // translucent value here veiled the whole window. It is set again on
        // `[class*="sidebarCol"]` below, which is the only place it is meant for.
        `  --dsw-specific-sidebar-fill: rgba(0, 0, 0, 0) !important;`,
        `  --dsw-alias-bg-layer-1: ${mix(PALETTE.layer1[themeKey], levels.layer1)} !important;`,
        `  --dsw-alias-bg-layer-2: ${mix(PALETTE.layer2[themeKey], levels.layer2)} !important;`,
        `  --dsw-alias-bg-layer-3: ${mix(PALETTE.layer3[themeKey], levels.layer3)} !important;`,
        `  --dsw-alias-bg-overlay: ${mix(PALETTE.overlay[themeKey], levels.layer3)} !important;`,
        `  --dsw-specific-sidebar-nav-item-active: ${mix(PALETTE.navActive[themeKey], levels.navActive)} !important;`,
        `  --dsw-specific-sidebar-nav-item-hover: ${mix(PALETTE.navHover[themeKey], levels.navHover)} !important;`,
        `  --dsw-specific-input-major: ${fill} !important;`,
        `  --dsh-we-glass: ${fill} !important;`,
        `  --dsh-we-content-fill: ${mix(PALETTE.layer1[themeKey], levels.content)} !important;`,
        `  --dsh-we-glass-line: color-mix(in srgb, var(--dsw-alias-border-l2) 55%, transparent) !important;`,
        // Opaque sheets the app paints with its own tokens.
        `  --dsw-alias-bg-module-platform: ${mix(PALETTE.module[themeKey], levels.layer1)} !important;`,
        `  --dsw-alias-markdown-code-block: ${mix(PALETTE.code[themeKey], levels.code)} !important;`,
        `  --dsw-specific-menu: ${mix(PALETTE.menu[themeKey], levels.glass)} !important;`,
        `  --dsw-alias-button-elevated-fill: ${mix(PALETTE.elevated[themeKey], levels.glass)} !important;`,
        `  --dsw-alias-button-floating-fill: ${mix(PALETTE.floating[themeKey], levels.glass)} !important;`,
        `  --dsw-alias-button-ghost-active-fill: ${mix(PALETTE.ghost[themeKey], levels.navActive)} !important;`,
        `  --dsw-alias-interactive-bg-hover-solid: ${mix(PALETTE.hoverSolid[themeKey], levels.navHover)} !important;`,
        `  --dsw-specific-bubble: ${mix(PALETTE.bubble[themeKey], levels.layer1)} !important;`,
        // Markdown surfaces: inline code chips were the last pure-white blocks.
        `  --dsw-alias-markdown-inline-code: ${mix(PALETTE.mdInline[themeKey], levels.code)} !important;`,
        `  --dsw-alias-markdown-code-block-banner: ${mix(PALETTE.mdBanner[themeKey], levels.code)} !important;`,
        `  --dsw-alias-markdown-code-segment-selected: ${mix(PALETTE.mdSegmentOn[themeKey], levels.glass)} !important;`,
        `  --dsw-alias-markdown-code-segment-unselected: ${mix(PALETTE.mdSegmentOff[themeKey], levels.layer2)} !important;`,
        `  --dsw-alias-markdown-tag: ${mix(PALETTE.mdTag[themeKey], levels.layer2)} !important;`,
        `  --dsw-alias-markdown-citation: ${mix(PALETTE.mdCitation[themeKey], levels.layer2)} !important;`,
        // Remaining opaque strips: menu group headers and hover rows.
        `  --dsw-alias-menu-group-header-fill: ${mix(PALETTE.layer2[themeKey], levels.glass)} !important;`,
        `  --dsw-alias-bg-layer-4: ${mix(PALETTE.layer3[themeKey], levels.layer3)} !important;`,
        '}',
        // The sidebar column is the only surface the sidebar fill belongs to:
        // the app also paints its outermost frame with this token, and a fill
        // there veils the whole window (that was the white film over the image).
        `${selector} [class*="sidebarCol"] {`,
        `  --dsw-specific-sidebar-fill: ${mix(PALETTE.sidebar[themeKey], levels.sidebar)} !important;`,
        '}',
      ]
      return lines.join('\n')
    }

    /** Style elements this plugin owns. */
    const styleRefs = { base: null, paint: null }

    /** Recompute the translucency rules and the html flag. */
    function paintTheme() {
      if (settings.enabled) {
        try {
          document.documentElement.setAttribute('data-dsh-wallpaper', 'on')
        } catch {
          /* ignore */
        }
      } else {
        try {
          document.documentElement.removeAttribute('data-dsh-wallpaper')
        } catch {
          /* ignore */
        }
      }
      if (!styleRefs.paint) return
      if (!settings.enabled) {
        styleRefs.paint.textContent = ''
        return
      }
      const levels = surfaces()
      const chrome = levels.sidebar
      const inkBlock = (themeKey) => {
        // Both scopes carry the same specificity, so a light rule can never leak
        // into dark mode and vice versa: only one of them can match at a time.
        const scope =
          themeKey === 'dark'
            ? 'html[data-dsh-wallpaper="on"] body[data-ds-dark-theme]'
            : 'html[data-dsh-wallpaper="on"] body:not([data-ds-dark-theme])'
        return [
          inkRule(scope, themeKey, levels.layer1),
          // Body text that lives directly in the reading column rather than in a
          // card (the trace view is all of it) sits on the column fill.
          inkRule(`${scope} [class*="centerCol"]`, themeKey, levels.content),
          inkRule(
            [`${scope} [class*="sidebarCol"]`, `${scope} [class*="bottomRow"]`].join(',\n'),
            themeKey,
            chrome,
          ),
          inkRule(
            [
              `${scope} [data-composer-card]`,
              `${scope} [data-composer-stat] > :is(button, span)`,
              `${scope} [role="dialog"]`,
              `${scope} [class*="_overlay"] [class*="_panel"]`,
              `${scope} [class*="_menu"]`,
              `${scope} [class*="_popover"]`,
            ].join(',\n'),
            themeKey,
            levels.glass,
          ),
        ].join('\n')
      }
      styleRefs.paint.textContent = [
        themeRule('html[data-dsh-wallpaper="on"] body', 'light'),
        themeRule('html[data-dsh-wallpaper="on"] body[data-ds-dark-theme]', 'dark'),
        inkBlock('light'),
        inkBlock('dark'),
        scrimRule('html[data-dsh-wallpaper="on"] body', '255, 255, 255', 'light'),
        scrimRule('html[data-dsh-wallpaper="on"] body[data-ds-dark-theme]', '0, 0, 0', 'dark'),
        ...blockRules(),
        ...cornerRules(),
        ...glassRules(),
        ...sheetRules(),
      ].join('\n')
    }

    /** Per-block blur values, clamped to what the sliders can produce. */
    function blockBlur(patch) {
      const pick = (key) => {
        const source = patch && patch[key] !== undefined ? patch[key] : settings[key]
        return clamp(Number(source), 0, 32, DEFAULTS[key])
      }
      return {
        main: pick('blurMain'),
        side: pick('blurSide'),
        right: pick('blurRight'),
        bottom: pick('blurBottom'),
      }
    }

    /**
     * Frosted glass per layout block: each column blurs what is behind itself,
     * so the wallpaper can be crisp in the reading area and soft at the edges.
     *
     * The blur MUST NOT be applied to the column element itself: any
     * `backdrop-filter` other than `none` makes the element a containing block
     * for fixed-position descendants, and the sidebar's collapse toggle is
     * `position: fixed; left: 12px` on Windows. Applying it there pinned the
     * toggle inside the collapsing rail and made the sidebar impossible to
     * reopen. A `::before` paint layer blurs the same pixels without touching
     * layout containment.
     */
    function blockRules() {
      const blocks = blockBlur()
      const on = 'html[data-dsh-wallpaper="on"]'
      const rule = (selector, pixels) => [
        `${on} ${selector} { position: relative; }`,
        pixels > 0
          ? `${on} ${selector}::before { content: ""; position: absolute; inset: 0; z-index: -1;` +
            ` pointer-events: none; backdrop-filter: blur(${pixels}px) !important; }`
          : `${on} ${selector}::before { content: ""; position: absolute; inset: 0; z-index: -1;` +
            ` pointer-events: none; backdrop-filter: none !important; }`,
      ]
      return [
        // The reading column keeps a thin wash so text never sits on bare photo.
        `${on} [class*="centerCol"] { background: var(--dsh-we-content-fill) !important; }`,
        ...rule('[class*="centerCol"]', blocks.main),
        ...rule('[class*="sidebarCol"]', blocks.side),
        ...rule('[data-rightbar-col]', blocks.right),
        ...rule('[class*="bottomRow"]', blocks.bottom),
      ]
    }

    /**
     * Frosted glass on the surfaces the app ships as solid sheets: the composer
     * input card and the composer stat pills. The translucent fill comes from
     * `--dsw-specific-input-major` / `--dsh-we-glass` (both driven by the
     * strength knob); the blur is what turns that fill into glass.
     */
    function glassRules() {
      const on = 'html[data-dsh-wallpaper="on"]'
      const lightShadow = 'inset 0 1px 0 rgba(255, 255, 255, .55), 0 8px 24px rgba(0, 0, 0, .08)'
      const darkShadow = 'inset 0 1px 0 rgba(255, 255, 255, .08), 0 8px 24px rgba(0, 0, 0, .38)'
      const frost = 'backdrop-filter: blur(18px) saturate(1.12) !important;'
      return [
        // The composer input card. Its frost is a `::before` paint layer for the
        // same containing-block reason as the layout blocks (composer popovers
        // are positioned against the viewport).
        `${on} [data-composer-card] { position: relative; }`,
        `${on} [data-composer-card]::before { content: ""; position: absolute; inset: 0; z-index: -1;` +
          ` pointer-events: none; border-radius: inherit; backdrop-filter: blur(18px) saturate(1.12) !important; }`,
        `${on} [data-composer-card] { box-shadow: ${lightShadow} !important; }`,
        `${on} body[data-ds-dark-theme] [data-composer-card] { box-shadow: ${darkShadow} !important; }`,
        // Sheets that live inside a full-screen overlay (settings) are drawn as a
        // solid sheet by the app itself; give them the same fill + frost.
        `${on} [class*="_overlay"] [class*="_panel"] { ${frost}` +
          ` background: var(--dsh-we-glass) !important;` +
          ` box-shadow: inset 0 0 0 1px var(--dsh-we-glass-line), 0 24px 60px rgba(0, 0, 0, .18) !important; }`,
        // Floating panels: dialogs, menus, popovers and the composer stat pills.
        `${on} [role="dialog"], ${on} [class*="_menu"], ${on} [class*="_popover"], ${on} [class*="_dropdown"] { ${frost} }`,
        // The pill is a <button> in the dialog variant and a <span> in the compact one.
        `${on} [data-composer-stat] > :is(button, span) { color: var(--dsw-alias-label-secondary) !important;` +
          ` background: var(--dsh-we-glass) !important; backdrop-filter: blur(12px) saturate(1.1) !important;` +
          ` box-shadow: inset 0 0 0 1px var(--dsh-we-glass-line) !important; }`,
        // The session list fades its last rows out with a 24px gradient of
        // `--dsw-specific-sidebar-fill` (`._*_fade`, absolute at the bottom of
        // `._*_treeBody`). Against a translucent sidebar that gradient no longer
        // matches the fill and shows up as a bright band above the avatar row.
        `${on} [class*="_treeBody"] > [class*="_fade"] { display: none !important; }`,
      ]
    }

    /**
     * The changed-files / diff sheet gets a slightly more solid fill than the
     * cards around it AND blurs its own backdrop, so the prose behind it can
     * never read through as a second layer of text while the wallpaper still
     * shows around its edges.
     */
    function sheetRules() {
      const on = 'html[data-dsh-wallpaper="on"]'
      const alpha = clamp(surfaces().layer1 + 14, 26, 96, 61)
      const light = mix('--dsw-static-neutral-bluish-00', alpha)
      const dark = mix('--dsw-static-neutral-bluish-850', alpha)
      const sheet = `background: var(--dsh-we-sheet) !important; backdrop-filter: blur(22px) saturate(1.1) !important;`
      return [
        `${on} body { --dsh-we-sheet: ${light} !important; }`,
        `${on} body[data-ds-dark-theme] { --dsh-we-sheet: ${dark} !important; }`,
        `${on} [data-changed-files] { ${sheet} }`,
        `${on} [data-changes-hover-preview] { ${sheet} }`,
      ]
    }

    /**
     * Windows-titlebar layouts round the top-left corner of the center column.
     * With a wallpaper behind it that reads as a stray notch, so it is squared.
     */
    function cornerRules() {
      return [
        'html[data-dsh-wallpaper="on"][data-windows-titlebar] [class*="frame"] { --dsh-windows-content-radius: 0px !important; }',
        'html[data-dsh-wallpaper="on"][data-windows-titlebar] [class*="centerCol"] { border-radius: 0 !important; }',
      ]
    }

    /**
     * The veil between wallpaper and UI. Light themes need the backdrop lighter
     * than the text, dark themes darker; the alpha is solved from the measured
     * wallpaper luminance so any wallpaper stays legible, and the
     * "dim" slider biases the result up or down.
     */
    function scrimAlpha(themeKey) {
      const amount = clamp(Number(settings.scrim), 0, 0.75, DEFAULTS.scrim)
      const bias = (amount - DEFAULTS.scrim) * 1.5
      const luminance = wallpaperLuminance
      if (luminance === null) return clamp(0.12 + bias, 0, 0.6)
      // The picture is left almost untouched: only a very dark wallpaper needs
      // lifting in a light theme, only a very bright one needs dimming in a dark
      // theme. Everywhere else legibility comes from the panels and the ink
      // ladder, so the wallpaper keeps its own contrast.
      if (themeKey === 'light') {
        const floor = 0.3
        if (luminance >= floor) return clamp(bias, 0, 0.5)
        return clamp(((floor - luminance) / floor) * 0.38 + bias, 0, 0.5)
      }
      const ceiling = 0.62
      if (luminance <= ceiling) return clamp(bias, 0, 0.55)
      return clamp(((luminance - ceiling) / (1 - ceiling)) * 0.42 + bias, 0, 0.55)
    }

    /**
     * One theme's veil rule. Light themes veil with white and dark themes with
     * black, so text keeps its contrast on any image.
     */
    function scrimRule(selector, rgb, themeKey) {
      return `${selector} { --dsh-we-scrim: rgba(${rgb}, ${scrimAlpha(themeKey).toFixed(3)}) !important; }`
    }

    /** Average luminance of the current wallpaper (0..1), or null if unknown. */
    let wallpaperLuminance = null

    /** Last fit decision, carried into the renderer report. */
    let reportFit = { mode: 'cover', setting: 'auto', backdrop: false, aspect: null, zoom: DEFAULTS.zoom, posX: DEFAULTS.posX, posY: DEFAULTS.posY }

    /**
     * Average luminance of one loaded frame, measured in a tiny canvas.
     * Two things use it: how strong the veil has to be at an extreme, and the
     * ink ladder. Nothing else is derived from the picture.
     */
    function sampleLuminance(node) {
      try {
        const size = 24
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return null
        context.drawImage(node, 0, 0, size, size)
        const pixels = context.getImageData(0, 0, size, size).data
        let sum = 0
        for (let index = 0; index < pixels.length; index += 4) {
          sum += (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255
        }
        return sum / (pixels.length / 4)
      } catch {
        return null
      }
    }

    /** Store a fresh measurement and repaint the veil it drives. */
    function setWallpaperLuminance(value) {
      const next = Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null
      if (next === wallpaperLuminance) return
      wallpaperLuminance = next
      paintTheme()
    }

    /** Feed one loaded frame into the measurement. */
    function absorbWallpaper(node) {
      setWallpaperLuminance(sampleLuminance(node))
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    const CSS = `
/* The new-session hero badge ("预览版" / "Preview"): the user wants it gone. */
[class*="_previewBadge"] { display: none !important; }
.dsh-we-page { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 28px; color: var(--dsw-alias-label-primary); }
.dsh-we-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dsh-we-titlebox { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsh-we-title { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.dsh-we-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dsh-we-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 14px 16px;
  background: transparent; display: flex; flex-direction: column; gap: 12px; }
.dsh-we-card-quiet { background: var(--dsw-alias-bg-layer-1); }
.dsh-we-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dsh-we-row-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-we-row-name { font-size: 13px; font-weight: 500; }
.dsh-we-row-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.45; }
.dsh-we-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.dsh-we-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
/* A field that owns a control on its right: label + hint on the left. */
.dsh-we-field-label { color: var(--dsw-alias-label-secondary); font-size: 11px; font-weight: 500; letter-spacing: .02em; text-transform: uppercase; }
.dsh-we-value { color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; font-size: 11px; }
.dsh-we-slider { display: flex; align-items: center; gap: 10px; }
.dsh-we-slider input[type=range] { flex: 1; accent-color: var(--dsw-alias-brand-primary); }
.dsh-we-switch { position: relative; width: 38px; height: 22px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2); cursor: pointer; flex: none; transition: background .15s ease, border-color .15s ease; }
.dsh-we-switch[data-on="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-we-switch span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; transition: transform .15s ease; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.dsh-we-switch[data-on="true"] span { transform: translateX(16px); }
.dsh-we-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 9px; background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); }
.dsh-we-seg button { border: none; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
  padding: 5px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
.dsh-we-seg button[data-active="true"] { background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-label-primary); backdrop-filter: blur(12px) saturate(1.1);
  box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.dsh-we-chiprow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-we-swatch { width: 24px; height: 24px; padding: 0; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); }
.dsh-we-swatch[data-active="true"] { box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary); }
.dsh-we-color { width: 34px; height: 24px; padding: 0; border-radius: 7px; cursor: pointer; background: none;
  border: 1px solid var(--dsw-alias-border-l2); }
.dsh-we-chip { border: 1px solid var(--dsw-alias-border-l1); background: none; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.dsh-we-chip[data-active="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-we-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 160px; padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3));
  backdrop-filter: blur(12px) saturate(1.1); }
.dsh-we-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.dsh-we-search input::placeholder { color: var(--dsw-alias-label-secondary); }
.dsh-we-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
  padding: 6px 12px; border-radius: 8px; cursor: pointer; backdrop-filter: blur(12px) saturate(1.1); }
.dsh-we-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dsh-we-btn:disabled { opacity: .55; cursor: default; }
.dsh-we-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-we-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); gap: 12px; }
.dsh-we-tile { position: relative; display: flex; flex-direction: column; gap: 0; padding: 0; border-radius: 11px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); overflow: hidden; cursor: pointer;
  text-align: left; font: inherit; color: var(--dsw-alias-label-primary); transition: border-color .15s ease, transform .15s ease; }
.dsh-we-tile:hover { border-color: var(--dsw-alias-border-l2); transform: translateY(-1px); }
.dsh-we-tile[data-selected="true"] { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary); }
.dsh-we-thumb { position: relative; aspect-ratio: 16 / 9; width: 100%; overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.dsh-we-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsh-we-thumb-empty { display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-we-badge { position: absolute; top: 6px; left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 10px;
  background: rgba(0,0,0,.55); color: #fff; letter-spacing: .02em; backdrop-filter: blur(4px); }
.dsh-we-active-dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%;
  background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 2px rgba(0,0,0,.35); }
.dsh-we-tile-body { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px 10px; min-width: 0; }
.dsh-we-tile-title { font-size: 12px; line-height: 1.35; overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dsh-we-tile-meta { color: var(--dsw-alias-label-secondary); font-size: 10px; }
.dsh-we-status { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; flex-wrap: wrap; }
.dsh-we-status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); flex: none; }
.dsh-we-status-dot[data-tone="warn"] { background: var(--dsw-alias-state-warn-primary); }
.dsh-we-status-dot[data-tone="error"] { background: var(--dsw-alias-state-error-primary); }
.dsh-we-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5; }
.dsh-we-empty { padding: 26px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px;
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; }
.dsh-we-now { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 10px;
  background: transparent; border: 1px solid var(--dsw-alias-border-l1); }
.dsh-we-now-thumb { width: 96px; aspect-ratio: 16 / 9; border-radius: 7px; overflow: hidden; flex: none; background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); }
.dsh-we-now-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsh-we-now-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dsh-we-now-title { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-we-now-meta { color: var(--dsw-alias-label-secondary); font-size: 11px; }
/* Mock desktop: the same fills, frost and veil the real window gets, drawn in a
   small box so a slider can be judged without leaving the settings page. */
.dsh-we-preview { position: relative; width: 100%; max-width: 100%; height: auto; max-height: min(320px, 40vh); margin: 0 auto; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); isolation: isolate;
  cursor: grab; touch-action: none; user-select: none; }
.dsh-we-preview:active { cursor: grabbing; }
/* Zoom controls sit in the corner; the wheel over the picture also zooms. */
.dsh-we-preview-zoom { position: absolute; right: 8px; bottom: 8px; z-index: 3; display: flex; align-items: center; gap: 2px;
  padding: 2px; border-radius: 8px; background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-2));
  border: .5px solid var(--dsh-we-glass-line, var(--dsw-alias-border-l1)); backdrop-filter: blur(12px) saturate(1.1); }
.dsh-we-preview-zoom button { width: 24px; height: 22px; display: grid; place-items: center; border: 0; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1; cursor: pointer; }
.dsh-we-preview-zoom button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-we-preview-zoom span { min-width: 42px; text-align: center; font-size: 11px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary); }
.dsh-we-preview-viewport { position: absolute; inset: 0; overflow: hidden; background: transparent; }
.dsh-we-preview-media { position: absolute; display: block; }
.dsh-we-preview-shell { position: absolute; inset: 0; }
.dsh-we-preview-side { position: absolute; left: 0; top: 0; bottom: 0; width: 23%; min-width: 0;
  border-right: .5px solid var(--dsw-alias-border-l2); }
.dsh-we-preview-main { position: absolute; left: 23%; right: 0; top: 0; bottom: 13%; min-width: 0; }
.dsh-we-preview-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 13%; min-width: 0;
  display: flex; align-items: center; justify-content: center; padding: 0 4%; }
.dsh-we-preview-pill { width: 100%; height: 62%; border-radius: 999px; border: .5px solid var(--dsw-alias-border-l2); }
.dsh-we-preview-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-we-preview-tag { padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); color: var(--dsw-alias-label-secondary); font-size: 10px; }
.dsh-we-tile-ratio { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 999px; font-size: 10px;
  background: rgba(0, 0, 0, .55); color: #fff; letter-spacing: .02em; }
.dsh-we-adv-toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
  border: none; background: none; padding: 0; font: inherit; color: var(--dsw-alias-label-primary); cursor: pointer; }
.dsh-we-adv-toggle span:last-child { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-we-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
/* --- sidebar panel ------------------------------------------------------- */
.dsh-we-glyph { display: inline-grid; place-items: center; color: inherit; line-height: 0; }
.dsh-we-glyph[data-open="true"] { color: var(--dsw-alias-brand-primary); }
.dsh-we-side { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 2px 0 4px; }
.dsh-we-side-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-we-side-back { display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; padding: 2px 4px;
  border-radius: 6px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-we-side-back:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-we-side-title { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-we-side-now { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 10px;
  background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); border: .5px solid var(--dsh-we-glass-line, var(--dsw-alias-border-l1)); }
.dsh-we-side-thumb { width: 42px; height: 28px; flex: none; border-radius: 6px; object-fit: cover;
  background: var(--dsw-alias-bg-layer-2); }
.dsh-we-side-now-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-we-side-now-title { font-size: 12px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-we-side-now-kind { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dsh-we-side-search { width: 100%; box-sizing: border-box; height: 26px; padding: 0 8px; border-radius: 8px; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-2));
  border: .5px solid var(--dsw-alias-border-l1); }
.dsh-we-side-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-we-side-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.dsh-we-side-chip { border: .5px solid var(--dsw-alias-border-l1); background: transparent; border-radius: 999px;
  padding: 1px 8px; font: inherit; font-size: 11px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-we-side-chip[data-active="true"] { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
.dsh-we-side-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.dsh-we-side-empty { padding: 16px 4px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-we-side-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px; border: 0; border-radius: 8px;
  background: transparent; font: inherit; text-align: left; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-we-side-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-we-side-row[data-active="true"] { background: var(--dsw-alias-bg-layer-3); }
.dsh-we-side-row-thumb { width: 44px; height: 28px; flex: none; border-radius: 6px; object-fit: cover; background: var(--dsw-alias-bg-layer-2); }
.dsh-we-side-row-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dsh-we-side-row-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-we-side-row-meta { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.dsh-we-side-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-right: 2px; }
.dsh-we-page.dsh-we-compact { gap: 12px; padding: 2px 0 12px; }
      .dsh-we-placeholder { display: grid; place-items: center; min-height: 240px; }
.dsh-we-compact .dsh-we-head { gap: 10px; align-items: center; }
.dsh-we-compact .dsh-we-sub { display: none; }
.dsh-we-compact .dsh-we-title { font-size: 13px; }
.dsh-we-compact .dsh-we-card { padding: 10px; border-radius: 10px; }
.dsh-we-compact .dsh-we-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
.dsh-we-compact .dsh-we-gallery { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
.dsh-we-compact .dsh-we-preview { width: 100%; height: auto; }
.dsh-we-compact .dsh-we-preview-meta { font-size: 10px; }
/* z-index -3: the wallpaper has to sit BEHIND the per-block blur layers
   (::before with z-index -1), otherwise the opaque wallpaper paints over
   them and the per-block blur sliders look dead. -1 is taken by the blur
   layers inside the columns; -2 is left free for future scrim layers. */
.dsh-we-backdrop { position: fixed; inset: 0; z-index: -3; pointer-events: none; overflow: hidden; contain: strict; }
.dsh-we-backdrop-viewport { position: absolute; inset: 0; overflow: hidden; }
.dsh-we-backdrop-media { position: absolute; display: block; }
.dsh-we-backdrop-scrim { position: absolute; inset: 0; }
.dsh-we-select { font: inherit; font-size: 12px; padding: 5px 8px; border-radius: 8px; color: var(--dsw-alias-label-primary);
  background: var(--dsh-we-glass, var(--dsw-alias-bg-layer-3)); border: 1px solid var(--dsw-alias-border-l1);
  backdrop-filter: blur(12px) saturate(1.1); }
.dsh-we-check { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dsw-alias-label-primary); }
.dsh-we-check input { accent-color: var(--dsw-alias-brand-primary); }
`

    /** Create the two style elements this plugin owns. */
    function injectStyles() {
      try {
        const base = document.createElement('style')
        base.setAttribute('data-dsh-wallpaper-engine', 'base')
        base.textContent = CSS
        document.head.appendChild(base)
        const paint = document.createElement('style')
        paint.setAttribute('data-dsh-wallpaper-engine', 'paint')
        document.head.appendChild(paint)
        styleRefs.base = base
        styleRefs.paint = paint
        paintTheme()
      } catch {
        /* a missing head only costs the plugin its styling */
      }
    }

    // ------------------------------------------------------------------
    // Backdrop (shell.overlay — a portal into body, behind the app frame)
    // ------------------------------------------------------------------

    /** The wallpaper the layer should show right now, or null. */
    function currentItem() {
      if (!settings.enabled) return null
      if (settings.mode === 'pin') return settings.pinned && settings.pinned.playFile ? settings.pinned : null
      const monitors = (data.state && data.state.monitors) || []
      if (monitors.length === 0) return null
      const exact = monitors.find((row) => row.monitor === settings.monitor)
      const row = exact || monitors[0]
      return row && row.item && row.item.playFile ? row.item : null
    }

    /** One wallpaper surface: media element + scrim. */
    function Backdrop() {
      useLocaleVersion()
      useStoreVersion()
      const videoRef = useRef(null)
      // Natural shape of the current media: `auto` fit needs it to decide
      // between filling the screen and keeping the picture whole.
      const [mediaAspect, setMediaAspect] = useState(null)
      const [natural, setNatural] = useState({ w: 0, h: 0 })
      const item = currentItem()
      const url = item ? mediaUrl(item.playFile) : ''
      const isVideo = Boolean(item && item.playKind === 'video')
      const poster = item && item.preview && item.preview !== item.playFile ? mediaUrl(item.preview) : undefined

      // Pin mode never polls, but the state still says whether Wallpaper Engine
      // is installed and which monitors exist — read it once so the layer (and
      // the Host report) is not blind when the settings page is closed.
      useEffect(() => {
        if (!settings.enabled || data.state) return
        loadState()
      }, [settings.enabled, settings.mode])

      // Follow mode is live: the host re-reads Wallpaper Engine's config.
      useEffect(() => {
        if (!settings.enabled || settings.mode !== 'follow') return undefined
        let alive = true
        const tick = () => {
          if (!alive) return
          loadState()
        }
        tick()
        const timer = window.setInterval(tick, POLL_MS)
        return () => {
          alive = false
          window.clearInterval(timer)
        }
      }, [settings.enabled, settings.mode])

      // Video playback follows the mute/pause preferences.
      useEffect(() => {
        const element = videoRef.current
        if (!element) return
        element.muted = settings.muted !== false
        if (settings.paused) element.pause()
        else {
          const played = element.play()
          if (played && typeof played.catch === 'function') played.catch(() => {})
        }
      }, [settings.muted, settings.paused, url, isVideo])

      useEffect(() => {
        paintTheme()
      }, [settings.enabled, settings.surface])

      // Tell the Host what the layer resolved to, once the media settled.
      useEffect(() => {
        if (!url) return undefined
        const timer = window.setTimeout(() => {
          reportRenderer('mounted')
        }, 1500)
        return () => window.clearTimeout(timer)
      }, [url, settings.enabled])

      // A new wallpaper invalidates the measured brightness until it loads.
      useEffect(() => {
        setWallpaperLuminance(null)
        setMediaAspect(null)
      }, [url])

      // Remember what actually appeared on screen: the library sorts "last used
      // first, then most used", and follow mode changes the wallpaper without
      // any click, so the backdrop is the only place that sees every change.
      useEffect(() => {
        if (item) recordUse(item, 'display')
      }, [item ? item.id : ''])

      if (!url) return null

      const blur = clamp(Number(settings.blur), 0, 32, 0)
      const fitSetting = settings.fit
      const viewportAspect = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 9
      const shell = placement(fitSetting, mediaAspect, viewportAspect)
      const filter = blur > 0 ? `blur(${blur}px)` : undefined
      const frame = framing(settings.zoom, settings.posX, settings.posY)
      const mediaStyle = {
        objectFit: shell.objectFit,
        objectPosition: frame.objectPosition,
        // Sized + offset by layout, so no ancestor transform can upset the
        // backdrop-filter sampling of the columns in front of it.
        width: `${frame.widthPct}%`,
        height: `${frame.heightPct}%`,
        left: `${frame.leftPct}%`,
        top: `${frame.topPct}%`,
        right: 'auto',
        bottom: 'auto',
        filter,
        // A blur softens the media's own edge, so overscale it slightly.
        transform: blur > 0 && shell.mode !== 'center' ? 'scale(1.06)' : undefined,
        transition: 'opacity .35s ease',
      }
      reportFit = {
        mode: shell.mode,
        setting: shell.setting,
        backdrop: shell.backdrop,
        aspect: mediaAspect ? Number(mediaAspect.toFixed(3)) : null,
        zoom: frame.zoom,
        posX: frame.posX,
        posY: frame.posY,
      }

      // `object-fit: none` (centre mode) draws the picture at its pixel size, so
      // zoom would not scale it. Draw it as a background instead: exact size and
      // offset, and the preview can reproduce the same crop by scaling the ratio.
      const naturalWidth = natural.w
      const naturalHeight = natural.h
      const centreStyle =
        shell.mode === 'center' && naturalWidth > 0
          ? {
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${url}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${(naturalWidth * Number(frame.scale)).toFixed(1)}px ${(naturalHeight * Number(frame.scale)).toFixed(1)}px`,
              backgroundPosition: `calc(50% + ${(((Number(frame.leftPct) / 100) * window.innerWidth) || 0).toFixed(1)}px) calc(50% + ${(((Number(frame.topPct) / 100) * window.innerHeight) || 0).toFixed(1)}px)`,
              filter,
              transition: 'opacity .35s ease',
            }
          : null

      const layer = h(
        'div',
        {
          className: 'dsh-we-backdrop',
          'data-dsh-wallpaper-backdrop': item.id,
          'data-fit': shell.mode,
          'aria-hidden': 'true',
        },
        h(
          'div',
          { className: 'dsh-we-backdrop-viewport' },
          centreStyle
            ? h('div', { key: url, className: 'dsh-we-backdrop-media dsh-we-backdrop-centre', style: centreStyle })
            : isVideo
            ? h('video', {
                key: url,
                ref: videoRef,
                className: 'dsh-we-backdrop-media',
                src: url,
                poster,
                style: mediaStyle,
                autoPlay: true,
                loop: true,
                playsInline: true,
                muted: true,
                preload: 'auto',
                disablePictureInPicture: true,
                onLoadedData: (event) => {
                  const node = event.currentTarget
                  setMediaAspect(node.videoWidth && node.videoHeight ? node.videoWidth / node.videoHeight : null)
                  setNatural({ w: node.videoWidth || 0, h: node.videoHeight || 0 })
                  absorbWallpaper(node)
                  reportRenderer('video-loaded')
                },
                onError: () => reportRenderer('video-error'),
              })
            : h('img', {
                key: url,
                className: 'dsh-we-backdrop-media',
                src: url,
                alt: '',
                draggable: false,
                decoding: 'async',
                style: mediaStyle,
                onLoad: (event) => {
                  const node = event.currentTarget
                  setMediaAspect(node.naturalWidth && node.naturalHeight ? node.naturalWidth / node.naturalHeight : null)
                  setNatural({ w: node.naturalWidth || 0, h: node.naturalHeight || 0 })
                  absorbWallpaper(node)
                  reportRenderer('image-load')
                },
                onError: () => reportRenderer('image-error'),
              }),
        ),
        h('div', { className: 'dsh-we-backdrop-scrim', style: { background: 'var(--dsh-we-scrim, rgba(0, 0, 0, 0))' } }),
      )

      return reactDom.createPortal(layer, document.body)
    }

    // ------------------------------------------------------------------
    // Settings page
    // ------------------------------------------------------------------

    /** One labeled preference row. */
    function Row({ name, hint, children }) {
      return h(
        'div',
        { className: 'dsh-we-row' },
        h('div', { className: 'dsh-we-row-label' }, h('span', { className: 'dsh-we-row-name' }, name), hint ? h('span', { className: 'dsh-we-row-hint' }, hint) : null),
        children,
      )
    }

    /** True when the current look is exactly this preset. */
    function matchesPreset(preset) {
      return (
        Number(settings.surface) === preset.surface &&
        Number(settings.blur) === preset.blur &&
        Math.abs(Number(settings.scrim) - preset.scrim) < 0.005
      )
    }

    /** One slider with a live value readout. */
    function Slider({ label, value, min, max, step, display, onChange }) {
      return h(
        'div',
        { className: 'dsh-we-field' },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } },
          h('span', { className: 'dsh-we-field-label' }, label),
          h('span', { className: 'dsh-we-value' }, display),
        ),
        h(
          'div',
          { className: 'dsh-we-slider' },
          h('input', {
            type: 'range',
            min,
            max,
            step,
            value,
            onChange: (event) => onChange(Number(event.target.value)),
          }),
        ),
      )
    }

    /** An accessible switch. */
    function Switch({ checked, onChange, title }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-we-switch',
          'data-on': checked ? 'true' : 'false',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': title,
          onClick: () => onChange(!checked),
        },
        h('span', null),
      )
    }

    /** The active wallpaper strip. */
    function NowCard({ item, subtitle }) {
      return h(
        'div',
        { className: 'dsh-we-now' },
        h(
          'div',
          { className: 'dsh-we-now-thumb' },
          item && item.preview ? h('img', { src: mediaUrl(item.preview), alt: '', loading: 'lazy', decoding: 'async' }) : null,
        ),
        h(
          'div',
          { className: 'dsh-we-now-text' },
          h('span', { className: 'dsh-we-now-title' }, item ? item.title || t('unknown') : t('statusNoActive')),
          h('span', { className: 'dsh-we-now-meta' }, subtitle),
          item && item.workshopUrl
            ? h(
                'a',
                {
                  className: 'dsh-we-now-meta',
                  href: item.workshopUrl,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none' },
                },
                `Steam · ${item.workshopId}`,
              )
            : null,
        ),
      )
    }

    /**
     * The drop-in folder: the fallback that makes the plugin usable with no
     * Wallpaper Engine at all. The path is shown verbatim (selectable) because
     * "find the Steam library yourself" was the whole failure mode before.
     */
    function FolderCard({ folder, compact, onRescan }) {
      const [copied, setCopied] = useState(false)
      const [busy, setBusy] = useState(false)
      const [failed, setFailed] = useState(false)
      const dir = (folder && folder.path) || ''
      const count = Number(folder && folder.count) || 0
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(dir)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }
      const open = async () => {
        if (busy) return
        setBusy(true)
        try {
          await callHost('openFolder', {})
          setFailed(false)
        } catch {
          // The path is still selectable, so the user is never stuck.
          setFailed(true)
        }
        setBusy(false)
      }
      if (dir === '') return null
      const pathStyle = {
        marginTop: '6px',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '11px',
        lineHeight: '1.5',
        wordBreak: 'break-all',
        userSelect: 'text',
        color: 'var(--dsw-alias-label-primary)',
      }
      const buttonStyle = { marginRight: '6px', marginTop: '8px' }
      return h(
        'div',
        { className: 'dsh-we-card' },
        h(
          'div',
          { className: 'dsh-we-row' },
          h('span', { className: 'dsh-we-title', style: { fontSize: '13px' } }, t('folderTitle')),
        ),
        compact ? null : h('div', { className: 'dsh-we-row-hint' }, t('folderHint')),
        h('div', { style: pathStyle, title: dir }, dir),
        h(
          'div',
          null,
          h(
            'button',
            { type: 'button', className: 'dsh-we-btn', style: buttonStyle, disabled: busy, onClick: open },
            t('openFolder'),
          ),
          h('button', { type: 'button', className: 'dsh-we-btn', style: buttonStyle, onClick: copy }, copied ? t('copied') : t('copyPath')),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-we-btn',
              style: buttonStyle,
              disabled: data.loading,
              onClick: () => {
                if (typeof onRescan === 'function') onRescan()
              },
            },
            data.loading ? t('scanning') : t('refresh'),
          ),
        ),
        h('div', { className: 'dsh-we-row-hint', style: { marginTop: '6px' } }, count ? fmt(t('folderCount'), { count }) : t('folderEmpty')),
        failed ? h('div', { className: 'dsh-we-row-hint', style: { marginTop: '4px' } }, t('openFolderFailed')) : null,
      )
    }

    /** Human label for a media shape: 16:9, 1:1, 9:16, or the pixel size. */
    function ratioLabel(width, height) {
      if (!width || !height) return ''
      const target = width / height
      const table = [
        [21, 9],
        [32, 9],
        [16, 9],
        [16, 10],
        [4, 3],
        [3, 2],
        [1, 1],
        [2, 3],
        [3, 4],
        [9, 16],
      ]
      for (const [w, h] of table) {
        if (Math.abs(target - w / h) / (w / h) < 0.045) return `${w}:${h}`
      }
      return `${width}×${height}`
    }

    /** One library tile. */
    function Tile({ item, selected, active, onPick, used }) {
      const [ratio, setRatio] = useState('')
      const thumbUrl = item.preview ? mediaUrl(item.preview) : ''
      // A video in the drop-in folder has no preview file; its first frame is
      // the next best thumbnail, so the tile is not an empty box.
      const videoThumbUrl = thumbUrl === '' && item.playKind === 'video' ? mediaUrl(item.playFile) : ''
      const kindLabel = item.source === 'folder'
        ? t('folder')
        : item.source === 'local'
          ? t('local')
          : item.kind === 'video'
            ? t('video')
            : item.kind === 'web'
              ? t('web')
              : item.kind === 'image'
                ? t('image')
                : t('scene')
      const badge = kindLabel
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-we-tile',
          'data-selected': selected ? 'true' : 'false',
          title: item.title || t('unknown'),
          onClick: () => onPick(item),
        },
        h(
          'div',
          { className: 'dsh-we-thumb' },
          thumbUrl
            ? h('img', {
                src: thumbUrl,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
                onLoad: (event) => {
                  const node = event.currentTarget
                  setRatio(ratioLabel(node.naturalWidth, node.naturalHeight))
                },
              })
            : videoThumbUrl
              ? h('video', {
                  src: videoThumbUrl,
                  muted: true,
                  preload: 'metadata',
                  playsInline: true,
                  onLoadedMetadata: (event) => {
                    const node = event.currentTarget
                    setRatio(ratioLabel(node.videoWidth, node.videoHeight))
                  },
                })
              : h('div', { className: 'dsh-we-thumb-empty' }, t('previewMissing')),
          h('span', { className: 'dsh-we-badge' }, badge),
          ratio ? h('span', { className: 'dsh-we-tile-ratio' }, ratio) : null,
          active ? h('span', { className: 'dsh-we-active-dot', title: t('activeNow') }) : null,
        ),
        h(
          'div',
          { className: 'dsh-we-tile-body' },
          h('span', { className: 'dsh-we-tile-title' }, item.title || t('unknown')),
          h(
            'span',
            { className: 'dsh-we-tile-meta' },
            kindLabel,
            used && used > 1 ? ` · \u00d7${used}` : '',
          ),
        ),
      )
    }

    /** A mock desktop drawn with the current settings. */
    function Preview({ item }) {
      useStoreVersion()
      const [previewAspect, setPreviewAspect] = useState(0)
      // Live drag/wheel feedback: drafts are drawn but only persisted when the
      // gesture ends, so a pointermove never writes localStorage.
      const [posXDraft, setPosXDraft] = useState(null)
      const [posYDraft, setPosYDraft] = useState(null)
      const [zoomDraft, setZoomDraft] = useState(null)
      const dragRef = useRef(null)
      const zoomCommit = useRef(null)
      useEffect(() => () => {
        if (zoomCommit.current) window.clearTimeout(zoomCommit.current)
      }, [])
      let dark = false
      try {
        dark = document.body.hasAttribute('data-ds-dark-theme')
      } catch {
        dark = false
      }
      const themeKey = dark ? 'dark' : 'light'
      const levels = surfaces()
      const blocks = blockBlur()
      const blur = clamp(Number(settings.blur), 0, 32, 0)
      const veil = scrimAlpha(themeKey)
      const tint = dark ? '20, 21, 26' : '255, 255, 255'
      const fillOf = (percent) => `rgba(${tint}, ${(clamp(percent, 0, 100, 0) / 100).toFixed(3)})`
      const frostOf = (pixels) => (Number(pixels) > 0 ? `blur(${Number(pixels)}px) saturate(1.1)` : undefined)
      // Same decision the real backdrop makes for this window, then drawn
      // inside a box that has the window's exact shape — that is what makes the
      // preview honest instead of a decorative mock.
      const windowAspect = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 9
      const mediaAspectPreview = previewAspect || reportFit.aspect || 0
      const shell = placement(settings.fit, mediaAspectPreview, windowAspect)
      // Same source as the real layer: the preview must never measure a
      // thumbnail's aspect while the window shows the video's aspect, or the
      // two would pick different fit modes (that is what made them differ).
      const url = item ? mediaUrl(item.playFile) : ''
      const isVideoPreview = Boolean(item && item.playKind === 'video')
      const frame = framing(
        zoomDraft === null ? settings.zoom : zoomDraft,
        posXDraft === null ? settings.posX : posXDraft,
        posYDraft === null ? settings.posY : posYDraft,
      )
      const mediaBox = {
        objectFit: shell.objectFit,
        objectPosition: frame.objectPosition,
        width: `${frame.widthPct}%`,
        height: `${frame.heightPct}%`,
        left: `${frame.leftPct}%`,
        top: `${frame.topPct}%`,
        right: 'auto',
        bottom: 'auto',
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
      }
      // `object-fit: none` draws the picture at its pixel size, so a small
      // preview box would show a different crop than the window. In centre mode
      // the picture is drawn as a background sized by the box/window ratio, so
      // both show the same region.
      const boxRef = useRef(null)
      const [boxWidth, setBoxWidth] = useState(0)
      const [natural, setNatural] = useState({ w: 0, h: 0 })
      useEffect(() => {
        const node = boxRef.current
        if (!node || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver((entries) => {
          const rect = entries[0] && entries[0].contentRect
          if (rect && rect.width > 0) setBoxWidth(rect.width)
        })
        observer.observe(node)
        return () => observer.disconnect()
      }, [])
      const windowWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280
      const ratio = boxWidth > 0 ? boxWidth / windowWidth : 0
      const centreMode = shell.mode === 'center' && natural.w > 0 && ratio > 0
      const centreStyle = centreMode
        ? {
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${url}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${(natural.w * Number(frame.scale) * ratio).toFixed(1)}px ${(natural.h * Number(frame.scale) * ratio).toFixed(1)}px`,
            backgroundPosition: `calc(50% + ${((Number(frame.leftPct) / 100) * windowWidth * ratio).toFixed(1)}px) calc(50% + ${((Number(frame.topPct) / 100) * (windowWidth / windowAspect) * ratio).toFixed(1)}px)`,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
          }
        : null
      return h(
        'div',
        { className: 'dsh-we-field', 'data-dsh-preview': 'true' },
        h(
          'div',
          {
            className: 'dsh-we-preview',
            ref: boxRef,
            'data-fit': shell.mode,
            style: { aspectRatio: windowAspect.toFixed(3) },
            title: t('framingHint'),
            onPointerDown: (event) => {
              if (event.button !== 0) return
              dragRef.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                posX: settings.posX,
                posY: settings.posY,
                width: event.currentTarget.clientWidth || 1,
                height: event.currentTarget.clientHeight || 1,
              }
              try {
                event.currentTarget.setPointerCapture(event.pointerId)
              } catch {
                /* synthetic events have no capturable pointer */
              }
            },
            onPointerMove: (event) => {
              const drag = dragRef.current
              if (!drag || drag.id !== event.pointerId) return
              // The picture follows the pointer: dragging right moves the media
              // right (posX grows), which reveals what was on the left. Only the
              // slack that zoom created can move, so the divisor is the grow
              // factor — at 100% there is nothing to drag.
              const grow = Math.max(0.02, (clamp(Number(settings.zoom), 100, 300, DEFAULTS.zoom) - 100) / 100)
              setPosXDraft(clamp(drag.posX + ((event.clientX - drag.x) / drag.width) * 100 / grow, -50, 50, drag.posX))
              setPosYDraft(clamp(drag.posY + ((event.clientY - drag.y) / drag.height) * 100 / grow, -50, 50, drag.posY))
            },
            onPointerUp: (event) => {
              const drag = dragRef.current
              if (!drag || drag.id !== event.pointerId) return
              dragRef.current = null
              try {
                event.currentTarget.releasePointerCapture(event.pointerId)
              } catch {
                /* the pointer may already be released */
              }
              // Commit from the pointer delta, not from the draft state: two
              // events landing in one React batch would read a stale draft and
              // the crop would snap back.
              const grow = Math.max(0.02, (clamp(Number(settings.zoom), 100, 300, DEFAULTS.zoom) - 100) / 100)
              const patch = {}
              if (event.clientX !== drag.x) {
                patch.posX = Math.round(clamp(drag.posX + ((event.clientX - drag.x) / drag.width) * 100 / grow, -50, 50, drag.posX))
              }
              if (event.clientY !== drag.y) {
                patch.posY = Math.round(clamp(drag.posY + ((event.clientY - drag.y) / drag.height) * 100 / grow, -50, 50, drag.posY))
              }
              setPosXDraft(null)
              setPosYDraft(null)
              if (Object.keys(patch).length > 0) updateSettings(patch)
            },
            onPointerCancel: () => {
              dragRef.current = null
              setPosXDraft(null)
              setPosYDraft(null)
            },
            onWheel: (event) => {
              // Wheel and pinch (a trackpad pinch arrives as ctrl+wheel) zoom the
              // picture, which is what people expect over a photo. At the limits
              // the event is passed through so the settings page still scrolls —
              // scrolling no longer shrinks the wallpaper by accident.
              const base = zoomDraft === null ? settings.zoom : zoomDraft
              const step = event.ctrlKey ? 6 : 12
              const next = clamp(Math.round(base - event.deltaY * 0.05 * step), 100, 300, base)
              if (next === base) return
              event.preventDefault()
              setZoomDraft(next)
              if (zoomCommit.current) window.clearTimeout(zoomCommit.current)
              zoomCommit.current = window.setTimeout(() => {
                zoomCommit.current = null
                setZoomDraft(null)
                updateSettings({ zoom: next })
              }, 240)
            },
            onDoubleClick: () => {
              if (zoomCommit.current) window.clearTimeout(zoomCommit.current)
              zoomCommit.current = null
              setZoomDraft(null)
              setPosXDraft(null)
              setPosYDraft(null)
              updateSettings({ zoom: DEFAULTS.zoom, posX: DEFAULTS.posX, posY: DEFAULTS.posY })
            },
          },
          h(
            'div',
            { className: 'dsh-we-preview-viewport' },
            url
              ? centreMode
                ? h('div', { className: 'dsh-we-preview-media dsh-we-preview-centre', style: centreStyle })
                : isVideoPreview
                ? h('video', {
                    className: 'dsh-we-preview-media',
                    src: url,
                    muted: true,
                    loop: true,
                    autoPlay: true,
                    playsInline: true,
                    disablePictureInPicture: true,
                    style: mediaBox,
                    onLoadedData: (event) => {
                      const node = event.currentTarget
                      setPreviewAspect(node.videoWidth && node.videoHeight ? node.videoWidth / node.videoHeight : 0)
                      setNatural({ w: node.videoWidth || 0, h: node.videoHeight || 0 })
                    },
                  })
                : h('img', {
                    className: 'dsh-we-preview-media',
                    src: url,
                    alt: '',
                    draggable: false,
                    loading: 'lazy',
                    decoding: 'async',
                    style: mediaBox,
                    onLoad: (event) => {
                      const node = event.currentTarget
                      setPreviewAspect(node.naturalWidth && node.naturalHeight ? node.naturalWidth / node.naturalHeight : 0)
                      setNatural({ w: node.naturalWidth || 0, h: node.naturalHeight || 0 })
                    },
                  })
              : h('div', { className: 'dsh-we-preview-media', style: { background: 'var(--dsw-alias-bg-layer-2)' } }),
          ),
          veil > 0.004
            ? h('div', { className: 'dsh-we-preview-veil', style: { background: `rgba(${dark ? '0, 0, 0' : '255, 255, 255'}, ${veil.toFixed(3)})` } })
            : null,
          h(
            'div',
            { className: 'dsh-we-preview-shell' },
            // The real window is a 23% sidebar, a reading column with its own
            // wash, and a bottom composer row. The preview draws only those
            // tints — no drawn-on text or fake chrome — so what it shows is the
            // wallpaper seen through the same percentages the app uses.
            h('div', {
              className: 'dsh-we-preview-side',
              style: { background: fillOf(levels.sidebar), backdropFilter: frostOf(blocks.side) },
            }),
            h('div', {
              className: 'dsh-we-preview-main',
              style: { background: fillOf(levels.content), backdropFilter: frostOf(blocks.main) },
            }),
            // The bottom strip has no tint of its own in the real window
            // (the shell is clear); only the composer pill is filled.
            h(
              'div',
              { className: 'dsh-we-preview-bar', style: { background: 'transparent', backdropFilter: frostOf(blocks.bottom) } },
              h('div', { className: 'dsh-we-preview-pill', style: { background: fillOf(levels.glass), backdropFilter: frostOf(Math.max(12, Number(settings.blurBottom) || 0)) } }),
            ),
          ),
          // Zoom is buttons + slider on purpose: a wheel handler here would eat
          // the settings page's own scrolling, which felt unreasonable.
          h(
            'div',
            {
              className: 'dsh-we-preview-zoom',
              onPointerDown: (event) => event.stopPropagation(),
              onDoubleClick: (event) => event.stopPropagation(),
            },
            h(
              'button',
              {
                type: 'button',
                title: t('zoomOut'),
                'aria-label': t('zoomOut'),
                onClick: () => updateSettings({ zoom: clamp(Math.round(settings.zoom / 1.1), 100, 300, settings.zoom) }),
              },
              '−',
            ),
            h('span', null, `${settings.zoom}%`),
            h(
              'button',
              {
                type: 'button',
                title: t('zoomIn'),
                'aria-label': t('zoomIn'),
                onClick: () => updateSettings({ zoom: clamp(Math.round(settings.zoom * 1.1), 100, 300, settings.zoom) }),
              },
              '+',
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-we-preview-meta' },
          h('span', { className: 'dsh-we-preview-tag' }, t('preview')),
          h('span', null, `${t('surface')} ${levels.sidebar} / ${levels.content} / ${levels.glass}%`),
          h('span', null, `${t('scrim')} ${Math.round(veil * 100)}%`),
          h('span', null, settings.zoom > 100 ? `${t('zoom')} ${settings.zoom}%` : t('framingZoomFirst')),
          item
            ? h(
                'span',
                null,
                item.kind === 'video' ? t('video') : item.kind === 'image' ? t('image') : t('scene'),
              )
            : null,
        ),
      )
    }

    /**
     * The preview must never be able to take the settings page down, so it is
     * wrapped in an error boundary that reports the failure instead.
     */
    class SafePreview extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        noteError('preview', error)
      }

      render() {
        return this.state.failed ? null : h(Preview, this.props)
      }
    }

    /**
     * The glyph that sits in the sidebar's panel list. PanelRow renders it inside
     * its own button, whose click switches the main column, so this click stops
     * propagation and opens the sidebar panel instead.
     */
    function PanelGlyph(props) {
      const size = (props && props.size) || 16
      return h(
        'span',
        {
          className: 'dsh-we-glyph',
          'data-sidebar-panel': 'wallpaper-engine',
          'data-open': sidebarOpen ? 'true' : 'false',
          title: t('sidebarPanel'),
          onPointerDown: (event) => event.stopPropagation(),
          onClick: (event) => {
            event.stopPropagation()
            event.preventDefault()
            // Toggle what is actually on screen, not a cached flag: the sidebar
            // also opens from the row click, so the flag can lag behind the DOM.
            const shown = Boolean(document.querySelector('[data-dsh-side-panel="true"]'))
            setSidebarOpen(!shown)
          },
        },
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
          h('rect', { x: '2.5', y: '4', width: '19', height: '16', rx: '3', stroke: 'currentColor', 'stroke-width': '1.6' }),
          h('circle', { cx: '8.5', cy: '9.5', r: '1.7', fill: 'currentColor' }),
          h('path', { d: 'M3 17.5l5.2-4.6 4.1 3.4 3.1-2.6L21 17.5', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        ),
      )
    }

    /** The wallpaper panel that replaces the sidebar list while it is open. */
    function SidebarWallpaperPanel() {
      useLocaleVersion()
      useStoreVersion()
      return h(
        'div',
        { className: 'dsh-we-side', 'data-dsh-side-panel': 'true' },
        h(
          'div',
          { className: 'dsh-we-side-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-we-side-back',
              title: t('back'),
              onClick: () => setSidebarOpen(false),
            },
            '‹',
            h('span', null, t('back')),
          ),
          h('span', { className: 'dsh-we-side-title' }, t('sidebarPanel')),
        ),
        h('div', { className: 'dsh-we-side-body' }, h(WallpaperSettings, { compact: true })),
      )
    }

    /**
     * Clicking the sidebar row (its label, not just the glyph) lands here. The
     * sidebar surface is opened and the main column is handed back to the
     * conversation. `selectPanel(null)` is the documented way back; passing
     * 'conversation' throws because that is not a registered main key. The
     * surface below is only a fallback, so the column can never go blank.
     */
    function WallpaperMainPanel() {
      useLocaleVersion()
      useStoreVersion()
      // Runs before paint: the row click opens the sidebar and hands the main
      // column back to the conversation in the same frame, so this panel is never
      // seen (it used to flash, reported as "点一下主区会这样再还原").
      useLayoutEffect(() => {
        setSidebarOpen(true)
        const layout = layoutService()
        if (layout && typeof layout.selectPanel === 'function') {
          try {
            layout.selectPanel(null)
          } catch {
            /* leave the placeholder below; never blank the column */
          }
        }
      }, [])
      // Deliberately cheap: mounting the full surface here loaded the library and
      // drew the preview just to throw it away one frame later.
      return h(
        'div',
        { className: 'dsh-we-page dsh-we-placeholder' },
        h(
          'div',
          { className: 'dsh-we-card' },
          h('div', { className: 'dsh-we-row-hint' }, t('sidebarOnlyHint')),
          h(
            'button',
            { type: 'button', className: 'dsh-we-btn', onClick: () => setSidebarOpen(true) },
            t('openSidebarPanel'),
          ),
        ),
      )
    }

    /** The settings page. */
    /** Plain greys offered next to the colour picker: white, light grey, ink. */
    const INK_SWATCHES = ['#ffffff', '#e6e9ee', '#0b0d11']

    function WallpaperSettings(props) {
      const compact = Boolean(props && props.compact)
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [advanced, setAdvanced] = useState(false)
      useLocaleVersion()
      useStoreVersion()

      useEffect(() => {
        ensureData()
      }, [])

      const state = data.state
      const library = data.library
      const items = (library && library.items) || []
      const counts = (library && library.counts) || {}
      const installed = state ? state.installed !== false : true
      const monitors = (state && state.monitors) || []
      const activeRow = monitors.find((row) => row.monitor === settings.monitor) || monitors[0] || null
      const activeItem = activeRow ? activeRow.item : null
      const selectedId = settings.mode === 'pin' && settings.pinned ? settings.pinned.id : activeItem ? activeItem.id : ''
      const following = settings.mode === 'follow'
      const displayItem = following ? activeItem : settings.pinned
      const localCount = items.filter((item) => item.source === 'local').length
      const recentCount = items.filter((item) => usage[item.id]).length
      const countFor = (key) => (key === 'local' ? localCount : key === 'recent' ? recentCount : counts[key] || 0)
      // The drop-in folder is the fallback when Wallpaper Engine is absent, so
      // it is read from state (cheap) and the library (authoritative count).
      const folder = (library && library.folder) || (state && state.folder) || null
      const folderCount = Number(folder && folder.count) || 0
      const usable = installed || folderCount > 0
      // The ink row reports the ratio the reading column actually shows, so the
      // number in the panel is the number the window gets.
      const inkTheme = (() => {
        try {
          return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
        } catch {
          return 'light'
        }
      })()
      const inkSample = inkFor(effectiveLuminance(inkTheme, surfaces().layer1), inkTheme)

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const matched = items.filter((item) => {
          if (filter === 'local' && item.source !== 'local') return false
          if (filter === 'recent' && !usage[item.id]) return false
          if (filter !== 'all' && filter !== 'local' && filter !== 'recent' && item.kind !== filter) return false
          if (needle === '') return true
          const haystack = `${item.title || ''} ${(item.tags || []).join(' ')} ${item.workshopId || ''}`.toLowerCase()
          return haystack.includes(needle)
        })
        return sortByUsage(matched)
      }, [items, filter, query, usageVersion])

      const pick = (item) => {
        recordUse(item, 'pick')
        updateSettings({ enabled: true, mode: 'pin', pinned: item })
      }

      const statusTone = data.error ? 'error' : usable ? 'ok' : 'warn'
      const scannedAt = library && library.scannedAt ? new Date(library.scannedAt) : null
      const scannedLabel = scannedAt
        ? fmt(t('statusScanned'), { time: scannedAt.toLocaleTimeString(dict() === STRINGS.zh ? 'zh-CN' : 'en-US') })
        : ''

      return h(
        'div',
        { className: compact ? 'dsh-we-page dsh-we-compact' : 'dsh-we-page' },
        h(
          'div',
          { className: 'dsh-we-head' },
          h(
            'div',
            { className: 'dsh-we-titlebox' },
            h('span', { className: 'dsh-we-title' }, t('sectionTitle')),
            h('span', { className: 'dsh-we-sub' }, t('sectionSubtitle')),
          ),
          h(Switch, {
            checked: settings.enabled,
            title: t('enable'),
            onChange: (enabled) => updateSettings({ enabled }),
          }),
        ),

        // In the narrow sidebar the status block is only worth the space when it
        // has something to say (an error); otherwise the preview comes first.
        compact && !data.error
          ? null
          : h(
          'div',
          { className: 'dsh-we-card' },
          h('div', { className: 'dsh-we-row-hint' }, t('enableHint')),
          h(
            'div',
            { className: 'dsh-we-status' },
            h('span', { className: 'dsh-we-status-dot', 'data-tone': statusTone }),
            h(
              'span',
              null,
              data.error
                ? data.error
                : installed
                  ? fmt(t('statusReady'), { count: counts.all || items.length })
                  : folderCount > 0
                    ? fmt(t('statusFolder'), { count: folderCount })
                    : t('notInstalled'),
            ),
            scannedLabel ? h('span', null, `· ${scannedLabel}`) : null,
          ),
          data.error
            ? h(
                'div',
                { className: 'dsh-we-error' },
                `${t('unreachable')} ${t('unreachableHint')}`,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-we-btn',
                    style: { marginLeft: '8px' },
                    onClick: () => {
                      loadState()
                      loadLibrary(true)
                    },
                  },
                  t('retry'),
                ),
              )
            : null,
          usable && !data.error
            ? h(NowCard, {
                item: displayItem,
                subtitle: following
                  ? displayItem
                    ? fmt(t('statusActive'), { title: displayItem.title || t('unknown') })
                    : t('statusNoActive')
                  : displayItem
                    ? t('selected')
                    : t('modePin'),
              })
            : null,
          !installed && folderCount === 0
            ? h(
                'div',
                { className: 'dsh-we-error' },
                t('notInstalled'),
                h('div', { className: 'dsh-we-row-hint' }, t('notInstalledHint')),
              )
            : null,
        ),

        // Always present: with no Wallpaper Engine this card IS the feature, and
        // even with it installed a personal folder is the easiest way in.
        data.error
          ? null
          : h(FolderCard, {
              folder,
              compact,
              onRescan: () => {
                invalidateSelection()
                loadLibrary(true)
              },
            }),

        h(
          'div',
          { className: 'dsh-we-card' },
          h(SafePreview, { item: displayItem }),
          compact
            ? null
            : h(Row, {
                name: t('mode'),
                hint: t('modeHint'),
              },
            h(
              'div',
              { className: 'dsh-we-seg' },
              h(
                'button',
                {
                  type: 'button',
                  'data-active': following ? 'true' : 'false',
                  onClick: () => updateSettings({ mode: 'follow' }),
                },
                t('modeFollow'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  'data-active': following ? 'false' : 'true',
                  onClick: () => updateSettings({ mode: 'pin' }),
                },
                t('modePin'),
              ),
            ),
          ),
          monitors.length > 1 && following && !compact
            ? h(
                'div',
                { className: 'dsh-we-field' },
                h('span', { className: 'dsh-we-field-label' }, t('monitor')),
                h(
                  'select',
                  {
                    className: 'dsh-we-select',
                    value: settings.monitor,
                    onChange: (event) => updateSettings({ monitor: event.target.value }),
                  },
                  monitors.map((row) =>
                    h('option', { key: row.monitor, value: row.monitor }, `${row.monitor}${row.item ? ` · ${row.item.title}` : ''}`),
                  ),
                ),
              )
            : null,
          compact
            ? null
            : h(
            'div',
            { className: 'dsh-we-field' },
            h('span', { className: 'dsh-we-field-label' }, t('preset')),
            h(
              'div',
              { className: 'dsh-we-seg', style: { alignSelf: 'flex-start' } },
              PRESETS.map((preset) =>
                h(
                  'button',
                  {
                    key: preset.id,
                    type: 'button',
                    'data-active': matchesPreset(preset) ? 'true' : 'false',
                    onClick: () =>
                      updateSettings({ surface: preset.surface, blur: preset.blur, scrim: preset.scrim }),
                  },
                  t(preset.labelKey),
                ),
              ),
            ),
          ),
          compact
            ? null
            : h(
            'div',
            { className: 'dsh-we-grid' },
            h(Slider, {
              label: t('surface'),
              value: settings.surface,
              min: 20,
              max: 100,
              step: 1,
              display: `${settings.surface}%`,
              onChange: (surface) => updateSettings({ surface }),
            }),
            h(Slider, {
              label: t('scrim'),
              value: Math.round(settings.scrim * 100),
              min: 0,
              max: 75,
              step: 1,
              display: `${Math.round(settings.scrim * 100)}%`,
              onChange: (value) => updateSettings({ scrim: value / 100 }),
            }),
            h(
              'div',
              { className: 'dsh-we-field' },
              h('span', { className: 'dsh-we-field-label' }, t('fit')),
              h(
                'div',
                { className: 'dsh-we-seg', style: { alignSelf: 'flex-start' } },
                ...['auto', 'cover', 'contain', 'stretch', 'center'].map((mode) => {
                  const label = mode === 'auto' ? t('fitAuto') : mode === 'cover' ? t('fitCover') : mode === 'contain' ? t('fitContain') : mode === 'stretch' ? t('fitStretch') : t('fitCenter')
                  const hint = mode === 'auto' ? t('fitAutoHint') : mode === 'cover' ? t('fitCoverHint') : mode === 'contain' ? t('fitContainHint') : mode === 'stretch' ? t('fitStretchHint') : t('fitCenterHint')
                  return h(
                    'button',
                    {
                      type: 'button',
                      title: hint,
                      'data-active': settings.fit === mode ? 'true' : 'false',
                      onClick: () => updateSettings({ fit: mode }),
                    },
                    label,
                  )
                }),
              ),
              h('div', { className: 'dsh-we-row-hint' }, t('fitAutoHint')),
            ),
          ),
          compact
            ? null
            : h(
            'div',
            { className: 'dsh-we-chiprow' },
            h(
              'label',
              { className: 'dsh-we-check' },
              h('input', { type: 'checkbox', checked: settings.muted, onChange: (event) => updateSettings({ muted: event.target.checked }) }),
              t('mute'),
            ),
            h(
              'label',
              { className: 'dsh-we-check' },
              h('input', { type: 'checkbox', checked: settings.paused, onChange: (event) => updateSettings({ paused: event.target.checked }) }),
              t('pause'),
            ),
            !settings.enabled ? h('span', { className: 'dsh-we-row-hint' }, t('disabledNotice')) : null,
          ),
        ),

        h(
          'div',
          { className: 'dsh-we-card' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-we-adv-toggle',
              'aria-expanded': advanced ? 'true' : 'false',
              onClick: () => setAdvanced(!advanced),
            },
            h('span', null, t('advanced')),
            h('span', null, `${advanced ? '−' : '+'} ${t('advancedHint')}`),
          ),
          advanced
            ? [
                // In the sidebar the look controls live here so the top of the
                // panel stays preview + fit + library.
                compact
                  ? h(
                      'div',
                      { key: 'look', className: 'dsh-we-grid' },
                      h(Slider, {
                        label: t('surface'),
                        value: settings.surface,
                        min: 20,
                        max: 100,
                        step: 1,
                        display: `${settings.surface}%`,
                        onChange: (surface) => updateSettings({ surface }),
                      }),
                      h(Slider, {
                        label: t('scrim'),
                        value: Math.round(settings.scrim * 100),
                        min: 0,
                        max: 75,
                        step: 1,
                        display: `${Math.round(settings.scrim * 100)}%`,
                        onChange: (value) => updateSettings({ scrim: value / 100 }),
                      }),
                    )
                  : null,
                compact
                  ? h(
                      'div',
                      { key: 'chips', className: 'dsh-we-chiprow' },
                      h(
                        'label',
                        { className: 'dsh-we-check' },
                        h('input', { type: 'checkbox', checked: settings.muted, onChange: (event) => updateSettings({ muted: event.target.checked }) }),
                        t('mute'),
                      ),
                      h(
                        'label',
                        { className: 'dsh-we-check' },
                        h('input', { type: 'checkbox', checked: settings.paused, onChange: (event) => updateSettings({ paused: event.target.checked }) }),
                        t('pause'),
                      ),
                    )
                  : null,
                h(
                  'div',
                  { key: 'blur', className: 'dsh-we-grid' },
                  h(Slider, {
                    label: t('blur'),
                    value: settings.blur,
                    min: 0,
                    max: 32,
                    step: 1,
                    display: `${settings.blur}px`,
                    onChange: (blur) => updateSettings({ blur }),
                  }),
                ),
                h(
                  'div',
                  { key: 'frame', className: 'dsh-we-chiprow' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-we-btn',
                      onClick: () => updateSettings({ zoom: DEFAULTS.zoom, posX: DEFAULTS.posX, posY: DEFAULTS.posY }),
                    },
                    t('resetFraming'),
                  ),
                  h('span', { className: 'dsh-we-hint' }, t('framingZoomFirst')),
                ),
                h(
                  'div',
                  { key: 'reset', className: 'dsh-we-chiprow' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-we-btn',
                      onClick: () => updateSettings({ ...LOOK_DEFAULTS }),
                    },
                    t('reset'),
                  ),
                ),
              ]
            : null,
        ),

        h(
          'div',
          { className: 'dsh-we-card', 'data-dsh-ink': 'card' },
          h(Row, { name: t('ink'), hint: t('inkHint') }),
          h(
            'div',
            { className: 'dsh-we-seg', style: { alignSelf: 'flex-start' } },
            h(
              'button',
              { type: 'button', 'data-active': settings.inkMode === 'auto' ? 'true' : 'false', onClick: () => updateSettings({ inkMode: 'auto' }) },
              t('inkAuto'),
            ),
            h(
              'button',
              { type: 'button', 'data-active': settings.inkMode === 'custom' ? 'true' : 'false', onClick: () => updateSettings({ inkMode: 'custom' }) },
              t('inkCustom'),
            ),
            h(
              'button',
              { type: 'button', 'data-active': settings.inkMode === 'off' ? 'true' : 'false', onClick: () => updateSettings({ inkMode: 'off' }) },
              t('inkOff'),
            ),
          ),
          settings.inkMode === 'custom'
            ? h(
                'div',
                { className: 'dsh-we-chiprow' },
                INK_SWATCHES.map((color) =>
                  h('button', {
                    key: color,
                    type: 'button',
                    className: 'dsh-we-swatch',
                    style: { background: color },
                    'data-active': String(settings.inkColor).toLowerCase() === color ? 'true' : 'false',
                    'aria-label': color,
                    onClick: () => updateSettings({ inkColor: color }),
                  }),
                ),
                h('input', {
                  type: 'color',
                  className: 'dsh-we-color',
                  value: settings.inkColor,
                  onChange: (event) => updateSettings({ inkColor: event.target.value }),
                }),
              )
            : null,
          h(Slider, {
            label: t('inkLevels'),
            value: settings.inkLevels,
            min: 0,
            max: 100,
            step: 1,
            display: `${settings.inkLevels}%`,
            onChange: (inkLevels) => updateSettings({ inkLevels }),
          }),
          h(
            'span',
            { className: 'dsh-we-hint' },
            `${t('inkRatio')} ${inkSample.contrast}:1 · ${inkSample.base}` +
              (inkSample.fellBack ? ` · ${t('inkFallback')}` : ''),
          ),
        ),

        h(
          'div',
          { className: 'dsh-we-card' },
          h(Row, { name: t('blockBlur'), hint: t('blockBlurHint') }),
          h(
            'div',
            { className: 'dsh-we-grid' },
            h(Slider, {
              label: t('blurMain'),
              value: settings.blurMain,
              min: 0,
              max: 32,
              step: 1,
              display: `${settings.blurMain}px`,
              onChange: (blurMain) => updateSettings({ blurMain }),
            }),
            h(Slider, {
              label: t('blurSide'),
              value: settings.blurSide,
              min: 0,
              max: 32,
              step: 1,
              display: `${settings.blurSide}px`,
              onChange: (blurSide) => updateSettings({ blurSide }),
            }),
            h(Slider, {
              label: t('blurRight'),
              value: settings.blurRight,
              min: 0,
              max: 32,
              step: 1,
              display: `${settings.blurRight}px`,
              onChange: (blurRight) => updateSettings({ blurRight }),
            }),
            h(Slider, {
              label: t('blurBottom'),
              value: settings.blurBottom,
              min: 0,
              max: 32,
              step: 1,
              display: `${settings.blurBottom}px`,
              onChange: (blurBottom) => updateSettings({ blurBottom }),
            }),
          ),
        ),

        h(
          'div',
          { className: 'dsh-we-card' },
          h(
            'div',
            { className: 'dsh-we-row' },
            h('span', { className: 'dsh-we-title', style: { fontSize: '13px' } }, t('library')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-we-btn',
                disabled: data.loading,
                onClick: () => {
                  invalidateSelection()
                  loadLibrary(true)
                },
              },
              data.loading ? t('scanning') : t('refresh'),
            ),
          ),
          h(
            'div',
            { className: 'dsh-we-chiprow' },
            h(
              'div',
              { className: 'dsh-we-search' },
              h('input', {
                placeholder: t('search'),
                value: query,
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
            ...['all', 'recent', 'scene', 'video', 'web', 'image', 'local'].map((key) =>
              h(
                'button',
                {
                  key,
                  type: 'button',
                  className: 'dsh-we-chip',
                  'data-active': filter === key ? 'true' : 'false',
                  onClick: () => setFilter(key),
                },
                `${t(key)}${countFor(key) ? ` ${countFor(key)}` : ''}`,
              ),
            ),
          ),
          data.loading && items.length === 0
            ? h('div', { className: 'dsh-we-empty' }, t('scanningNow'))
            : visible.length === 0
              ? h(
                  'div',
                  { className: 'dsh-we-empty' },
                  items.length === 0 ? `${t('folderEmpty')} ${t('folderHint')}` : t('empty'),
                )
              : h(
                  'div',
                  { className: 'dsh-we-gallery' },
                  visible.map((item) =>
                    h(Tile, {
                      key: item.id,
                      item,
                      selected: item.id === selectedId,
                      active: Boolean(activeItem && activeItem.id === item.id),
                      used: usageOf(item.id).count,
                      onPick: pick,
                    }),
                  ),
                ),
          installed
            ? h('div', { className: 'dsh-we-row-hint' }, t('stillPreview'))
            : null,
        ),
      )
    }

    /** Drop the pinned selection (used before a full rescan). */
    function invalidateSelection() {
      if (settings.mode === 'pin' && settings.pinned) updateSettings({ pinned: null })
      data.library = null
    }

    // ------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------


    /** Register one slot occupant without letting a rejection kill the boot. */
    function registerSlot(register, label) {
      try {
        return register()
      } catch (error) {
        lastSlotError = String((error && error.message) || error)
        console.error(`[dsh-wallpaper-engine] ${label} registration skipped:`, error)
        return () => {}
      }
    }

    function apply(ctx) {
      hostCtx = ctx
      const slots = ctx.slots || (ctx.get ? ctx.get('slots') : undefined)
      if (!slots || typeof slots.register !== 'function' || typeof slots.inject !== 'function') {
        return
      }
      try {
        window.addEventListener('error', (event) => noteError('error', event))
        window.addEventListener('unhandledrejection', (event) => noteError('rejection', event.reason))
      } catch {
        /* ignore */
      }
      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => {
            stopVerifyPolling()
            sidebarOpen = false
            if (sidebarRegistration) {
              try {
                sidebarRegistration()
              } catch {
                /* already gone with the fiber */
              }
              sidebarRegistration = null
            }
            sidebarSlotHost = null
            if (styleRefs.base) styleRefs.base.remove()
            if (styleRefs.paint) styleRefs.paint.remove()
            styleRefs.base = null
            styleRefs.paint = null
            try {
              document.documentElement.removeAttribute('data-dsh-wallpaper')
            } catch {
              /* ignore */
            }
          }, 'dsh-wallpaper-engine: styles')
        }
        injectStyles()
        startVerifyPolling()
      } catch (error) {
        console.error('[dsh-wallpaper-engine] style injection skipped:', error)
      }
      slots.inject('shell.overlay', () =>
        registerSlot(() => slots.register({ name: 'shell.overlay', id: 'wallpaper-engine-layer', order: -10 }, Backdrop), 'shell.overlay'),
      )
      slots.inject('sidebar.workspaces', (scoped) => {
        sidebarSlotHost = scoped || slots
        syncSidebarSlot()
        return () => {
          sidebarSlotHost = null
        }
      })
      slots.inject('sidebar.panellist', () =>
        registerSlot(
          () => slots.register({ name: 'sidebar.panellist', id: 'wallpaper-engine', order: 20, label: () => t('sidebarPanel') }, PanelGlyph),
          'sidebar.panellist',
        ),
      )
      slots.inject('main', () =>
        registerSlot(() => slots.register({ name: 'main', key: 'wallpaper-engine' }, WallpaperMainPanel), 'main'),
      )
      // Boot report: proves the Client half runs and shows what it painted.
      window.setTimeout(() => {
        reportRenderer('boot')
      }, 2500)
    }

    return { inject: ['slots'], apply }
  },
})



