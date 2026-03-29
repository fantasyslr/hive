#!/bin/bash
# Hive 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/.../setup.sh | bash
# 或者: bash scripts/setup.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hive Gateway — 一键安装"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要 Node.js >= 18。请先安装：https://nodejs.org"
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo "❌ Node.js 版本太低（当前 v$NODE_VER），需要 >= 18"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 需要 npm"
    exit 1
fi
echo "✓ npm $(npm -v)"

# 进入项目目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"
echo "✓ 项目目录: $PROJECT_DIR"

# 安装依赖
echo ""
echo "→ 安装依赖..."
npm install --silent 2>&1 | tail -3
echo "✓ 依赖安装完成"

# 安装 Lark CLI（全局）
echo ""
echo "→ 安装 Lark CLI..."
if ! command -v npx &> /dev/null || ! npx @larksuite/cli --version &> /dev/null 2>&1; then
    npm install -g @larksuite/cli --silent 2>&1 | tail -1
fi
echo "✓ Lark CLI $(npx @larksuite/cli --version 2>/dev/null || echo 'installed')"

# 安装 Lark Skills（项目级）
if [ ! -d ".agents/skills/lark-base" ]; then
    echo ""
    echo "→ 安装 Lark Skills..."
    npx skills add larksuite/cli --all -y 2>&1 | tail -3
    echo "✓ Lark Skills 安装完成（19 域）"
else
    echo "✓ Lark Skills 已存在"
fi

# 跑测试
echo ""
echo "→ 运行测试..."
TEST_OUT=$(npx vitest run 2>&1 | tail -3)
echo "$TEST_OUT"
if echo "$TEST_OUT" | grep -q "passed"; then
    echo "✓ 测试通过"
else
    echo "⚠ 测试有问题，但不阻塞安装"
fi

# 提示下一步
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ 安装完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "下一步:"
echo ""
echo "  1. 启动 Gateway:"
echo "     cd $PROJECT_DIR && npm run start"
echo ""
echo "  2. 配置飞书（可选）:"
echo "     npx @larksuite/cli config init"
echo "     npx @larksuite/cli auth login"
echo ""
echo "  3. Smoke 测试:"
echo "     bash scripts/smoke-test.sh"
echo ""
echo "  4. 查看使用指南:"
echo "     cat docs/user-guide.md"
echo "     或访问: http://localhost:3000/docs/onboarding"
echo ""
