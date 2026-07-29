import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tags = [
    {
      slug: "ethics",
      name: "Ethics",
      description: "Normative ethics, metaethics, applied ethics.",
    },
    {
      slug: "epistemology",
      name: "Epistemology",
      description: "Knowledge, belief, justification, skepticism.",
    },
    {
      slug: "metaphysics",
      name: "Metaphysics",
      description: "Existence, identity, causation, free will.",
    },
    {
      slug: "political-philosophy",
      name: "Political Philosophy",
      description: "Justice, liberty, the state, political obligation.",
    },
  ];

  for (const t of tags) {
    await prisma.tag.upsert({
      where: { slug: t.slug },
      update: {},
      create: t,
    });
  }

  console.log(`Seeded ${tags.length} tags.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
