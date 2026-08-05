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
  title: "Why REΛVE exists",
  turns: [
    {
      role: "visitor",
      text: "Why did you build REΛVE?",
    },
    {
      role: "founder",
      text: "The logic is simple. The majority of small businesses all need the same basic services to cover 90% of their operation — email, scheduling, and customer management. The REΛVE platform provides all of these on day zero with an integrated agent. With one click, you can research a company from an email, turn rough notes into a proposal, see what your competitors are charging — and literally anything else you can imagine.",
    },
    {
      role: "founder",
      text: "REΛVE differs from standard SaaS apps because we're not a multimillion-dollar operation. We developed this entire application in-house and know it inside and out. We've built over a dozen modules to extend the standard REΛVE app.",
    },
    {
      role: "founder",
      text: "The goal was to give the small business owner everything they needed from a distance — without bloating the price with unnecessary features — all in a framework that is easily extendable. That's where REΛVE is different. We can customize your installation quickly, and it is not a five-figure operation, as it is with many agencies.",
    },
    {
      role: "founder",
      text: "We have over 20 years of experience developing websites and applications. I use REΛVE every day, and I actually build the REΛVE app from within itself. I have since stopped using all other apps, and the decrease in noise has been absolutely phenomenal. I used to get well over 100 dings and beeps a day — and only maybe 5% of them were relevant. Now all I see is that 5%.",
    },
  ],
  attribution: "Thomas Reave",
};
