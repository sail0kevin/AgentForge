#!/usr/bin/env node

/**
 * API状态监控脚本
 *
 * 功能：定期检查LLM API的可用性，当API恢复时通知用户
 * 使用方法：npx tsx scripts/monitor-api-status.ts
 *
 * 检查间隔：每小时一次（可配置）
 * API地址：从环境变量读取（LONGCAT_BASE_URL）
 * API Key：从环境变量读取（LONGCAT_API_KEY）
 */

import { config } from 'dotenv';

// 加载环境变量
config();

// 配置项
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1小时
const API_BASE_URL = process.env.LONGCAT_BASE_URL || 'https://api.omini.cn';
const API_KEY = process.env.LONGCAT_API_KEY;
const MODEL = 'gpt-5.6-lun';

// 日志函数
function log(message: string) {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${timestamp}] ${message}`);
}

// 检查API状态
async function checkApiStatus(): Promise<boolean> {
  if (!API_KEY) {
    log('❌ 错误: LONGCAT_API_KEY 环境变量未设置');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });

    if (response.ok) {
      log('✅ API已恢复！服务正常可用');
      log('');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('  🎉 Phase 1 验证可以开始了！');
      log('');
      log('  执行以下命令开始验证：');
      log('  npx tsx scripts/phase1-validation-runner.ts');
      log('');
      log('  预计耗时：1.8小时');
      log('  预计成本：$8.88（约¥64）');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('');
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      log(`❌ API仍不可用 (HTTP ${response.status})`);
      if (errorData.error?.message) {
        log(`   错误信息: ${errorData.error.message}`);
      }
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ 检查失败: ${errorMessage}`);
    return false;
  }
}

// 主函数
async function main() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('  API状态监控已启动');
  log(`  监控地址: ${API_BASE_URL}`);
  log(`  检查间隔: ${CHECK_INTERVAL_MS / 60000} 分钟`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');

  // 立即执行第一次检查
  log('执行首次检查...');
  const isAvailable = await checkApiStatus();

  if (isAvailable) {
    // API已恢复，退出监控
    process.exit(0);
  }

  log(`下次检查时间: ${new Date(Date.now() + CHECK_INTERVAL_MS).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  log('');

  // 设置定时检查
  const intervalId = setInterval(async () => {
    log('执行定时检查...');
    const isAvailable = await checkApiStatus();

    if (isAvailable) {
      // API已恢复，清除定时器并退出
      clearInterval(intervalId);
      process.exit(0);
    } else {
      log(`下次检查时间: ${new Date(Date.now() + CHECK_INTERVAL_MS).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      log('');
    }
  }, CHECK_INTERVAL_MS);

  // 优雅退出处理
  process.on('SIGINT', () => {
    log('');
    log('收到退出信号，停止监控...');
    clearInterval(intervalId);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('');
    log('收到终止信号，停止监控...');
    clearInterval(intervalId);
    process.exit(0);
  });
}

// 启动监控
main().catch((error) => {
  log(`❌ 监控程序异常退出: ${error.message}`);
  process.exit(1);
});
