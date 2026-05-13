#!/bin/bash
# YuzhenFork 健身 Agent 独立启动脚本
# 端口: 4570 | 数据目录: .runtime-fitness/
# 用法: bash start-fitness-agent.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export NOVELFORK_RUNTIME_DIR="$SCRIPT_DIR/.runtime-fitness"
export NOVELFORK_STUDIO_PORT=4570
export NOVELFORK_PROJECT_ROOT="$SCRIPT_DIR"

# DAML-RAG 连接配置（HTTP API 方式）
export DAML_RAG_URL="http://localhost:8001"
export DAML_RAG_TOKEN="9eTioEunbkSpXJc6bEDmxEGKRrCY0p2xl2D6mhXwWaLrv-b63v2IoDYZiH4WzbDw"

echo "🏋️ 启动玉珍健身 Agent..."
echo "   端口: $NOVELFORK_STUDIO_PORT"
echo "   数据目录: $NOVELFORK_RUNTIME_DIR"
echo "   项目根: $NOVELFORK_PROJECT_ROOT"
echo "   DAML-RAG: $DAML_RAG_URL"

cd "$SCRIPT_DIR/packages/studio" || exit 1
exec bun dist/api/index.js
