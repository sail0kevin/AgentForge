import os

# Fix src/app/api/agents/route.ts
path1 = r'src/app/api/agents/route.ts'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    'capabilityIds: JSON.parse(agent.config || "[]"),\n    }));',
    'capabilityIds: JSON.parse(agent.config || "[]") as string[],\n    }));'
)
with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed route.ts')

# Fix src/app/api/agents/[id]/route.ts
path2 = r'src/app/api/agents/[id]/route.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content = f.read()
# Fix line 31 (GET handler)
content = content.replace(
    'capabilityIds: JSON.parse(agent.config || "[]"),\n    }, { status: 200 });\n  } catch (error) {\n    return Response.json({ error: "Failed to get agent" }',
    'capabilityIds: JSON.parse(agent.config || "[]") as string[],\n    }, { status: 200 });\n  } catch (error) {\n    return Response.json({ error: "Failed to get agent" }'
)
# Fix line 70 (PUT handler)
content = content.replace(
    'capabilityIds: body.capabilityIds ?? JSON.parse(agent.config || "[]"),',
    'capabilityIds: body.capabilityIds ?? (JSON.parse(agent.config || "[]") as string[]),'
)
with open(path2, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed [id]/route.ts')
