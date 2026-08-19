/**
 * Profile helpers — map a UserProfile into plain label→value pairs.
 * Semantic alias matching lives in lib/semantics.ts (single source of truth).
 */

import type { UserProfile } from "@/types";

/**
 * Convert a profile into a flat record keyed by human-readable labels.
 * Boolean fields become "Yes"/"No" for form compatibility.
 */
export function profileToAutofillMap(profile: UserProfile): Record<string, string> {
  const out: Record<string, string> = {};

  const put = (label: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === "") return;
    if (typeof value === "boolean") {
      out[label] = value ? "Yes" : "No";
    } else {
      out[label] = String(value);
    }
  };

  put("First Name", profile.firstName);
  put("Middle Name", profile.middleName);
  put("Last Name", profile.lastName);
  put("Email", profile.email);
  put("Phone", profile.phone);
  put("LinkedIn", profile.linkedin);
  put("Website", profile.website);
  put("Location", profile.location);
  put("Address", profile.location);
  put("Authorized to Work", profile.authorizedToWork);
  put("Require Sponsorship", profile.requiresSponsorship);
  put("At Least 18", profile.atLeast18);
  put("Desired Salary", profile.desiredSalary);
  put("Expected Salary", profile.desiredSalary);
  put("Years of Experience", profile.yearsExperience);
  put("Education", profile.education);
  put("Degree", profile.degree);
  put("Field of Study", profile.fieldOfStudy);
  put("Major", profile.fieldOfStudy);
  put("Graduation Date", profile.graduationDate);
  put("GPA", profile.gpa);
  put("Preferred Location", profile.preferredLocation);
  put("Gender", profile.gender);
  put("Sex", profile.gender);
  put("Veteran Status", profile.veteran);
  put("Race", profile.race);
  put("Disability", profile.disability);
  put("How Did You Hear About Us?", profile.hearAboutUs);

  return out;
}

export function isProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(profile.firstName && profile.lastName && profile.email);
}
