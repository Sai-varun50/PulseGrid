const { z } = require("zod");

const webhookIncidentSchema = z.object({
  service_id: z
    .number()
    .int()
    .positive(),

  title: z
    .string()
    .min(1)
    .max(255),

  description: z
    .string()
    .nullable()
    .optional(),

  severity: z.enum([
    "low",
    "medium",
    "high",
    "critical",
  ]),

  fingerprint: z
    .string()
    .min(1)
    .max(255),

  event_id: z
    .string()
    .min(1)
    .optional(),
});

module.exports = {
  webhookIncidentSchema,
};