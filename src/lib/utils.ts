import {z} from 'zod';

export const typecheck = <T>(schema: z.ZodType<T>,value: z.infer<z.ZodType<T>>): Promise<z.infer<z.ZodType<T>>> => {
  return schema.parseAsync(value)
};
