# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 项目概览

`@xtmm/commit-kit` 是一个一次性 CLI 工具（`commit-kit init`），用于将 Git 提交规范引导到任何项目中。它会安装并配置 **husky**（Git 钩子）、**lint-staged**（提交前代码检查）、**commitlint**（提交信息校验）以及 **commitizen** 搭配 **cz-customizable**（支持中文/表情符号类型的交互式提交提示）。

## 包类型与入口

- **ESM**（package.json 中 `"type": "module"`）。使用 `import`/`export`，不要使用 `require`。
- **CLI 入口**：`bin/cli.js` — 一个解析命令行标志并委托给 `src/init.js` 的薄层。
- **提交二进制**：`bin/commit.js` — 一个轻量级的 commitizen 分发器，在包自己的依赖树中解析 `cz-customizable` 以确保跨包管理器兼容。作为 `commit-kit-cz` 发布。
- **核心逻辑**：`src/init.js` — `init()` 函数，负责编排环境检测、文件写入和 package.json 的修改。
- **配置模板**：`src/configs/` — 包自带的默认配置文件。
- **Shell 钩子模板**：`templates/` — 写入 `.husky/` 的原始钩子脚本。

## 如何运行 / 测试

本项目没有构建步骤。`bin/cli.js` 的 shebang 直接指向 node，因此可以直接运行。

```bash
# 本地运行（从仓库根目录）
node bin/cli.js init           # 在当前目录实际执行初始化
node bin/cli.js init --dry-run # 仅预览，不写入任何内容
node bin/cli.js init --force   # 覆盖已有的配置文件
node bin/cli.js --version

# 全局链接以进行本地开发测试
npm link
commit-kit init --dry-run
```

**没有自动化测试**，也没有配置测试运行器。

## 架构（初始化流程）

`src/init.js` 中的 `init()` 函数遵循一个线性的 7 步流水线：

1. **环境检查** — 确认 `.git` 目录存在且 `package.json` 存在；若不存在则终止并给出提示。
2. **包管理器检测** — 按顺序检查锁文件（`pnpm-lock.yaml`、`yarn.lock`、`bun.lockb`、`package-lock.json`）；默认使用 npm。
3. **计划阶段** — 在触碰磁盘之前，确定每个文件写入和 package.json 键的操作（创建/跳过/覆盖）。这是 `--dry-run` 的底层机制。
4. **钩子写入** — 将 `templates/pre-commit` 和 `templates/commit-msg` 复制到 `.husky/` 中。每个钩子都是一个最小化的 shell 脚本，通过 `npx` 调用相应的工具。
5. **配置写入** — 将 `src/configs/cz-config.cjs` → `.cz-config.cjs` 以及 `src/configs/commitlint.config.mjs` → `commitlint.config.js`。如果目标文件已存在，则跳过（除非使用 `--force`）。
6. **package.json 修改** — 设置 `scripts.prepare`，设置 `scripts.commit`，移除已弃用的 `husky.hooks`，合并 `lint-staged` 配置（智能检测 eslint/prettier 是否可用，若不可用则写入 `{ "*": [] }` 空规则），并设置 `config.commitizen` + `config.cz-customizable`。通过点路径解析处理嵌套键。
7. **Husky 注册** — 运行 `npx husky` 将钩子注册到 `.git/hooks` 中。

## 配置文件及其作用

| 文件（目标项目中） | 来源 | 用途 |
|---|---|---|
| `.husky/pre-commit` | `templates/pre-commit` | 对暂存文件运行 `npx lint-staged` |
| `.husky/commit-msg` | `templates/commit-msg` | 通过 `npx commitlint --edit $1` 校验提交信息 |
| `.cz-config.cjs` | `src/configs/cz-config.cjs` | 定义 15 种带表情符号的提交类型，中文提示，默认跳过 scope/body/footer |
| `commitlint.config.js` | `src/configs/commitlint.config.mjs` | 继承 `cz` 预设；空规则对象供用户扩展 |
| `package.json` → `lint-staged` | `buildLintStagedConfig()` 动态生成 | 根据项目已安装的工具自动匹配：有 eslint+prettier 则配置 `eslint --fix` + `prettier --write`，仅 prettier 则只运行 prettier，都没有则写入空规则 `{ "*": [] }` |
| `package.json` → `scripts.commit` | `commit-kit-cz` 二进制 | 跨包管理器兼容的提交命令，通过 `require.resolve` 安全解析 `cz-customizable` 路径（尤其对 pnpm 重要） |

## 关键实现细节

- **默认幂等**：已有的钩子和配置会被跳过，不会被覆盖（除非使用 `--force`）。计划与执行分离的设计意味着 `--dry-run` 可以精确显示将要发生的事情而不产生副作用。
- **`copyTemplate` / `copyConfig`**：两者封装了相同的"存在则跳过"逻辑，但从不同的源目录（`templates/` 与 `src/configs/`）读取。
- **智能 lint-staged**：`buildLintStagedConfig()` 动态检测项目中是否安装了 `eslint` / `prettier`，按需生成配置。如果两者都未安装，会写入空规则 `{ "*": [] }` 以避免 `lint-staged` 报错。
- **`commit-kit-cz` 二进制**（`bin/commit.js`）：一个轻量级的 commitizen 分发器，通过 `require.resolve` 在自己的依赖树中解析 `cz-customizable`，确保跨包管理器（尤其是 pnpm）兼容。
- **`deepMerge`** 已定义但当前未在初始化路径中使用 — 保留用于未来的合并操作。
- **嵌套键处理**：package.json 的更新使用点路径拆分（例如 `"husky.hooks"`），并在移除后清理空的父对象。
- **钩子脚本默认最小化**：它们通过 shell 调用 `npx`，而不是嵌入逻辑，因此可以在不重新生成钩子的情况下更新工具。

## 依赖

- **husky** v9 — 唯一与此工具兼容的活跃版本（v4 的钩子会被显式清理）。
- **lint-staged**、**commitlint**、**commitizen**、**cz-customizable**、**commitlint-config-cz** — 全部作为直接依赖携带，因此消费项目只需要安装 `@xtmm/commit-kit` 即可。

## 发布说明

package.json 中的 `"files"` 字段会发布 `bin/`、`src/` 和 `templates/` 目录。除此之外的内容不会发布到注册表。
