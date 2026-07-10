import os

# Fix messages API to use getOrCreateDefaultUser
path = r'src/app/api/workspaces/manual/messages/route.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'getOrCreateDefaultUser' not in content:
    content = content.replace(
        'import { prisma } from "@/lib/db";',
        'import { prisma } from "@/lib/db";\nimport { getOrCreateDefaultUser } from "@/lib/current-user";'
    )

# Fix the workspace creation to use the default user
content = content.replace(
    '        userId: "local-anonymous",',
    '        userId: user.id,'
)

# Add user lookup before workspace creation
content = content.replace(
    '    const workspace = await prisma.workspace.upsert({',
    '    const user = await getOrCreateDefaultUser();\n    const workspace = await prisma.workspace.upsert({'
)
content = content.replace(
    '    const workspace = await prisma.workspace.findUnique({',
    '    const user = await getOrCreateDefaultUser();\n    const workspace = await prisma.workspace.findUnique({'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed messages API')
