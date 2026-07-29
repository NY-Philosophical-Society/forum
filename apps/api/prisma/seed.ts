import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TAGS = [
  { slug: "logic", name: "Logic", description: "Formal and informal reasoning, argumentation, paradoxes." },
  {
    slug: "mind",
    name: "Mind",
    description: "Consciousness, personal identity, the mind-body problem.",
  },
  {
    slug: "science",
    name: "Science",
    description: "Scientific method, causation, theory-choice, demarcation.",
  },
  { slug: "aesthetics", name: "Aesthetics", description: "Art, beauty, taste, and the meaning of art." },
  {
    slug: "religion",
    name: "Religion",
    description: "God, faith and reason, the problem of evil.",
  },
  {
    slug: "language",
    name: "Language",
    description: "Meaning, reference, and the nature of truth in language.",
  },
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

async function upsertUser(email: string, displayName: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName, passwordHash, verificationStatus: "VERIFIED" },
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface ReplySeed {
  authorEmail: string;
  authorName: string;
  body: string;
  /** Index into this thread's replies array — makes this a reply-to-a-reply. */
  replyToIndex?: number;
  hoursAfterThread: number;
}

interface ThreadSeed {
  tagSlug: (typeof TAGS)[number]["slug"];
  authorEmail: string;
  authorName: string;
  title: string;
  body: string;
  daysAgo: number;
  replies: ReplySeed[];
}

const THREADS: ThreadSeed[] = [
  {
    tagSlug: "ethics",
    authorEmail: "kant@demo.nyphilosophy.org",
    authorName: "Immanuel Kant",
    title: "Is moral luck a coherent concept?",
    body: "Bernard Williams and Thomas Nagel both argued that our ordinary moral judgments are shot through with 'moral luck' — we blame the drunk driver who kills a pedestrian more than the equally drunk driver who, by sheer chance, makes it home safely. But if morality is supposed to track what's within our control, shouldn't the two drivers be equally culpable? Is moral luck a real phenomenon, or a sign that our ordinary moral intuitions are simply confused?",
    daysAgo: 6,
    replies: [
      {
        authorEmail: "hume@demo.nyphilosophy.org",
        authorName: "David Hume",
        body: "Intuitions aren't confused here — they're doing exactly what they should. We don't just judge intentions, we judge outcomes because outcomes are what we actually live with. The driver who kills someone owes a different kind of repair to the world than the one who doesn't, regardless of what was 'in their control.'",
        hoursAfterThread: 2,
      },
      {
        authorEmail: "hegel@demo.nyphilosophy.org",
        authorName: "G.W.F. Hegel",
        body: "This is why any ethics built purely on the isolated individual's will struggles here. Actions only become determinate — become what they actually are — through their outcomes in the world. There's no 'pure' culpability that floats free of consequence.",
        hoursAfterThread: 5,
      },
      {
        authorEmail: "weil@demo.nyphilosophy.org",
        authorName: "Simone Weil",
        body: "I'd push back gently, David — if we let outcome alone dictate blame, we collapse the distinction between misfortune and wrongdoing. The driver who makes it home is still someone who chose to drive drunk. Luck shouldn't change what kind of person they revealed themselves to be.",
        replyToIndex: 0,
        hoursAfterThread: 9,
      },
      {
        authorEmail: "mill@demo.nyphilosophy.org",
        authorName: "John Stuart Mill",
        body: "From a purely practical standpoint, punishing based on outcome makes sense even if it's not 'fair' in some cosmic sense — it's what actually deters reckless behavior and compensates victims. Maybe moral luck is uncomfortable precisely because morality has to do real work in the world, not just track abstract desert.",
        hoursAfterThread: 27,
      },
      {
        authorEmail: "hume@demo.nyphilosophy.org",
        authorName: "David Hume",
        body: "Fair — I'll concede that much, Simone. Perhaps there are two separate questions tangled together here: how much someone deserves blame, and how much they owe in restitution. Luck might legitimately affect the second without touching the first.",
        replyToIndex: 2,
        hoursAfterThread: 30,
      },
      {
        authorEmail: "aquinas@demo.nyphilosophy.org",
        authorName: "Thomas Aquinas",
        body: "Isn't this just Aristotle's point about hitting a target versus intending to? An archer who is skilled and still misses due to a gust of wind is judged differently from a reckless amateur who happens to hit the bullseye. Luck was already baked into virtue ethics from the start.",
        hoursAfterThread: 50,
      },
    ],
  },
  {
    tagSlug: "religion",
    authorEmail: "aquinas@demo.nyphilosophy.org",
    authorName: "Thomas Aquinas",
    title: "Does the problem of evil actually refute theism?",
    body: "Epicurus's classic formulation: 'Is God willing to prevent evil, but not able? Then he is not omnipotent. Is he able, but not willing? Then he is malevolent. Is he both able and willing? Then whence evil?' The free will defense answers the moral-evil half of this, but what about natural evil — earthquakes, disease, a child born with a genetic disorder? Does suffering that no free choice caused settle the question against theism?",
    daysAgo: 5,
    replies: [
      {
        authorEmail: "hume@demo.nyphilosophy.org",
        authorName: "David Hume",
        body: "Natural evil is exactly where the free will defense runs out of road. You can blame human choice for war, but not for childhood leukemia. If this is the best of all possible worlds, the architect has some explaining to do.",
        hoursAfterThread: 3,
      },
      {
        authorEmail: "aquinas@demo.nyphilosophy.org",
        authorName: "Thomas Aquinas",
        body: "The 'soul-making' response holds up better here than people give it credit for: a world with real stakes, real fragility, and real risk is what makes courage, compassion, and growth possible at all. Remove all natural evil and you remove the conditions for most of what we consider virtue.",
        hoursAfterThread: 8,
      },
      {
        authorEmail: "weil@demo.nyphilosophy.org",
        authorName: "Simone Weil",
        body: "I've always found soul-making theodicies morally uncomfortable rather than reassuring — they risk treating a child's suffering as instrumentally useful to someone else's spiritual development. That's a steep price to ask an innocent third party to pay without consent.",
        replyToIndex: 1,
        hoursAfterThread: 14,
      },
      {
        authorEmail: "aquinas@demo.nyphilosophy.org",
        authorName: "Thomas Aquinas",
        body: "That's fair, and it's the strongest objection to soul-making theodicies I know of. I don't think it's fully answerable without appeal to some further good the sufferer themselves receives — which is where an afterlife has to do a lot of load-bearing work in the theory.",
        replyToIndex: 2,
        hoursAfterThread: 20,
      },
      {
        authorEmail: "zhuangzi@demo.nyphilosophy.org",
        authorName: "Zhuangzi",
        body: "Worth noting this whole framing assumes a God who is a moral agent judged by human standards of goodness in the first place. Not every tradition treats divinity that way — plenty are comfortable with a cosmos indifferent to human welfare without concluding anything is 'wrong.'",
        hoursAfterThread: 33,
      },
      {
        authorEmail: "wollstonecraft@demo.nyphilosophy.org",
        authorName: "Mary Wollstonecraft",
        body: "Sure, but then you've just relocated the problem rather than solved it — if divinity isn't good in any recognizable sense, why call it worthy of worship rather than merely powerful?",
        replyToIndex: 4,
        hoursAfterThread: 40,
      },
      {
        authorEmail: "mill@demo.nyphilosophy.org",
        authorName: "John Stuart Mill",
        body: "I tend to think this whole debate proves less than either side wants. At best it shows classical omni-theism is harder to square with the world than its defenders admit; at best for the theist, it shows the atheist's certainty is overstated. Rarely does either side walk away actually refuted.",
        hoursAfterThread: 55,
      },
    ],
  },
  {
    tagSlug: "aesthetics",
    authorEmail: "hume@demo.nyphilosophy.org",
    authorName: "David Hume",
    title: "Can AI-generated art be beautiful in the same sense as human art?",
    body: "Suppose a model produces a painting that, by every formal measure, is indistinguishable from a celebrated human masterpiece — composition, color, technique, even a plausible 'meaning' if you ask it to explain the piece. Does it lack something essential that a human-made equivalent has, or is our resistance to calling it beautiful just sentimentality about authorship?",
    daysAgo: 4,
    replies: [
      {
        authorEmail: "kant@demo.nyphilosophy.org",
        authorName: "Immanuel Kant",
        body: "Beauty for me was always about the judgment, not the object's origin — a disinterested pleasure that claims universal validity. If a viewer has that experience in front of the AI piece with no knowledge of its origin, the aesthetic judgment has already happened, origin be damned.",
        hoursAfterThread: 4,
      },
      {
        authorEmail: "hegel@demo.nyphilosophy.org",
        authorName: "G.W.F. Hegel",
        body: "I'd resist that. Art is Spirit's self-expression through a particular historical moment — a made thing is always in dialogue with a tradition, an artist's struggle, their moment in history. A generative model has no history to be in dialogue with; it's an average, not a position.",
        hoursAfterThread: 10,
      },
      {
        authorEmail: "kant@demo.nyphilosophy.org",
        authorName: "Immanuel Kant",
        body: "But couldn't you say the same about a human artist heavily imitating a style — are they always in a 'meaningful' historical dialogue, or just producing skilled pastiche? I'm not sure the line is as clean as 'made by a person' vs. 'not.'",
        replyToIndex: 1,
        hoursAfterThread: 15,
      },
      {
        authorEmail: "wollstonecraft@demo.nyphilosophy.org",
        authorName: "Mary Wollstonecraft",
        body: "There's also a question of what we owe the artists whose labor trained the model in the first place — even bracketing metaphysics, there's a real ethical wrinkle in calling something 'beautiful' when it was built by absorbing thousands of uncredited human works.",
        hoursAfterThread: 24,
      },
      {
        authorEmail: "mill@demo.nyphilosophy.org",
        authorName: "John Stuart Mill",
        body: "That's an important point but a separate one from the aesthetic question — we can condemn the process while still asking honestly whether the output produces the aesthetic response we're interested in.",
        replyToIndex: 3,
        hoursAfterThread: 29,
      },
      {
        authorEmail: "zhuangzi@demo.nyphilosophy.org",
        authorName: "Zhuangzi",
        body: "The cook Ding cut up oxen so skillfully because he'd stopped seeing 'an ox' and moved with the natural grain of things after years of practice — skill was inseparable from a certain kind of attention built over time. I'm skeptical anything without that history of attention can produce more than a clever simulacrum of what attention produces.",
        hoursAfterThread: 40,
      },
    ],
  },
  {
    tagSlug: "science",
    authorEmail: "turing@demo.nyphilosophy.org",
    authorName: "Alan Turing",
    title: "Is Kuhn's notion of paradigm shifts compatible with scientific realism?",
    body: "Kuhn argued that scientific revolutions replace one paradigm with an incommensurable successor — not a straightforward accumulation of truth but something closer to a Gestalt shift. If paradigms are genuinely incommensurable, in what sense can we say science is converging on a truer picture of reality rather than just cycling through different useful frameworks?",
    daysAgo: 3,
    replies: [
      {
        authorEmail: "hegel@demo.nyphilosophy.org",
        authorName: "G.W.F. Hegel",
        body: "Incommensurability doesn't have to mean 'no rational continuity' — it can mean successive frameworks are related dialectically, each an advance that both preserves and negates what came before. Convergence needn't look linear to still be convergence.",
        hoursAfterThread: 3,
      },
      {
        authorEmail: "mill@demo.nyphilosophy.org",
        authorName: "John Stuart Mill",
        body: "Practically speaking, whatever you call it philosophically, a modern engineer's bridge stands up and a medieval one didn't stand up nearly as reliably. That track record of increasing predictive and technological success is hard to explain if theories are genuinely incommensurable rather than progressively better approximations.",
        hoursAfterThread: 9,
      },
      {
        authorEmail: "turing@demo.nyphilosophy.org",
        authorName: "Alan Turing",
        body: "That's the 'no miracles' argument in a nutshell, and I find it fairly persuasive — but Laudan's pessimistic meta-induction still nags at me. Plenty of past theories were also empirically successful in their day and later turned out to be flatly false: phlogiston, the luminiferous ether. Why think ours are different?",
        replyToIndex: 1,
        hoursAfterThread: 16,
      },
      {
        authorEmail: "hume@demo.nyphilosophy.org",
        authorName: "David Hume",
        body: "Because the alternative — that our current theories are also probably false in ways we can't currently detect — is unfalsifiable pessimism dressed up as humility. It's not an argument for anything, just a permanent asterisk.",
        replyToIndex: 2,
        hoursAfterThread: 22,
      },
      {
        authorEmail: "zhuangzi@demo.nyphilosophy.org",
        authorName: "Zhuangzi",
        body: "I notice both sides assume there's a single 'reality' theories are converging on or failing to converge on. Depending how seriously you take instrumentalism, the paradigms could just be increasingly useful tools for prediction without there being a fact of the matter about which one 'really' describes the world.",
        hoursAfterThread: 30,
      },
      {
        authorEmail: "aquinas@demo.nyphilosophy.org",
        authorName: "Thomas Aquinas",
        body: "But surely something explains why the tools keep getting more useful rather than randomly fluctuating — and 'the world actually has a structure the tools are tracking' is a far simpler explanation than 'it's a coincidence that keeps compounding.'",
        replyToIndex: 4,
        hoursAfterThread: 36,
      },
    ],
  },
  {
    tagSlug: "logic",
    authorEmail: "wittgenstein@demo.nyphilosophy.org",
    authorName: "Ludwig Wittgenstein",
    title: "Does the Liar's Paradox show that truth is inherently unstable?",
    body: "'This sentence is false.' If it's true, it's false; if it's false, it's true. Tarski's response was to banish natural languages from having a consistent truth predicate for their own sentences, requiring a hierarchy of meta-languages instead. Graham Priest and the dialetheists take the paradox at face value instead: some contradictions are just true. Which response actually solves the problem rather than just relabeling it?",
    daysAgo: 2,
    replies: [
      {
        authorEmail: "kant@demo.nyphilosophy.org",
        authorName: "Immanuel Kant",
        body: "Tarski's hierarchy always struck me as a technical fix rather than a philosophical one — it tells you how to build a language that avoids the paradox, not why natural language, which clearly does allow self-reference, isn't simply broken in a deep way.",
        hoursAfterThread: 2,
      },
      {
        authorEmail: "hegel@demo.nyphilosophy.org",
        authorName: "G.W.F. Hegel",
        body: "Dialetheism has always seemed to me the more honest option — contradiction is not automatically the sign of a broken system, it can be the sign of a system rich enough to talk about itself. Rejecting that outright is a metaphysical prejudice, not a proof.",
        hoursAfterThread: 6,
      },
      {
        authorEmail: "wittgenstein@demo.nyphilosophy.org",
        authorName: "Ludwig Wittgenstein",
        body: "I'm more sympathetic to a third option: the sentence isn't true or false because it isn't really saying anything determinate in the first place — it's a piece of language that looks grammatical but is doing no genuine work, the way 'colorless green ideas sleep furiously' is grammatical without expressing a thought.",
        replyToIndex: 1,
        hoursAfterThread: 11,
      },
      {
        authorEmail: "hume@demo.nyphilosophy.org",
        authorName: "David Hume",
        body: "That feels like it dodges rather than resolves — plenty of paradoxical sentences seem to be saying something perfectly determinate right up until the contradiction bites. Why single out the Liar as 'meaningless' rather than any other true-looking sentence?",
        replyToIndex: 2,
        hoursAfterThread: 18,
      },
      {
        authorEmail: "mill@demo.nyphilosophy.org",
        authorName: "John Stuart Mill",
        body: "From where I sit this matters enormously for anything built on classical logic — if some sentences are neither true nor false, or worse, both, entire proof systems relying on excluded middle or non-contradiction need patching before you can trust anything downstream.",
        hoursAfterThread: 25,
      },
      {
        authorEmail: "turing@demo.nyphilosophy.org",
        authorName: "Alan Turing",
        body: "Which is exactly why computer science cares — a programming language or proof assistant that admits self-referential 'this statement is false' style constructions without a type hierarchy to block them can be made to prove anything at all. Practically, Tarski's fix, or something equivalent, is unavoidable if you want a system you can trust for real work.",
        replyToIndex: 4,
        hoursAfterThread: 31,
      },
      {
        authorEmail: "aquinas@demo.nyphilosophy.org",
        authorName: "Thomas Aquinas",
        body: "I'd only add that this problem is far older than Tarski or Russell — the Liar goes back to Eubulides in the 4th century BC. That it has survived over two thousand years of serious attention without full resolution should itself tell us something about how deep the problem runs, whichever response you prefer.",
        hoursAfterThread: 48,
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

async function seedThread(spec: ThreadSeed, tagsBySlug: Record<string, { id: string }>) {
  const existing = await prisma.thread.findFirst({ where: { title: spec.title } });
  if (existing) {
    console.log(`Skipping "${spec.title}" — already seeded.`);
    return;
  }

  const author = await upsertUser(spec.authorEmail, spec.authorName);
  const createdAt = new Date(Date.now() - spec.daysAgo * DAY);

  const thread = await prisma.thread.create({
    data: {
      title: spec.title,
      body: spec.body,
      authorId: author.id,
      createdAt,
      tags: { connect: [{ id: tagsBySlug[spec.tagSlug].id }] },
    },
  });

  const createdPosts: { id: string }[] = [];
  for (const r of spec.replies) {
    const replyAuthor = await upsertUser(r.authorEmail, r.authorName);
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

  console.log(`Seeded thread "${spec.title}" with ${spec.replies.length} replies.`);
}

async function main() {
  const tagsBySlug = await seedTags();
  for (const spec of THREADS) {
    await seedThread(spec, tagsBySlug);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
