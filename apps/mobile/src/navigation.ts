export type FeedStackParamList = {
  Home: undefined;
  Thread: { threadId: string };
  NewThread: { tagId?: string };
};

export type MessagesStackParamList = {
  Messages: undefined;
  Conversation: { userId: string; displayName: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
  Verify: undefined;
  VerifyMock: { sessionId: string };
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
