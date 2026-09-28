// Seed data for the community showcase. Pure data and types — no React.
// Everything here is demo content modelled on the club's real chapters,
// venues, and Wednesday format; nothing is fetched from a backend.
import { CLUB_CALENDAR_URL } from "~/lib/club-links";

export type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  location: string;
  chapter: string;
  interests: string[];
  bio: string;
  color: string;
  events: number;
  mutual: number;
  openToConnect?: boolean;
};

export type SessionStatus = "Open" | "Waitlist" | "Sold out" | "Preview";

// Registration itself happens on the club's Luma calendar. Every upcoming location
// links to its real Luma page; statuses, times, and prices mirror that page as of
// September 16, 2026. Past sessions have no link because Luma closes them.
export type EventSession = {
  venue: string;
  neighborhood: string;
  host: string;
  status: SessionStatus;
  lumaUrl?: string;
};

export type EventItem = {
  id: string;
  kind: "Philosophy Club" | "Meditation" | "Met" | "Museum";
  month: string;
  day: string;
  dateLabel: string;
  time: string;
  title: string;
  summary: string;
  details: string[];
  price: string;
  location: string;
  chapter: string;
  mode: "In person" | "Online" | "Hybrid";
  host: string;
  attendees: string[];
  replies: number;
  past?: boolean;
  sessions: EventSession[];
};

// "you" is the signed-in viewer. Keeping the viewer in the same collection means
// the profile view, directory, and avatars all resolve through one lookup.
export const VIEWER_ID = "you";

export const people: Person[] = [
  {
    id: VIEWER_ID,
    name: "Philosophy Member",
    initials: "PM",
    role: "Philosopher",
    location: "Manhattan, New York",
    chapter: "New York",
    interests: ["Consciousness", "Metaphysics", "Philosophy of mind"],
    bio: "Interested in human consciousness and our connection to the universe.",
    color: "ink",
    events: 6,
    mutual: 0,
    openToConnect: true,
  },
  {
    id: "maya",
    name: "Maya Chen",
    initials: "MC",
    role: "Urban planner & ethics reader",
    location: "Brooklyn, New York",
    chapter: "New York",
    interests: ["Political philosophy", "Cities", "Care ethics"],
    bio: "I think about how public spaces shape the lives we share. Usually reading Iris Marion Young, Jane Jacobs, or whatever the group hands me next.",
    color: "clay",
    events: 14,
    mutual: 4,
    openToConnect: true,
  },
  {
    id: "julian",
    name: "Julian Reed",
    initials: "JR",
    role: "Teacher & amateur classicist",
    location: "Queens, New York",
    chapter: "New York",
    interests: ["Ancient philosophy", "Education", "Virtue"],
    bio: "High-school teacher, slow reader, enthusiastic question asker. Interested in what the ancients can and cannot tell us about living together now.",
    color: "blue",
    events: 9,
    mutual: 2,
    openToConnect: true,
  },
  {
    id: "amara",
    name: "Amara Okafor",
    initials: "AO",
    role: "Writer & community organizer",
    location: "Harlem, New York",
    chapter: "New York",
    interests: ["Existentialism", "Justice", "African philosophy"],
    bio: "Writing about belonging, responsibility, and the stories cities tell about themselves. Always glad to trade reading recommendations.",
    color: "gold",
    events: 21,
    mutual: 7,
    openToConnect: true,
  },
  {
    id: "theo",
    name: "Theo Alvarez",
    initials: "TA",
    role: "Designer & philosophy newcomer",
    location: "Echo Park, Los Angeles",
    chapter: "Los Angeles",
    interests: ["Aesthetics", "Technology", "Phenomenology"],
    bio: "A designer learning to ask better questions about attention, technology, and what makes an experience meaningful.",
    color: "green",
    events: 5,
    mutual: 3,
  },
  {
    id: "priya",
    name: "Priya Shah",
    initials: "PS",
    role: "Researcher & discussion host",
    location: "Princeton, New Jersey",
    chapter: "Princeton",
    interests: ["Philosophy of mind", "AI", "Epistemology"],
    bio: "Researcher working at the border of cognitive science and philosophy. I host the monthly online philosophy of mind circle.",
    color: "violet",
    events: 18,
    mutual: 5,
    openToConnect: true,
  },
  {
    id: "samuel",
    name: "Samuel Bennett",
    initials: "SB",
    role: "Musician & neighborhood regular",
    location: "Bushwick, Brooklyn",
    chapter: "New York",
    interests: ["Aesthetics", "Meaning", "Philosophy of music"],
    bio: "Composer, performer, and regular at the Tuesday salon. Curious about how shared attention turns a room into a community.",
    color: "rose",
    events: 26,
    mutual: 8,
  },
];

const CLUB_SUMMARY = "Three half-hour conversations on the night's topic, with a new group each time. No experience required.";

const CLUB_DETAILS = [
  "We discuss the night's topic in three half-hour sessions, speaking with a new group each time. Most guests stay long afterwards to carry on their best conversations.",
  "No previous experience is required. Admission can't be guaranteed after 7:30 PM, whatever your ticket type, so aim to arrive on time.",
];

export const LUMA_CALENDAR_URL = CLUB_CALENDAR_URL;

export const events: EventItem[] = [
  {
    id: "death",
    kind: "Philosophy Club",
    month: "SEP",
    day: "16",
    dateLabel: "Wednesday, September 16",
    time: "7:00–10:00 PM",
    title: "Philosophy Club",
    summary: CLUB_SUMMARY,
    details: CLUB_DETAILS,
    price: "Free",
    location: "Room 52 · Midtown East",
    chapter: "New York",
    mode: "In person",
    host: "Maya Chen",
    attendees: ["maya", "julian", "amara", "theo", "samuel"],
    replies: 18,
    sessions: [
      { venue: "Bananas", neighborhood: "East Village", host: "Julian Reed", status: "Waitlist", lumaUrl: "https://luma.com/thenew-ew8a" },
      { venue: "Room 52", neighborhood: "Midtown East", host: "Maya Chen", status: "Waitlist", lumaUrl: "https://luma.com/6rrab7qn" },
    ],
  },
  {
    id: "causality",
    kind: "Philosophy Club",
    month: "SEP",
    day: "23",
    dateLabel: "Wednesday, September 23",
    time: "7:00–10:00 PM",
    title: "Philosophy Club",
    summary: CLUB_SUMMARY,
    details: CLUB_DETAILS,
    price: "Free",
    location: "New York Society for Ethical Culture · Columbus Circle",
    chapter: "New York",
    mode: "In person",
    host: "Priya Shah",
    attendees: ["priya", "theo", "maya", "julian"],
    replies: 11,
    sessions: [
      { venue: "Ruth", neighborhood: "Prospect Park", host: "Amara Okafor", status: "Waitlist", lumaUrl: "https://luma.com/dbh2zame" },
      { venue: "New York Society for Ethical Culture", neighborhood: "Columbus Circle", host: "Priya Shah", status: "Waitlist", lumaUrl: "https://luma.com/gl28otwc" },
      { venue: "Room 52", neighborhood: "Midtown East", host: "Maya Chen", status: "Waitlist", lumaUrl: "https://luma.com/85v9ohen" },
    ],
  },
  {
    id: "utopia",
    kind: "Philosophy Club",
    month: "SEP",
    day: "30",
    dateLabel: "Wednesday, September 30",
    time: "7:00–10:00 PM",
    title: "Philosophy Club",
    summary: CLUB_SUMMARY,
    details: CLUB_DETAILS,
    price: "Free",
    location: "McCarren Parkhouse · Williamsburg",
    chapter: "New York",
    mode: "In person",
    host: "Samuel Bennett",
    attendees: ["samuel", "maya", "amara"],
    replies: 7,
    sessions: [
      { venue: "McCarren Parkhouse", neighborhood: "Williamsburg", host: "Samuel Bennett", status: "Preview", lumaUrl: "https://luma.com/4escg57i" },
      { venue: "Sugar Mouse", neighborhood: "East Village", host: "Theo Alvarez", status: "Preview", lumaUrl: "https://luma.com/wdz508u5" },
    ],
  },
  {
    id: "virya",
    kind: "Meditation",
    month: "SEP",
    day: "20",
    dateLabel: "Sunday, September 20",
    time: "4:30–7:30 PM",
    title: "Vīrya",
    summary: "A guided, sound-based meditation with Vīrya, followed by the usual group discussion. No meditation experience needed.",
    details: [
      "Rather than trying to concentrate, you're guided through a simple sound-based practice that lets the mind settle on its own. After an introduction and a 30-minute meditation, the evening moves into group discussion on the topic.",
      "All levels are welcome. Doors close at 4:15 PM so the meditation isn't interrupted, and it's a shoe-free event.",
    ],
    price: "$25",
    location: "151 W 30th St · Midtown",
    chapter: "New York",
    mode: "In person",
    host: "Priya Shah",
    attendees: ["priya", "amara"],
    replies: 4,
    sessions: [
      { venue: "151 W 30th St, 3rd floor", neighborhood: "Midtown", host: "Priya Shah", status: "Open", lumaUrl: "https://luma.com/fg3prpqw" },
    ],
  },
  {
    id: "renaissance",
    kind: "Met",
    month: "SEP",
    day: "19",
    dateLabel: "Saturday, September 19",
    time: "7:00–9:00 PM",
    title: "Renaissance Art and Humanism",
    summary: "Short talks and small-group conversations in The Met's Renaissance galleries, from Van Eyck to Raphael.",
    details: [
      "Inside The Met's Renaissance galleries, the evening follows one arc, from the fall of Rome to the High Renaissance, through works by Van Eyck, Lippi, and Raphael.",
      "Three 30-minute conversations in groups of three or four, each opened by a brief introduction and a prompt about the artworks in front of you.",
    ],
    price: "$9",
    location: "The Metropolitan Museum of Art · Upper East Side",
    chapter: "New York",
    mode: "In person",
    host: "Amara Okafor",
    attendees: ["amara", "julian", "theo"],
    replies: 9,
    sessions: [
      { venue: "The Metropolitan Museum of Art", neighborhood: "Upper East Side", host: "Amara Okafor", status: "Sold out", lumaUrl: "https://luma.com/5ecskw2r" },
    ],
  },
  {
    id: "control-compliance",
    kind: "Philosophy Club",
    month: "SEP",
    day: "09",
    dateLabel: "Wednesday, September 9",
    time: "7:00–10:00 PM",
    title: "Philosophy Club",
    summary: CLUB_SUMMARY,
    details: CLUB_DETAILS,
    price: "Free",
    location: "Room 52 · Midtown East",
    chapter: "New York",
    mode: "In person",
    host: "Amara Okafor",
    attendees: ["amara", "theo", "samuel", "maya"],
    replies: 32,
    past: true,
    sessions: [
      { venue: "Room 52", neighborhood: "Midtown East", host: "Amara Okafor", status: "Sold out" },
      { venue: "McCarren Parkhouse", neighborhood: "Williamsburg", host: "Samuel Bennett", status: "Sold out" },
    ],
  },
];

// The care team are named volunteers a member can reach directly, rather than a
// generic "contact leadership" address. Naming and picturing them is the point:
// the reported failure mode is that people escalate to a person they trust, or
// not at all.
export function byId(id: string): Person {
  return people.find((person) => person.id === id) || people[0];
}

// Everyone except the signed-in viewer — the directory and suggestions never
// surface you to yourself.
export const others = people.filter((person) => person.id !== VIEWER_ID);

export const careTeam = [
  { id: "amara", role: "Care lead · Brooklyn locations", note: "Volunteers Wednesdays. Handles most first conversations." },
  { id: "priya", role: "Care volunteer · Midtown locations", note: "Trained in de-escalation. Also runs the Sunday sittings." },
  { id: "maya", role: "Care volunteer · Prospect Park", note: "Usually near the door at Ruth." },
];

// A chapter's locations are the venues it currently runs on its public calendar.
// Only New York lists venues there today; the other chapters have no upcoming
// events published, so their discussions are organised by chapter alone.
export type ChapterLocation = { id: string; name: string; venue: string };

export const chapters: { name: string; location: string; members: number; cadence: string; description: string; color: string; calendarUrl: string; locations: ChapterLocation[] }[] = [
  {
    name: "New York",
    location: "Six venues across Manhattan and Brooklyn",
    members: 2840,
    cadence: "Every Wednesday, 7:00 PM",
    description: "The founding chapter. Hundreds of people gather every Wednesday at locations across Manhattan and Brooklyn.",
    color: "clay",
    calendarUrl: LUMA_CALENDAR_URL,
    locations: [
      { id: "midtown-east", name: "Midtown East", venue: "Room 52" },
      { id: "columbus-circle", name: "Columbus Circle", venue: "New York Society for Ethical Culture" },
      { id: "williamsburg", name: "Williamsburg", venue: "McCarren Parkhouse" },
      { id: "prospect-park", name: "Prospect Park", venue: "Ruth" },
      { id: "east-village", name: "East Village", venue: "Bananas" },
      { id: "sugar-mouse", name: "Sugar Mouse", venue: "Sugar Mouse, 3rd Avenue" },
    ],
  },
  {
    name: "Los Angeles",
    location: "Los Angeles, California",
    members: 310,
    cadence: "Monthly",
    description: "A younger chapter finding its rhythm on the west coast, meeting at neighbourhood venues.",
    color: "gold",
    calendarUrl: "https://luma.com/laphilosophy",
    locations: [],
  },
  {
    name: "Princeton",
    location: "Princeton, New Jersey",
    members: 186,
    cadence: "Monthly",
    description: "The Princeton Philosophical Society — students, faculty, and neighbours at the same table.",
    color: "blue",
    calendarUrl: "https://luma.com/princetonphilosophy",
    locations: [],
  },
  {
    name: "Tampa Bay",
    location: "Tampa Bay, Florida",
    members: 124,
    cadence: "Monthly",
    description: "Our newest chapter, growing through Meetup and word of mouth across the bay.",
    color: "violet",
    calendarUrl: "https://www.meetup.com/tampabayphilosophy/",
    locations: [],
  },
];

export function locationName(chapterName: string, locationId: string | null) {
  if (!locationId) return null;
  return chapters.find((chapter) => chapter.name === chapterName)?.locations.find((location) => location.id === locationId)?.name ?? null;
}

export type ForumComment = {
  id: string;
  author: string;
  age: string;
  body: string;
  likes: number;
  replies?: ForumComment[];
};

export const forumThreads = [
  {
    id: "moral-luck",
    chapter: "New York",
    location: "east-village" as string | null,
    topic: "Ethics",
    title: "How much of a good life depends on moral luck?",
    excerpt: "We often judge a choice by what happened afterward. Is that fair, or is consequence inseparable from responsibility?",
    body: [
      "Two drivers take the same corner at the same careless speed. A child steps out in front of one of them and not the other. We hold the first driver responsible for something terrible and the second for very little, though nothing separates their choices.",
      "Bernard Williams and Thomas Nagel both worried that this should trouble us more than it does. If responsibility tracks what we control, luck should be irrelevant. But strip out everything we did not control — our upbringing, our temperament, the moment a child stepped into the road — and there may be nothing recognisably human left to judge.",
      "I do not think the answer is to stop blaming people. I think it might be to admit that our moral vocabulary was never built for a world this contingent, and that we use it anyway because the alternative is worse.",
    ],
    author: "julian",
    age: "42 minutes ago",
    replies: 19,
    likes: 34,
    comments: [
      {
        id: "ml-1",
        author: "maya",
        age: "31 minutes ago",
        likes: 12,
        body: "The driver case always lands harder for me when I think about it institutionally. We built the road, set the speed limit, decided where the crosswalk goes. A lot of what we call individual moral luck is really a design decision someone made on a budget.",
        replies: [
          {
            id: "ml-1-1",
            author: "julian",
            age: "24 minutes ago",
            likes: 6,
            body: "That is a genuinely different framing and I think it is right. It moves the question from 'was the driver unlucky' to 'who arranged the conditions under which that luck was possible' — which is answerable in a way the first question is not.",
          },
        ],
      },
      {
        id: "ml-2",
        author: "amara",
        age: "18 minutes ago",
        likes: 9,
        body: "I keep returning to the fact that the unlucky driver will feel something the lucky one never has to. Williams called it agent-regret. Whatever we decide about blame, that feeling is not a mistake to be corrected — it is a form of taking your own agency seriously.",
      },
      {
        id: "ml-3",
        author: "priya",
        age: "9 minutes ago",
        likes: 4,
        body: "Is there a version of this where the two drivers are equally blameworthy and we simply lack the appetite to punish the lucky one? Our practices might be tracking harm caused rather than culpability, and we tell ourselves a story about desert afterward.",
      },
    ] as ForumComment[],
  },
  {
    id: "city-memory",
    chapter: "New York",
    location: "prospect-park" as string | null,
    topic: "Political philosophy",
    title: "Who gets to decide what a neighborhood remembers?",
    excerpt: "A monument is only one form of public memory. Street names, zoning, and the stories institutions preserve may matter just as much.",
    body: [
      "The monument debate gets the attention because statues are legible — they have a face, a plinth, and a name you can argue about. But most of what a neighborhood remembers is stored somewhere far less contested.",
      "A landmarking decision preserves one century of a block's life and quietly discards the others. A zoning map decides which buildings get to grow old enough to become meaningful. The archive that gets funded determines whose letters survive to be read in fifty years.",
      "None of those arrive as a vote. They arrive as procedure, which is exactly what makes them durable — and worth asking about.",
    ],
    author: "maya",
    age: "2 hours ago",
    replies: 27,
    likes: 51,
    comments: [
      {
        id: "cm-1",
        author: "amara",
        age: "1 hour ago",
        likes: 17,
        body: "This is the thing I try to get across when people ask why we bother recording oral histories. The official record is not neutral storage — it is a set of decisions about what was worth the cost of keeping.",
        replies: [
          {
            id: "cm-1-1",
            author: "samuel",
            age: "52 minutes ago",
            likes: 7,
            body: "And cost is doing real work in that sentence. Preservation is expensive, so memory ends up correlated with whoever had the resources to be archived in the first place.",
          },
        ],
      },
      {
        id: "cm-2",
        author: "julian",
        age: "44 minutes ago",
        likes: 8,
        body: "There is an older version of this in how the ancients handled damnatio memoriae — erasure as an official act. What strikes me is that our version is gentler and probably more effective, because nobody has to sign anything.",
      },
    ] as ForumComment[],
  },
  {
    id: "attention-taken",
    chapter: "Los Angeles",
    location: null as string | null,
    topic: "Philosophy of mind",
    title: "Is attention something we give, or something taken from us?",
    excerpt: "We say we pay attention, as if we decide where it goes. Most days it feels more like it gets collected.",
    body: [
      "I design interfaces for a living, which means a good part of my job is deciding where other people's eyes land first. The industry's word for success is engagement. The honest word might be capture.",
      "The phrase 'paying attention' assumes a spender who chooses. But if attention is steered before any choice happens, by colour, motion, and a notification timed to the minute, then the choosing comes afterwards, as a story we tell about where we already were.",
      "I am not sure whether the answer is more discipline on the part of the person or more restraint on the part of people like me. Probably both, but I'd like to know which carries more weight.",
    ],
    author: "theo",
    age: "5 hours ago",
    replies: 8,
    likes: 22,
    comments: [
      {
        id: "at-1",
        author: "priya",
        age: "4 hours ago",
        likes: 9,
        body: "Simone Weil thought attention was the rarest and purest form of generosity, which only makes sense if it can be given freely. If most of it is captured before we notice, the generous kind becomes something we have to protect, not just something we do.",
      },
      {
        id: "at-2",
        author: "samuel",
        age: "2 hours ago",
        likes: 5,
        body: "Musicians steer attention too, but a listener knows they've agreed to it by sitting down. Maybe the line isn't steering versus not steering, it's whether the person ever consented to being led.",
      },
    ] as ForumComment[],
  },
  {
    id: "machine-understanding",
    chapter: "Princeton",
    location: null as string | null,
    topic: "Philosophy of mind",
    title: "What would count as evidence that a machine understands?",
    excerpt: "Behavior is evidence when we encounter other people. Why does it suddenly seem insufficient when the subject is artificial?",
    body: [
      "With other people, behaviour is all we ever get. I have never inspected anyone's inner life directly; I infer it from what they say and do, and the inference is so fast it does not feel like one.",
      "Put the same behaviour in front of us from a machine and the inference stops. We suddenly want something more — the right kind of substrate, the right causal history, something it is like to be the thing.",
      "I am not sure whether that extra demand is a philosophical insight or a prejudice with good manners. It might be both. But we should at least notice that we apply a standard here we could not survive applying to each other.",
    ],
    author: "priya",
    age: "Yesterday",
    replies: 46,
    likes: 73,
    comments: [
      {
        id: "mu-1",
        author: "samuel",
        age: "22 hours ago",
        likes: 21,
        body: "The asymmetry might be doing useful work though. With people we have overwhelming background evidence that the same kind of thing is going on inside — shared biology, shared development. That is not a prejudice, it is a prior.",
        replies: [
          {
            id: "mu-1-1",
            author: "priya",
            age: "20 hours ago",
            likes: 11,
            body: "Agreed that it is a prior rather than bare bias. My worry is that we treat it as unrevisable. A prior that no possible evidence could move is not really functioning as a prior any more.",
          },
          {
            id: "mu-1-2",
            author: "maya",
            age: "18 hours ago",
            likes: 5,
            body: "What would move it, concretely? I find I cannot name a behaviour that would change my mind, which I take as a bad sign about my own position rather than a good one about the machine's.",
          },
        ],
      },
      {
        id: "mu-2",
        author: "julian",
        age: "15 hours ago",
        likes: 6,
        body: "Worth separating understanding from consciousness here. A system might understand a domain in every functional sense without there being anything it is like to be it. We keep bundling the two and then getting stuck.",
      },
    ] as ForumComment[],
  },
  {
    id: "beauty-attention",
    chapter: "New York",
    location: "williamsburg" as string | null,
    topic: "Aesthetics",
    title: "Does beauty ask something of our attention?",
    excerpt: "Some experiences seem to slow us down before we have decided that they matter. What kind of claim is being made on us?",
    body: [
      "There is a moment before judgment where something has already held you. You have not yet decided the piece is good; you have simply not moved on. Iris Murdoch thought that moment was morally significant — a brief interruption of the self.",
      "If that is right, beauty is not only a property we detect but a demand we can fail to meet. Looking badly becomes a kind of error.",
      "I am curious whether anyone experiences this as obligation rather than pleasure, because the vocabulary we use for art is almost entirely the latter.",
    ],
    author: "samuel",
    age: "Yesterday",
    replies: 13,
    likes: 29,
    comments: [
      {
        id: "ba-1",
        author: "amara",
        age: "20 hours ago",
        likes: 10,
        body: "Obligation, yes — though I would say it feels less like duty and more like being addressed. Something asks for your attention and you can decline, but declining is a choice you made rather than a neutral default.",
      },
      {
        id: "ba-2",
        author: "maya",
        age: "16 hours ago",
        likes: 4,
        body: "Murdoch's kestrel is the example I always come back to. The bird does not care that you are looking. The whole value is that for a moment you are not the centre of the scene.",
      },
    ] as ForumComment[],
  },
  {
    id: "ordinary-meaning",
    chapter: "New York",
    location: null as string | null,
    topic: "Existentialism",
    title: "Can an ordinary life be chosen deliberately?",
    excerpt: "We talk about authenticity through dramatic decisions, but most of a life is repetition, habit, and maintenance.",
    body: [
      "The existentialist canon is full of thresholds — the leap, the moment of decision, the refusal. Almost none of it is about Tuesday.",
      "But a life is mostly Tuesdays: the same commute, the same dishes, the same people needing roughly the same things from you. If authenticity only shows up at the dramatic junctures, it is absent from nearly all of a life.",
      "I want an account where choosing the ordinary — deliberately, with your eyes open, again — is the harder and more interesting act. I am not sure the tradition gives me one.",
    ],
    author: "amara",
    age: "3 days ago",
    replies: 31,
    likes: 62,
    comments: [
      {
        id: "om-1",
        author: "julian",
        age: "3 days ago",
        likes: 19,
        body: "The Aristotelians have this and the existentialists largely do not. Virtue is constituted by repetition — you become just by doing just things on ordinary days. It is unglamorous by design.",
        replies: [
          {
            id: "om-1-1",
            author: "amara",
            age: "2 days ago",
            likes: 8,
            body: "That is fair, though habituation can look like the opposite of choosing. I want the repetition to be re-chosen rather than merely settled into, and I am not certain Aristotle needs that distinction.",
          },
        ],
      },
      {
        id: "om-2",
        author: "priya",
        age: "2 days ago",
        likes: 7,
        body: "Maintenance is the word that stuck with me. Almost nothing we value survives without someone doing dull work to keep it — relationships, institutions, cities. We have very little philosophy of upkeep.",
      },
    ] as ForumComment[],
  },
];

export type ChatLine = { from: string; time: string; body: string };

export const conversations: { id: string; kind: string; title: string; subtitle: string; preview: string; time: string; unread: number; members: string[]; history: ChatLine[] }[] = [
  {
    id: "event-death",
    kind: "Event group",
    title: "Sep 16 · Room 52",
    subtitle: "Philosophy Club · Midtown East · Wednesday, September 16",
    preview: "Maya: I added two short readings…",
    time: "4m",
    unread: 3,
    members: ["maya", "julian", "amara", "theo"],
    history: [
      { from: "maya", time: "5:42 PM", body: "Anyone else coming straight from work? I'll save a few seats near the front for this group." },
      { from: "julian", time: "5:47 PM", body: "Please. First time at Room 52 — is it the entrance on the avenue or around the side?" },
      { from: "you", time: "5:51 PM", body: "It's 212 E 52nd St, and the map is on the Luma page. Admission isn't guaranteed after 7:30, so I'm aiming for seven." },
      { from: "amara", time: "6:03 PM", body: "I'm facilitating one of the small groups tonight. See you all there." },
    ],
  },
  {
    id: "maya",
    kind: "Direct",
    title: "Maya Chen",
    subtitle: "Direct conversation · New York chapter",
    preview: "That question stayed with me too.",
    time: "1h",
    unread: 1,
    members: ["maya"],
    history: [
      { from: "maya", time: "Tuesday", body: "You said something last week about waiting for evidence being itself a decision. That question stayed with me all the way home." },
      { from: "you", time: "Tuesday", body: "It came out of planning work, honestly. Delay always looks neutral from the inside and never is from the outside." },
      { from: "maya", time: "8:14 PM", body: "Would you be up for opening that thread in the forum? I think it's a better question than the one I posted." },
    ],
  },
  {
    id: "williamsburg",
    kind: "Chapter group",
    title: "McCarren Parkhouse hosts",
    subtitle: "Facilitators and hosts · Williamsburg",
    preview: "Samuel: The space for the 30th is confirmed.",
    time: "3h",
    unread: 0,
    members: ["samuel", "maya", "amara"],
    history: [
      { from: "samuel", time: "2:10 PM", body: "The space for the 30th is confirmed, doors from 6:40. Registration opens 13 days out at noon." },
      { from: "amara", time: "2:24 PM", body: "I'll be on care for that one. Can we keep the two tables nearest the door free so it's easy to step out?" },
      { from: "samuel", time: "2:26 PM", body: "Already marked. I'll brief the facilitators on rotation before we start." },
    ],
  },
  {
    id: "priya",
    kind: "Direct",
    title: "Priya Shah",
    subtitle: "Direct conversation · Princeton chapter",
    preview: "Here's the paper I mentioned.",
    time: "Tue",
    unread: 0,
    members: ["priya"],
    history: [
      { from: "priya", time: "Monday", body: "Here's the paper I mentioned on understanding versus simulation — it's short and the middle section is the useful part." },
      { from: "you", time: "Monday", body: "Thank you. Does it engage with the substrate objection at all, or does it set that aside?" },
      { from: "priya", time: "Tuesday", body: "Sets it aside explicitly, which I think is the honest move. Worth bringing to a Wednesday sometime." },
    ],
  },
];
