import { initBuiltInTools } from "@/lib/tools/built-in";

let initialized = false;

/**
 * 确保内置工具已注册（幂等）。
 * 在应用启动时调用一次。
 */
export function ensureToolsInitialized() {
  if (initialized) return;
  initialized = true;
  initBuiltInTools();
}
