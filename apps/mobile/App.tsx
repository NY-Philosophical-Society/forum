import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "./src/lib/auth-context";
import { SettingsProvider, useSettings } from "./src/lib/settings-context";
import type { RootStackParamList } from "./src/navigation";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ThreadScreen } from "./src/screens/ThreadScreen";
import { NewThreadScreen } from "./src/screens/NewThreadScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SignupScreen } from "./src/screens/SignupScreen";
import { VerifyScreen } from "./src/screens/VerifyScreen";
import { VerifyMockScreen } from "./src/screens/VerifyMockScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ConversationScreen } from "./src/screens/ConversationScreen";
import { MockOAuthScreen } from "./src/screens/MockOAuthScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Unlike the web app (which lets anonymous visitors read a preview),
 * the mobile app requires an account before it lets you in at all — this is
 * the "AuthStack" shown whenever there's no logged-in user. Once sign-in
 * succeeds, `useAuth()`'s `user` becomes non-null and the parent component
 * swaps this out for AppStack automatically; no explicit navigation needed.
 */
function AuthStack() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log in" }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Sign up" }} />
      <Stack.Screen
        name="MockOAuth"
        component={MockOAuthScreen}
        options={({ route }) => ({
          title: `Mock ${route.params.provider === "apple" ? "Apple" : "Google"} Sign-In`,
        })}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}

function AppStack() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: "NYPS Forum" }} />
      <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: "Thread" }} />
      <Stack.Screen name="NewThread" component={NewThreadScreen} options={{ title: "New Thread" }} />
      <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: "Verification" }} />
      <Stack.Screen
        name="VerifyMock"
        component={VerifyMockScreen}
        options={{ title: "Mock Verification" }}
      />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: "Messages" }} />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({ title: route.params.displayName })}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}

function useStackScreenOptions() {
  const { colors } = useSettings();
  return {
    headerStyle: { backgroundColor: colors.paper },
    headerTintColor: colors.ink,
    contentStyle: { backgroundColor: colors.paper },
  };
}

function Root() {
  const { colors, themeName } = useSettings();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
      <StatusBar style={themeName === "dark" ? "light" : "dark"} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SettingsProvider>
  );
}
