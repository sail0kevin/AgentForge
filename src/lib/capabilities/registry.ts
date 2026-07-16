import type { CapabilityDefinition } from "@/lib/types";

export const defaultCapabilities: CapabilityDefinition[] = [
  {
    id: "rag",
    kind: "retrieval",
    name: "RAG Retrieval",
    description: "Retrieve relevant knowledge chunks before an agent calls the model.",
    enabledByDefault: true,
    implementationStatus: "available",
  },
  {
    id: "memory",
    kind: "memory",
    name: "Long-term Memory",
    description: "Read and write durable user, project, and conversation facts.",
    enabledByDefault: false,
    implementationStatus: "planned",
  },
  {
    id: "semantic-cache",
    kind: "cache",
    name: "Semantic Cache",
    description: "Reuse previous answers for semantically similar requests when allowed.",
    enabledByDefault: false,
    implementationStatus: "planned",
  },
  {
    id: "tool-call",
    kind: "tool",
    name: "Tool Calling",
    description: "Execute plan-authorized, schema-validated platform tools with limits and audit records.",
    enabledByDefault: true,
    implementationStatus: "available",
  },
  {
    id: "file-reader",
    kind: "tool",
    name: "File Reader",
    description: "Read workspace files through a controlled platform tool.",
    enabledByDefault: false,
    implementationStatus: "planned",
  },
  {
    id: "code-review",
    kind: "tool",
    name: "Code Review",
    description: "Run code-review checks as a reusable engineering tool.",
    enabledByDefault: false,
    implementationStatus: "planned",
  },
];

export function getCapabilityById(id: string) {
  return defaultCapabilities.find((capability) => capability.id === id) ?? null;
}

export function getEnabledDefaultCapabilityIds() {
  return defaultCapabilities.filter((capability) => capability.enabledByDefault && capability.implementationStatus === "available").map((capability) => capability.id);
}

export function describeCapabilities(capabilityIds: string[]) {
  return capabilityIds
    .map(getCapabilityById)
    .filter((capability): capability is CapabilityDefinition => Boolean(capability))
    .filter((capability) => capability.implementationStatus === "available")
    .map((capability) => `${capability.name} (${capability.kind}): ${capability.description}`);
}
