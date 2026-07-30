export type FeedStackParamList = {
  Home: undefined;
  // highlightPostId: a notification/search deep link to one specific reply —
  // the screen scrolls to it and marks it with an accent hairline.
  Thread: { threadId: string; highlightPostId?: string };
  // chapterName rides along so the composer can say where the thread lands
  // without a loading state.
  NewThread: { tagId?: string; chapterId?: string; chapterName?: string };
  // Initial values ride along so the edit screen never shows a loading state.
  EditThread: { threadId: string; title: string; body: string; tagIds: string[] };
  UserProfile: { userId: string };
  Search: undefined;
  // Chapters nest under the Feed tab rather than adding a fifth tab.
  Chapters: undefined;
  Chapter: { slug: string };
};

export type MessagesStackParamList = {
  Messages: undefined;
  Conversation: { userId: string; displayName: string };
  UserProfile: { userId: string };
};

export type AlertsStackParamList = {
  Notifications: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  Saved: undefined;
  Directory: undefined;
  UserProfile: { userId: string };
  EditProfile: undefined;
  Account: undefined;
  Verify: undefined;
  VerifyMock: { sessionId: string };
  Formatting: undefined;
  Settings: undefined;
  AdminReports: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  MockOAuth: { provider: "google" | "apple" };
  ForgotPassword: undefined;
  Settings: undefined;
};

/** Tab-level routes, for cross-tab jumps (e.g. profile → Message). */
export type RootTabParamList = {
  FeedTab: { screen: keyof FeedStackParamList; params?: object } | undefined;
  MessagesTab: { screen: keyof MessagesStackParamList; params?: object } | undefined;
  AlertsTab: { screen: keyof AlertsStackParamList; params?: object } | undefined;
  ProfileTab: { screen: keyof ProfileStackParamList; params?: object } | undefined;
};
