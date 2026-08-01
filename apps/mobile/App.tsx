import { Ionicons } from "@expo/vector-icons";
import {
  NavigationContainer,
  createNavigationContainerRef,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
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
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useEffect } from "react";
import type { PublicUser } from "@nyps-forum/shared";
import { api } from "./src/lib/api";
import { AuthProvider, useAuth } from "./src/lib/auth-context";
import { SettingsProvider, useSettings } from "./src/lib/settings-context";
import { useNotificationUnreadCount, useUnreadCount } from "./src/lib/use-unread";
import { onPushOpened, registerForPush } from "./src/lib/push";
import { fonts, type as typeScale } from "./src/lib/theme";
import type {
  AlertsStackParamList,
  AuthStackParamList,
  FeedStackParamList,
  MessagesStackParamList,
  ProfileStackParamList,
  RootTabParamList,
} from "./src/navigation";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ThreadScreen } from "./src/screens/ThreadScreen";
import { EditThreadScreen } from "./src/screens/EditThreadScreen";
import { NewThreadScreen } from "./src/screens/NewThreadScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SignupScreen } from "./src/screens/SignupScreen";
import { VerifyScreen } from "./src/screens/VerifyScreen";
import { VerifyMockScreen } from "./src/screens/VerifyMockScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ConversationScreen } from "./src/screens/ConversationScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { UserProfileScreen } from "./src/screens/UserProfileScreen";
import { EditProfileScreen } from "./src/screens/EditProfileScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { FormattingScreen } from "./src/screens/FormattingScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { AdminReportsScreen } from "./src/screens/AdminReportsScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SavedScreen } from "./src/screens/SavedScreen";
import { ChaptersScreen } from "./src/screens/ChaptersScreen";
import { ChapterFeedScreen } from "./src/screens/ChapterFeedScreen";
import { DirectoryScreen } from "./src/screens/DirectoryScreen";

const FeedStackNav = createNativeStackNavigator<FeedStackParamList>();
const MessagesStackNav = createNativeStackNavigator<MessagesStackParamList>();
const AlertsStackNav = createNativeStackNavigator<AlertsStackParamList>();
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

function SearchButton() {
  const { colors } = useSettings();
  const navigation = useNavigation<NavigationProp<FeedStackParamList>>();
  return (
    <Pressable
      onPress={() => navigation.navigate("Search")}
      hitSlop={8}
      accessibilityLabel="Search"
    >
      <Ionicons name="search-outline" size={22} color={colors.ink} />
    </Pressable>
  );
}

function FeedStack() {
  const options = useHeaderOptions();
  return (
    <FeedStackNav.Navigator screenOptions={options}>
      <FeedStackNav.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerTitle: () => <BrandTitle />, headerRight: () => <SearchButton /> }}
      />
      <FeedStackNav.Screen name="Thread" component={ThreadScreen} options={{ title: "Thread" }} />
      <FeedStackNav.Screen
        name="NewThread"
        component={NewThreadScreen}
        options={{ title: "New Thread" }}
      />
      <FeedStackNav.Screen
        name="EditThread"
        component={EditThreadScreen}
        options={{ title: "Edit Thread" }}
      />
      <FeedStackNav.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: "Profile" }}
      />
      <FeedStackNav.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      <FeedStackNav.Screen
        name="Chapters"
        component={ChaptersScreen}
        options={{ title: "Chapters" }}
      />
      <FeedStackNav.Screen
        name="Chapter"
        component={ChapterFeedScreen}
        options={{ title: "Chapter" }}
      />
    </FeedStackNav.Navigator>
  );
}

function AlertsStack() {
  const options = useHeaderOptions();
  return (
    <AlertsStackNav.Navigator screenOptions={options}>
      <AlertsStackNav.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
    </AlertsStackNav.Navigator>
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
      <MessagesStackNav.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: "Profile" }}
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
        name="Saved"
        component={SavedScreen}
        options={{ title: "Saved threads" }}
      />
      <ProfileStackNav.Screen
        name="Directory"
        component={DirectoryScreen}
        options={{ title: "Member directory" }}
      />
      <ProfileStackNav.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: "Profile" }}
      />
      <ProfileStackNav.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: "Edit Profile" }}
      />
      <ProfileStackNav.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: "Account" }}
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
        options={{ title: "Report queue" }}
      />
    </ProfileStackNav.Navigator>
  );
}

function AppTabs() {
  const { colors } = useSettings();
  const unread = useUnreadCount();
  const alertsUnread = useNotificationUnreadCount();

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
        name="AlertsTab"
        component={AlertsStack}
        options={{
          title: "Alerts",
          tabBarBadge: alertsUnread > 0 ? alertsUnread : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
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

const navigationRef = createNavigationContainerRef<RootTabParamList>();

function Root() {
  const { colors, themeName } = useSettings();
  const { user, loading, token } = useAuth();

  // Re-register the push token whenever a session starts. `ask: false` — this
  // only refreshes an already-granted permission; the ask itself happens on
  // the Alerts tab, the first moment someone shows they care.
  useEffect(() => {
    if (token) registerForPush(token, false);
  }, [token]);

  // Push taps deep-link exactly like their in-app rows: replies/likes/
  // mentions to the specific reply, DMs to the conversation, anything
  // without a target to the Alerts list.
  useEffect(() => {
    if (!token) return;
    return onPushOpened(async (link) => {
      if (!navigationRef.isReady()) return;
      if (link.type === "message" && link.actorId) {
        try {
          const res = await api.get<{ user: PublicUser }>(
            `/api/users/${link.actorId}/profile`,
            token,
          );
          navigationRef.navigate("MessagesTab", {
            screen: "Conversation",
            params: { userId: link.actorId, displayName: res.user.displayName },
          });
        } catch {
          navigationRef.navigate("MessagesTab", { screen: "Messages" });
        }
      } else if (link.threadId) {
        navigationRef.navigate("FeedTab", {
          screen: "Thread",
          params: { threadId: link.threadId, highlightPostId: link.postId },
        });
      } else {
        navigationRef.navigate("AlertsTab", { screen: "Notifications" });
      }
    });
  }, [token]);
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
    <NavigationContainer ref={navigationRef}>
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
