import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/lib/auth-context";
import { colors } from "./src/lib/theme";
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

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: "NYPS Forum" }} />
          <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: "Thread" }} />
          <Stack.Screen name="NewThread" component={NewThreadScreen} options={{ title: "New Thread" }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Log in" }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: "Sign up" }} />
          <Stack.Screen
            name="MockOAuth"
            component={MockOAuthScreen}
            options={({ route }) => ({
              title: `Mock ${route.params.provider === "apple" ? "Apple" : "Google"} Sign-In`,
            })}
          />
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
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
