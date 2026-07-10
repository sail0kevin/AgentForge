import os

# Create agents [id] route
agents_dir = os.path.join('src', 'app', 'api', 'agents', '[id]')
os.makedirs(agents_dir, exist_ok=True)

agents_route = "import { NextRequest, NextResponse } from \"next/server\";\nimport { getOrCreateDefaultUser } from \"@/lib/current-user\";\nimport { prisma } from \"@/lib/db\";\nimport { mapAgent } from \"@/lib/mappers\";\nimport { agentUpdateSchema } from \"@/lib/validation\";\n\nexport async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  const user = await getOrCreateDefaultUser();\n  const agent = await prisma.agent.findFirst({ where: { id, userId: user.id } });\n  if (!agent) return NextResponse.json({ error: \"Agent not found\" }, { status: 404 });\n  return NextResponse.json(mapAgent(agent));\n}\n\nexport async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  const body = agentUpdateSchema.parse(await request.json());\n  const user = await getOrCreateDefaultUser();\n  const agent = await prisma.agent.findFirst({ where: { id, userId: user.id } });\n  if (!agent) return NextResponse.json({ error: \"Agent not found\" }, { status: 404 });\n  const updated = await prisma.agent.update({ where: { id }, data: body });\n  return NextResponse.json(mapAgent(updated));\n}\n\nexport async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  const user = await getOrCreateDefaultUser();\n  const agent = await prisma.agent.findFirst({ where: { id, userId: user.id } });\n  if (!agent) return NextResponse.json({ error: \"Agent not found\" }, { status: 404 });\n  await prisma.agent.delete({ where: { id } });\n  return NextResponse.json({ success: true });\n}\n"

with open(os.path.join(agents_dir, 'route.ts'), 'w', encoding='utf-8') as f:
    f.write(agents_route)
print('agents [id] route created')

# Create api-keys [id] route
keys_dir = os.path.join('src', 'app', 'api', 'api-keys', '[id]')
os.makedirs(keys_dir, exist_ok=True)

keys_route = "import { NextRequest, NextResponse } from \"next/server\";\nimport { getOrCreateDefaultUser } from \"@/lib/current-user\";\nimport { prisma } from \"@/lib/db\";\n\nexport async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  const user = await getOrCreateDefaultUser();\n  const key = await prisma.apiKey.findFirst({ where: { id, userId: user.id } });\n  if (!key) return NextResponse.json({ error: \"API key not found\" }, { status: 404 });\n  await prisma.apiKey.delete({ where: { id } });\n  return NextResponse.json({ success: true });\n}\n"

with open(os.path.join(keys_dir, 'route.ts'), 'w', encoding='utf-8') as f:
    f.write(keys_route)
print('api-keys [id] route created')
