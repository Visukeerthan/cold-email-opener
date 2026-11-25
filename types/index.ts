import { z } from "zod";

export const CandidateProfileSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  headline: z.string().min(2, "Headline is required"),
  skills: z.string().min(2, "Enter at least a few skills"),
  projectsAndExperience: z
    .string()
    .min(10, "Add key projects or internship experience"),
  githubUrl: z
    .string()
    .url("Enter a valid GitHub/Portfolio URL")
    .optional()
    .or(z.literal("")),
  availability: z.string().optional().default("Available immediately"),
});

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const InputModeSchema = z.enum(["url", "jd", "hybrid"]);
export type InputMode = z.infer<typeof InputModeSchema>;

export const OutreachTemplateSchema = z.enum([
  "wellfound_note",
  "cold_email",
  "linkedin_dm",
]);
export type OutreachTemplate = z.infer<typeof OutreachTemplateSchema>;

export const GenerateRequestSchema = z
  .object({
    profile: CandidateProfileSchema,
    mode: InputModeSchema,
    template: OutreachTemplateSchema,
    companyUrl: z.string().optional().default(""),
    jobDescription: z.string().optional().default(""),
    targetRole: z.string().min(2, "Target role is required"),
    customInstruction: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if ((data.mode === "url" || data.mode === "hybrid") && !data.companyUrl.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyUrl"],
        message: "Company URL is required for URL or Hybrid mode.",
      });
    }
    if (
      (data.mode === "jd" || data.mode === "hybrid") &&
      data.jobDescription.trim().length < 20
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobDescription"],
        message: "Paste at least 20 characters of the Job Description.",
      });
    }
  });

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  subject: z.string().optional().default(""),
  content: z.string().min(1),
  matchedAngle: z.string().min(1),
  scrapedDomain: z.string().optional().default(""),
});

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;