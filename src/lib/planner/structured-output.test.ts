import { describe, it, expect, vi } from 'vitest';
import { generateStructuredOutput, StructuredOutputError } from './structured-output';
import { z } from 'zod';

describe('generateStructuredOutput', () => {
  const TestSchema = z.object({
    name: z.string(),
    age: z.number(),
  });

  describe('JSON extraction - three-layer fallback', () => {
    it('should extract JSON from Markdown code block', async () => {
      const generate = vi.fn().mockResolvedValue('```json\n{"name": "Alice", "age": 30}\n```');
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('should extract JSON from Markdown code block without "json" tag', async () => {
      const generate = vi.fn().mockResolvedValue('```\n{"name": "Bob", "age": 25}\n```');
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'Bob', age: 25 });
    });

    it('should extract first complete JSON object from mixed content', async () => {
      const generate = vi.fn().mockResolvedValue('Here is the result: {"name": "Charlie", "age": 35} and more text');
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'Charlie', age: 35 });
    });

    it('should fix trailing commas in objects', async () => {
      const generate = vi.fn().mockResolvedValue('{"name": "David", "age": 40,}');
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'David', age: 40 });
    });

    it('should fix trailing commas in arrays', async () => {
      const ArraySchema = z.object({ items: z.array(z.string()) });
      const generate = vi.fn().mockResolvedValue('{"items": ["a", "b",]}');
      const result = await generateStructuredOutput({
        schema: ArraySchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ items: ['a', 'b'] });
    });

    it('should replace single quotes with double quotes', async () => {
      const generate = vi.fn().mockResolvedValue("{'name': 'Eve', 'age': 28}");
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'Eve', age: 28 });
    });

    it('should handle combined errors (trailing comma + single quotes)', async () => {
      const generate = vi.fn().mockResolvedValue("{'name': 'Frank', 'age': 45,}");
      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
      });
      expect(result).toEqual({ name: 'Frank', age: 45 });
    });
  });

  describe('schema validation retry', () => {
    it('should retry on schema validation failure', async () => {
      const generate = vi.fn()
        .mockResolvedValueOnce('{"name": "Grace"}')  // 缺少 age
        .mockResolvedValueOnce('{"name": "Grace", "age": 50}');  // 正确

      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
        maxAttempts: 2,
      });

      expect(generate).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ name: 'Grace', age: 50 });
    });

    it('should throw StructuredOutputError after max attempts', async () => {
      const generate = vi.fn().mockResolvedValue('{"name": "Henry"}');  // 始终缺少 age

      await expect(generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
        maxAttempts: 2,
      })).rejects.toThrow(StructuredOutputError);

      expect(generate).toHaveBeenCalledTimes(2);
    });

    it('should include validation issues in error', async () => {
      const generate = vi.fn().mockResolvedValue('{"name": "Iris"}');

      try {
        await generateStructuredOutput({
          schema: TestSchema,
          prompt: 'test',
          generate,
          maxAttempts: 1,
        });
        throw new Error('Expected StructuredOutputError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StructuredOutputError);
        const issues = (error as StructuredOutputError).issues;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.some(issue => issue.includes('age'))).toBe(true);
      }
    });
  });

  describe('custom validation', () => {
    it('should apply custom validation after schema validation', async () => {
      const generate = vi.fn()
        .mockResolvedValueOnce('{"name": "Jack", "age": -5}')  // age < 0
        .mockResolvedValueOnce('{"name": "Jack", "age": 20}');  // 正确

      const result = await generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
        validate: (value) => value.age < 0 ? ['age must be non-negative'] : [],
        maxAttempts: 2,
      });

      expect(generate).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ name: 'Jack', age: 20 });
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON with diagnostic logging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const generate = vi.fn().mockResolvedValue('not json at all');

      await expect(generateStructuredOutput({
        schema: TestSchema,
        prompt: 'test',
        generate,
        maxAttempts: 1,
      })).rejects.toThrow(StructuredOutputError);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Structured Output] JSON parse failed on attempt 1')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preview: not json at all')
      );

      consoleSpy.mockRestore();
    });
  });
});
