export type FeedStackParamList = {
  Home: undefined;
  Thread: { threadId: string };
  NewThread: { tagId?: string };
  // Initial values ride along so the edit screen never shows a loading state.
  EditThread: { threadId: string; title: string; body: string; tagIds: string[] };
  UserProfile: { userId: string };
};

export type MessagesStackParamList = {
  Messages: undefined;
  Conversation: { userId: string; displayName: string };
  UserProfile: { userId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
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
  ProfileTab: { screen: keyof ProfileStackParamList; params?: object } | undefined;
};
