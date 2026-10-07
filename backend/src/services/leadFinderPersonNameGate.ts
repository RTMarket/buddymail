/**
 * 对齐插件 popup.js：cleanPersonNameForGate / isPlausiblePersonName / cleanJobTitleForGate
 */
const HONORIFIC = /^(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Sir|Dame|Mx)\.?$/i;
const LEAD_JUNK =
  /^(As|Is|Are|Was|Were|Says?|Said|Going|Meet|Watch|View|See|Read|Our|The|And|But|With|From|Into|Over|Under|About|Reportedly|Shows|After|Before|Why|How|When|What|Who|Whose|Whom|New|Top|Best|Follow|Following|Officer|Officers|Grew|Brings|Takes|Offers?|Sells?|Should|Shopping|Buying|Selling|Paying|Watching|Getting|Making)$/i;
const TRAIL_JUNK =
  /^(Headquarters|Announces|Named|Prioritizes|Appointed|Joins|Says|Said|Explains|Explain|Feedback|Bio|Profile|Inc|LLC|Initial|Investment|Founded|Founding|Inquiries|Inquiry|Going|Back|Is|Are|AI|Once|Steps?|Down|Lost|To|Brand|Her|His|Their|Email|Emails|Video|Videos|Payment|Payments|Attention|Shopping|Just|Waterfront|Cart|Checkout|Guide|Review|Deal|Deals|News|Update|Updates|Area|Growth|Offer|Offers|Sale|Sales)$/i;
const TITLE_AS_NAME =
  /\b(Officer|Manager|Director|President|Chairman|Chairwoman|Chairperson|Founder|Cofounder|Executive|Specialist|Analyst|Engineer|Coordinator|Associate|Consultant|Advisor|Adviser|Architect|Scientist|Researcher|Developer|Designer|Strategist|Leader|Chief|Principal|Intern|Fellow|Representative|Recruiter|Accountant|Controller|Counsel|Attorney|Lawyer|Administrator|Supervisor|Secretary|Treasurer)\.?$/i;
const PLACEHOLDER =
  /^(john smith|jane doe|john doe|jane smith|emily johnson|michael brown|david wilson|sarah davis|william miller|lisa moore|mark davis|karen moore|test user|foo bar)$/i;

const NOT_NAME_TOKEN =
  /^(Play|Find|Gun|Spin|Unblocked|Online|Golf|Realistic|Adobe|Acrobat|Reader|Medical|Centre|Center|Portal|Sexual|Activity|Download|Install|Granny|Ragdoll|Archers|Doctors|Book|Free|Game|Games|Windows|Duckmath|WikiHow|How)$/i;

export function cleanLeadPersonName(name: string): string {
  let n = String(name || "")
    .trim()
    .replace(/[.\u3002]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = n.split(/\s+/).filter(Boolean);
  while (parts.length && HONORIFIC.test(parts[0]!)) parts.shift();
  while (parts.length && HONORIFIC.test(parts[parts.length - 1]!)) parts.pop();
  while (parts.length >= 2 && LEAD_JUNK.test(parts[0]!)) parts.shift();
  while (parts.length >= 2 && TRAIL_JUNK.test(parts[parts.length - 1]!)) parts.pop();
  return parts.join(" ").trim();
}

export function cleanLeadJobTitle(title: string): string {
  let t = String(title || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  t = t.replace(/\s*&(?:amp)?;?\s*$/i, "").trim();
  t = t.replace(/\s*&[a-z0-9]{1,3}$/i, "").trim();
  for (let i = 0; i < 8; i++) {
    const next = t
      .replace(/[,;:|/\\·•]+$/g, "")
      .replace(/\s*[-–—]\s*$/g, "")
      .replace(/\s+(&|and|or|of|the|for|with|to|in|at|on|as)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (next === t) break;
    t = next;
  }
  if (/\s*&[a-z0-9]{0,3}$/i.test(t)) return "";
  return t.slice(0, 512);
}

export function isPlausibleLeadPersonName(name: string): boolean {
  const raw = String(name || "").trim();
  if (!raw || PLACEHOLDER.test(raw.toLowerCase())) return false;
  if (
    /\b(Is\s+Going|Going\s+Back|Says?\s+AI|Who\s+Lost|Steps?\s+Down|Grew\s+Her|Shopping\s+Video)\b/i.test(
      raw
    )
  ) {
    return false;
  }
  const n = cleanLeadPersonName(raw);
  if (n.length < 4 || n.length > 70) return false;
  if (!/\s/.test(n)) return false;
  if (/@|https?:|www\.|\.com|\d{3,}/i.test(n)) return false;
  if (/\b(Inc|LLC|Ltd|Limited|Corp|Corporation|University|College|Hospital|Group|Company)\.?$/i.test(n)) {
    return false;
  }
  if (TITLE_AS_NAME.test(n)) return false;
  if (/\b(Chief\s+\w+\s+Officer|Vice\s+President|General\s+Manager|Head\s+Of|Director\s+Of)\b/i.test(n)) {
    return false;
  }
  const parts = n.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  if (parts.some((p) => NOT_NAME_TOKEN.test(p))) return false;
  if (/\b(Centre|Center|Portal|Medical|Unblocked|Acrobat|Reader|Activity|Golf|Simulator|Download|Install|WikiHow)\b/i.test(n)) {
    return false;
  }
  return parts.every((p) => /^[A-Z][a-zA-Z'.-]{1,20}$/.test(p) || /^[A-Z]{2,4}$/.test(p));
}

const JOB_TITLE =
  /\b((?:Co-)?Founders?|CEO|CTO|CFO|COO|CMO|CRO|CIO|CPO|CHRO|CISO|CXO|President|Chairman|Vice\s+President|EVP|SVP|VP|Managing Director|General Manager|Country (?:Leader|Manager|Head)|Directors?|Head of|Chief [A-Za-z][A-Za-z\s]{2,40}Officer|Managers?|Procurement|Purchasing|Buyers?|Sourcing|Supply Chain|Sales|Business Development|Account Executives?|Marketing|Brand|Finance|Accounting|Controllers?|Human Resources|Talent Acquisition|Recruiters?|Engineers?|Developers?|IT\b|Specialists?|Analysts?|Coordinators?|Representatives?|Associates?)\b/i;

export function isPlausibleLeadJobTitle(title: string): boolean {
  const t = cleanLeadJobTitle(title);
  if (!t) return false;
  if (t.length > 80) return false;
  if (
    /game|unblocked|wikihow|download|install|portal|appointment|immersive|handcrafted|physics-based|hidden object|horror game|maintenance in progress/i.test(
      t
    )
  ) {
    return false;
  }
  return JOB_TITLE.test(t);
}
