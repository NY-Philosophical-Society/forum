import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hotScore, recomputeThreadHotScore } from "../src/server/ranking";
import { supabaseAdmin } from "../src/server/supabase";

const prisma = new PrismaClient();

/**
 * Demo accounts need to exist in Supabase Auth, not just in our table — they
 * are meant to be signed into. The auth user is created first and its id
 * becomes User.id, which is the same order a real signup follows.
 *
 * Idempotent: re-seeding finds the existing auth user rather than failing on
 * the duplicate email, so `npm run db:seed` stays repeatable.
 */
async function upsertAuthUser(email: string, displayName: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (data?.user) return data.user.id;

  // Already there from a previous seed — find it and carry on.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return existing.id;

  throw new Error(`Could not create or find the auth user for ${email}: ${error?.message}`);
}

const TAGS = [
  { slug: "logic", name: "Logic", description: "Formal and informal reasoning, argumentation, paradoxes." },
  { slug: "mind", name: "Mind", description: "Consciousness, personal identity, the mind-body problem." },
  { slug: "science", name: "Science", description: "Scientific method, causation, theory-choice, demarcation." },
  { slug: "aesthetics", name: "Aesthetics", description: "Art, beauty, taste, and the meaning of art." },
  { slug: "religion", name: "Religion", description: "God, faith and reason, the problem of evil." },
  { slug: "language", name: "Language", description: "Meaning, reference, and the nature of truth in language." },
  { slug: "epistemology", name: "Epistemology", description: "Knowledge, belief, justification, skepticism." },
  { slug: "ethics", name: "Ethics", description: "Normative ethics, metaethics, applied ethics." },
  { slug: "metaphysics", name: "Metaphysics", description: "Existence, identity, causation, free will." },
  {
    slug: "political-philosophy",
    name: "Political Philosophy",
    description: "Justice, liberty, the state, political obligation.",
  },
  {
    slug: "mathematics",
    name: "Mathematics",
    description: "Is mathematics discovered or invented; the nature of mathematical objects and proof.",
  },
  {
    slug: "law",
    name: "Law",
    description: "The nature of law, legal positivism vs. natural law, what makes law binding.",
  },
] as const;

const DEMO_PASSWORD = "demo-password-123";

/** Ordinary club members — not the canon. */
const MEMBERS: Record<string, string> = {
  marguerite: "Marguerite Okonkwo",
  daniel: "Daniel Reiss",
  priya: "Priya Raghunathan",
  tomas: "Tomás Delgado",
  hannah: "Hannah Feldstein",
  wenli: "Wen-Li Chen",
  owen: "Owen Brannigan",
  adaora: "Adaora Nwosu",
  julian: "Julian Castellanos",
  ruth: "Ruth Abramowitz",
  samir: "Samir Haddad",
  clare: "Clare Whitfield",
};

async function upsertUser(handle: string) {
  const displayName = MEMBERS[handle];
  if (!displayName) throw new Error(`Unknown seed member: ${handle}`);
  const email = `${handle}@demo.nyphilosophy.org`;
  const id = await upsertAuthUser(email, displayName);
  return prisma.user.upsert({
    where: { email },
    update: { displayName },
    create: { id, email, displayName, verificationStatus: "VERIFIED" },
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface ReplySeed {
  author: string;
  body: string;
  /** Index into this thread's replies array — makes this a reply-to-a-reply. */
  replyToIndex?: number;
  hoursAfterThread: number;
}

interface ThreadSeed {
  tagSlug: (typeof TAGS)[number]["slug"];
  author: string;
  title: string;
  body: string;
  daysAgo: number;
  replies: ReplySeed[];
}

const THREADS: ThreadSeed[] = [
  {
    tagSlug: "logic",
    author: "wenli",
    title: "Consequentia mirabilis: can a claim be proved by the failure of its own denial?",
    body: `Clavius gave us the strangest inference rule in the book. In modern notation:

\`\`\`
(¬P → P) → P
\`\`\`

If assuming a proposition's *falsity* forces you to conclude its **truth**, then the proposition is true outright. Medieval logicians called it the **consequentia mirabilis** — the marvellous consequence — and it has an air of getting something for nothing.

It is also exactly the shape of the Liar. Let \`L\` be the sentence "*L is false*." Suppose \`L\` is false. Then what it says is the case — so \`L\` is true. We have \`¬L → L\`, and the marvellous consequence hands us \`L\`. But \`L\` says it is false.

So which do we give up?

1. The marvellous consequence itself
2. Bivalence — that every sentence is true or false
3. The assumption that \`L\` expresses a proposition at all

I want to hear the strongest case for each. Come at this hard.`,
    daysAgo: 3,
    replies: [
      {
        author: "daniel",
        body: `Give up nothing. The **consequentia mirabilis** is not a curiosity, it is just *reductio* wearing a hat.

> If assuming a proposition's falsity forces you to conclude its truth...

That "forces" is doing all the work, and it is perfectly ordinary work. \`¬P → P\` together with \`¬P\` yields \`P ∧ ¬P\`. A contradiction refutes the assumption. Therefore \`¬¬P\`, therefore \`P\`. Every step is one you already accept.

The rule is fine. The Liar is where the fault is, and pretending otherwise is scapegoating an innocent inference.`,
        hoursAfterThread: 2,
      },
      {
        author: "adaora",
        body: `Daniel's derivation smuggles in double negation elimination, and that is precisely the step an intuitionist declines.

Drop it and the marvellous consequence stops being derivable in general. That is not a technicality — it is the whole point. The rule *looks* miraculous because it lets you conjure a positive result out of a purely negative one, and constructively that is exactly what you are not entitled to do.

I would say the miracle is the tell. **Miracles do not happen in logic.** When an inference feels like it is producing content from nothing, the honest response is suspicion, not admiration.`,
        replyToIndex: 0,
        hoursAfterThread: 6,
      },
      {
        author: "priya",
        body: `Both of you are arguing about the engine while the wheels are off.

The problem is not the inference rule, it is that \`L\` never manages to say anything. Compare:

> This sentence is false.

with

> This sentence is in English.

The second has content you can check. The first has the *grammar* of a claim and none of the substance — it is an instruction to evaluate a result that does not exist yet. There is nothing there for "true" or "false" to attach to, so option 3, and the marvellous consequence walks away clean.`,
        hoursAfterThread: 11,
      },
      {
        author: "wenli",
        body: `Priya, I do not think you can hold that line, and here is why.

Take Yablo's sequence: an infinite list where each sentence says "*every sentence below me is false*." No sentence refers to itself. Each one is a perfectly ordinary claim about *other* sentences. And the paradox arises anyway.

If meaninglessness is your diagnosis, you now owe us an account on which none of infinitely many non-self-referential sentences means anything. That is a very expensive bill.`,
        replyToIndex: 2,
        hoursAfterThread: 18,
      },
      {
        author: "owen",
        body: `Option 2, and I do not think it should be controversial.

Bivalence is an assumption, not a discovery. We adopted it because it is convenient for the sentences we usually care about, and the Liar is simply a case where the convenience runs out. Say \`L\` is neither true nor false and the derivation stops at the first step — you never get \`¬L\`, so you never get \`¬L → L\`.

The cost is real: you lose excluded middle in full generality. But that is a *smaller* loss than telling me the rules of inference are unreliable, or that a grammatical English sentence is noise.`,
        hoursAfterThread: 26,
      },
      {
        author: "ruth",
        body: `Owen, this is where the strengthened Liar eats you alive.

> Say \`L\` is neither true nor false...

Very well. Now consider:

> This sentence is not true.

If it is neither true nor false, then it is *not true* — which is exactly what it says, so it is true. Your third truth value bought you one round and the paradox reformulated itself in the time it took to sit down.

Every "solution" of this shape faces the same problem: whatever category you invent to put the Liar in, the Liar just talks about that category instead.`,
        replyToIndex: 4,
        hoursAfterThread: 33,
      },
      {
        author: "marguerite",
        body: `Two thousand four hundred years, and the pattern is remarkably consistent: every proposal pays in a currency its author happens to find cheap.

Daniel keeps classical logic and pays with the Liar being *someone else's problem*. Adaora keeps consistency and pays with mathematics she would otherwise want. Priya keeps bivalence and pays with meaning. Owen pays with excluded middle and Ruth just showed the receipt bounced.

I do not offer a way out. But I would gently suggest the marvellous consequence is not the villain here. It is the *instrument* — the thing sensitive enough to detect that something in our concept of truth was already broken before it arrived.`,
        hoursAfterThread: 44,
      },
    ],
  },
  {
    tagSlug: "epistemology",
    author: "hannah",
    title: "Can observation alone ever reveal necessity?",
    body: `Every experiment I have ever run tells me what *did* happen. None of them tells me what *had* to.

If every event might, in principle, fail to repeat — if the next dropped stone might hang in the air — then how do we ever move from *seeing what has happened* to *knowing what must happen*?

The usual answer is that the regularity is so vast, so unbroken, that denying it becomes absurd. But vastness is still just more of the same kind of evidence. A thousand confirmations of a rule and one confirmation of a rule differ in degree, not in kind, and neither is a demonstration.

So: is necessity something we **observe**, something we **impose**, or something we have simply agreed to stop asking about?`,
    daysAgo: 5,
    replies: [
      {
        author: "tomas",
        body: `Necessity is not in the world, it is in the *structure we bring to it*. You do not see causation; you see one thing and then another thing, and supply the connection yourself.

That is not a defect. Without that supplied structure there is no experience at all, only succession.`,
        hoursAfterThread: 3,
      },
      {
        author: "samir",
        body: `The pragmatic answer: we do not need necessity, we need reliability, and reliability is something observation can absolutely deliver.

Bridges stand up. Vaccines work. The demand for something stronger than "this has held without exception and we understand the mechanism" strikes me as a demand for a kind of certainty that would not do any additional work if we had it.`,
        hoursAfterThread: 9,
      },
      {
        author: "hannah",
        body: `Samir — I grant that reliability is enough for engineering. My question is whether it is enough for *understanding*.

There seems to be a real difference between "the stone has always fallen" and "the stone falls **because** mass curves spacetime." The second feels like it explains. If all we ever have is the first, then explanation is an illusion we permit ourselves.`,
        replyToIndex: 1,
        hoursAfterThread: 15,
      },
      {
        author: "clare",
        body: `Some necessity is observable, but only the boring kind — the kind we built in ourselves.

> No bachelor is married.

I do not need a survey. But that is because the necessity lives in the *definition*, not the world. The moment you ask about stones and spacetime you are outside the reach of that trick, and Hannah's problem returns untouched.`,
        hoursAfterThread: 22,
      },
      {
        author: "julian",
        body: `Inference to the best explanation does more here than people credit.

We are not merely counting instances. We are asking which underlying structure would make the instances unsurprising, and often exactly one candidate survives. That is not deduction, but it is not brute enumeration either — it is a third thing, and dismissing it as "still just observation" flattens a real distinction.`,
        replyToIndex: 3,
        hoursAfterThread: 30,
      },
      {
        author: "priya",
        body: `Julian, "best" is carrying the weight, and the criteria are ours: simplicity, elegance, unifying power.

Those are aesthetic virtues. Lovely ones. But an argument that the universe must obey our sense of elegance is an argument that needs its own defence, and I have never seen it given.`,
        replyToIndex: 4,
        hoursAfterThread: 38,
      },
    ],
  },
  {
    tagSlug: "ethics",
    author: "adaora",
    title: "What does it mean to love someone well?",
    body: `We talk about loving *more* or *less*, but rarely about loving **well** — as though love were a quantity rather than a skill.

Suppose we try to measure it. Three candidates:

1. **Intensity** — how strongly you feel it
2. **Honesty** — whether you see the person as they are rather than as you need them to be
3. **Benefit** — whether the person's life actually goes better for your loving them

Each fails on its own. The most intense love can be suffocating. Perfect clear-sightedness can be cold. And love aimed purely at someone's improvement stops treating them as a person and starts treating them as a project.

So what is the measure? Or is asking for one already the mistake?`,
    daysAgo: 6,
    replies: [
      {
        author: "ruth",
        body: `Honesty, and it is not close.

Intensity without accurate sight is infatuation with a figure you invented. Benefit without accurate sight is condescension. Seeing the person clearly is the precondition for the other two meaning anything at all — it is not one option among three, it is the ground the others stand on.`,
        hoursAfterThread: 4,
      },
      {
        author: "owen",
        body: `Ruth, I think you have described *respect*, which is admirable and not the same thing.

I can see a colleague with total clarity and wish them well without anything I would call love. Something has to make this person matter to you disproportionately, beyond what impartial assessment warrants. That excess is not a flaw in love — it is the thing itself.`,
        replyToIndex: 0,
        hoursAfterThread: 8,
      },
      {
        author: "marguerite",
        body: `The question has a hidden assumption I would like to pull out: that loving well is something you do *to* or *for* another person, and can therefore be scored.

But love is a relation, and relations are not performances. Asking how well I love you is a bit like asking how well I am adjacent to you. Some of the answer is not mine to give.`,
        hoursAfterThread: 14,
      },
      {
        author: "tomas",
        body: `Attention. That is the measure, and it is nearly the whole of it.

> Attention is the rarest and purest form of generosity.

The capacity to actually notice another person — not the version of them convenient to your own story — is difficult, unglamorous, and where love usually fails. Not in a shortage of feeling. In a shortage of noticing.`,
        hoursAfterThread: 20,
      },
      {
        author: "clare",
        body: `Attention is beautiful and insufficient. A skilled manipulator attends closely. A stalker attends obsessively.

Attention *plus* good will, maybe. Which suggests the answer is a cluster rather than a criterion — and I suspect Adaora's closing question is the right one. We want a single measure because measures are tidy, not because love is.`,
        replyToIndex: 3,
        hoursAfterThread: 27,
      },
      {
        author: "daniel",
        body: `Practical test that has served me better than any theory: does the person become **more themselves** around you, or less?

It is not a definition. But it catches the failure modes — the suffocating love, the cold love, the improving love — without requiring us to first settle what love is. Sometimes a diagnostic beats an analysis.`,
        hoursAfterThread: 36,
      },
      {
        author: "adaora",
        body: `Daniel, that is the most useful thing said here, and I notice it is not a measure at all. It is a *symptom*.

Perhaps that is the shape of the answer. Loving well is not a quantity we score but a condition we detect — the way you diagnose health mostly by the absence of specific illnesses rather than by any positive test.`,
        replyToIndex: 5,
        hoursAfterThread: 45,
      },
    ],
  },
  {
    tagSlug: "ethics",
    author: "julian",
    title: "How should we recognize what is truly valuable and what only appears so?",
    body: `Almost everything that has ever wasted my time announced itself as important at the moment I chose it.

The difficulty is not that we pursue things we know to be worthless. It is that *appearing* valuable is precisely what worthless things are good at — and the appearance is often more vivid than the reality.

Some proposed tests:

- **The deathbed test** — will this matter at the end?
- **The reversal test** — if I did not already have it, would I seek it out?
- **The substitution test** — would something else serve just as well?

Each has a hole in it. The deathbed test overweights the perspective of someone exhausted and afraid. The reversal test discounts things whose value only appears after long acquaintance. The substitution test cannot see what is valuable *precisely because* it is irreplaceable to me in particular.

Is there a better instrument, or only better judgement?`,
    daysAgo: 4,
    replies: [
      {
        author: "clare",
        body: `Time. Not a test you apply but a test you *undergo*.

Things that only appear valuable stop appearing so, given long enough. The trouble is that "long enough" is often longer than the decision you needed to make, which makes it excellent for retrospect and nearly useless for choosing.`,
        hoursAfterThread: 3,
      },
      {
        author: "samir",
        body: `The question presumes value is out there waiting to be recognized, like a coin in the grass.

If it is instead something we *confer*, then there is nothing to be mistaken about — only choices we later regret or endorse. That reframing dissolves the problem rather than solving it, which I admit is a slightly cheap victory.`,
        hoursAfterThread: 7,
      },
      {
        author: "hannah",
        body: `Samir, regret is doing suspicious work in your account.

If value is purely conferred, regret should be impossible — you conferred it, so what is there to regret? The fact that we *can* be wrong about what we valued seems like evidence that there was something to be wrong about.`,
        replyToIndex: 1,
        hoursAfterThread: 13,
      },
      {
        author: "wenli",
        body: `A test the original post missed, and I think it is the strongest one: **does pursuing it make you want more of it, or does it satisfy?**

Merely apparent goods reliably generate appetite. Real ones tend to produce a kind of settling. It is not infallible, but unlike the deathbed test you can run it now.`,
        hoursAfterThread: 19,
      },
      {
        author: "marguerite",
        body: `Wen-Li, that cleanly disqualifies philosophy, which has never once satisfied anyone and reliably produces appetite for more of itself.

I say this with affection, and I am not entirely joking. Any test this crisp should be checked against the activity we are currently performing.`,
        replyToIndex: 3,
        hoursAfterThread: 25,
      },
      {
        author: "julian",
        body: `Marguerite — that may be the real finding. Perhaps the good things divide into the ones that *satisfy* and the ones that *sustain*, and we have been trying to force both through one instrument.

Food satisfies. Enquiry sustains. Insatiability is a defect in the first category and the entire point of the second.`,
        replyToIndex: 4,
        hoursAfterThread: 34,
      },
    ],
  },
  {
    tagSlug: "ethics",
    author: "ruth",
    title: "Reading group: Aristotle, Nicomachean Ethics, Books I–III",
    body: `We are taking the first three books over the coming weeks. Any edition is fine — I will cite Bekker numbers so we can stay in step.

**Book I** — the human good, *eudaimonia*, the function argument (1097b22–1098a20)
**Book II** — virtue as a state of character, habituation, the doctrine of the mean
**Book III** — voluntary and involuntary action, choice, deliberation, courage

Questions to hold onto as you read:

1. The function argument infers what is *good for* a human from what is *distinctive of* humans. Is that a valid move, or does it slide from a fact about our species to a claim about our welfare?
2. Aristotle insists virtue is acquired by practice, not teaching. If that is right, what exactly is a book like this one *for*?
3. Book III makes voluntariness a condition of praise and blame — but character itself is formed by habits laid down before you could choose them. Are we responsible for the person doing the choosing?

Newcomers very welcome. This is the best possible place to read Aristotle for the first time.`,
    daysAgo: 2,
    replies: [
      {
        author: "owen",
        body: `On (1) — I think the function argument is weaker than its reputation.

That reason is distinctive of us establishes only that it is *distinctive*, not that it is **good**. Deceit at scale is also fairly distinctive of humans. The inference needs a premise Aristotle never quite supplies: that fulfilling your characteristic activity constitutes flourishing rather than merely defining you.`,
        hoursAfterThread: 5,
      },
      {
        author: "priya",
        body: `Owen, that reads *ergon* too thinly. Aristotle is not saying "whatever humans uniquely do." He means the activity that, performed excellently, constitutes the thing being fully what it is — as a knife's *ergon* is cutting, not sitting in a drawer.

Deceit is a *failure* of reason's excellent operation, not a rival candidate for it. That does not make the argument airtight, but it is not the crude inference you are describing.`,
        replyToIndex: 0,
        hoursAfterThread: 10,
      },
      {
        author: "tomas",
        body: `On (2), the answer is in II.4: you become just by doing just acts, *as the just person does them* — knowingly, from a settled state, chosen for their own sake.

The book cannot install the state. What it can do is tell you which acts to practise and what the target looks like, so your habituation is aimed at something rather than accumulated at random. Reading it is preparation, not achievement.`,
        hoursAfterThread: 16,
      },
      {
        author: "hannah",
        body: `Question (3) is the one that troubles me most, and III.5 does not fully escape it.

Aristotle concedes character is formed by habit and then insists we are responsible because the *individual acts* forming it were voluntary. But the child performing those acts already has whatever character their upbringing gave them. The regress does not obviously terminate anywhere comfortable.`,
        hoursAfterThread: 23,
      },
      {
        author: "marguerite",
        body: `Hannah, I think Aristotle's answer is that he is not doing metaphysics here — he is doing politics.

The point of locating responsibility where he does is that praise and blame *work*: they shape the habits of people still forming. Whether the regress terminates is, for his purposes, beside the point. It is a practical doctrine wearing metaphysical clothes.`,
        replyToIndex: 3,
        hoursAfterThread: 31,
      },
      {
        author: "samir",
        body: `Practical note for newcomers: **do not** start with Book I's methodology and expect rigour. Aristotle says outright (1094b) that ethics admits only the precision its subject allows.

People arrive expecting geometry, find something closer to seasoned advice, and conclude he is being sloppy. He is not. He told you the standard in advance.`,
        hoursAfterThread: 40,
      },
    ],
  },
  {
    tagSlug: "aesthetics",
    author: "clare",
    title: "Can AI-generated art be beautiful in the same sense as human art?",
    body: `Suppose a model produces a painting that, by every formal measure, is indistinguishable from a celebrated human work — composition, colour, technique, even a plausible account of its own meaning if you ask.

Does it lack something essential? Or is our resistance to calling it beautiful just sentimentality about authorship?

I am genuinely undecided, and I would rather hear the strongest version of each side than the popular version.`,
    daysAgo: 7,
    replies: [
      {
        author: "daniel",
        body: `Beauty is in the *judgement*, not the object's provenance — a disinterested pleasure that claims universal validity.

If a viewer has that experience standing in front of the work, knowing nothing of its origin, the aesthetic judgement has already occurred. Learning the origin afterwards can change how you feel about the *situation*. I do not see how it reaches back and unmakes the experience.`,
        hoursAfterThread: 4,
      },
      {
        author: "adaora",
        body: `I resist that. A made thing is always in dialogue with a tradition, with the maker's struggle, with their moment. That dialogue is not decoration on top of the object — it is a good part of what we are responding to.

A generative model has no position to speak from. It has an **average**.`,
        hoursAfterThread: 10,
      },
      {
        author: "daniel",
        body: `But say the same about a skilled human working deliberately in an established style. Are they in "meaningful historical dialogue," or producing accomplished pastiche?

I do not think the line is where you want it to be. It certainly is not simply "made by a person."`,
        replyToIndex: 1,
        hoursAfterThread: 15,
      },
      {
        author: "priya",
        body: `There is also the question of what we owe the artists whose work trained the model. Bracketing metaphysics entirely, there is an ethical wrinkle in calling something beautiful when it was assembled by absorbing thousands of uncredited works.`,
        hoursAfterThread: 24,
      },
      {
        author: "owen",
        body: `Important, but a *different* question. We can condemn the process and still ask honestly whether the output produces the response we are interested in. Collapsing the two lets us avoid the harder one.`,
        replyToIndex: 3,
        hoursAfterThread: 29,
      },
      {
        author: "tomas",
        body: `The cook Ding carved oxen so well because after years he had stopped seeing "an ox" and moved with the grain of the thing. Skill was inseparable from a particular quality of attention built over time.

I am sceptical that anything without that history produces more than a convincing simulacrum of what attention produces. Though I concede I could not always tell them apart.`,
        hoursAfterThread: 40,
      },
    ],
  },
  {
    tagSlug: "religion",
    author: "samir",
    title: "Does the problem of evil actually refute theism?",
    body: `Epicurus's formulation, in the usual shape:

> Is God willing to prevent evil, but not able? Then he is not omnipotent.
> Is he able, but not willing? Then he is malevolent.
> Is he both able and willing? Then whence evil?

The free will defence answers the moral half. But what about *natural* evil — earthquakes, disease, a child born with a genetic disorder? Does suffering that no free choice caused settle the matter?`,
    daysAgo: 8,
    replies: [
      {
        author: "hannah",
        body: `Natural evil is exactly where the free will defence runs out of road. You can attribute war to human choice. You cannot attribute childhood leukaemia to it.

If this is the best of all possible worlds, the architect has some explaining to do.`,
        hoursAfterThread: 3,
      },
      {
        author: "marguerite",
        body: `The soul-making response holds up better than it is usually given credit for. A world with real stakes, real fragility and real risk is what makes courage, compassion and growth possible at all. Remove every natural evil and you remove the conditions for most of what we call virtue.`,
        hoursAfterThread: 8,
      },
      {
        author: "ruth",
        body: `I have always found soul-making theodicies morally uncomfortable rather than reassuring. They risk treating a child's suffering as instrumentally useful to *someone else's* spiritual development.

That is a steep price to charge an innocent third party without their consent.`,
        replyToIndex: 1,
        hoursAfterThread: 14,
      },
      {
        author: "marguerite",
        body: `Fair, and it is the strongest objection I know of. I do not think it is answerable without appeal to some further good the sufferer *themselves* receives — which is where an afterlife ends up doing a great deal of load-bearing work.`,
        replyToIndex: 2,
        hoursAfterThread: 20,
      },
      {
        author: "wenli",
        body: `Worth noticing that the whole framing assumes a God who is a moral agent judged by human standards of goodness. Not every tradition takes that on. Plenty are content with a cosmos indifferent to human welfare without concluding anything has gone *wrong*.`,
        hoursAfterThread: 33,
      },
      {
        author: "julian",
        body: `Then you have relocated the problem rather than solved it. If divinity is not good in any sense we recognise, why is it an object of worship rather than merely of fear?`,
        replyToIndex: 4,
        hoursAfterThread: 40,
      },
      {
        author: "clare",
        body: `My honest read: this debate proves less than either side wants. At best it shows classical omni-theism is harder to square with the world than its defenders concede. At best for the theist, it shows the atheist's confidence is overstated.

Rarely does anyone actually walk away refuted.`,
        hoursAfterThread: 55,
      },
    ],
  },
];

async function seedTags() {
  const bySlug: Record<string, { id: string }> = {};
  for (const t of TAGS) {
    bySlug[t.slug] = await prisma.tag.upsert({
      where: { slug: t.slug },
      update: {},
      create: t,
    });
  }
  console.log(`Seeded ${TAGS.length} tags.`);
  return bySlug;
}

/**
 * Seed content is demo material, so it is fully replaceable — drop the old
 * threads (and everything hanging off them) before writing the new set.
 */
async function wipeThreads() {
  await prisma.postLike.deleteMany();
  await prisma.threadLike.deleteMany();
  await prisma.eventAttendee.deleteMany();
  // Reports carry a bare targetId rather than a foreign key, so ones pointing
  // at the threads/replies about to be deleted would linger as "gone" rows in
  // the admin queue. The ModerationLog is deliberately never touched here —
  // nothing in this codebase deletes an audit entry.
  await prisma.report.deleteMany({ where: { targetType: { in: ["thread", "post"] } } });
  await prisma.post.deleteMany();
  await prisma.thread.deleteMany();
  console.log("Cleared existing threads, replies and likes.");
}

async function seedThread(spec: ThreadSeed, tagsBySlug: Record<string, { id: string }>) {
  const author = await upsertUser(spec.author);
  const createdAt = new Date(Date.now() - spec.daysAgo * DAY);

  const thread = await prisma.thread.create({
    data: {
      title: spec.title,
      body: spec.body,
      authorId: author.id,
      createdAt,
      hotScore: hotScore(0, 0, createdAt),
      tags: { connect: [{ id: tagsBySlug[spec.tagSlug].id }] },
    },
  });

  const createdPosts: { id: string }[] = [];
  for (const r of spec.replies) {
    const replyAuthor = await upsertUser(r.author);
    const parentId = r.replyToIndex !== undefined ? createdPosts[r.replyToIndex].id : null;
    const post = await prisma.post.create({
      data: {
        threadId: thread.id,
        authorId: replyAuthor.id,
        body: r.body,
        parentId,
        createdAt: new Date(createdAt.getTime() + r.hoursAfterThread * HOUR),
      },
    });
    createdPosts.push(post);
  }
  await recomputeThreadHotScore(thread.id);

  console.log(`Seeded "${spec.title.slice(0, 56)}…" (${spec.replies.length} replies)`);
}

async function main() {
  const tagsBySlug = await seedTags();
  await wipeThreads();
  for (const spec of THREADS) {
    await seedThread(spec, tagsBySlug);
  }

  // Demo moderator account — there's no bootstrap admin UI, so this is the
  // one way to get an admin account locally. Promote a real account the same
  // way (`role: "admin"`) via direct DB access until an admin UI exists.
  // Deliberately NOT a supporter: admins must be able to moderate chapters,
  // events, and the directory without donating, and the seed should prove it.
  const adminEmail = "admin@demo.nyphilosophy.org";
  const adminId = await upsertAuthUser(adminEmail, "Eleanor Vance");
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "admin" },
    create: {
      id: adminId,
      email: adminEmail,
      displayName: "Eleanor Vance",
      verificationStatus: "VERIFIED",
      role: "admin",
    },
  });
  console.log("Seeded demo admin (admin@demo.nyphilosophy.org / demo-password-123).");
  await seedDemoReports();
  await seedMembership(admin.id);
}

/**
 * Membership demo data: members of the Society, an NYC chapter with an
 * active roster + one pending request, chapter-only threads, directory
 * opt-ins, and a past event with its afterlife thread — so every membership
 * feature is visible in the preview on a fresh seed.
 */
const SUPPORTERS = ["marguerite", "daniel", "priya", "ruth", "wenli", "owen", "adaora", "samir"];

const DIRECTORY_PROFILES: Record<string, { bio: string; partners: boolean }> = {
  marguerite: { bio: "History of philosophy, the Liar, whatever resists tidy answers.", partners: false },
  daniel: { bio: "Classical logic, philosophy of mathematics. Will defend LEM to the death.", partners: true },
  priya: { bio: "Philosophy of language and truth. Reading Kripke's 'Outline of a Theory of Truth'.", partners: true },
  ruth: { bio: "Ancient ethics — currently leading the Nicomachean Ethics reading group.", partners: true },
  wenli: { bio: "Paradoxes, Daoism, comparative philosophy. Slow reader, careful arguer.", partners: false },
  owen: { bio: "Epistemology and philosophy of religion. Happy to be wrong in public.", partners: true },
};

async function seedMembership(adminId: string) {
  // Members of the Society (isSupporter) — the WISDOMKEY placeholder made real.
  for (const handle of SUPPORTERS) {
    const user = await upsertUser(handle);
    await prisma.user.update({
      where: { id: user.id },
      data: { isSupporter: true, supporterSince: new Date(Date.now() - 30 * DAY) },
    });
  }
  console.log(`Marked ${SUPPORTERS.length} demo members as supporters.`);

  // Directory opt-ins (member-only, opt-in — most members in, some out).
  for (const [handle, profile] of Object.entries(DIRECTORY_PROFILES)) {
    const user = await upsertUser(handle);
    await prisma.user.update({
      where: { id: user.id },
      data: { directoryVisible: true, directoryBio: profile.bio, openToPartners: profile.partners },
    });
  }
  console.log(`Seeded ${Object.keys(DIRECTORY_PROFILES).length} directory opt-ins.`);

  // The NYC chapter: an active roster plus one pending request for the admin
  // queue. Members were added by the admin, so they land active.
  const chapter = await prisma.chapter.upsert({
    where: { slug: "new-york-city" },
    // Explicit, so re-seeding an existing database converges on this shape
    // rather than leaving whatever was there before.
    update: { description: null, location: "New York, NY" },
    create: {
      slug: "new-york-city",
      name: "New York City",
      location: "New York, NY",
    },
  });

  const laChapter = await prisma.chapter.upsert({
    where: { slug: "los-angeles" },
    update: {},
    create: {
      slug: "los-angeles",
      name: "Los Angeles",
      location: "Los Angeles, CA",
    },
  });
  // Supporters only — chapter membership requires it. wenli/samir aren't in NYC.
  for (const handle of ["wenli", "samir"]) {
    const user = await upsertUser(handle);
    await prisma.chapterMembership.upsert({
      where: { chapterId_userId: { chapterId: laChapter.id, userId: user.id } },
      update: { state: "active" },
      create: {
        chapterId: laChapter.id,
        userId: user.id,
        state: "active",
        approvedAt: new Date(),
      },
    });
  }
  console.log(`Seeded chapter "${laChapter.name}" (2 active).`);
  const activeHandles = ["marguerite", "daniel", "priya", "ruth"];
  for (const handle of activeHandles) {
    const user = await upsertUser(handle);
    await prisma.chapterMembership.upsert({
      where: { chapterId_userId: { chapterId: chapter.id, userId: user.id } },
      update: { state: "active" },
      create: { chapterId: chapter.id, userId: user.id, state: "active", approvedAt: new Date() },
    });
  }
  const pendingUser = await upsertUser("owen");
  await prisma.chapterMembership.upsert({
    where: { chapterId_userId: { chapterId: chapter.id, userId: pendingUser.id } },
    update: { state: "pending", approvedAt: null },
    create: { chapterId: chapter.id, userId: pendingUser.id, state: "pending" },
  });
  console.log(`Seeded chapter "${chapter.name}" (${activeHandles.length} active, 1 pending).`);

  // A chapter-only thread — must never surface outside the chapter.
  const marguerite = await upsertUser("marguerite");
  const chapterThreadCreated = new Date(Date.now() - 1 * DAY);
  const chapterThread = await prisma.thread.create({
    data: {
      title: "November meetup: shall we tackle the Tractatus?",
      body: `Proposal for the November session: the *Tractatus*, propositions 1–3, with Anscombe's introduction as a crutch.

It is short, it is brutal, and it will either be the best meeting of the year or a room full of people silently renumbering their objections. Both outcomes seem worth having.

Say here if you're in, and whether Sunday afternoons still work for everyone.`,
      authorId: marguerite.id,
      createdAt: chapterThreadCreated,
      chapterId: chapter.id,
      hotScore: hotScore(0, 0, chapterThreadCreated),
    },
  });
  const daniel = await upsertUser("daniel");
  const ruth = await upsertUser("ruth");
  await prisma.post.create({
    data: {
      threadId: chapterThread.id,
      authorId: daniel.id,
      body: "In. And I'll bring the Ogden translation so we can argue about the translations too.",
      createdAt: new Date(chapterThreadCreated.getTime() + 3 * HOUR),
    },
  });
  await prisma.post.create({
    data: {
      threadId: chapterThread.id,
      authorId: ruth.id,
      body: "Sundays work. But I want it on record that I predicted the silent renumbering.",
      createdAt: new Date(chapterThreadCreated.getTime() + 7 * HOUR),
    },
  });
  await recomputeThreadHotScore(chapterThread.id);
  console.log("Seeded 1 chapter-only thread with replies.");

  await seedEventThread(adminId, chapter.id);
}

/**
 * A past event and its afterlife thread: member questions from before the
 * evening, the admin's post-event drop (topics, recording, transcript), the
 * conversation continuing after — with attendees marked so the "was there"
 * badge shows. Reading is open to any account; posting is member-only.
 */
async function seedEventThread(adminId: string, _chapterId: string) {
  // Last night's meeting, so the afterlife thread is the freshest thing in the
  // Events strip — which is the state the feature is designed around.
  const eventDate = new Date(Date.now() - 1 * DAY);
  const createdAt = new Date(eventDate.getTime() - 10 * DAY);
  const thread = await prisma.thread.create({
    data: {
      title: "Values: where do they come from, and can they be wrong?",
      body: `Our topic for the evening. Three questions to hold onto:

1. Are values discovered or made? If made, by whom — the individual, or the community they were raised in?
2. Can a whole culture be **wrong** about a value, or does that question quietly assume the very standard it's asking about?
3. When two values you hold genuinely conflict, what are you actually doing when you choose?

**When:** ${eventDate.toDateString()}, 7pm
**Where:** The clubroom, 24 Washington Mews

Bring the question you'd want pressed on you rather than the one you've already answered. Afterwards the topics land here and the conversation continues with the people who were in the room.`,
      authorId: adminId,
      createdAt,
      kind: "event",
      eventDate,
      eventCode: "MEWS-1124",
      hotScore: hotScore(0, 0, createdAt),
    },
  });

  const before = [
    {
      handle: "samir",
      hoursAfter: 20,
      body: "A question I'd like pressed: everyone says values are *shaped* by culture, which is obviously true and tells us nothing about whether they're **correct**. Origin and justification are different questions. Can we keep them apart for one evening?",
    },
    {
      handle: "adaora",
      hoursAfter: 50,
      body: "Mine is narrower. We all agree some past culture was wrong about something — slavery, usually. So we already believe cultures can be wrong. What is that belief actually resting on, if not a standard outside the culture?",
    },
  ];
  const beforePosts: { id: string }[] = [];
  for (const q of before) {
    const author = await upsertUser(q.handle);
    beforePosts.push(
      await prisma.post.create({
        data: {
          threadId: thread.id,
          authorId: author.id,
          body: q.body,
          createdAt: new Date(createdAt.getTime() + q.hoursAfter * HOUR),
        },
      }),
    );
  }

  // The afterlife drop, day after the event.
  const afterDrop = await prisma.post.create({
    data: {
      threadId: thread.id,
      authorId: adminId,
      body: `**The evening, for the record.**

Where we actually went: Samir's separation of origin from justification held for about ten minutes before Adaora's slavery case pulled it apart — if the standard is outside the culture, name it; if it isn't, explain the conviction. Nobody managed both.

The room split roughly three ways. That values are discovered, and moral progress is literally progress. That they're made, and "progress" just means "closer to ours." And a third position that got the least airtime and may have been the strongest: that the discovered/made distinction is the wrong frame, because values are the kind of thing that only exist in the practice of holding them.

We never got to the third question — what you're *doing* when two values you hold conflict. Carrying it to next month.

📼 Recording: *(link goes here once we have somewhere to host media)*
📄 Transcript: *(same)*

The floor stays open, especially for those who were in the room. What did we miss?`,
      createdAt: new Date(eventDate.getTime() + 8 * HOUR),
    },
  });
  const wenli = await upsertUser("wenli");
  await prisma.post.create({
    data: {
      threadId: thread.id,
      authorId: wenli.id,
      parentId: afterDrop.id,
      body: "What we missed: the third position got dismissed as evasion, and it isn't. Saying values exist only in the practice of holding them is not neutrality between the other two — it's a claim that both are asking a badly formed question. That deserved longer than four minutes.",
      createdAt: new Date(eventDate.getTime() + 14 * HOUR),
    },
  });
  const priya = await upsertUser("priya");
  await prisma.post.create({
    data: {
      threadId: thread.id,
      authorId: priya.id,
      parentId: beforePosts[1].id,
      body: "Adaora — I think your question was answered in the room and nobody noticed. The conviction rests on the *victims'* judgement, not ours. They said it was wrong at the time. That isn't a standard outside the culture; it's a standard inside it that the culture refused to hear.",
      createdAt: new Date(eventDate.getTime() + 20 * HOUR),
    },
  });
  await recomputeThreadHotScore(thread.id);

  // Who was in the room: some marked by the admin, some via the event code.
  const attendees: { handle: string; source: string }[] = [
    { handle: "samir", source: "admin" },
    { handle: "adaora", source: "admin" },
    { handle: "wenli", source: "code" },
    { handle: "priya", source: "code" },
    { handle: "marguerite", source: "code" },
  ];
  for (const a of attendees) {
    const user = await upsertUser(a.handle);
    await prisma.eventAttendee.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: user.id } },
      update: {},
      create: { threadId: thread.id, userId: user.id, source: a.source },
    });
  }
  console.log(`Seeded past event thread with ${attendees.length} attendees (code MEWS-1124).`);
}

/**
 * Two open reports so /admin/reports isn't an empty page on a fresh database.
 * Both are filed by a seeded member against another seeded member's content,
 * which is what the queue is actually for.
 */
async function seedDemoReports() {
  const [thread, post] = await Promise.all([
    prisma.thread.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.post.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  if (!thread || !post) return;

  const reporter = await prisma.user.findFirst({
    where: { role: "user", deletedAt: null, id: { notIn: [thread.authorId, post.authorId] } },
  });
  if (!reporter) return;

  await prisma.report.createMany({
    data: [
      {
        reporterId: reporter.id,
        targetType: "thread",
        targetId: thread.id,
        category: "off_topic",
        reason: "This reads more like a political argument than a philosophical one.",
      },
      {
        reporterId: reporter.id,
        targetType: "post",
        targetId: post.id,
        category: "harassment",
        reason: null,
      },
    ],
  });
  console.log("Seeded 2 open demo reports for the admin queue.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
