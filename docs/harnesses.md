# Harness adapters

Brizo installs one Agent Skills compatible bundle and small command wrappers where a platform needs them. The current directory choices and invocation forms follow these platform documents:

- [Agent Skills specification](https://agentskills.io/specification)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Cursor Agent Skills](https://prod.cursor.com/docs/skills)
- [TRAE IDE skills](https://docs.trae.cn/ide_skills), [TRAE slash commands](https://docs.trae.cn/ide_slash-commands), and [TraeCode CLI skills](https://docs.trae.cn/cli_skills)
- [CodeBuddy skills](https://www.codebuddy.cn/docs/cli/skills) and [WorkBuddy skill import](https://cloud.tencent.com/document/product/1831/134432)
- [Lingma IDE skills](https://help.aliyun.com/zh/lingma/skills-3020747), [Qoder skills](https://docs.qoder.com/cli/Skills), and [Qoder CN CLI skills](https://help.aliyun.com/en/lingma/skills-3033419)
- [Qwen Code skills](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md) and [Kimi Code CLI skills](https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/customization/skills.md)
- [Gemini CLI skills](https://geminicli.com/docs/cli/using-agent-skills/), [OpenCode skills](https://opencode.ai/docs/skills), and [Windsurf skills](https://docs.windsurf.com/windsurf/cascade/skills)
- [GitHub Copilot CLI skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), [Kiro skills](https://kiro.dev/docs/skills/), and [Junie Agent Skills](https://junie.jetbrains.com/docs/agent-skills.html)
- [Roo Code skills](https://docs.roocode.com/features/skills) and [Cline skills](https://docs.cline.bot/customization/skills)

Run `brizo platforms` to see every accepted adapter ID and its invocation. `brizo install --target <id[,id...]>` installs only those adapters. Aliases such as `claude`, `qwen`, and `trae-cn` resolve to their canonical IDs.

Adapters copy managed files rather than creating symlinks, so sandboxed applications can read them. Brizo does not overwrite an unmarked file or directory with the same name. `brizo uninstall` removes only files created by this package.

WorkBuddy uses an import ZIP because it does not publish a stable global skill directory. Cline requires its experimental Skills feature. Kiro custom Agents must list the installed skill in their resources.
