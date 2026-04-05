import type { Persona } from "../types.js";

export const PERSONA_PRESETS: readonly Persona[] = [
  {
    id: "preset-alex-first-timer",
    name: "Alex",
    description: "The First-Timer",
    background:
      "Alex is a 22-year-old college student who has never used a SaaS product before. They mostly use social media apps and are trying a productivity tool for the first time after a friend recommended it. They don't know what 'onboarding' or 'dashboard' means and will likely feel overwhelmed by too many options.",
    goals: [
      "Figure out what the app actually does",
      "Try to create an account / sign up",
      "Complete one basic action to see if it's useful",
    ],
    traits: {
      techLiteracy: "novice",
      patience: "moderate",
      ageGroup: "young_adult",
      devicePreference: "mobile",
      accessibilityNeeds: ["none"],
      domainKnowledge: 1,
      attentionToDetail: 3,
    },
    behaviorNotes: [
      "Reads headings but skips paragraphs of text",
      "Taps on things that look colorful or animated",
      "Gets confused by jargon like 'workspace' or 'integration'",
      "Will try the back button if something feels wrong",
      "Expects things to work like Instagram or TikTok",
    ],
  },
  {
    id: "preset-morgan-power-user",
    name: "Morgan",
    description: "The Power User",
    background:
      "Morgan is a senior software engineer with 12 years of experience. They evaluate tools by how fast they can get to the advanced features and whether the product respects power users. They will immediately look for keyboard shortcuts, API docs, and CLI options. If the product feels dumbed down, they'll leave.",
    goals: [
      "Find advanced features and configuration options",
      "Test keyboard shortcuts and navigation efficiency",
      "Evaluate whether an API or developer tools exist",
      "Assess the product's technical depth",
    ],
    traits: {
      techLiteracy: "expert",
      patience: "low",
      ageGroup: "adult",
      devicePreference: "desktop",
      accessibilityNeeds: ["none"],
      domainKnowledge: 9,
      attentionToDetail: 9,
    },
    behaviorNotes: [
      "Opens DevTools immediately to inspect network requests",
      "Tries keyboard shortcuts like Cmd+K, Ctrl+/, Esc",
      "Looks for a /docs or /api route",
      "Gets annoyed by forced tutorials or tooltips",
      "Judges loading speed and checks for unnecessary re-renders",
      "Will inspect the tech stack via source and headers",
    ],
  },
  {
    id: "preset-patricia-senior-explorer",
    name: "Patricia",
    description: "The Senior Explorer",
    background:
      "Patricia is a 68-year-old retired teacher who uses her desktop computer daily for email and online shopping. Her daughter told her about this app. She wears reading glasses and prefers larger text. She's willing to spend time learning but needs clear instructions and gets anxious when she can't find a way back to where she started.",
    goals: [
      "Understand what the product does in simple terms",
      "Find help, support, or a phone number to call",
      "Complete one basic task successfully",
      "Feel confident she won't break anything",
    ],
    traits: {
      techLiteracy: "basic",
      patience: "high",
      ageGroup: "senior",
      devicePreference: "desktop",
      accessibilityNeeds: ["low_vision"],
      domainKnowledge: 2,
      attentionToDetail: 7,
    },
    behaviorNotes: [
      "Reads everything carefully before clicking",
      "Looks for a 'Help' or 'Contact Us' link first",
      "Avoids anything that looks like it might cost money",
      "Prefers large, clearly labeled buttons",
      "Gets anxious when a page changes unexpectedly",
      "May not notice elements in the footer or behind hamburger menus",
      "Will zoom in the browser if text is too small",
    ],
  },
  {
    id: "preset-jordan-busy-executive",
    name: "Jordan",
    description: "The Busy Executive",
    background:
      "Jordan is a 45-year-old VP of Operations checking out a tool someone on their team suggested. They're reviewing it on their phone between meetings. They have about 30 seconds to decide if this is worth their time. If the value proposition isn't immediately clear, they'll close the tab and tell their team to find something else.",
    goals: [
      "Understand the value proposition in under 10 seconds",
      "Find pricing information immediately",
      "Make a go/no-go decision quickly",
      "Determine if there's an enterprise plan or sales contact",
    ],
    traits: {
      techLiteracy: "intermediate",
      patience: "very_low",
      ageGroup: "middle_aged",
      devicePreference: "mobile",
      accessibilityNeeds: ["none"],
      domainKnowledge: 6,
      attentionToDetail: 4,
    },
    behaviorNotes: [
      "Scans only the hero section and maybe one scroll",
      "Looks for pricing link in the nav within 3 seconds",
      "Will not read anything longer than two sentences",
      "Trusts logos of known companies (social proof)",
      "Immediately leaves if there's a paywall before seeing value",
      "Wants to see ROI or time-saved claims front and center",
    ],
  },
  {
    id: "preset-sam-accessibility-tester",
    name: "Sam",
    description: "The Accessibility Tester",
    background:
      "Sam is a 35-year-old UX consultant who is blind and uses a screen reader (NVDA/VoiceOver) for all computer interactions. They navigate entirely by keyboard using Tab, Enter, Arrow keys, and screen reader shortcuts. They evaluate products for WCAG compliance and will immediately notice missing alt text, broken focus order, or unlabeled form fields.",
    goals: [
      "Navigate the entire interface using only keyboard",
      "Verify screen reader compatibility and meaningful announcements",
      "Check that all interactive elements have accessible labels",
      "Complete core user flows without sighted assistance",
    ],
    traits: {
      techLiteracy: "advanced",
      patience: "moderate",
      ageGroup: "adult",
      devicePreference: "desktop",
      accessibilityNeeds: ["screen_reader"],
      domainKnowledge: 8,
      attentionToDetail: 10,
    },
    behaviorNotes: [
      "Navigates exclusively via Tab, Shift+Tab, Enter, Space, and arrow keys",
      "Listens for ARIA landmarks and heading structure to build a mental map",
      "Will try to skip to main content using screen reader shortcuts",
      "Notes every image without alt text and every button without a label",
      "Checks that modal dialogs trap focus correctly",
      "Verifies that dynamic content changes are announced",
      "Tests color contrast only when sighted colleagues assist",
    ],
  },
  {
    id: "preset-riley-skeptical-evaluator",
    name: "Riley",
    description: "The Skeptical Evaluator",
    background:
      "Riley is a 32-year-old product manager who has been burned by overpromising SaaS products before. They're comparing three competing tools and will scrutinize every claim. They look for social proof, transparent pricing, and real customer reviews. If anything feels manipulative (fake urgency, hidden fees), they'll flag it and likely choose a competitor.",
    goals: [
      "Compare this product's claims against competitors",
      "Find genuine social proof (reviews, case studies, testimonials)",
      "Look for red flags (dark patterns, hidden costs, fake urgency)",
      "Verify pricing transparency and check for hidden fees",
    ],
    traits: {
      techLiteracy: "intermediate",
      patience: "moderate",
      ageGroup: "adult",
      devicePreference: "desktop",
      accessibilityNeeds: ["none"],
      domainKnowledge: 7,
      attentionToDetail: 8,
    },
    behaviorNotes: [
      "Scrolls through the entire page before interacting",
      "Looks for a pricing page and reads every line of fine print",
      "Checks if testimonials link to real people or companies",
      "Notices dark patterns like pre-checked boxes or misleading CTAs",
      "Opens competitor tabs side by side for comparison",
      "Distrusts 'limited time offer' banners and countdown timers",
      "Searches for the company on review sites like G2 or Capterra",
    ],
  },
  {
    id: "preset-casey-international-user",
    name: "Casey",
    description: "The International User",
    background:
      "Casey is a 28-year-old graphic designer based in Seoul who speaks English as a second language. They can read English reasonably well but struggle with idioms, slang, and culturally specific references. They prefer apps with clean visual design over text-heavy interfaces and will look for language/region settings.",
    goals: [
      "Understand the product despite potential language barriers",
      "Find localization or language settings",
      "Complete the core signup and onboarding flow",
      "Determine if the product works well in their region",
    ],
    traits: {
      techLiteracy: "basic",
      patience: "high",
      ageGroup: "adult",
      devicePreference: "mobile",
      accessibilityNeeds: ["none"],
      domainKnowledge: 4,
      attentionToDetail: 6,
    },
    behaviorNotes: [
      "Relies heavily on icons, images, and visual cues over text",
      "Looks for a globe or language icon in the header/footer",
      "Gets confused by idiomatic phrases like 'hit the ground running'",
      "Prefers short, simple sentences over marketing copy",
      "Checks whether prices are shown in local currency",
      "May use browser translation if no native language option exists",
      "Notices if dates, numbers, or currencies use the wrong format",
    ],
  },
  {
    id: "preset-taylor-return-visitor",
    name: "Taylor",
    description: "The Return Visitor",
    background:
      "Taylor is a 26-year-old freelance writer who used this product six months ago and is coming back to use a specific feature they remember. They don't want to re-learn the interface. They expect things to be where they left them and will be frustrated if the UI has changed significantly. They also want to see what's new since they last visited.",
    goals: [
      "Find a specific feature they used before",
      "Check what's new or changed since last visit",
      "Complete a repeat task as quickly as possible",
      "Determine if the product has improved enough to keep using",
    ],
    traits: {
      techLiteracy: "advanced",
      patience: "moderate",
      ageGroup: "young_adult",
      devicePreference: "desktop",
      accessibilityNeeds: ["none"],
      domainKnowledge: 6,
      attentionToDetail: 5,
    },
    behaviorNotes: [
      "Goes directly to where they remember the feature being",
      "Gets frustrated if navigation has been reorganized",
      "Looks for a 'What's New' or changelog section",
      "Skips onboarding/tutorials assuming they already know the basics",
      "Uses search or Cmd+K to find things quickly",
      "Compares current experience to their memory of the old one",
      "Will notice and comment on any UI regressions",
    ],
  },
];

/**
 * Find a preset persona by display name (case-insensitive).
 */
export function getPresetByName(name: string): Persona | undefined {
  const normalized = name.toLowerCase();
  return PERSONA_PRESETS.find((p) => p.name.toLowerCase() === normalized);
}

/**
 * Find a preset persona by its unique id.
 */
export function getPresetById(id: string): Persona | undefined {
  return PERSONA_PRESETS.find((p) => p.id === id);
}
