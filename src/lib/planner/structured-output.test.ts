import assert from "node:assert/strict";
import test from "node:test";
import { generateStructuredOutput, StructuredOutputError } from './structured-output';
import { z } from 'zod';

const TestSchema = z.object({
  name: z.string(),
  age: z.number(),
});

test('should extract JSON from Markdown code block', async () => {
  const generate = async () => '```json\n{"name": "Alice", "age": 30}\n```';
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'Alice', age: 30 });
});

test('should extract JSON from Markdown code block without "json" tag', async () => {
  const generate = async () => '```\n{"name": "Bob", "age": 25}\n```';
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'Bob', age: 25 });
});

test('should extract first complete JSON object from mixed content', async () => {
  const generate = async () => 'Here is the result: {"name": "Charlie", "age": 35} and more text';
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'Charlie', age: 35 });
});

test('should fix trailing commas in objects', async () => {
  const generate = async () => '{"name": "David", "age": 40,}';
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'David', age: 40 });
});

test('should fix trailing commas in arrays', async () => {
  const ArraySchema = z.object({ items: z.array(z.string()) });
  const generate = async () => '{"items": ["a", "b",]}';
  const result = await generateStructuredOutput({
    schema: ArraySchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { items: ['a', 'b'] });
});

test('should replace single quotes with double quotes', async () => {
  const generate = async () => "{'name': 'Eve', 'age': 28}";
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'Eve', age: 28 });
});

test('should handle combined errors (trailing comma + single quotes)', async () => {
  const generate = async () => "{'name': 'Frank', 'age': 45,}";
  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
  });
  assert.deepEqual(result, { name: 'Frank', age: 45 });
});

test('should retry on schema validation failure', async () => {
  let callCount = 0;
  const generate = async () => {
    callCount++;
    if (callCount === 1) return '{"name": "Grace"}';  // 缺少 age
    return '{"name": "Grace", "age": 50}';  // 正确
  };

  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
    maxAttempts: 2,
  });

  assert.equal(callCount, 2);
  assert.deepEqual(result, { name: 'Grace', age: 50 });
});

test('should throw StructuredOutputError after max attempts', async () => {
  const generate = async () => '{"name": "Henry"}';  // 始终缺少 age

  await assert.rejects(
    () => generateStructuredOutput({
      schema: TestSchema,
      prompt: 'test',
      generate,
      maxAttempts: 2,
    }),
    StructuredOutputError
  );
});

test('should include validation issues in error', async () => {
  const generate = async () => '{"name": "Iris"}';

  try {
    await generateStructuredOutput({
      schema: TestSchema,
      prompt: 'test',
      generate,
      maxAttempts: 1,
    });
    assert.fail('Expected StructuredOutputError to be thrown');
  } catch (error) {
    assert.ok(error instanceof StructuredOutputError);
    const issues = (error as StructuredOutputError).issues;
    assert.ok(issues.length > 0);
    assert.ok(issues.some(issue => issue.includes('age')));
  }
});

test('should apply custom validation after schema validation', async () => {
  let callCount = 0;
  const generate = async () => {
    callCount++;
    if (callCount === 1) return '{"name": "Jack", "age": -5}';  // age < 0
    return '{"name": "Jack", "age": 20}';  // 正确
  };

  const result = await generateStructuredOutput({
    schema: TestSchema,
    prompt: 'test',
    generate,
    validate: (value) => value.age < 0 ? ['age must be non-negative'] : [],
    maxAttempts: 2,
  });

  assert.equal(callCount, 2);
  assert.deepEqual(result, { name: 'Jack', age: 20 });
});

test('should handle invalid JSON with diagnostic logging', async () => {
  const generate = async () => 'not json at all';

  await assert.rejects(
    () => generateStructuredOutput({
      schema: TestSchema,
      prompt: 'test',
      generate,
      maxAttempts: 1,
    }),
    StructuredOutputError
  );
});
