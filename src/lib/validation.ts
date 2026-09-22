import { z } from "zod";

export const DECISION_ACTIONS = ["APPROVE", "REJECT", "REQUEST_MORE_INFO"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Reasons that must carry context supplied by the analyst. */
export const REASON_REQUIRED_ACTIONS: DecisionAction[] = ["REJECT", "REQUEST_MORE_INFO"];

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 1000;

/**
 * Allow-list for reason free-text: letters, digits, whitespace and a small set
 * of punctuation. Rejects control characters, angle brackets, backslashes and
 * other payload-shaped input rather than trying to sanitise it after the fact.
 */
const REASON_ALLOWED = /^[\p{L}\p{N}\s.,;:!?'"()\-_/@%&+#]*$/u;

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
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED", "MORE_INFO_REQUESTED"]).default("ALL"),
  risk: z.enum(["ALL", "LOW", "MEDIUM", "HIGH"]).default("ALL"),
  search: z.string().max(100).default(""),
  sort: z.enum(["OLDEST", "NEWEST", "RISK", "STATUS"]).default("OLDEST"),
});

export type QueueFilter = z.infer<typeof queueFilterSchema>;
