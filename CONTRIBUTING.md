# Contributing to OpenField

**参与贡献**

> PRINCIPLES.md is the constitution of this project — read it before your first PR. When principles conflict with velocity, principles win.
> PRINCIPLES.md 是本项目的宪法——请在第一个 PR 之前通读。当原则与开发速度冲突时，原则优先。

## Before You Start（动手之前）

1. **Read the constitution 先读宪法** — especially the Six Non-Negotiables（第 2 节）.
2. **Search first 先检索** — existing issues and PRs may already cover your point.
3. **When in doubt, open an issue 有疑问先开 issue** — cite the clause at stake, using the Principle Discussion template. Debating principles is welcome; silently violating them is not.

## Issue Types（议题类型）

| Template 模板 | Use for 用途 |
| --- | --- |
| Bug Report 缺陷报告 | Behavior against the spec or the principles 行为不符合规范或原则 |
| Feature Proposal 功能提案 | Capabilities traced to a real field problem 从真实田野问题出发的能力 |
| Principle Discussion 原则讨论 | Debating or amending PRINCIPLES.md 宪法条款的辩论与修订 |

Feature proposals that touch data handling, AI, or participant-facing flows must state, in the proposal, which principles apply and how the design honors them.
涉及数据处理、AI 集成或受访者可见流程的功能提案，必须在提案中写明相关原则及设计如何满足它们。

## Data Safety（数据安全，红线）

- **Never commit real field data** — no recordings, photos, transcripts, participant identifiers, or consent records. Test fixtures use synthetic data only.
  **绝不提交真实田野数据**——录音、照片、转写、受访者标识符、同意书一律不得入库；测试夹具只允许合成数据。
- Never commit secrets: keys, tokens, signing material.
  密钥、令牌、签名材料同样禁止入库。

## Pull Requests（合并请求）

1. The PR template embeds the [Ethics Self-Review Checklist](docs/ETHICS_CHECKLIST.md) — complete it before requesting review.
   PR 模板已内嵌[伦理自查清单](docs/ETHICS_CHECKLIST.md)，请先自查再请求评审。
2. Any PR touching **data handling, AI integration, or user-facing copy** follows that checklist. Reviewers treat an unchecked applicable item as blocking; unsatisfiable §1–§3 items go to **Maintainer Ethics Review** — approval alone does not merge.
   涉及**数据处理、AI 集成或用户可见文案**的 PR 必须走该清单。适用项未勾选即阻断；第 1–3 节有无法满足的项时进入**维护者伦理评审**，仅 Approve 不合入。
3. **Bilingual parity 双语对等** — no feature is done until both languages are done（第 4 节）.
4. Keep PRs reviewable: small, single-purpose, with a clear principle reference.
   保持 PR 可评审：小而专注，原则引用明确。

## Quality Gates（质量关卡，第 5 节）

- Executing a sensitive action without recorded confirmation is a **P0 bug** — every confirmation path needs CI coverage.
  未经确认即执行敏感操作是 **P0 级缺陷**——确认路径必须有 CI 覆盖。
- Generated codebooks must pass the methodological validator.
  生成编码表必须通过方法论校验器。
- Releases additionally obey the Founder's Field Rule: no release ships without surviving real fieldwork.
  版本发布另受创始人田野法则约束：未经真实田野检验不得发布。

## Commits & Branches（提交与分支）

- Branches 分支：`feat/*`、`fix/*`、`docs/*`、`chore/*`
- Commits 提交：imperative mood, concise; bilingual summary welcome. 祈使句、简洁，欢迎双语概述。例如：`feat: version consent templates 版本化同意书`

## Local Development（本地开发）

The codebase is forming; setup instructions will land with the first runnable milestone. Until then, the highest-leverage contributions are documentation, principle review, and issue triage.
代码库正在成形，环境搭建说明将随首个可运行里程碑发布。在此之前，最有价值的贡献是文档、原则评审与议题分诊。

## Security & Conduct（安全与行为）

- Security problems never go in public issues — see [SECURITY.md](SECURITY.md).
  安全问题严禁公开发帖，见 [SECURITY.md](SECURITY.md)。
- Participation means agreeing to the [Code of Conduct](CODE_OF_CONDUCT.md).
  参与即表示同意[行为准则](CODE_OF_CONDUCT.md)。

## License（许可证）

OpenField is released under the [MIT License](LICENSE); contributions are licensed under the same license.
OpenField 以 [MIT 许可证](LICENSE)发布；贡献内容默认按同一许可证授权。
