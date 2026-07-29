import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_400Regular_Italic,
  LibreBaskerville_700Bold,
} from "@expo-google-fonts/libre-baskerville";
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { AuthProvider, useAuth } from "./src/lib/auth-context";
import { SettingsProvider, useSettings } from "./src/lib/settings-context";
import { useUnreadCount } from "./src/lib/use-unread";
import { fonts, type as typeScale } from "./src/lib/theme";
import type {
  AuthStackParamList,
  FeedStackParamList,
  MessagesStackParamList,
  ProfileStackParamList,
} from "./src/navigation";
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
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { FormattingScreen } from "./src/screens/FormattingScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { AdminReportsScreen } from "./src/screens/AdminReportsScreen";

const FeedStackNav = createNativeStackNavigator<FeedStackParamList>();
const MessagesStackNav = createNativeStackNavigator<MessagesStackParamList>();
const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator();

function useHeaderOptions() {
  const { colors } = useSettings();
  return {
    headerStyle: { backgroundColor: colors.paper },
    headerTintColor: colors.ink,
    headerTitleStyle: { fontFamily: fonts.serifBold, color: colors.ink },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.paper },
  };
}

function BrandTitle() {
  const { colors, themeName } = useSettings();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image
        source={require("./assets/nypc-icon.png")}
        // The ink amphora disappears on dark paper — lift it via tint.
        style={{ width: 26, height: 26, tintColor: themeName === "dark" ? colors.ink : undefined }}
        resizeMode="contain"
      />
      <Text style={{ fontFamily: fonts.serifBold, fontSize: 15, color: colors.ink }}>
        New York Philosophy Club
      </Text>
    </View>
  );
}

function FeedStack() {
  const options = useHeaderOptions();
  return (
    <FeedStackNav.Navigator screenOptions={options}>
      <FeedStackNav.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerTitle: () => <BrandTitle /> }}
      />
      <FeedStackNav.Screen name="Thread" component={ThreadScreen} options={{ title: "Thread" }} />
      <FeedStackNav.Screen
        name="NewThread"
        component={NewThreadScreen}
        options={{ title: "New Thread" }}
      />
    </FeedStackNav.Navigator>
  );
}

function MessagesStack() {
  const options = useHeaderOptions();
  return (
    <MessagesStackNav.Navigator screenOptions={options}>
      <MessagesStackNav.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: "Messages" }}
      />
      <MessagesStackNav.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }) => ({ title: route.params.displayName })}
      />
    </MessagesStackNav.Navigator>
  );
}

function ProfileStack() {
  const options = useHeaderOptions();
  return (
    <ProfileStackNav.Navigator screenOptions={options}>
      <ProfileStackNav.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profile" }}
      />
      <ProfileStackNav.Screen
        name="Verify"
        component={VerifyScreen}
        options={{ title: "Verification" }}
      />
      <ProfileStackNav.Screen
        name="VerifyMock"
        component={VerifyMockScreen}
        options={{ title: "Mock Verification" }}
      />
      <ProfileStackNav.Screen
        name="Formatting"
        component={FormattingScreen}
        options={{ title: "Formatting guide" }}
      />
      <ProfileStackNav.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <ProfileStackNav.Screen
        name="AdminReports"
        component={AdminReportsScreen}
        options={{ title: "Reports" }}
      />
    </ProfileStackNav.Navigator>
  );
}

function AppTabs() {
  const { colors } = useSettings();
  const unread = useUnreadCount();

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontFamily: fonts.displaySemi, fontSize: typeScale.xs },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent,
          color: colors.paper,
          fontFamily: fonts.displaySemi,
          fontSize: typeScale.xs,
        },
      }}
    >
      <Tabs.Screen
        name="FeedTab"
        component={FeedStack}
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="newspaper-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="MessagesTab"
        component={MessagesStack}
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

/** Login/signup gate — the mobile app requires an account before anything else. */
function AuthStack() {
  const options = useHeaderOptions();
  return (
    <AuthStackNav.Navigator screenOptions={options}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} options={{ title: "Log in" }} />
      <AuthStackNav.Screen name="Signup" component={SignupScreen} options={{ title: "Sign up" }} />
      <AuthStackNav.Screen
        name="MockOAuth"
        component={MockOAuthScreen}
        options={({ route }) => ({
          title: `Mock ${route.params.provider === "apple" ? "Apple" : "Google"} Sign-In`,
        })}
      />
      <AuthStackNav.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: "Reset password" }}
      />
      <AuthStackNav.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
    </AuthStackNav.Navigator>
  );
}

function Root() {
  const { colors, themeName } = useSettings();
  const { user, loading } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_400Regular_Italic,
    LibreBaskerville_700Bold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.paper,
        }}
      >
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppTabs /> : <AuthStack />}
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
