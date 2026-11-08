# dsh-system-prompt-inject

向 DeepSeek Harness 的 **system 提示词**追加自定义段落。

一段 JS，没有依赖，没有构建步骤，不改 DSH 安装目录。

MIT License。

---

## 它解决什么问题

想把一段规则从「模型可能忽略」提升到「模型必须读」的层级时，DSH 里有两个看起来能用、实际都不行的位置：

| 机制 | 为什么不行 |
|---|---|
| `AGENTS.md` / 工作区指令 | `dsh-agent-instructions` 把整条链渲染成一条 **user 角色**消息，天然排在所有 system 段之后；渲染出来的框架原文还写着它不覆盖 system、developer、直接用户指令。 |
| `system-prompt` 的 `personaPrefix` / `personaSuffix` | Web/Desktop 下提示词由 agent preset 掌管，每个 preset 都挂一个 `@deepseek-ai/dsh-persona` 行。该行**无条件**注册 `deployment:persona-prefix` 和 `deployment:persona-suffix`（哪怕内容为空字符串），而作用域内的同名注册会遮蔽全局注册。所以在 preset 生效时（Web 下永远生效），改 profile 的人设是空操作。 |

注册一个**不同名字**的 section，是唯一不用重写整个 preset 插件列表、又能进入 system 层级的受支持做法。

## 行为与边界

- **只追加，不替换。** 从不设置 `complete: true`，因此不可能截断、替换或重排任何既有段——harness 身份、人设、plan 与工具指引、runtime context 全部原样保留。删掉配置行即可完全恢复。
- **一行一段。** 挂多行（不同 entry id）就能在不同位置注入多段；每段的 `name` 必须不同，因为 name 是替换键，重复会**静默遮蔽**前一个而不是并存。
- **静态文本。** 动态内容会让每次请求的前缀都变，破坏 provider 的提示词缓存，所以 `text` 是配置里读到的普通字符串。
- **空内容不注册。** `text` 为空或只有空白时不注册任何段，不会留下空段。

## 安装

1. 把 `system-prompt-inject.mjs` 复制到你的 profile 目录，例如
   `C:\Users\<你>\.dsh\profiles\desktop\`（Windows）或
   `~/.dsh/profiles/desktop/`。
2. 把 `patch.example.yml` 里的 `insert` 段追加到同目录的 `cordis.patch.yml`。
3. 重启 Harness。启用 HMR 的 profile 会热加载。

> 追加到 profile patch 必须用 `insert:` 包装。裸写的顶层 `- id: ...` 会被当成针对已有行的 patch，报 `patch: entry "<id>" not found`。

## 配置字段

| 字段 | 必填 | 默认 | 含义 |
|---|---|---|---|
| `text` | 是 | — | 要注入的段文本。为空或全空白时不注册。支持多行。 |
| `name` | 否 | `user:custom` | 段的注册名，同时是替换键。多行并存时必须各不相同。 |
| `order` | 否 | `50` | 段的排序位置，见下表。非有限数值时回落到默认值。 |

### order 取值参考

由 `@deepseek-ai/dsh-system-prompt` 的 `SECTION_ORDERS` 定义：

| 区间 | 内容 |
|---|---|
| `-1000` | harness 身份（`You are an AI agent powered by DeepSeek Harness.`） |
| `0` | 部署人设前缀（`deployment:persona-prefix`） |
| `500` – `900` | plan / team / PTC / 文件引用等策略 |
| `1000` – `3100` | 各工具的使用指引 |
| `9000` – `10100` | 交付文件引用、harness 源码说明、Web 端说明 |
| `10200` | 部署人设后缀（`deployment:persona-suffix`） |

`50` 落在人设前缀之后、所有策略与工具指引之前，读起来像身份的一部分，而不是末尾补丁。想插到别处就显式写 `order`。

## 多个段并存示例

```yaml
- insert:
    - id: system-prompt-inject-identity
      name: './system-prompt-inject.mjs'
      config:
        name: 'user:language-rule'
        order: 50
        text: |-
          ## 语言规则
          - 分析、推理与思考过程以中文为主。

    - id: system-prompt-inject-review
      name: './system-prompt-inject.mjs'
      config:
        name: 'user:review-guidelines'
        order: 2500
        text: |-
          ## 代码审查约定
          - 先读再改，不做顺手重构。
```

## 验证

改完重启后，可以不依赖模型自述地确认注入是否生效：解压会话日志看 `system/message` 事件。

```powershell
# 会话日志：~/.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd
node -e "const z=require('node:zlib'),f=require('node:fs');const b=f.readFileSync(process.argv[1]);const parts=[];let o=0;while(o<b.length){const s=b.subarray(o);parts.push(z.zstdDecompressSync(s));const i=s.indexOf(Buffer.from([0x28,0xb5,0x2f,0xfd]),4);if(i<0)break;o+=i;}process.stdout.write(Buffer.concat(parts).toString())" <日志路径> | Select-String 'system/message'
```

`system/message` 事件里的 `text` 就是实际发给模型的 system 全文，搜你注入的段名或首行即可。

## 测试

```sh
node --test system-prompt-inject.test.mjs
```

覆盖：默认与自定义 `name`/`order`、非法值回落、绝不设置 `complete`、`{{...}}` 原样保留、空内容不注册、配置缺失不抛错。

## 已知限制

- **仅作用于仍在加载此行的 profile。** 换到不包含该 `insert` 的 profile 就不生效。
- **`minimal` preset 下不生效。** 该 preset 的人设行声明了 `complete: true`，会把其他所有段（含此段）丢弃。
- **不提供图形配置页。** DSH 的 `autoGenerate` 表单目前**没有任何随附客户端会渲染**（官方文档原文：*no shipped client does so yet*），所以配置只存在于 `cordis.patch.yml` 的 `text` 字段。想做 GUI 需要另写 React 客户端包并注册到 `plugins.bundle.config` 插槽。
- **上游 API 变更风险。** `ctx.systemPrompt.section()` 是当前受支持的注册接口；若未来版本改动签名，需同步更新。

## 卸载

从 `cordis.patch.yml` 删除对应 `insert` 行（或删掉整个 `insert`），重启即可。删掉 `system-prompt-inject.mjs` 也不影响，只是 loader 会因缺文件报错——先删配置行再删文件。
