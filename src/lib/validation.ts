import { z } from "zod";

export const DECISION_ACTIONS = ["APPROVE", "REJECT", "REQUEST_MORE_INFO"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Reasons that must carry context supplied by the analyst. */
export const REASON_REQUIRED_ACTIONS: DecisionAction[] = ["REJECT", "REQUEST_MORE_INFO"];

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 1000;

/**
 * Allow-list for reason free-text: letters, digits, spaces and a small set of
 * punctuation. Rejects every control character (including tabs and newlines),
 * angle brackets, backslashes and other payload-shaped input rather than
 * trying to sanitise it after the fact.
 */
const REASON_ALLOWED = /^[\p{L}\p{N} .,;:!?'"()\-_/@%&+#]*$/u;

export const reasonSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(REASON_MIN_LENGTH, `Reason must be at least ${REASON_MIN_LENGTH} characters.`)
      .max(REASON_MAX_LENGTH, `Reason must be at most ${REASON_MAX_LENGTH} characters.`)
      .regex(
        REASON_ALLOWED,
        "Reason contains unsupported characters. Use letters, numbers and basic punctuation only."
      )
  );

export const optionalReasonSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(REASON_MAX_LENGTH, `Reason must be at most ${REASON_MAX_LENGTH} characters.`)
      .regex(
        REASON_ALLOWED,
        "Reason contains unsupported characters. Use letters, numbers and basic punctuation only."
      )
  )
  .optional();

export const decisionInputSchema = z
  .object({
    action: z.enum(DECISION_ACTIONS),
    reason: z.string().max(REASON_MAX_LENGTH * 2).optional().default(""),
  })
  .superRefine((value, ctx) => {
    const required = REASON_REQUIRED_ACTIONS.includes(value.action);
    const parsed = required
      ? reasonSchema.safeParse(value.reason ?? "")
      : optionalReasonSchema.safeParse(value.reason ?? "");
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: parsed.error.issues[0]?.message ?? "Invalid reason.",
      });
    }
  })
  .transform((value) => ({
    action: value.action,
    reason: value.reason?.trim() ? value.reason.trim() : null,
  }));

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export const queueFilterSchema = z.object({
  status: z
    .enum([
      "ALL",
      "PENDING",
      "AWAITING_SECOND_APPROVAL",
      "APPROVED",
      "REJECTED",
      "MORE_INFO_REQUESTED",
    ])
    .default("ALL"),
  risk: z.enum(["ALL", "LOW", "MEDIUM", "HIGH"]).default("ALL"),
  assignment: z.enum(["ALL", "MINE", "UNCLAIMED"]).default("ALL"),
  search: z.string().max(100).default(""),
  sort: z.enum(["OLDEST", "NEWEST", "RISK", "STATUS"]).default("OLDEST"),
});

export type QueueFilter = z.infer<typeof queueFilterSchema>;

/** Unknown or malformed filter values fall back to the defaults. */
export function parseQueueFilter(input: {
  status?: string;
  risk?: string;
  assignment?: string;
  search?: string;
  sort?: string;
}): QueueFilter {
  const defaults = queueFilterSchema.parse({});
  const parsed = queueFilterSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  return {
    status: queueFilterSchema.shape.status.safeParse(input.status).data ?? defaults.status,
    risk: queueFilterSchema.shape.risk.safeParse(input.risk).data ?? defaults.risk,
    assignment:
      queueFilterSchema.shape.assignment.safeParse(input.assignment).data ?? defaults.assignment,
    search: (input.search ?? "").slice(0, 100),
    sort: queueFilterSchema.shape.sort.safeParse(input.sort).data ?? defaults.sort,
  };
}
