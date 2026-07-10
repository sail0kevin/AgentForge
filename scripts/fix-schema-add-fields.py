# fix-schema-add-fields.py
import os
ROOT = r"G:\projects\agent-learning\projects\Multi-Agent-Workspace"

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)

p = os.path.join(ROOT, r"src\lib\validation.ts")
c = read(p)

# The schema: agentCreateSchema
schema_start = c.find('export const agentCreateSchema = z.object({')
if schema_start == -1:
    print("FAIL: agentCreateSchema not found")
else:
    # Find its end: closing '});' followed by newline
    schema_end = c.find('});\n', schema_start)
    if schema_end == -1:
        print("FAIL: schema end not found")
    else:
        schema_end += len('});')  
        old_schema = c[schema_start:schema_end]
        # Insert apiUrl/apiKey before closing });
        # Replace the schema
        new_text_before = c[:schema_end]  # includes closing });
        # The actual edit: find the line 'maxTokens: ...default(1200),' and add after it
        insert_marker = 'maxTokens: z.coerce.number().int().min(128).max(8000).default(1200),'
        if insert_marker in old_schema:
            new_schema_body = old_schema.replace(insert_marker, insert_marker + '''
  apiUrl: z.string().max(500).optional().default(""),
  apiKey: z.string().max(500).optional().default(""),''')
            c = c[:schema_start] + new_schema_body + c[schema_end:]
            write(p, c)
            print(f"[OK] agentCreateSchema extended with apiUrl/apiKey fields")
        else:
            print("WARN: insert marker not found in schema")
            print(old_schema)
