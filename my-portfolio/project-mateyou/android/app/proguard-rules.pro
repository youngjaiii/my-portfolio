# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ============ Capacitor Plugins ============
# Keep all Capacitor plugin classes
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# Keep MateYou custom plugins
-keep class com.mateyou.app.LiveKitPlugin { *; }
-keep class com.mateyou.app.AudioTogglePlugin { *; }
-keep class com.mateyou.app.CallManager { *; }
-keep class com.mateyou.app.CallManager$* { *; }
-keep class com.mateyou.app.MateYouConnectionService { *; }
-keep class com.mateyou.app.CallNotificationService { *; }
-keep class com.mateyou.app.CallActionReceiver { *; }

# ============ LiveKit SDK ============
-keep class io.livekit.android.** { *; }
-keep class livekit.** { *; }
-dontwarn io.livekit.android.**

# ============ WebRTC ============
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# ============ Kotlin Coroutines ============
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.**