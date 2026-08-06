export function formatPostedAge(age: string): string {
  const match = age.trim().match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) {
    return age || "Unknown";
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith("h")) {
    if (value === 0) return "Just now";
    return value === 1 ? "1 hour ago" : `${value} hours ago`;
  }

  if (unit.startsWith("d")) {
    if (value === 0) return "Today";
    return value === 1 ? "1 day ago" : `${value} days ago`;
  }

  if (unit.startsWith("w")) {
    return value === 1 ? "1 week ago" : `${value} weeks ago`;
  }

  if (unit.startsWith("mo")) {
    return value === 1 ? "1 month ago" : `${value} months ago`;
  }

  if (unit.startsWith("y")) {
    return value === 1 ? "1 year ago" : `${value} years ago`;
  }

  return age;
}

/** Resolve PittCSC continuation rows where company is "↳". */
export function resolveCompanyNames<T extends { company: string }>(
  jobs: T[],
): T[] {
  let lastCompany = "";

  return jobs.map((job) => {
    if (job.company === "↳" && lastCompany) {
      return { ...job, company: lastCompany };
    }

    if (job.company && job.company !== "↳") {
      lastCompany = job.company;
    }

    return job;
  });
}
