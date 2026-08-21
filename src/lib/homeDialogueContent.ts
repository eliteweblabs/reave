/** Static homepage founder dialogue — visitor prompt + Thomas Reave response. */
export type HomeDialogueTurn = {
  role: "visitor" | "founder";
  text: string;
};

export type HomeDialogueContent = {
  eyebrow: string;
  title: string;
  turns: HomeDialogueTurn[];
  attribution: string;
};

export const HOME_DIALOGUE: HomeDialogueContent = {
  eyebrow: "From the founder",
  title: "What we actually do",
  turns: [
    {
      role: "visitor",
      text: "Are you selling an app, or do you just fix websites?",
    },
    {
      role: "founder",
      text: "We help small businesses on the internet. That’s the job. If the site is chunky and you need someone to clean it up for a few hundred bucks, we’ll do that. If you need branded email so you don’t look like a free Gmail™, we’ll set that up too. Listings, hosting, the leftover tool you never wanted to learn — we’ll take the work.",
    },
    {
      role: "founder",
      text: "There is also an operating system we built for running the shop — inbox, clients, billing, an agent that actually does the clicking. We bring it up when it fits. We’re not going to make you buy software just to get help with the thing that’s in the way this week.",
    },
    {
      role: "founder",
      text: "We’ve been doing websites and apps for over 20 years. The OS is what we use ourselves, and we can put you on it if you want the whole pile in one login. Most people start with whatever is actually hurting — and that’s fine. We’ll take any of it.",
    },
  ],
  attribution: "Thomas Reave",
};
