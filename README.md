# @xtmm/commit-kit

一键式 Git 提交规范配置工具 — 集成 husky + lint-staged + commitlint + commitizen。

## 特性

- 🔌 **一行命令初始化** — `npx @xtmm/commit-kit init` 完成全部配置
- 📦 **零依赖安装** — 主项目只需安装 `@xtmm/commit-kit`，6 个子依赖自动携带
- 🎨 **中文 Emoji 提交模板** — 预置 15 种提交类型，交互式选择
- 🛡️ **双 hook 守护** — pre-commit 代码检查 + commit-msg 信息校验
- 🔧 **灵活覆盖** — 所有默认配置均可按项目需求修改
- 🧪 **dry-run 预览** — 安全预览，变更前先看效果

## 快速开始

```bash
# 1. 安装
npm install -D @xtmm/commit-kit
# 或
pnpm add -D @xtmm/commit-kit

# 2. 初始化
npx commit-kit init

# 3. 使用（二选一）
git cz          # commitizen 标准命令
pnpm commit     # 如果配置了 "commit": "git-cz"
```

## CLI 命令

```bash
commit-kit init              # 初始化配置（跳过已有文件）
commit-kit init --force      # 强制覆盖所有配置
commit-kit init --dry-run    # 仅预览变更，不写文件
commit-kit --version         # 打印版本
```

## init 做了什么

```
1. 检测 Git 仓库 + package.json
2. 识别包管理器（npm / pnpm / yarn / bun）
3. 创建 .husky/pre-commit  （lint-staged 检查）
4. 创建 .husky/commit-msg   （commitlint 校验）
5. 写入 .cz-config.cjs      （提交类型模板）
6. 写入 commitlint.config.js（校验规则）
7. 更新 package.json:
   - scripts.prepare = "husky"
   - lint-staged 配置（eslint + prettier）
   - config.commitizen + config.cz-customizable
   - 移除废弃的 husky.hooks（husky v4 遗留）
8. 执行 husky 注册 Git hooks
```

## 自定义配置

| 自定义项 | 文件 | 说明 |
|---|---|---|
| 提交类型 | `.cz-config.cjs` → `types` | 增删改类型和 Emoji |
| 校验规则 | `commitlint.config.js` → `rules` | 添加额外规则 |
| 检查范围 | `package.json` → `lint-staged` | 修改 glob 和命令 |

## 提交类型

| 类型 | 说明 |
|---|---|
| ✨ feat | 新增功能 |
| 🐛 fix | 修复缺陷 |
| 💄 ui | 更新 UI 界面或样式 |
| 🔧 util | 工具函数/hooks/公共模块 |
| 🎨 style | 代码格式 |
| ♻️ refactor | 代码重构 |
| 📝 docs | 文档更新 |
| ✅ test | 增加或修改测试用例 |
| 🔧 chore | 更改配置文件、构建工具等 |
| 📦 add | 添加或更新依赖库 |
| 🔥 del | 清理无用代码或文件 |
| ⏪ revert | 回滚到上一个版本 |
| 🔖 release | 发布新版本 |
| 🚀 deploy | 部署项目 |
| 🎉 init | 项目初始化 |

## 注意事项

- 默认 lint-staged 配置会调用 `eslint --fix` 和 `prettier --write`，请确保项目已安装这两个工具
- 如果项目不需要 ESLint/Prettier，可编辑 `package.json` 中的 `lint-staged` 配置
- `.cz-config.cjs` 和 `commitlint.config.js` 首次 init 后不会被覆盖（除非 `--force`）

## License

MIT
