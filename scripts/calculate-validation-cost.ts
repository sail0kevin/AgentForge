#!/usr/bin/env node

/**
 * 验证方案成本计算器
 *
 * 功能：快速估算不同验证方案的成本和耗时
 * 使用方法：npx tsx scripts/calculate-validation-cost.ts
 *
 * 计算维度：
 * - Case数量
 * - 平均API调用次数
 * - Token消耗
 * - 成本（USD和CNY）
 * - 预计耗时
 */

import { calculateCost } from '@/lib/billing';

// 验证方案定义
interface ValidationPlan {
  name: string;
  description: string;
  caseCount: number;
  avgCallsPerCase: number;
  avgInputTokensPerCall: number;
  avgOutputTokensPerCall: number;
}

const plans: ValidationPlan[] = [
  {
    name: 'Phase 1 验证（24 case采样）',
    description: '10个失败case + 14个成功case，1/3采样验证',
    caseCount: 24,
    avgCallsPerCase: 3.5,
    avgInputTokensPerCall: 8000,
    avgOutputTokensPerCall: 4000,
  },
  {
    name: 'Phase 1 完整验证（72 case）',
    description: '全部72个case完整验证，最高统计置信度',
    caseCount: 72,
    avgCallsPerCase: 3.5,
    avgInputTokensPerCall: 8000,
    avgOutputTokensPerCall: 4000,
  },
  {
    name: 'Phase 2 快速验证（24 case）',
    description: 'Phase 2改进后的24 case验证',
    caseCount: 24,
    avgCallsPerCase: 2.8,
    avgInputTokensPerCall: 8000,
    avgOutputTokensPerCall: 4000,
  },
  {
    name: 'Phase 2 完整验证（72 case）',
    description: 'Phase 2改进后的72 case完整验证',
    caseCount: 72,
    avgCallsPerCase: 2.8,
    avgInputTokensPerCall: 8000,
    avgOutputTokensPerCall: 4000,
  },
  {
    name: 'Baseline 重现（72 case）',
    description: '重跑baseline（single_candidate_with_review），用于对比',
    caseCount: 72,
    avgCallsPerCase: 5.0,
    avgInputTokensPerCall: 8000,
    avgOutputTokensPerCall: 4000,
  },
];

// 格式化数字（千分位）
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// 计算单个方案的成本
function calculatePlanCost(plan: ValidationPlan) {
  const totalCalls = plan.caseCount * plan.avgCallsPerCase;
  const totalInputTokens = totalCalls * plan.avgInputTokensPerCall;
  const totalOutputTokens = totalCalls * plan.avgOutputTokensPerCall;

  const cost = calculateCost('LongCat-2.0', totalInputTokens, totalOutputTokens);

  // 预计耗时（每次调用约15秒，包括网络延迟）
  const estimatedTimeMinutes = (totalCalls * 15) / 60;
  const estimatedTimeHours = estimatedTimeMinutes / 60;

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    costUsd: cost.costUsd,
    costCny: cost.costUsd * 7.2, // 1 USD ≈ 7.2 CNY
    estimatedTimeMinutes,
    estimatedTimeHours,
  };
}

// 打印方案详情
function printPlanDetails(plan: ValidationPlan, index: number) {
  const result = calculatePlanCost(plan);

  console.log(`\n${index}. ${plan.name}`);
  console.log(`   ${plan.description}`);
  console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Case数量:      ${plan.caseCount} 个`);
  console.log(`   平均调用次数:   ${plan.avgCallsPerCase} 次/case`);
  console.log(`   总调用次数:     ${result.totalCalls} 次`);
  console.log(`   总Token数:     ${formatNumber(result.totalTokens)} tokens`);
  console.log(`     - Input:     ${formatNumber(result.totalInputTokens)} tokens`);
  console.log(`     - Output:    ${formatNumber(result.totalOutputTokens)} tokens`);
  console.log(`   预计成本:      $${result.costUsd.toFixed(2)} USD (约¥${result.costCny.toFixed(0)} CNY)`);
  console.log(`   预计耗时:      ${result.estimatedTimeHours.toFixed(1)} 小时`);

  return result;
}

// 打印对比表格
function printComparisonTable(results: Array<{ plan: ValidationPlan; result: ReturnType<typeof calculatePlanCost> }>) {
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('快速对比表');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 表头
  console.log('');
  console.log('方案                       | Case数 | 调用次数 | 成本(USD) | 成本(CNY) | 耗时(h)');
  console.log('─────────────────────────────────────────────────────────────────────────');

  // 数据行
  for (const { plan, result } of results) {
    const name = plan.name.padEnd(25);
    const caseCount = String(plan.caseCount).padStart(6);
    const calls = String(result.totalCalls).padStart(8);
    const usd = `$${result.costUsd.toFixed(2)}`.padStart(9);
    const cny = `¥${result.costCny.toFixed(0)}`.padStart(9);
    const time = result.estimatedTimeHours.toFixed(1).padStart(7);

    console.log(`${name} | ${caseCount} | ${calls} | ${usd} | ${cny} | ${time}`);
  }

  console.log('');
}

// 推荐建议
function printRecommendations() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('推荐建议');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✅ Phase 1 验证（24 case）- 推荐');
  console.log('   优点：成本低（~$9），耗时短（1.8小时），统计显著性足够');
  console.log('   适用：快速验证Phase 1改进效果，适合预算有限的情况');
  console.log('');
  console.log('✅ Phase 1 完整验证（72 case）- 高置信度需求');
  console.log('   优点：最高统计置信度，覆盖所有case');
  console.log('   缺点：成本较高（~$27），耗时长（5.4小时）');
  console.log('   适用：需要完整对比baseline，或准备发表论文');
  console.log('');
  console.log('⚡ Phase 2 快速验证（24 case）- 迭代优化');
  console.log('   优点：成本更低（~$6），耗时更短（1.2小时）');
  console.log('   适用：Phase 1验证后，快速验证Phase 2改进效果');
  console.log('');
  console.log('📊 推荐执行顺序：');
  console.log('   1. Phase 1 验证（24 case）- 快速验证改进效果');
  console.log('   2. 如果效果显著，执行Phase 2改进');
  console.log('   3. Phase 2 快速验证（24 case）- 验证进一步优化');
  console.log('   4. 如果需要发表或高置信度，最后执行完整验证（72 case）');
  console.log('');
  console.log('💰 总预算建议：$15-25（Phase 1 + Phase 2 快速验证）');
  console.log('');
}

// 主函数
function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('验证方案成本计算器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results = plans.map((plan, index) => {
    const result = printPlanDetails(plan, index + 1);
    return { plan, result };
  });

  printComparisonTable(results);
  printRecommendations();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

// 执行
main();
