export type RootStackParamList = {
  Home: undefined;
  Thread: { threadId: string };
  NewThread: { tagId?: string };
  Login: undefined;
  Signup: undefined;
  Verify: undefined;
  VerifyMock: { sessionId: string };
  Messages: undefined;
  Conversation: { userId: string; displayName: string };
  MockOAuth: { provider: "google" | "apple" };
};
