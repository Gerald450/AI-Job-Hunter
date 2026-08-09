/**
 * Lightweight host-matching checks for ATS adapters (no DOM).
 * Run: node --experimental-strip-types chrome-extension/scripts/check-ats-hosts.mts
 * or: pnpm exec tsx scripts/check-ats-hosts.mts
 */

type Matcher = (hostname: string, pathname?: string) => boolean;

const matchers: Record<string, Matcher> = {
  greenhouse: (h) => h.includes("greenhouse.io"),
  lever: (h) => h.includes("lever.co"),
  ashby: (h) => h.includes("ashbyhq.com"),
  workable: (h) => h.includes("workable.com"),
  workday: (h) =>
    h.includes("myworkdayjobs.com") ||
    h.includes("workdayjobs.com") ||
    /\.wd\d+\./i.test(h),
  smartrecruiters: (h) => h.includes("smartrecruiters.com"),
  icims: (h) => h.includes("icims.com"),
  oracle: (h) => h.includes("oraclecloud.com"),
  taleo: (h) => h.includes("taleo.net") || h.includes("taleo.com"),
  successfactors: (h) =>
    h.includes("successfactors.com") ||
    h.includes("successfactors.eu") ||
    h.includes("sapsf.com"),
  jobvite: (h) => h.includes("jobvite.com"),
  teamtailor: (h) => h.includes("teamtailor.com"),
  bamboohr: (h) => h.includes("bamboohr.com") || h.includes("bamboohr.co"),
  recruitee: (h) => h.includes("recruitee.com"),
  lifeattiktok: (h) =>
    h.includes("lifeattiktok.com") || h.includes("jobs.bytedance.com"),
};

const cases: Array<{ host: string; expect: string }> = [
  { host: "boards.greenhouse.io", expect: "greenhouse" },
  { host: "jobs.lever.co", expect: "lever" },
  { host: "jobs.ashbyhq.com", expect: "ashby" },
  { host: "apply.workable.com", expect: "workable" },
  { host: "acme.wd1.myworkdayjobs.com", expect: "workday" },
  { host: "jobs.smartrecruiters.com", expect: "smartrecruiters" },
  { host: "careers-acme.icims.com", expect: "icims" },
  { host: "eeho.fa.oraclecloud.com", expect: "oracle" },
  { host: "acme.taleo.net", expect: "taleo" },
  { host: "career.successfactors.com", expect: "successfactors" },
  { host: "jobs.jobvite.com", expect: "jobvite" },
  { host: "acme.teamtailor.com", expect: "teamtailor" },
  { host: "acme.bamboohr.com", expect: "bamboohr" },
  { host: "acme.recruitee.com", expect: "recruitee" },
  { host: "lifeattiktok.com", expect: "lifeattiktok" },
  { host: "jobs.bytedance.com", expect: "lifeattiktok" },
];

let failed = 0;
for (const { host, expect } of cases) {
  const hit = Object.entries(matchers).find(([, fn]) => fn(host));
  const got = hit?.[0] ?? "unknown";
  if (got !== expect) {
    console.error(`FAIL ${host}: expected ${expect}, got ${got}`);
    failed += 1;
  } else {
    console.log(`ok ${host} → ${got}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(`All ${cases.length} ATS host checks passed.`);
