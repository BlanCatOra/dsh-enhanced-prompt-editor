/**
 * dsh-enhanced-prompt-editor —— 右侧栏编辑面板。
 *
 * 结构：
 *   ┌─ 工具栏：草稿名 · 保存 · 用阅读器打开 · 已有草稿 ─┐
 *   │  大编辑区（回车语义由设置决定）                    │
 *   └─ 状态栏：字数 · 保存状态 · [听写] [发送] ──────────┘
 *
 * 回车语义由本组件自己的 `onKeyDown` 全权决定：拦截 Enter 并按设置
 * 换成换行或发送，因此 DSH 内置的 Composer Enter 设置不会互相影响。
 *
 * 发送是「直接发出」：`inputActions.setDraft` + `inputActions.submit`。
 *
 * @module dsh-enhanced-prompt-editor/panel
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLUGIN_ID } from './constants.js';
import { MAX_DRAFT_CHARS, resolveEnterAction } from './constants.js';
import { lineHeightFor } from './constants.js';
import { draftTitleOf } from './constants.js';
import { Recording, canRecord, audioBase64 } from './audio.js';
import { ensureCss as injectStyle } from './css.js';
import { INDENT_BUTTONS, SYMBOLS, applySymbol, indentLines } from './edit-ops.js';
import {
  MEASURE_HOST_CLASS,
  attachMeasurer,
  gutterHeightsOf,
  stripeBackgroundOf,
  stripeSpansOf,
} from './soft-wrap.js';

const CSS_ID = `${PLUGIN_ID}/panel.css`;
const CSS = `
.dsh-epe-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,transparent)}
.dsh-epe-bar{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
.dsh-epe-name{flex:1 1 auto;min-width:0;font:500 13px/20px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-primary,currentColor);background:transparent;border:none;outline:none;padding:2px 4px;border-radius:6px}
.dsh-epe-name:focus{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-epe-name::placeholder{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7}
.dsh-epe-btn{display:inline-flex;align-items:center;gap:5px;flex:none;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,currentColor);font:500 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.dsh-epe-btn:disabled{opacity:.45;cursor:default}
.dsh-epe-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
/* 次要按钮的悬浮底色。⚠️ 这条的选择器特异性必须**低于**下面的 primary 规则，
   否则会把主按钮的悬浮背景也一起换掉（见下）。用 :where() 把特异性压到
   (0,2,0) 的好处是：primary 的 hover 规则写 (0,2,0) 也能靠后声明胜出，
   不必堆 !important。 */
.dsh-epe-btn:where(:hover):not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
/* 主发送按钮。token 取自内核自己的发送按钮（InputBar 的 .primary）：
   background:--dsw-alias-button-info-fill / hover:--dsw-alias-button-info-hover。
   之前用的是 --dsw-alias-brand-primary，它在深色主题下解析成近白色，
   于是「纯白底 + 白字」；而通用 hover 规则的特异性 (0,3,0) 又高过这一条
   (0,2,0)，悬浮时背景被换成中性灰、文字仍是白色 → 「黑底白字」。
   现在两者都用官方 token，且 hover 规则同特异性、靠后声明生效。 */
.dsh-epe-btn[data-primary]{background:var(--dsw-alias-button-info-fill,#5686fe);border-color:transparent;color:#fff}
.dsh-epe-btn[data-primary]:where(:hover):not(:disabled){background:var(--dsw-alias-button-info-hover,#4a76e0);filter:none}
.dsh-epe-btn[data-recording]{background:#d9534f;border-color:transparent;color:#fff}
/* ── 编辑区 ────────────────────────────────────────────────────────
   行底色**用一段 linear-gradient 画在 textarea 上**，而不是把 textarea 拆成
   「每行一个 div」的 contenteditable。

   为什么不拆：textarea 原生的光标移动、跨行选择、IME 组合输入、粘贴多行、
   undo/redo 全部是免费的，拆成逐行元素就得逐条自己实现（且很难做对）。
   而条纹只要行高固定，就能用渐变精确画出来——功能零风险。

   ⚠️ 2026-10-16 起，**生效的**渐变由 JS 按逻辑行逐段生成后写成 textarea 的
   inline style（见 soft-wrap.js 的 stripeBackgroundOf）；CSS 里保留的
   repeating-linear-gradient 只是测量跑完之前的降级兜底。原因：软换行时一条
   逻辑行占多个**物理行**，而 repeating 渐变的周期是固定的——同一条逻辑行会被
   切成两种底色（用户原话：「自动换行后实际同一行的内容要用同色背景」）。
   不换行的文档展开后与重复渐变逐像素一致（相位没变：第 1、3、5… 行上色）。

   ⚠️ 渐变里的色标**必须写 var(--dsh-epe-stripe)**。写成裸的
   --dsh-epe-stripe（漏了 var()）时，那个位置既不是颜色也不是长度，
   整条 background-image 会被判无效并回落到 none —— 表现是「条纹完全不见」，
   而且控制台不报任何错。第一版就是这么错的。
   对齐要点：--dsh-epe-line 必须与 font 里的 line-height 一致（1.7）；
   条纹起点必须与**首行文字顶**对齐——也就是要跳过 padding-top，
   做法是：在渐变里内置一段 padding-top 长的透明补偿段（见 soft-wrap.js），
   并把 origin/clip 都设为 padding-box。
   background-attachment:local 让条纹随内容滚动。

   ⚠️ 千万不要写成 origin:content-box 而 clip 留默认（border-box）。
   两者不一致时，padding-top 那 12px 落在渐变的**负坐标区**，
   渐变的第一个 tile 之前会被 clamp 到第一个色标（那时是亮色），
   于是第一条亮带被撑成 padding-top + line-height ≈ 39px，后面每条都是 27.2px。
   表现正是「第一二三行高度目测不一致」——用户 2026-10-16 就是这么发现的。
   离屏 Chromium 实测：不修 → 首带 39px；修好 → 27px，与后续带一致。

   另一个坑：origin/clip 都设 content-box 也能让首带变 27px，但条纹会**四周内缩
   12px**（padding 区不上色），行背景不再铺满整行。所以最终选的是
   「padding-box + 渐变内补偿段」：首带 27px 且铺满。
   ⚠️ 本段注释**绝不能出现反引号**——它落在 CSS 模板字符串内部，会提前闭合字符串。 */
/* 行号沟槽：与编辑区同字号、同行高、同 padding-top，滚动同步由 JS 做。
   用 flex 容器把「行号列 + textarea」并排，两者共享 --dsh-epe-line。 */
.dsh-epe-body{--dsh-epe-pad:12px;--dsh-epe-line:27px;flex:1 1 auto;min-height:0;display:flex;min-width:0;position:relative}
/* ⚠️ line-height 必须走 --dsh-epe-line（整数 px），**不能**写 1.7em。
   1.7em 在 16px 下 = 27.2px（小数），渐变周期 54.4px 落不到整数像素上，
   光栅化会把相邻的带抹成 27px / 28px 交错 —— 用户看到的就是
   「某一条条纹带比别的窄」。实测带高 27.0/27.98/26.96/26.96/28.02 交错，
   周期在 54/55 之间摆动。取整后每条带严格相等。
   行号 gutter 与编辑区**必须共用**这个值，否则两者会逐行错开。 */
.dsh-epe-gutter{flex:none;overflow:hidden;padding:var(--dsh-epe-pad) 6px var(--dsh-epe-pad) 10px;text-align:right;color:var(--dsw-alias-label-tertiary,currentColor);opacity:.55;font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none;pointer-events:none;background:transparent;border-right:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14))}
.dsh-epe-gutter span{display:block;min-height:var(--dsh-epe-line)}
/* 隐藏的软换行镜像：与编辑区**同字体、同行高、同 tab 宽度**，宽度由 JS 设成
   编辑区的内容宽度（见 soft-wrap.js 的 attachMeasurer）。
   ⚠️ 必须 absolute 定位脱离 flex 流——它是 .dsh-epe-body 的第三个子节点，
   参与布局就会把编辑区挤窄，测量宽度与真实宽度从此不一致。 */
.dsh-epe-measure{position:absolute;left:0;top:0;box-sizing:border-box;padding:0;margin:0;border:0;resize:none;background:none;color:transparent;font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;overflow:hidden;height:1px;min-height:0;display:block;visibility:hidden;pointer-events:none}
/* 镜像宿主：0 尺寸、不参与交互，只为让 React 拥有一个可挂镜像的容器。 */
.dsh-epe-measureHost{position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none}
.dsh-epe-editor{flex:1 1 auto;min-height:0;width:100%;resize:none;box-sizing:border-box;padding:var(--dsh-epe-pad,12px);border:none;outline:none;color:var(--dsw-alias-label-primary,currentColor);font-weight:400;font-size:var(--dsh-epe-font,16px);line-height:var(--dsh-epe-line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2;overflow:auto;
  background-color:transparent;
  /* ⚠️ 这条是**降级兜底**：测量还没跑完（首帧）或容器还没布局时按物理行交替，
     与修复前的视觉一致。测量成功后 JS 会用 inline style（按逻辑行逐段生成的
     linear-gradient，见 soft-wrap.js 的 stripeBackgroundOf）盖掉这条。
     渐变里**内置 padding-top 的透明补偿段**：周期严格 = --dsh-epe-line * 2，
     亮段从 --dsh-epe-pad 起、长 --dsh-epe-line，正好覆盖第 1、3、5… 行。 */
  background-image:repeating-linear-gradient(to bottom,
    transparent 0,
    transparent var(--dsh-epe-pad,12px),
    var(--dsh-epe-stripe) var(--dsh-epe-pad,12px),
    var(--dsh-epe-stripe) calc(var(--dsh-epe-pad,12px) + var(--dsh-epe-line)),
    transparent calc(var(--dsh-epe-pad,12px) + var(--dsh-epe-line)),
    transparent calc(var(--dsh-epe-line) * 2));
  /* padding-box 才是对的裁剪框：既铺满（含 padding 区），又与渐变原点一致。
     绝不能写 origin:content-box + clip 默认(border-box) —— 见上方注释。 */
  background-origin:padding-box;
  background-clip:padding-box;
  background-attachment:local;
  /* 用 label-primary 的极低透明度当条纹色：浅色主题下变深、深色主题下变浅，
     两个主题都成立，且不必硬编码颜色。 */
  --dsh-epe-stripe:color-mix(in srgb, var(--dsw-alias-label-primary,currentColor) 5%, transparent);}
.dsh-epe-editor:focus{--dsh-epe-stripe:color-mix(in srgb, var(--dsw-alias-brand-primary,#5686fe) 7%, transparent)}
/* ── 底部快捷键行 ──────────────────────────────────────────────── */
.dsh-epe-keys{display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:none;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
/* 按钮尺寸乘一个缩放系数：字号设置能一起带动图标与按钮，用户才觉得"不那么大/小"。
   用 calc 而不是改 px 值，这样基准只写一次。 */
.dsh-epe-key{flex:none;height:calc(24px * var(--dsh-epe-key-scale,1));min-width:calc(24px * var(--dsh-epe-key-scale,1));padding:0 calc(7px * var(--dsh-epe-key-scale,1));border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:500 calc(13px * var(--dsh-epe-key-scale,1))/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.dsh-epe-key:where(:hover):not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,currentColor)}
.dsh-epe-key:disabled{opacity:.45;cursor:default}
.dsh-epe-key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
.dsh-epe-keySep{flex:none;width:1px;height:16px;margin:0 3px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.28))}
.dsh-epe-editor::placeholder{color:var(--dsw-alias-label-tertiary,currentColor);opacity:.7}
.dsh-epe-foot{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));min-width:0}
.dsh-epe-meta{flex:1 1 auto;min-width:0;font:400 12px/16px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-tertiary,currentColor);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-epe-meta[data-error]{color:#d9534f}
.dsh-epe-drafts{flex:none;display:flex;flex-direction:column;max-height:132px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18))}
.dsh-epe-draft{display:flex;align-items:center;gap:8px;padding:6px 12px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);font:400 12px/16px ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:left}
.dsh-epe-draft:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-epe-draft span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-epe-empty{padding:10px 12px;font:400 12px/16px ui-sans-serif,system-ui,sans-serif;color:var(--dsw-alias-label-tertiary,currentColor)}
`;

/**
 * 注入面板样式。
 *
 * 走共享的容错实现（见 `./css.js`）：插槽渲染器捕获到渲染期异常会永久
 * 撤销该条目，因此注入样式不能有抛出的可能。
 */
function ensureCss() {
  injectStyle(CSS_ID, CSS, PLUGIN_ID);
}

/** 发送键位显示文案：跟随平台惯用修饰键。 */
function sendKeyLabel() {
  const platform = globalThis.navigator?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘↵' : 'Ctrl+Enter';
}

/**
 * 符号按钮的悬浮提示。
 *
 * 显示「中文名 符号」，例如 `圆括号 ()`、`加粗 **`。两者都给的理由：
 * 中文名说清用途、符号本身说清会插入什么 —— 用户 2026-10-16 要求
 * 「指针悬浮显示简单易懂的中文名」。
 *
 * ⚠️ 不要退回成读某个 `.hint` key：上一版用的是 `symbol.<key>.hint`，
 * 那个 key **不存在**，于是悬浮显示裸 key（`symbol.paren.hint`）。
 */
function symbolTip(t, symbol) {
  const name = t?.(`symbol.${symbol.key}`);
  if (typeof name !== 'string' || name === '' || name.startsWith('symbol.')) return symbol.label;
  return `${name} ${symbol.label}`;
}

/**
 * 面板正文。
 *
 * @param props 插槽框架注入：`t`、`sessionId`、`store`、`settings`、`io`、
 *   `speech`（可选，来自语音插件），以及会话标准席位 `inputActions`、
 *   `useProjection`。
 */
export function PanelBody(props) {
  ensureCss();
  const { t, sessionId, store, settings, io, inputActions, speechStore, useSessions } = props;
  const [, forceRender] = useState(0);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState(null);
  // 每行占几个物理行（软换行测量结果）。null = 还没测出（首帧、容器未布局）。
  const [rowCounts, setRowCounts] = useState(null);
  const recordingRef = useRef(undefined);
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const measureHostRef = useRef(null);

  // 状态订阅：草稿或设置变化都重渲染。
  useEffect(() => {
    const offStore = store.snapshot.subscribe(() => forceRender((n) => n + 1));
    const offSettings = settings.subscribe(() => forceRender((n) => n + 1));
    const offSpeech = speechStore?.subscribe?.(() => forceRender((n) => n + 1));
    return () => {
      offStore();
      offSettings();
      offSpeech?.();
    };
  }, [store, settings, speechStore]);

  // 语音 remote 可能在任意时刻出现；每次渲染从快照源现读，不做身份缓存。
  const speech = speechStore?.getSnapshot?.();

  const state = store.of(sessionId);
  const config = settings.get();
  /**
   * 会话工作区根。**必须是渲染期的顶层 hook 调用**：`useSessions` 是 React
   * 选择器钩子，放进 effect 或事件回调里会违反 Rules of Hooks（hook 调用数量
   * 随分支变化），React 会直接抛错。因此在这里读一次，后面各处复用。
   */
  const cwd = io.cwd(useSessions, sessionId);
  const isWorkspace = config.storage === 'workspace';
  const sendKey = useMemo(() => sendKeyLabel(), []);
  const title = draftTitleOf(state.text, t?.('panel.title') ?? 'Prompt');

  // 首次挂载：按存储方式载入草稿。
  useEffect(() => {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined;
    let cancelled = false;
    if (config.storage === 'browser') {
      const local = io.readLocal();
      if (local !== '' && state.text === '') store.setText(sessionId, local);
      return undefined;
    }
    if (config.storage === 'none' || !isWorkspace) return undefined;
    if (cwd === undefined) return undefined;
    const { signal, release } = io.begin();
    io.list({ cwd, dir: config.dir, signal })
      .then((entries) => {
        if (cancelled) return;
        store.patch(sessionId, { drafts: Array.isArray(entries) ? entries : [] });
        const first = entries?.[0];
        if (first !== undefined && state.text === '') {
          store.patch(sessionId, { name: first.name, path: first.path });
          return io.load({ cwd, rel: first.file, signal }).then((text) => {
            if (!cancelled) store.setText(sessionId, text);
          });
        }
        return undefined;
      })
      .catch(() => undefined)
      .finally(release);
    return () => {
      cancelled = true;
      release();
    };
    // 只在会话或存储方式改变时重新载入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, config.storage, config.dir, isWorkspace, cwd]);

  /** 保存当前草稿。 */
  const save = useCallback(
    async (nameOverride) => {
      if (!isWorkspace) {
        if (config.storage === 'browser') {
          io.writeLocal(state.text);
          store.patch(sessionId, { status: 'saved', error: null });
          return;
        }
        store.patch(sessionId, { status: 'idle', error: null });
        return;
      }
      if (cwd === undefined) {
        store.patch(sessionId, { status: 'error', error: t?.('panel.needSession') ?? 'no session cwd' });
        return;
      }
      store.patch(sessionId, { status: 'saving', error: null });
      const { signal, release } = io.begin();
      try {
        const name = nameOverride ?? state.name ?? draftTitleOf(state.text, 'draft');
        const result = await io.save({ sessionId, cwd, dir: config.dir, name, text: state.text, signal });
        store.patch(sessionId, { status: 'saved', name, path: result.path, error: null });
      } catch (error) {
        store.patch(sessionId, {
          status: 'error',
          error: (t?.('panel.errorSave', { message: error.message }) ?? error.message),
        });
      } finally {
        release();
      }
    },
    [config.dir, cwd, io, isWorkspace, sessionId, state.name, state.text, store, t],
  );

  /** 发送：直接进会话。 */
  const send = useCallback(async () => {
    const result = await io.send(inputActions, state.text);
    if (result.ok) {
      store.patch(sessionId, { status: 'idle', error: null });
      setNotice(null);
      if (config.storage === 'browser') io.writeLocal(state.text);
      else if (isWorkspace) void save();
      return;
    }
    setNotice(t?.('panel.errorSend', { message: result.reason }) ?? result.reason);
  }, [config.storage, inputActions, io, isWorkspace, save, sessionId, state.text, store, t]);

  /** 编辑器按键：回车语义与快捷键。 */
  const onKeyDown = useCallback(
    (event) => {
      const action = resolveEnterAction(event, config.enterMode);
      if (action === null) return;
      event.preventDefault();
      if (action === 'send') void send();
      else {
        // 手动插入换行：textarea 的默认行为已被 preventDefault 吃掉。
        const el = event.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = `${el.value.slice(0, start)}\n${el.value.slice(end)}`;
        store.setText(sessionId, next);
        // 光标落到换行之后。没有 rAF 的环境（测试、非浏览器）同步设置即可。
        const place = () => {
          const node = textareaRef.current;
          if (node !== null && node !== undefined) node.setSelectionRange(start + 1, start + 1);
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
        else place();
      }
    },
    [config.enterMode, send, sessionId, store],
  );

  /**
   * 插入符号 / 包裹选中文字。
   *
   * ⚠️ 用户 2026-10-16 明确要求：**选中一段文字后点成对符号，是把文字框在
   * 符号内，不是把框选的文字改成符号**（后者会丢掉用户的内容）。具体规则在
   * `./edit-ops.js` 的三个纯函数里，这里只负责读/写选区。
   *
   * 选区必须**在点击按钮前**读——按钮一旦拿到焦点，textarea 的
   * `selectionStart/End` 在某些浏览器里会归零。所以用 `onMouseDown`
   * `preventDefault()` 阻止按钮抢焦点（见下面的渲染），这样选区一直在
   * textarea 上，点完还能恢复。
   */
  const insertSymbol = useCallback(
    (symbol) => {
      const node = textareaRef.current;
      const current = store.of(sessionId).text;
      // 没有 DOM（测试环境）时退回「追加到末尾」，仍然不留死路。
      const start = node?.selectionStart ?? current.length;
      const end = node?.selectionEnd ?? current.length;
      const result = applySymbol(current, start, end, symbol);
      store.setText(sessionId, result.text);
      // 光标/选区落回预期位置。
      const place = () => {
        const el = textareaRef.current;
        if (el === null || el === undefined) return;
        el.focus();
        el.setSelectionRange(result.selStart, result.selEnd);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
      else place();
    },
    [sessionId, store],
  );

  /**
   * 粘贴：把剪贴板文本插进**当前光标处**，替换选区。
   *
   * 用 `navigator.clipboard.readText()`（需要用户手势 + 权限，点击按钮满足前者）。
   * 读不到就退回提示，不静默失败——用户点了没反应会以为按钮坏了。
   */
  const pasteAtCaret = useCallback(async () => {
    let text = '';
    try {
      text = (await globalThis.navigator?.clipboard?.readText?.()) ?? '';
    } catch (error) {
      setNotice(t?.('panel.errorPaste', { message: error?.message ?? 'denied' }) ?? 'paste denied');
      return;
    }
    if (text === '') {
      setNotice(t?.('panel.errorPasteEmpty') ?? 'clipboard is empty');
      return;
    }
    const node = textareaRef.current;
    const current = store.of(sessionId).text;
    const start = node?.selectionStart ?? current.length;
    const end = node?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`;
    store.setText(sessionId, next);
    setNotice(null);
    const caret = start + text.length;
    const place = () => {
      const el = textareaRef.current;
      if (el === null || el === undefined) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
    else place();
  }, [sessionId, store, t]);

  /** 一键缩进 / 反缩进（用户 2026-10-16 要求）。 */
  const indentSelection = useCallback(
    (outdent) => {
      const node = textareaRef.current;
      const current = store.of(sessionId).text;
      const start = node?.selectionStart ?? current.length;
      const end = node?.selectionEnd ?? current.length;
      const result = indentLines(current, start, end, outdent);
      store.setText(sessionId, result.text);
      const place = () => {
        const el = textareaRef.current;
        if (el === null || el === undefined) return;
        el.focus();
        el.setSelectionRange(result.selStart, result.selEnd);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
      else place();
    },
    [sessionId, store],
  );

  /** 听写：录音 → 转写 → 追加到草稿。 */
  const dictate = useCallback(async () => {
    if (speech === undefined) {
      setNotice(t?.('panel.errorDictate', { message: 'speech unavailable' }) ?? 'speech unavailable');
      return;
    }
    if (recording) {
      setPhase('transcribing');
      try {
        const active = recordingRef.current;
        recordingRef.current = undefined;
        setRecording(false);
        if (active === undefined) return;
        const bytes = await active.record.stop(active.maxDurationSeconds);
        const result = await speech.transcribe({
          audioBase64: audioBase64(bytes),
          providerId: active.providerId,
        });
        if (result?.ok !== true) throw new Error(result?.error?.message ?? 'transcribe failed');
        const text = result.value?.text ?? '';
        if (text !== '') store.setText(sessionId, `${store.of(sessionId).text}${text}`);
      } catch (error) {
        setNotice(t?.('panel.errorDictate', { message: error.message }) ?? error.message);
      } finally {
        setPhase('idle');
      }
      return;
    }
    if (!canRecord()) {
      setNotice(t?.('panel.errorDictate', { message: 'no microphone support' }) ?? 'no microphone support');
      return;
    }
    try {
      const catalog = await speech?.catalog?.();
      const active = new Recording({});
      await active.start();
      recordingRef.current = {
        record: active,
        maxDurationSeconds: catalog?.maxDurationSeconds ?? 60,
        providerId: catalog?.selection?.providerId,
      };
      setRecording(true);
    } catch (error) {
      setNotice(t?.('panel.errorDictate', { message: error.kind ?? error.message }) ?? error.message);
    }
  }, [recording, sessionId, speech, store, t]);

  // 卸载时释放录音资源。
  useEffect(
    () => () => {
      recordingRef.current?.record?.dispose?.().catch(() => undefined);
      recordingRef.current = undefined;
    },
    [],
  );

  const status = (() => {
    if (state.status === 'saving') return t?.('panel.saving') ?? '…';
    if (state.status === 'saved') return t?.('panel.saved') ?? 'saved';
    return '';
  })();

  // 行号数量：按实际行数算（末尾换行也算一行，与编辑器的感觉一致）。
  // 空文档也显示 1 行，避免沟槽突然消失导致编辑区横向跳动。
  const text = String(state.text ?? '');
  const lines = text.split('\n');
  const lineNumbers = Math.max(1, lines.length);

  /**
   * 软换行测量 + 条纹重算。
   *
   * 依赖里放的是 `text`（内容）而不是 `state`（每次渲染都是新对象），
   * 否则 effect 每帧都会跑一遍。滚动/高度变化不改内容，但会改换行宽度，
   * 所以还要监听 window resize 与 RS 的尺寸变化。
   *
   * 测量失败（拿不到宽度、DOM 不在）时保留上一次结果而不是清空 —— 清空会让
   * 用户看到条纹闪一下再回来；真的没有结果时渲染侧会退回降级几何。
   */
  useEffect(() => {
    const host = measureHostRef.current;
    const editor = textareaRef.current;
    if (host === null || editor === null) return undefined;
    let measurer = null;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try {
        if (measurer === null) measurer = attachMeasurer(host);
        const counts = measurer.rowCounts(editor, lines);
        if (counts !== null) setRowCounts(counts);
      } catch (error) {
        // 测量是纯增强：任何异常都只降级，绝不能抛到渲染期
        //（插槽渲染器捕获到异常会永久撤销该条目）。
        console.error(`[${PLUGIN_ID}] soft-wrap measure failed:`, error);
      }
    };
    run();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    observer?.observe(editor);
    globalThis.addEventListener?.('resize', run);
    return () => {
      cancelled = true;
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', run);
      measurer?.dispose();
    };
    // lines 由 text 派生，两者同步变化；用 text 当依赖即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // 几何：行号高度按物理行数拉伸（行号「2」因此落在它自己那行的物理行上），
  // 条纹按逻辑行分段（同一条逻辑行的所有物理行同色）。
  const rowCountsSafe = rowCounts ?? lines.map(() => 1);
  const lineHeightPx = lineHeightFor(config.editorFontSize ?? 16);
  const gutterHeights = gutterHeightsOf(rowCountsSafe, lineHeightPx);
  const stripeBackground = stripeBackgroundOf(stripeSpansOf(rowCountsSafe));

  const canDictate = config.dictate && speech !== undefined;

  return h(
    'div',
    { className: 'dsh-epe-panel' },
    h(
      'div',
      { className: 'dsh-epe-bar' },
      h('input', {
        className: 'dsh-epe-name',
        value: state.name ?? '',
        placeholder: t?.('panel.nameLabel') ?? 'Draft name',
        onChange: (event) => store.patch(sessionId, { name: event.target.value }),
        'aria-label': t?.('panel.nameLabel') ?? 'Draft name',
      }),
      isWorkspace
        ? h(
            'button',
            { type: 'button', className: 'dsh-epe-btn', onClick: () => void save(), disabled: state.status === 'saving' },
            status !== '' ? status : (t?.('panel.save') ?? 'Save'),
          )
        : null,
      isWorkspace && state.path !== null && config.browseWithReader
        ? h(
            'button',
            {
              type: 'button',
              className: 'dsh-epe-btn',
              onClick: () => {
                const address = fileAddressOf(sessionId, state.path);
                if (address !== undefined) io.openInReader(sessionId, address);
              },
            },
            t?.('panel.openInReader') ?? 'Open in viewer',
          )
        : null,
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-epe-btn',
          onClick: () => {
            store.setText(sessionId, '');
            setNotice(null);
          },
        },
        t?.('panel.clear') ?? 'Clear',
      ),
    ),
    // 行号 + 编辑区并排。行号用纯展示的 span 列表（不是 DOM 行），
    // 与 textarea 共享同一个行高变量，滚动时按 scrollTop 同步偏移。
    // ⚠️ --dsh-epe-font 与 --dsh-epe-key-scale 必须设在**共用的 .dsh-epe-body**
    // 上，不能只设在 textarea 的 style 里：行号 gutter 是 textarea 的**兄弟节点**，
    // 设在 textarea 上的自定义属性它继承不到，只会用 CSS 里的兜底值 16px
    // —— 字号一改成非 16px，行号就按 16px 排版、文字按新字号排版，逐行错位。
    h(
      'div',
      {
        className: 'dsh-epe-body',
        style: {
          '--dsh-epe-font': `${config.editorFontSize ?? 16}px`,
          // 行高取整数像素（见 constants.js 的 lineHeightFor）：
          // 小数行高会让条纹带宽度在 27/28px 之间摆动，看起来「某条带更窄」。
          // gutter 与 textarea 都在这个父节点下，共用同一个值。
          '--dsh-epe-line': `${lineHeightFor(config.editorFontSize ?? 16)}px`,
          '--dsh-epe-key-scale': String((config.keySize ?? 100) / 100),
        },
      },
      lineNumbers > 0
        ? h(
            'div',
            { className: 'dsh-epe-gutter', 'aria-hidden': true, ref: gutterRef },
            Array.from({ length: lineNumbers }, (_unused, index) =>
              // 每个行号的高度 = 该逻辑行占的**物理行数 × 行高**。
              // 这样它下面的行号就落在「自己那行文字真正开始」的物理行上
              //（逻辑行 1 占 3 个物理行时，行号 2 出现在第 4 个物理行）。
              // 拿不到行高时退回 null，由 CSS 的 min-height 兜底成一行高。
              // eslint-disable-next-line react/no-array-index-key
              h('span', { key: `ln-${index + 1}`, style: { height: gutterHeights?.[index] ?? undefined } }, String(index + 1)),
            ),
          )
        : null,
      h('textarea', {
        ref: textareaRef,
        className: 'dsh-epe-editor',
        // 字号与缩放由父层 .dsh-epe-body 上的 CSS 变量提供（见上），
        // 这样行号 gutter 与编辑区用的是**同一个字号**，行高才不会错位。
        value: state.text,
        spellCheck: false,
        // 按逻辑行生成的条纹（同一条逻辑行的所有物理行同色）。写 inline style
        // 才能带进「每行占几个物理行」这个运行时信息；拿不到测量时退回 CSS
        // 里那条按物理行交替的降级渐变（不写 background-image 即可）。
        style: { backgroundImage: stripeBackground },
        placeholder: (t?.('panel.placeholder', { send: sendKey }) ?? 'Write here…'),
        onChange: (event) => store.setText(sessionId, event.target.value),
        onKeyDown,
        onScroll: (event) => {
          // 行号沟槽跟着编辑区滚动，否则长文里行号会错位。
          const gutter = gutterRef.current;
          if (gutter !== null && gutter !== undefined) gutter.scrollTop = event.currentTarget.scrollTop;
        },
        'aria-label': t?.('panel.title') ?? 'Prompt',
      }),
      // 软换行测量用的隐藏镜像宿主。必须**由 React 拥有**（镜像由 JS 自己
      // append 进来），这样不会在 React 的 diff 里打架；它 absolute + 0 尺寸，
      // 不参与布局也不影响编辑区宽度。
      h('div', { className: MEASURE_HOST_CLASS, 'aria-hidden': true, ref: measureHostRef }),
    ),
    // ── 快捷键行（用户 2026-10-16 要求：放在发送按钮行的空白处）──────
    h(SymbolBar, {
      t,
      scale: (config.keySize ?? 100) / 100,
      onSymbol: insertSymbol,
      onIndent: indentSelection,
      onPaste: () => void pasteAtCaret(),
    }),
    !isWorkspace || config.storage === 'none'
      ? null
      : state.drafts.length === 0
        ? null
        : h(
            'div',
            { className: 'dsh-epe-drafts' },
            state.drafts.map((draft) =>
              h(
                'button',
                {
                  key: draft.file,
                  type: 'button',
                  className: 'dsh-epe-draft',
                  onClick: () => {
                    if (cwd === undefined) return;
                    const { signal, release } = io.begin();
                    io.load({ cwd, rel: draft.file, signal })
                      .then((text) => store.patch(sessionId, { text, name: draft.name, path: draft.path }))
                      .catch(() => undefined)
                      .finally(release);
                  },
                },
                h('span', null, draft.name),
              ),
            ),
          ),
    h(
      'div',
      { className: 'dsh-epe-foot' },
      h(
        'div',
        { className: 'dsh-epe-meta', ...(notice !== null ? { 'data-error': true } : {}) },
        notice ?? `${t?.('panel.runes', { count: state.text.length }) ?? `${state.text.length} chars`}${config.storage === 'workspace' ? ` · ${t?.('panel.storageWorkspace') ?? ''}` : config.storage === 'browser' ? ` · ${t?.('panel.storageBrowser') ?? ''}` : ` · ${t?.('panel.storageNone') ?? ''}`}`,
      ),
      canDictate
        ? h(
            'button',
            {
              type: 'button',
              className: 'dsh-epe-btn',
              ...(recording ? { 'data-recording': true } : {}),
              onClick: () => void dictate(),
              disabled: phase === 'transcribing',
              title: t?.('panel.dictate') ?? 'Dictate',
            },
            phase === 'transcribing'
              ? (t?.('panel.transcribing') ?? '…')
              : recording
                ? (t?.('panel.dictating') ?? 'Stop')
                : (t?.('panel.dictate') ?? 'Dictate'),
          )
        : null,
      h(
        'button',
        {
          type: 'button',
          className: 'dsh-epe-btn',
          'data-primary': true,
          onClick: () => void send(),
          disabled: state.text.trim() === '',
          title: `${t?.('panel.send') ?? 'Send'} (${sendKey})`,
        },
        t?.('panel.send') ?? 'Send',
      ),
    ),
  );
}

/**
 * 符号快捷键行（**两个模式共用**）。
 *
 * 抽成独立组件的原因：用户 2026-10-16 要求「这个快捷行也加到模式二」。两处用
 * 同一份实现，就不会出现「面板里修好了、扩展输入框里还是旧的」。
 *
 * ⚠️ 每个按钮都必须 `onMouseDown` + `preventDefault()`：一旦按钮拿到焦点，
 * 编辑区（textarea / Lexical）的选区就可能归零，那样「包裹选中文字」与
 * 「按行缩进」都会落空——它们都依赖 `selectionStart/End` 或当前选区。
 *
 * @param props `t`、`scale`（缩放系数）、`onSymbol`、`onIndent`、`onPaste`。
 */
export function SymbolBar(props) {
  ensureCss();
  const { t, scale, onSymbol, onIndent, onPaste } = props;
  const style = { '--dsh-epe-key-scale': String(scale ?? 1) };

  /** 一个符号按钮的统一样式与事件绑定。 */
  const key = (keyName, label, title, onClick) =>
    h(
      'button',
      {
        key: keyName,
        type: 'button',
        className: 'dsh-epe-key',
        title,
        'aria-label': title,
        onMouseDown: (event) => event.preventDefault(),
        onClick,
      },
      label,
    );

  return h(
    'div',
    {
      className: 'dsh-epe-keys',
      role: 'toolbar',
      'aria-label': t?.('panel.keys') ?? 'Insert',
      style,
    },
    SYMBOLS.map((symbol) =>
      key(
        symbol.key,
        symbol.label,
        // 悬浮显示「中文名 符号」。⚠️ 不要退回读 `symbol.<key>.hint`：
        // 那个 key 不存在，会显示裸 key。
        symbolTip(t, symbol),
        () => onSymbol?.(symbol),
      ),
    ),
    INDENT_BUTTONS.map((button) =>
      key(
        button.key,
        button.label,
        `${t?.(`panel.${button.key}`) ?? button.label} ${button.label}`,
        () => onIndent?.(button.outdent),
      ),
    ),
    h('span', { className: 'dsh-epe-keySep', 'aria-hidden': true }),
    // 粘贴按钮：可见文字与可访问名都用简短名，详细说明只放 title。
    (() => {
      const label = t?.('panel.paste') ?? 'Paste';
      return h(
        'button',
        {
          key: 'paste',
          type: 'button',
          className: 'dsh-epe-key',
          title: t?.('panel.pasteHint') ?? label,
          'aria-label': label,
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => onPaste?.(),
        },
        label,
      );
    })(),
  );
}

/** 面板 tab 的标题：取草稿首行。 */
export function PanelTitle(props) {
  const { store } = props;
  const [, forceRender] = useState(0);
  useEffect(() => store.snapshot.subscribe(() => forceRender((n) => n + 1)), [store]);
  const title = draftTitleOf(store.of(props.sessionId).text, 'Prompt');
  return h('span', null, title);
}

/**
 * 造 `dsh-resource://file/...` 地址。
 *
 * 与 `@deepseek-ai/dsh-util-workspace-path` 的 `fileAddressFor` 同规则：
 * 工作区内的绝对路径折叠成 session 作用域的相对路径段。
 */
function fileAddressOf(sessionId, path) {
  if (typeof path !== 'string' || path === '') return undefined;
  const normalized = path.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ':'))
    .join('/');
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`;
}
