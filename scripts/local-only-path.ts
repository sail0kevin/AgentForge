import path from "node:path";

/**
 * 仅允许写入仓库内被 Git 忽略的 local-only 目录，避免实验原始数据误提交。
 */
export function assertPathWithinLocalOnly(targetPath: string, errorCode: string) {
  const localOnlyRoot = path.resolve("local-only");
  const relativePath = path.relative(localOnlyRoot, path.resolve(targetPath));
  const isOutsideLocalOnly = relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
  if (isOutsideLocalOnly) throw new Error(errorCode);
}
